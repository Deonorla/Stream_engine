/**
 * Compliance Checker
 * Pre-execution gate — verifies a wallet can interact with an asset
 * before any trade, bid, or session is executed.
 * Uses existing on-chain compliance + attestation policy data.
 */

/**
 * Run all compliance checks for a given (wallet, asset) pair.
 * Returns { allowed: bool, reasons: string[], checks: CheckResult[] }
 */
async function checkCompliance(chainService, { walletAddress, asset, action = 'trade' }) {
    const checks = [];
    const normalizedAction = String(action || 'trade').trim().toLowerCase();
    const isTradeAction = ['trade', 'bid', 'auction_bid', 'auction_trade'].includes(normalizedAction);
    const requiresClaimPolicyOpen = ['claim', 'claim_yield', 'yield_claim', 'route_yield', 'rent', 'session_open'].includes(normalizedAction);
    const strictAttestationRequired = !isTradeAction;

    // 1. Asset must exist and not be frozen/disputed/revoked
    const blockedStatuses = ['frozen', 'disputed', 'revoked'];
    const status = asset?.verificationStatusLabel || 'unknown';
    checks.push({
        name: 'asset_status',
        passed: !blockedStatuses.includes(status),
        detail: blockedStatuses.includes(status)
            ? `Asset is ${status} — trading blocked`
            : `Asset status: ${status}`,
    });

    // 2. Asset policy — check if claim is blocked
    if (requiresClaimPolicyOpen && chainService?.isConfigured?.() && asset?.tokenId) {
        try {
            const blocked = await chainService.contractService.invokeView({
                contractId: chainService.assetRegistryAddress,
                method: 'is_asset_claim_blocked',
                args: [{ type: 'u64', value: BigInt(asset.tokenId) }],
            });
            checks.push({
                name: 'claim_policy',
                passed: !blocked,
                detail: blocked ? 'Asset claim is currently blocked by policy' : 'Claim policy: open',
            });
        } catch {
            checks.push({ name: 'claim_policy', passed: true, detail: 'Policy check skipped (contract unavailable)' });
        }
    }

    // 3. Attestation requirements — asset must have required attestations
    const requiredAttestations = (asset?.attestationPolicies || []).filter(p => p.required);
    const activeAttestations = (asset?.attestations || []).filter(a => !a.revoked);
    const missingRoles = requiredAttestations.filter(req =>
        !activeAttestations.some(att => att.role === req.role || att.roleLabel === req.roleLabel)
    );
    checks.push({
        name: 'attestations',
        passed: strictAttestationRequired ? missingRoles.length === 0 : true,
        detail: missingRoles.length > 0
            ? strictAttestationRequired
                ? `Missing required attestations: ${missingRoles.map(r => r.roleLabel || r.role).join(', ')}`
                : `Attestations pending (${missingRoles.map(r => r.roleLabel || r.role).join(', ')}) — allowed for trade actions`
            : `All required attestations present (${activeAttestations.length})`,
    });

    // 4. On-chain compliance record for this wallet + asset type
    if (chainService?.isConfigured?.() && walletAddress && asset?.assetType != null) {
        try {
            const compliance = await chainService.getCompliance(walletAddress, asset.assetType);
            const allowed = compliance?.allowed == null
                ? (compliance?.approved !== false && compliance?.currentlyValid !== false)
                : Boolean(compliance.allowed);
            checks.push({
                name: 'wallet_compliance',
                passed: allowed,
                detail: allowed
                    ? `Wallet compliance: approved for asset type ${asset.assetType}`
                    : `Wallet not approved for asset type ${asset.assetType}: ${compliance?.reason || 'no reason given'}`,
            });
        } catch {
            checks.push({ name: 'wallet_compliance', passed: true, detail: 'Compliance check skipped (contract unavailable)' });
        }
    }

    const failed = checks.filter(c => !c.passed);
    return {
        allowed: failed.length === 0,
        action,
        walletAddress,
        tokenId: asset?.tokenId,
        checks,
        reasons: failed.map(c => c.detail),
    };
}

module.exports = { checkCompliance };
