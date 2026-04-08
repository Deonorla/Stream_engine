const { screenAssets, extractYieldRate, estimateRiskScore } = require("./assetScreener");

/**
 * Generate a plain-English due diligence summary for an asset using Gemini.
 */
async function generateDueDiligence(asset, apiKey) {
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
        return buildFallbackSummary(asset);
    }
    try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `You are an RWA (Real World Asset) analyst. Analyze this tokenized asset and provide a concise due diligence summary.

Asset Data:
- Token ID: ${asset.tokenId}
- Asset Type: ${asset.assetType} (1=real estate or land)
- Verification Status: ${asset.verificationStatusLabel}
- Status Reason: ${asset.statusReason || "none"}
- Issuer: ${asset.issuer}
- Jurisdiction: ${asset.jurisdiction || "unknown"}
- Rights Model: ${asset.rightsModelLabel}
- Attestations: ${(asset.attestations || []).length} (${(asset.attestations || []).filter(a => !a.revoked).length} active)
- Claimable Yield: ${asset.claimableYield} USDC
- Total Yield Deposited: ${asset.totalYieldDeposited} USDC
- Flash Advance Outstanding: ${asset.flashAdvanceOutstanding} USDC
- Rental Ready: ${asset.rentalReady}
- Currently Rented: ${Boolean(asset.rentalActivity?.currentlyRented)}
- Estimated Yield Rate: ${extractYieldRate(asset).toFixed(2)}%
- Risk Score: ${estimateRiskScore(asset)}/100

Provide a JSON response with these exact fields:
{
  "verdict": "BUY" | "HOLD" | "AVOID",
  "confidence": 0-100,
  "summary": "2-3 sentence plain English summary",
  "risks": ["risk1", "risk2"],
  "positives": ["positive1", "positive2"],
  "yieldAssessment": "one sentence on yield quality"
}`;

        const result = await model.generateContent(prompt);
        const text = (await result.response).text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.warn("Gemini due diligence failed:", e.message);
    }
    return buildFallbackSummary(asset);
}

function buildFallbackSummary(asset) {
    const risk = estimateRiskScore(asset);
    const yieldRate = extractYieldRate(asset);
    const status = asset.verificationStatusLabel || "unknown";
    const verdict = status === "verified" && risk < 40 ? "BUY"
        : status === "verified_with_warnings" || risk < 60 ? "HOLD"
        : "AVOID";

    return {
        verdict,
        confidence: Math.max(20, 80 - risk),
        summary: `Asset #${asset.tokenId} is ${status} with an estimated ${yieldRate.toFixed(1)}% yield and risk score of ${risk}/100.`,
        risks: [
            risk > 50 ? "High risk score" : null,
            !asset.rentalReady ? "Not rental ready" : null,
            Number(asset.flashAdvanceOutstanding) > 0 ? "Flash advance outstanding" : null,
        ].filter(Boolean),
        positives: [
            status === "verified" ? "Fully verified" : null,
            (asset.attestations || []).filter(a => !a.revoked).length > 0 ? "Has active attestations" : null,
            asset.rentalReady ? "Rental ready" : null,
        ].filter(Boolean),
        yieldAssessment: yieldRate > 0
            ? `Estimated annualized yield of ${yieldRate.toFixed(1)}%.`
            : "No yield data available.",
    };
}

/**
 * Aggregate market intelligence across all assets.
 */
function aggregateMarketIntel(assets) {
    if (!assets.length) return { totalAssets: 0 };

    const verified = assets.filter(a => a.verificationStatusLabel === "verified");
    const rentalReady = assets.filter(a => a.rentalReady);
    const currentlyRented = assets.filter(a => a.rentalActivity?.currentlyRented);
    const withYield = assets.filter(a => extractYieldRate(a) > 0);
    const yields = withYield.map(a => extractYieldRate(a));
    const risks = assets.map(a => estimateRiskScore(a));

    // Top performers by yield
    const topByYield = screenAssets(assets, { limit: 5 });

    // Sector breakdown
    const byType = assets.reduce((acc, a) => {
        const type = a.assetType || 0;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    // Issuer stats
    const byIssuer = assets.reduce((acc, a) => {
        if (!a.issuer) return acc;
        if (!acc[a.issuer]) acc[a.issuer] = { count: 0, verified: 0 };
        acc[a.issuer].count++;
        if (a.verificationStatusLabel === "verified") acc[a.issuer].verified++;
        return acc;
    }, {});

    return {
        totalAssets: assets.length,
        verifiedCount: verified.length,
        rentalReadyCount: rentalReady.length,
        currentRentalCount: currentlyRented.length,
        avgYield: yields.length ? Math.round(yields.reduce((a, b) => a + b, 0) / yields.length * 100) / 100 : 0,
        maxYield: yields.length ? Math.round(Math.max(...yields) * 100) / 100 : 0,
        avgRisk: Math.round(risks.reduce((a, b) => a + b, 0) / risks.length),
        topPerformers: topByYield.map(({ asset: _a, ...r }) => r),
        sectorBreakdown: byType,
        issuerStats: byIssuer,
    };
}

/**
 * Monitor assets for risk events — returns alerts.
 */
function monitorRisks(assets) {
    const alerts = [];
    for (const asset of assets) {
        const status = asset.verificationStatusLabel;
        if (["frozen", "disputed", "revoked"].includes(status)) {
            alerts.push({ tokenId: asset.tokenId, severity: "high", type: status, message: `Asset #${asset.tokenId} is ${status}` });
        }
        if (status === "stale") {
            alerts.push({ tokenId: asset.tokenId, severity: "medium", type: "stale", message: `Asset #${asset.tokenId} verification is stale` });
        }
        if (Number(asset.flashAdvanceOutstanding) > 0 && estimateRiskScore(asset) > 70) {
            alerts.push({ tokenId: asset.tokenId, severity: "medium", type: "flash_advance_risk", message: `Asset #${asset.tokenId} has outstanding flash advance with high risk` });
        }
    }
    return alerts;
}

module.exports = { generateDueDiligence, aggregateMarketIntel, monitorRisks };
