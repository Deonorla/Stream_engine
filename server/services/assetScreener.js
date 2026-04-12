/**
 * Asset Screening Engine
 * Filters, scores, and ranks RWA assets against agent criteria.
 * Pure functions — no I/O, easy to test.
 */

const VERIFICATION_WEIGHTS = { verified: 1, verified_with_warnings: 0.7, pending_attestation: 0.3 };

/**
 * Extract a numeric yield rate (annualized %) from an asset.
 * Priority order:
 *   1. Live stream data (highest priority)
 *   2. Live on-chain claimable/deposited ratio (backward compat)
 *   3. publicMetadata.yieldParameters.yieldTargetPct
 *   4. yieldParameters.monthlyRentalIncome annualized against listPrice (Estate)
 *   5. yieldParameters.annualLandLeaseIncome against listPrice (Land)
 *   6. Legacy metadata.monthlyYieldTarget (backward compat)
 *   7. Legacy metadata.pricePerHour (backward compat)
 */
function extractYieldRate(asset) {
    // Priority 1: Live yield stream data
    const stream = asset.stream;
    const durationSeconds = Number(
        stream?.durationSeconds
        || stream?.duration
        || (
            Number(stream?.stopTime || 0) > Number(stream?.startTime || 0)
                ? Number(stream.stopTime) - Number(stream.startTime)
                : 0
        )
    );
    const streamTotalAmount = Number(stream?.totalAmount || stream?.depositedAmount || 0);
    const streamDeposited = Number(stream?.depositedAmount || stream?.totalAmount || asset.totalYieldDeposited || 0);
    if (stream && streamTotalAmount > 0 && durationSeconds > 0 && streamDeposited > 0) {
        const annualizedRate =
            (streamTotalAmount / durationSeconds) * 31536000 // seconds/year
            / Math.max(streamDeposited, 1)
            * 100;
        return Math.min(annualizedRate, 999); // cap at 999%
    }

    // Priority 2: Live on-chain claimable/deposited ratio (backward compat)
    const claimable = Number(asset.claimableYield || 0);
    const deposited = Number(asset.totalYieldDeposited || 0);
    if (deposited > 0) return Math.min((claimable / deposited) * 100, 999);

    const metadata = asset.publicMetadata || asset.metadata || {};
    const yp = metadata.yieldParameters;

    // Priority 2–4: New yieldParameters block
    if (yp) {
        // Priority 2: yieldTargetPct
        const yieldTargetPct = Number(yp.yieldTargetPct || 0);
        if (yieldTargetPct > 0) return Math.min(yieldTargetPct, 999);

        const listPrice = Number(metadata.listPrice || 0);

        // Priority 3: monthlyRentalIncome annualized against listPrice (Estate)
        const monthlyRentalIncome = Number(yp.monthlyRentalIncome || 0);
        if (monthlyRentalIncome > 0 && listPrice > 0) {
            return Math.min((monthlyRentalIncome * 12 / listPrice) * 100, 999);
        }

        // Priority 4: annualLandLeaseIncome against listPrice (Land)
        const annualLandLeaseIncome = Number(yp.annualLandLeaseIncome || 0);
        if (annualLandLeaseIncome > 0 && listPrice > 0) {
            return Math.min((annualLandLeaseIncome / listPrice) * 100, 999);
        }
    }

    // Priority 5: Legacy monthlyYieldTarget (backward compat)
    const monthlyYieldTarget = Number(
        metadata.monthlyYieldTarget
        || metadata.monthlyYield
        || asset.monthlyYieldTarget
        || 0
    );
    if (monthlyYieldTarget > 0) {
        const annualRevenue = monthlyYieldTarget * 12;
        return Math.min((annualRevenue / 1000) * 100, 999);
    }

    // Priority 6: Legacy pricePerHour (backward compat)
    const pricePerHour = Number(
        metadata.pricePerHour
        || asset.pricePerHour
        || metadata.attributes?.find?.((a) => a?.trait_type === 'Price Per Hour')?.value
        || 0
    );
    if (pricePerHour > 0) {
        // annualised revenue as % of a nominal $1000 capital base
        const annualRevenue = pricePerHour * 24 * 365;
        return Math.min((annualRevenue / 1000) * 100, 999);
    }

    return 0;
}

/**
 * Estimate a simple risk score 0–100 (lower = safer).
 */
function estimateRiskScore(asset) {
    let risk = 50; // baseline
    const status = asset.verificationStatusLabel || '';
    if (status === 'verified') risk -= 20;
    else if (status === 'verified_with_warnings') risk -= 5;
    else if (status === 'pending_attestation') risk += 15;
    else if (['frozen', 'disputed', 'revoked'].includes(status)) risk += 30;

    // More attestations = lower risk
    const attestationCount = (asset.attestations || []).filter(a => !a.revoked).length;
    risk -= Math.min(attestationCount * 5, 20);

    // Flash advance outstanding = higher risk
    if (Number(asset.flashAdvanceOutstanding || 0) > 0) risk += 10;

    return Math.max(0, Math.min(100, risk));
}

