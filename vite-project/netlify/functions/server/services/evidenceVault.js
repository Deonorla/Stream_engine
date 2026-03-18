const {
    EVIDENCE_REQUIREMENTS,
    codeToRightsModel,
    hashJson,
    stableStringify,
} = require("./rwaModel");

const DEFAULT_DOCUMENT_KEYS = [
    "deed",
    "survey",
    "valuation",
    "inspection",
    "insurance",
    "tax",
    "tenancy",
    "encumbrance",
];

function toUnixTimestamp(value) {
    if (!value) {
        return null;
    }
    if (typeof value === "number") {
        return value;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function normalizeDocumentEntry(entry) {
    if (entry == null) {
        return null;
    }
    if (typeof entry === "string") {
        return {
            hash: entry.trim(),
            issuedAt: null,
            expiresAt: null,
            issuer: "",
            reference: "",
        };
    }
    if (typeof entry !== "object") {
        return null;
    }

    return {
        hash: String(entry.hash || entry.digest || entry.cid || "").trim(),
        issuedAt: toUnixTimestamp(entry.issuedAt),
        expiresAt: toUnixTimestamp(entry.expiresAt),
        issuer: String(entry.issuer || "").trim(),
        reference: String(entry.reference || entry.documentId || "").trim(),
        notes: String(entry.notes || "").trim(),
    };
}

function summarizeDocuments(documents = {}) {
    const entries = {};
    for (const key of DEFAULT_DOCUMENT_KEYS) {
        const normalized = normalizeDocumentEntry(documents[key]);
        entries[key] = normalized
            ? {
                present: Boolean(normalized.hash),
                issuedAt: normalized.issuedAt,
                expiresAt: normalized.expiresAt,
                issuer: normalized.issuer,
                reference: normalized.reference,
                hash: normalized.hash,
            }
            : {
                present: false,
                issuedAt: null,
                expiresAt: null,
                issuer: "",
                reference: "",
                hash: "",
            };
    }

    return entries;
}

class EvidenceVaultService {
    constructor(config = {}) {
        this.localStore = config.localStore || new Map();
    }

    buildRecord(bundle = {}, options = {}) {
        const rightsModel = options.rightsModel || codeToRightsModel(bundle.rightsModel);
        const documents = summarizeDocuments(bundle.documents || bundle);
        const requiredDocuments = EVIDENCE_REQUIREMENTS[rightsModel] || EVIDENCE_REQUIREMENTS.verified_rental_asset;
        const presentDocuments = Object.entries(documents)
            .filter(([, entry]) => entry.present)
            .map(([key]) => key);
        const missingRequiredDocuments = requiredDocuments.filter((key) => !documents[key]?.present);
        const expiringDocuments = Object.entries(documents)
            .filter(([, entry]) => entry.present && entry.expiresAt)
            .map(([key, entry]) => ({
                key,
                expiresAt: entry.expiresAt,
                expired: entry.expiresAt < Math.floor(Date.now() / 1000),
            }));

        const sanitizedBundle = {
            rightsModel,
            propertyRef: bundle.propertyRef || options.propertyRef || "",
            jurisdiction: bundle.jurisdiction || options.jurisdiction || "",
            notes: bundle.notes || "",
            documents,
        };
        const evidenceSummary = {
            rightsModel,
            requiredDocuments,
            presentDocuments,
            missingRequiredDocuments,
            documentCount: presentDocuments.length,
            freshness: expiringDocuments,
        };

        const evidenceRoot = hashJson({
            rightsModel,
            propertyRef: sanitizedBundle.propertyRef,
            jurisdiction: sanitizedBundle.jurisdiction,
            documents: Object.fromEntries(
                Object.entries(documents).map(([key, value]) => [
                    key,
                    value.present
                        ? {
                            hash: value.hash,
                            issuedAt: value.issuedAt,
                            expiresAt: value.expiresAt,
                            issuer: value.issuer,
                            reference: value.reference,
                        }
                        : null,
                ])
            ),
        });
        const evidenceManifestHash = hashJson({
            rightsModel,
            propertyRef: sanitizedBundle.propertyRef,
            jurisdiction: sanitizedBundle.jurisdiction,
            summary: evidenceSummary,
        });

        return {
            evidenceRoot,
            evidenceManifestHash,
            evidenceSummary,
            storedAt: Math.floor(Date.now() / 1000),
            bundle: sanitizedBundle,
        };
    }

    async storeBundle(bundle = {}, options = {}) {
        const record = this.buildRecord(bundle, options);
        this.localStore.set(record.evidenceRoot, record);
        return record;
    }

    async getBundle(evidenceRoot) {
        return this.localStore.get(evidenceRoot) || null;
    }

    async hasBundle(evidenceRoot) {
        return this.localStore.has(evidenceRoot);
    }

    exportBundle(record) {
        if (!record) {
            return null;
        }
        return JSON.parse(stableStringify({
            evidenceRoot: record.evidenceRoot,
            evidenceManifestHash: record.evidenceManifestHash,
            evidenceSummary: record.evidenceSummary,
            storedAt: record.storedAt,
            bundle: record.bundle,
        }));
    }
}

module.exports = {
    EvidenceVaultService,
    summarizeDocuments,
};
