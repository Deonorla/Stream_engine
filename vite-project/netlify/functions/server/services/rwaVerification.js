const {
    ATTESTATION_ROLE_CODES,
    codeToAttestationRole,
    codeToRightsModel,
    codeToVerificationStatus,
    hashText,
} = require("./rwaModel");
const { normalizeCid } = require("./ipfsService");

function toNumber(value) {
    if (value == null) {
        return 0;
    }
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    return Number(value.toString());
}

function buildCheck(key, label, passed, detail) {
    return {
        key,
        label,
        passed,
        detail,
    };
}

function evaluateVerification({
    asset,
    evidenceRecord,
    publicMetadata,
    activity = [],
    verificationInput = {},
    onChainVerification = null,
}) {
    const schemaVersion = Number(asset.schemaVersion || 1);
    if (schemaVersion <= 1) {
        const tokenUriMatches = verificationInput.canonicalURI
            ? asset.tokenURI === verificationInput.canonicalURI || asset.metadataURI === verificationInput.canonicalURI
            : true;
        const cidMatches = onChainVerification?.cidMatches ?? true;
        const tagMatches = onChainVerification?.tagMatches ?? true;
        const checks = [
            buildCheck("asset_exists", "Asset exists onchain", Boolean(onChainVerification?.assetExists ?? asset.exists), "Legacy asset located."),
            buildCheck("cid_match", "Legacy CID binding matches", cidMatches, cidMatches ? "CID hash matched." : "CID hash mismatch."),
            buildCheck("tag_match", "Legacy verification tag matches", tagMatches, tagMatches ? "Tag binding matched." : "Tag binding mismatch."),
            buildCheck(
                "token_uri_match",
                "Token URI matches public metadata",
                tokenUriMatches,
                tokenUriMatches ? "Token URI matched the provided metadata URI." : "Token URI mismatch."
            ),
        ];
        const failures = checks.filter((check) => !check.passed).map((check) => check.detail);
        const status = failures.length === 0 ? "legacy_verified" : "legacy_incomplete";
        return {
            status,
            checks,
            warnings: ["Legacy v1 asset uses CID/tag verification only."],
            failures,
            requiredActions:
                failures.length === 0
                    ? ["Migrate this asset to v2 evidence and attestation workflows for stronger verification."]
                    : ["Provide the correct CID/tag binding or migrate the asset to the v2 model."],
            evidenceCoverage: evidenceRecord?.evidenceSummary || {
                requiredDocuments: [],
                presentDocuments: [],
                missingRequiredDocuments: [],
                documentCount: 0,
            },
            attestationCoverage: {
                requiredRoles: [],
                presentRoles: [],
                missingRoles: [],
                attestations: [],
            },
            documentFreshness: {
                staleDocuments: [],
                validDocuments: [],
            },
            asset,
            activity,
        };
    }

    const checks = [];
    const warnings = [];
    const failures = [];
    const requiredActions = [];
    const now = Math.floor(Date.now() / 1000);
    const canonicalURI = verificationInput.canonicalURI || asset.publicMetadataURI || asset.metadataURI;
    const propertyRefHash = verificationInput.propertyRef ? hashText(verificationInput.propertyRef) : null;

    const onChainStatus = asset.verificationStatusLabel || codeToVerificationStatus(asset.verificationStatus);
    checks.push(
        buildCheck(
            "asset_exists",
            "Asset exists onchain",
            Boolean(asset.exists),
            asset.exists ? "The productive rental twin exists onchain." : "Asset was not found onchain."
        )
    );
    checks.push(
        buildCheck(
            "public_metadata_uri",
            "Public metadata URI matches",
            !canonicalURI || asset.publicMetadataURI === canonicalURI,
            !canonicalURI || asset.publicMetadataURI === canonicalURI
                ? "The onchain metadata URI matches the verification request."
                : "The onchain metadata URI does not match the requested URI."
        )
    );
    checks.push(
        buildCheck(
            "public_metadata_hash",
            "Public metadata hash matches",
            !verificationInput.publicMetadataHash || asset.publicMetadataHash === verificationInput.publicMetadataHash,
            !verificationInput.publicMetadataHash || asset.publicMetadataHash === verificationInput.publicMetadataHash
                ? "The public metadata hash matches the supplied metadata."
                : "The public metadata hash does not match the supplied metadata."
        )
    );
    checks.push(
        buildCheck(
            "property_ref",
            "Property reference matches",
            !propertyRefHash || asset.propertyRefHash === propertyRefHash,
            !propertyRefHash || asset.propertyRefHash === propertyRefHash
                ? "The property reference hash matches the verification request."
                : "The property reference hash does not match the verification request."
        )
    );
    checks.push(
        buildCheck(
            "evidence_root",
            "Evidence root is available",
            Boolean(asset.evidenceRoot && evidenceRecord),
            asset.evidenceRoot && evidenceRecord
                ? "A private evidence bundle is anchored and available in the server vault."
                : "The private evidence bundle could not be located on the server."
        )
    );

    const evidenceSummary = evidenceRecord?.evidenceSummary || {
        requiredDocuments: [],
        presentDocuments: [],
        missingRequiredDocuments: [],
        freshness: [],
        documentCount: 0,
    };
    if (evidenceSummary.missingRequiredDocuments.length > 0) {
        failures.push(`Missing required evidence documents: ${evidenceSummary.missingRequiredDocuments.join(", ")}`);
        requiredActions.push("Upload the missing deed, survey, valuation, inspection, insurance, or tax evidence.");
    }

    const staleDocuments = (evidenceSummary.freshness || [])
        .filter((entry) => entry.expired)
        .map((entry) => entry.key);
    if (staleDocuments.length > 0) {
        failures.push(`Expired evidence documents detected: ${staleDocuments.join(", ")}`);
        requiredActions.push("Refresh the expired evidence documents before marking the asset verified.");
    }

    const attestationPolicies = asset.attestationPolicies || [];
    const attestations = asset.attestations || [];
    const presentRoles = [];
    const missingRoles = [];
    const staleRoles = [];

    for (const policy of attestationPolicies) {
        if (!policy.required) {
            continue;
        }
        const roleLabel = codeToAttestationRole(policy.role);
        const validAttestation = attestations.find((attestation) => {
            const sameRole = Number(attestation.role) === Number(policy.role);
            const notRevoked = !attestation.revoked;
            const notExpired = !attestation.expiry || Number(attestation.expiry) >= now;
            const freshEnough = !policy.maxAge || Number(attestation.issuedAt) + Number(policy.maxAge) >= now;
            return sameRole && notRevoked && notExpired && freshEnough;
        });

        if (validAttestation) {
            presentRoles.push(roleLabel);
            continue;
        }

        const anyRoleAttestation = attestations.find((attestation) => Number(attestation.role) === Number(policy.role));
        if (anyRoleAttestation) {
            staleRoles.push(roleLabel);
        } else {
            missingRoles.push(roleLabel);
        }
    }

    if (missingRoles.length > 0) {
        failures.push(`Missing required attestations: ${missingRoles.join(", ")}`);
        requiredActions.push("Collect the missing role attestations before promoting the asset to verified.");
    }
    if (staleRoles.length > 0) {
        failures.push(`Stale or expired attestations detected: ${staleRoles.join(", ")}`);
        requiredActions.push("Refresh the stale attestations or update their expiry policy.");
    }

    if (onChainStatus === "frozen") {
        failures.push("Asset is frozen onchain.");
        requiredActions.push("Resolve the freeze reason and clear the asset policy before enabling claims.");
    }
    if (onChainStatus === "revoked") {
        failures.push("Asset is revoked onchain.");
    }
    if (onChainStatus === "disputed") {
        failures.push("Asset is disputed onchain.");
        requiredActions.push("Resolve the dispute before treating the asset as verified.");
    }

    for (const check of checks) {
        if (!check.passed) {
            failures.push(check.detail);
        }
    }

    if ((evidenceSummary.presentDocuments || []).length === 0) {
        warnings.push("No private evidence documents are attached in the server vault.");
    }
    if (publicMetadata?.legalTitleClaim === true) {
        warnings.push("Public metadata claims direct legal title transfer, which v2 does not represent.");
    }

    let status = "verified";
    if (failures.some((failure) => failure.includes("frozen"))) {
        status = "frozen";
    } else if (failures.some((failure) => failure.includes("revoked"))) {
        status = "revoked";
    } else if (failures.some((failure) => failure.includes("dispute"))) {
        status = "disputed";
    } else if (failures.some((failure) => failure.includes("Expired evidence") || failure.includes("Stale or expired attestations"))) {
        status = "stale";
    } else if (failures.length > 0) {
        status = failures.some((failure) => failure.includes("does not match")) ? "mismatch" : "incomplete";
    } else if (warnings.length > 0 || onChainStatus === "verified_with_warnings") {
        status = "verified_with_warnings";
    }

    return {
        status,
        checks,
        warnings,
        failures,
        requiredActions,
        evidenceCoverage: evidenceSummary,
        attestationCoverage: {
            requiredRoles: attestationPolicies.filter((policy) => policy.required).map((policy) => codeToAttestationRole(policy.role)),
            presentRoles,
            missingRoles,
            staleRoles,
            attestations,
        },
        documentFreshness: {
            staleDocuments,
            validDocuments: (evidenceSummary.freshness || [])
                .filter((entry) => !entry.expired)
                .map((entry) => entry.key),
        },
        asset,
        activity,
    };
}

module.exports = {
    evaluateVerification,
};
