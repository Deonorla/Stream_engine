const { Keypair, StrKey } = require("@stellar/stellar-sdk");

function decodeStellarSignature(signature) {
    const raw = String(signature || "").trim();
    if (!raw) {
        return null;
    }

    if (/^[0-9a-f]+$/i.test(raw)) {
        return Buffer.from(raw, "hex");
    }

    return Buffer.from(raw, "base64");
}

function buildIssuerAuthorizationMessage(payload = {}) {
    return [
        "Stream Engine RWA Mint Authorization",
        `issuer:${String(payload.issuer || "").trim().toUpperCase()}`,
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
        `attestor:${String(payload.attestor || "").trim().toUpperCase()}`,
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
        `attestor:${String(payload.attestor || "").trim().toUpperCase()}`,
        `reason:${payload.reason || ""}`,
        `issuedAt:${payload.issuedAt || ""}`,
        `nonce:${payload.nonce || ""}`,
    ].join("\n");
}

function verifyStellarAuthorization({
    expectedSigner,
    signature,
    authorization = {},
    message,
    missingSignatureReason,
}) {
    const signatureType = String(authorization.signatureType || "stellar").toLowerCase();
    const signerAddress = String(authorization.signerAddress || expectedSigner || "").trim().toUpperCase();
    const normalizedExpected = String(expectedSigner || "").trim().toUpperCase();

    if (!normalizedExpected || !signature) {
        return {
            valid: false,
            reason: missingSignatureReason,
        };
    }

    if (signatureType !== "stellar") {
        return {
            valid: false,
            reason: "only stellar signatures are supported",
            message,
            signatureType,
            signerAddress,
        };
    }

    if (!StrKey.isValidEd25519PublicKey(signerAddress)) {
        return {
            valid: false,
            reason: "invalid stellar signer address",
            message,
            signatureType,
            signerAddress,
        };
    }

    if (signerAddress !== normalizedExpected) {
        return {
            valid: false,
            reason: "stellar signerAddress must match the declared signer",
            message,
            signatureType,
            signerAddress,
        };
    }

    try {
        const verifier = Keypair.fromPublicKey(signerAddress);
        const signatureBuffer = decodeStellarSignature(signature);
        const isValid = verifier.verify(Buffer.from(message), signatureBuffer);
        return {
            valid: isValid,
            reason: isValid ? "" : "invalid stellar signature",
            message,
            signatureType,
            signerAddress,
        };
    } catch (error) {
        return {
            valid: false,
            reason: error.message || "invalid stellar signature",
            message,
            signatureType,
            signerAddress,
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

    return verifyStellarAuthorization({
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

    return verifyStellarAuthorization({
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

    return verifyStellarAuthorization({
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
