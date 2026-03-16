const { normalizeCid } = require("./ipfsService");

function buildVerificationPayload({ chainId, assetContract, tokenId, cid, tagHash }) {
    const normalizedPayload = {
        chainId: Number(chainId),
        assetContract,
        tokenId: Number(tokenId),
        cid: normalizeCid(cid),
        tagHash,
        version: 1,
    };

    return Buffer.from(JSON.stringify(normalizedPayload), "utf8").toString("base64url");
}

function parseVerificationPayload(payload) {
    if (!payload) {
        return null;
    }

    try {
        const decoded = Buffer.from(payload, "base64url").toString("utf8");
        return JSON.parse(decoded);
    } catch (error) {
        throw new Error("Invalid verification payload");
    }
}

function buildVerificationUrl(baseUrl, payload) {
    const cleanBaseUrl = (baseUrl || "").replace(/\/$/, "");
    return `${cleanBaseUrl}/rwa/verify?payload=${encodeURIComponent(payload)}`;
}

module.exports = {
    buildVerificationPayload,
    parseVerificationPayload,
    buildVerificationUrl,
};
