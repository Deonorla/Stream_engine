const { ethers } = require("ethers");
const { normalizeCid } = require("./ipfsService");
const { stableStringify } = require("./rwaModel");

function encodePayload(value) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function buildLegacyVerificationPayload({ chainId, assetContract, tokenId, cid, tagHash }) {
    const normalizedPayload = {
        chainId: Number(chainId),
        assetContract,
        tokenId: Number(tokenId),
        cid: normalizeCid(cid),
        tagHash,
        version: 1,
    };

    return encodePayload(normalizedPayload);
}

async function buildVerificationPayload({
    chainId,
    assetContract,
    tokenId,
    publicMetadataURI,
    publicMetadataHash,
    propertyRefHash,
    evidenceRoot,
    rightsModel,
    verificationStatus,
    signer,
}) {
    const payload = {
        version: 2,
        chainId: Number(chainId),
        assetContract,
        tokenId: Number(tokenId),
        publicMetadataURI,
        publicMetadataHash,
        propertyRefHash,
        evidenceRoot,
        rightsModel,
        verificationStatus,
    };

    const encodedPayload = encodePayload(payload);
    if (!signer || typeof signer.signMessage !== "function") {
        return encodedPayload;
    }

    const payloadDigest = ethers.keccak256(ethers.toUtf8Bytes(stableStringify(payload)));
    const signature = await signer.signMessage(payloadDigest);

    return encodePayload({
        ...payload,
        payloadDigest,
        signature,
    });
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
    buildLegacyVerificationPayload,
    buildVerificationPayload,
    parseVerificationPayload,
    buildVerificationUrl,
};