/**
 * Score an asset 0–100 against criteria. Higher = better match.
 */
function scoreAsset(asset, criteria) {
    const yieldRate = extractYieldRate(asset);
    const riskScore = estimateRiskScore(asset);
    let score = 0;

    if (criteria.verifiedOnly && asset.verificationStatusLabel !== "verified") return -1;
    if (criteria.rentalReadyOnly && !asset.rentalReady) return -1;

    // Yield match (0–40 points)
    if (criteria.minYield != null && yieldRate < criteria.minYield) return -1; // hard filter
    if (criteria.maxYield != null && yieldRate > criteria.maxYield) return -1;
    score += Math.min((yieldRate / Math.max(criteria.minYield || 1, 1)) * 20, 40);

    // Risk match (0–30 points)
    if (criteria.maxRisk != null && riskScore > criteria.maxRisk) return -1; // hard filter
    score += Math.max(0, 30 - riskScore * 0.3);

    // Verification bonus (0–20 points)
    score += (VERIFICATION_WEIGHTS[asset.verificationStatusLabel] || 0) * 20;

    // Rental ready bonus (0–10 points)
    if (asset.rentalReady) score += 10;

    // Asset type filter
    if (criteria.assetTypes?.length && !criteria.assetTypes.includes(asset.assetType)) return -1;

    // Jurisdiction filter
    if (criteria.jurisdictions?.length && asset.jurisdiction &&
        !criteria.jurisdictions.includes(asset.jurisdiction)) return -1;

    // Issuer exclusion
    if (criteria.excludeIssuers?.length &&
        criteria.excludeIssuers.includes(asset.issuer)) return -1;

    return Math.round(score);
}

/**
 * Screen and rank a list of assets against criteria.
 * @param {any[]} assets
 * @param {ScreenCriteria} criteria
 * @returns {ScoredAsset[]}
 */
function screenAssets(assets, criteria = {}) {
    const results = [];
    for (const asset of assets) {
        const score = scoreAsset(asset, criteria);
        if (score < 0) continue;
        results.push({
            tokenId: asset.tokenId,
            name: asset.name || asset.publicMetadataURI || `Asset #${asset.tokenId}`,
            assetType: asset.assetType,
            verificationStatus: asset.verificationStatusLabel,
            issuer: asset.issuer,
            jurisdiction: asset.jurisdiction,
            yieldRate: Math.round(extractYieldRate(asset) * 100) / 100,
            riskScore: estimateRiskScore(asset),
            rentalReady: asset.rentalReady,
            claimableYield: asset.claimableYield,
            score,
            asset, // full asset for downstream use
        });
    }
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return criteria.limit ? results.slice(0, criteria.limit) : results;
}

/**
 * Parse a natural-language goal into structured criteria using simple heuristics.
 * For richer parsing, pipe through Gemini before calling this.
 */
function parseGoal(goal = '') {
    const text = goal.toLowerCase();
    const criteria = {};

    const yieldMatch = text.match(/(\d+(?:\.\d+)?)\s*%/g);
    if (yieldMatch) {
        const nums = yieldMatch.map(m => parseFloat(m));
        if (text.includes('at least') || text.includes('minimum') || text.includes('above')) {
            criteria.minYield = Math.min(...nums);
        } else if (text.includes('under') || text.includes('below') || text.includes('max')) {
            criteria.maxYield = Math.max(...nums);
        } else if (nums.length >= 2) {
            criteria.minYield = Math.min(...nums);
            criteria.maxYield = Math.max(...nums);
        } else {
            criteria.minYield = nums[0];
        }
    }

    const riskMatch = text.match(/(\d+)\s*(?:%\s*)?risk/);
    if (riskMatch) criteria.maxRisk = parseInt(riskMatch[1]);

    const assetTypes = [];
    if (
        text.includes('real estate')
        || text.includes('property')
        || text.includes('rental')
        || text.includes('land')
        || text.includes('plot')
        || text.includes('parcel')
    ) assetTypes.push(1);
    if (assetTypes.length) criteria.assetTypes = [...new Set(assetTypes)];

    if (text.includes('verified only') || text.includes('verified assets')) criteria.verifiedOnly = true;

    const limitMatch = text.match(/top\s+(\d+)|(\d+)\s+assets?/);
    if (limitMatch) criteria.limit = parseInt(limitMatch[1] || limitMatch[2]);

    return criteria;
}

module.exports = { screenAssets, scoreAsset, extractYieldRate, estimateRiskScore, parseGoal };
