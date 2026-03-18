const { ethers } = require("ethers");
const { signatureVerify, cryptoWaitReady } = require("@polkadot/util-crypto");
const { stringToHex } = require("@polkadot/util");

function buildIssuerAuthorizationMessage(payload = {}) {
    return [
        "Stream Engine RWA Mint Authorization",
        `issuer:${String(payload.issuer || "").toLowerCase()}`,
        `rightsModel:${payload.rightsModel || ""}`,
        `jurisdiction:${payload.jurisdiction || ""}`,
        `propertyRef:${payload.propertyRef || ""}`,
        `publicMetadataHash:${payload.publicMetadataHash || ""}`,
        `evidenceRoot:${payload.evidenceRoot || ""}`,
        `issuedAt:${payload.issuedAt || ""}`,
        `nonce:${payload.nonce || ""}`,
    ].join("\n");
}

function buildAttestationAuthorizationMessage(payload = {}) {
    return [
        "Stream Engine RWA Attestation Authorization",
        `tokenId:${payload.tokenId || ""}`,
        `role:${payload.role || ""}`,
        `attestor:${String(payload.attestor || "").toLowerCase()}`,
        `evidenceHash:${payload.evidenceHash || ""}`,
        `statementType:${payload.statementType || ""}`,
        `expiry:${payload.expiry || 0}`,
        `issuedAt:${payload.issuedAt || ""}`,
        `nonce:${payload.nonce || ""}`,
    ].join("\n");
}

function buildAttestationRevocationAuthorizationMessage(payload = {}) {
    return [
        "Stream Engine RWA Attestation Revocation Authorization",
        `attestationId:${payload.attestationId || ""}`,
        `attestor:${String(payload.attestor || "").toLowerCase()}`,
        `reason:${payload.reason || ""}`,
        `issuedAt:${payload.issuedAt || ""}`,
        `nonce:${payload.nonce || ""}`,
    ].join("\n");
}

async function verifyAuthorizationMessage({
    expectedSigner,
    signature,
    authorization,
    fallbackSignatureType = "evm",
    message,
    missingSignatureReason,
}) {
    const signatureType = String(
        authorization.signatureType || fallbackSignatureType
    ).toLowerCase();
    const signerAddress = authorization.signerAddress || expectedSigner;

    if (!expectedSigner || !signature) {
        return {
            valid: false,
            reason: missingSignatureReason,
        };
    }

    if (signatureType === "substrate") {
        await cryptoWaitReady();
        const verification = signatureVerify(
            stringToHex(message),
            signature,
            signerAddress
        );
        return {
            valid: verification.isValid,
            reason: verification.isValid ? "" : "invalid substrate signature",
            message,
            signatureType,
            signerAddress,
        };
    }

    if (String(signerAddress).toLowerCase() !== String(expectedSigner).toLowerCase()) {
        return {
            valid: false,
            reason: "evm signerAddress must match the declared signer",
            message,
            signatureType: "evm",
            signerAddress,
        };
    }

    try {
        const recovered = ethers.verifyMessage(message, signature);
        return {
            valid: recovered.toLowerCase() === signerAddress.toLowerCase(),
            reason:
                recovered.toLowerCase() === signerAddress.toLowerCase()
                    ? ""
                    : "invalid evm signature",
            recoveredAddress: recovered,
            message,
            signatureType: "evm",
            signerAddress,
        };
    } catch (error) {
        return {
            valid: false,
            reason: error.message || "invalid evm signature",
            message,
            signatureType: "evm",
        };
    }
}

async function verifyIssuerAuthorization({
    issuer,
    issuerSignature,
    issuerAuthorization,
    rightsModel,
    jurisdiction,
    propertyRef,
    publicMetadataHash,
    evidenceRoot,
}) {
    const authorization = issuerAuthorization || {};
    const signature = issuerSignature || authorization.signature;
    const issuedAt = authorization.issuedAt || "";
    const nonce = authorization.nonce || "";

    const message = buildIssuerAuthorizationMessage({
        issuer,
        rightsModel,
        jurisdiction,
        propertyRef,
        publicMetadataHash,
        evidenceRoot,
        issuedAt,
        nonce,
    });

    return verifyAuthorizationMessage({
        expectedSigner: issuer,
        signature,
        authorization,
        message,
        missingSignatureReason: "issuerSignature is required",
    });
}

async function verifyAttestationAuthorization({
    tokenId,
    role,
    attestor,
    evidenceHash,
    statementType,
    expiry,
    attestationAuthorization,
    attestorSignature,
}) {
    const authorization = attestationAuthorization || {};
    const signature = attestorSignature || authorization.signature;
    const issuedAt = authorization.issuedAt || "";
    const nonce = authorization.nonce || "";

    const message = buildAttestationAuthorizationMessage({
        tokenId,
        role,
        attestor,
        evidenceHash,
        statementType,
        expiry,
        issuedAt,
        nonce,
    });

    return verifyAuthorizationMessage({
        expectedSigner: attestor,
        signature,
        authorization,
        message,
        missingSignatureReason: "attestorSignature is required",
    });
}

async function verifyAttestationRevocationAuthorization({
    attestationId,
    attestor,
    reason,
    revocationAuthorization,
    attestorSignature,
}) {
    const authorization = revocationAuthorization || {};
    const signature = attestorSignature || authorization.signature;
    const issuedAt = authorization.issuedAt || "";
    const nonce = authorization.nonce || "";

    const message = buildAttestationRevocationAuthorizationMessage({
        attestationId,
        attestor,
        reason,
        issuedAt,
        nonce,
    });

    return verifyAuthorizationMessage({
        expectedSigner: attestor,
        signature,
        authorization,
        message,
        missingSignatureReason: "attestorSignature is required",
    });
}

module.exports = {
    buildIssuerAuthorizationMessage,
    buildAttestationAuthorizationMessage,
    buildAttestationRevocationAuthorizationMessage,
    verifyIssuerAuthorization,
    verifyAttestationAuthorization,
    verifyAttestationRevocationAuthorization,
};
