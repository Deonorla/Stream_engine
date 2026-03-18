const { ethers } = require("ethers");

const RIGHTS_MODEL_CODES = {
    verified_rental_asset: 1,
    beneficial_interest: 2,
    revenue_rights_only: 3,
};

const RIGHTS_MODEL_LABELS = {
    1: "verified_rental_asset",
    2: "beneficial_interest",
    3: "revenue_rights_only",
};

const VERIFICATION_STATUS_CODES = {
    draft: 0,
    pending_attestation: 1,
    verified: 2,
    verified_with_warnings: 3,
    stale: 4,
    frozen: 5,
    revoked: 6,
    disputed: 7,
};

const VERIFICATION_STATUS_LABELS = {
    0: "draft",
    1: "pending_attestation",
    2: "verified",
    3: "verified_with_warnings",
    4: "stale",
    5: "frozen",
    6: "revoked",
    7: "disputed",
};

const ATTESTATION_ROLE_CODES = {
    issuer: 1,
    lawyer: 2,
    registrar: 3,
    inspector: 4,
    valuer: 5,
    insurer: 6,
    compliance: 7,
};

const ATTESTATION_ROLE_LABELS = {
    1: "issuer",
    2: "lawyer",
    3: "registrar",
    4: "inspector",
    5: "valuer",
    6: "insurer",
    7: "compliance",
};

const EVIDENCE_REQUIREMENTS = {
    verified_rental_asset: ["deed", "survey", "valuation", "inspection", "insurance", "tax"],
    beneficial_interest: ["deed", "valuation", "tax"],
    revenue_rights_only: ["tenancy", "valuation", "insurance"],
};

function stableValue(value) {
    if (Array.isArray(value)) {
        return value.map(stableValue);
    }
    if (value && typeof value === "object" && !(value instanceof Date)) {
        return Object.keys(value)
            .sort()
            .reduce((accumulator, key) => {
                accumulator[key] = stableValue(value[key]);
                return accumulator;
            }, {});
    }
    return value;
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function hashJson(value) {
    return ethers.keccak256(ethers.toUtf8Bytes(stableStringify(value)));
}

function hashText(value) {
    return ethers.keccak256(ethers.toUtf8Bytes(value || ""));
}

function normalizeRightsModel(value) {
    if (typeof value === "number" && RIGHTS_MODEL_LABELS[value]) {
        return {
            code: value,
            label: RIGHTS_MODEL_LABELS[value],
        };
    }

    const normalized = String(value || "verified_rental_asset")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    const code = RIGHTS_MODEL_CODES[normalized];
    if (!code) {
        throw new Error(`Unsupported rights model: ${value}`);
    }
    return {
        code,
        label: normalized,
    };
}

function normalizeVerificationStatus(value) {
    if (typeof value === "number" && VERIFICATION_STATUS_LABELS[value]) {
        return {
            code: value,
            label: VERIFICATION_STATUS_LABELS[value],
        };
    }

    const normalized = String(value || "draft")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    const code = VERIFICATION_STATUS_CODES[normalized];
    if (code == null) {
        throw new Error(`Unsupported verification status: ${value}`);
    }
    return {
        code,
        label: normalized,
    };
}

function normalizeAttestationRole(value) {
    if (typeof value === "number" && ATTESTATION_ROLE_LABELS[value]) {
        return {
            code: value,
            label: ATTESTATION_ROLE_LABELS[value],
        };
    }

    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    const code = ATTESTATION_ROLE_CODES[normalized];
    if (!code) {
        throw new Error(`Unsupported attestation role: ${value}`);
    }
    return {
        code,
        label: normalized,
    };
}

function codeToVerificationStatus(code) {
    return VERIFICATION_STATUS_LABELS[Number(code)] || "draft";
}

function codeToRightsModel(code) {
    return RIGHTS_MODEL_LABELS[Number(code)] || "verified_rental_asset";
}

function codeToAttestationRole(code) {
    return ATTESTATION_ROLE_LABELS[Number(code)] || "issuer";
}

module.exports = {
    RIGHTS_MODEL_CODES,
    RIGHTS_MODEL_LABELS,
    VERIFICATION_STATUS_CODES,
    VERIFICATION_STATUS_LABELS,
    ATTESTATION_ROLE_CODES,
    ATTESTATION_ROLE_LABELS,
    EVIDENCE_REQUIREMENTS,
    stableStringify,
    hashJson,
    hashText,
    normalizeRightsModel,
    normalizeVerificationStatus,
    normalizeAttestationRole,
    codeToVerificationStatus,
    codeToRightsModel,
    codeToAttestationRole,
};
