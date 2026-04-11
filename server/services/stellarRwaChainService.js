const crypto = require("crypto");
const { StrKey } = require("@stellar/stellar-sdk");
const {
    ATTESTATION_ROLE_LABELS,
    VERIFICATION_STATUS_CODES,
    codeToAttestationRole,
    codeToRightsModel,
    codeToVerificationStatus,
    hashText,
    normalizeAttestationRole,
    normalizeRightsModel,
    normalizeVerificationStatus,
} = require("./rwaModel");
const { StellarAnchorService, formatStellarAmount } = require("./stellarAnchorService");
const { StellarSorobanContractService } = require("./stellarSorobanContractService");
const { deriveRentalActivity } = require("./rwaAssetScope");
const { resolveStellarRuntimeId, DEFAULT_STELLAR_DEPLOYMENTS } = require("../../utils/runtimeConfig");

const DEFAULT_ATTESTATION_POLICIES = {
    1: [
        { role: 2, roleLabel: "lawyer", required: true, maxAge: 60 * 60 * 24 * 180 },
        { role: 4, roleLabel: "inspector", required: true, maxAge: 60 * 60 * 24 * 180 },
    ],
    2: [
        { role: 4, roleLabel: "inspector", required: true, maxAge: 60 * 60 * 24 * 90 },
        { role: 6, roleLabel: "insurer", required: true, maxAge: 60 * 60 * 24 * 180 },
    ],
    3: [
        { role: 4, roleLabel: "inspector", required: true, maxAge: 60 * 60 * 24 * 90 },
        { role: 6, roleLabel: "insurer", required: true, maxAge: 60 * 60 * 24 * 180 },
    ],
};

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function cacheEntry(value, ttlMs) {
    return {
        value,
        expiresAt: Date.now() + Math.max(100, Number(ttlMs || 0)),
    };
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const source = Array.isArray(items) ? items : [];
    const limit = Math.max(1, Number(concurrency || 1));
    if (source.length === 0) {
        return [];
    }
    if (source.length === 1 || limit <= 1) {
        return Promise.all(source.map((item, index) => mapper(item, index)));
    }

    const results = new Array(source.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, source.length) }, async () => {
        while (cursor < source.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(source[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
}

function parseMetadata(metadata) {
    if (!metadata) {
        return {};
    }

    if (typeof metadata === "object") {
        return metadata;
    }

    try {
        return JSON.parse(String(metadata));
    } catch {
        return {};
    }
}

function toActivity(source, eventName, txHash, tokenId, metadata = {}, logIndex = 0) {
    return {
        source,
        eventName,
        txHash,
        tokenId: tokenId == null ? null : Number(tokenId),
        blockNumber: nowSeconds(),
        logIndex,
        metadata,
        timestamp: nowSeconds(),
    };
}

function normalizeAddress(value) {
    return String(value || "").trim().toUpperCase();
}

function sameAddress(left, right) {
    return normalizeAddress(left) && normalizeAddress(left) === normalizeAddress(right);
}

function directWalletRequired(action, details = {}) {
    return createError(
        "direct_wallet_required",
        `Stellar ${action} must be signed by the acting wallet directly. Backend relay fallbacks are disabled for scalable owner-auth writes.`,
        details
    );
}

function normalizeSessionAmount(value) {
    return BigInt(String(value || "0"));
}

function computeSessionStreamed(session, at = nowSeconds()) {
    const totalAmount = normalizeSessionAmount(session.totalAmount);
    const durationSeconds = Math.max(
        1,
        Number(session.durationSeconds || (Number(session.stopTime) - Number(session.startTime)) || 1)
    );
    const elapsed = Math.max(0, Math.min(Number(session.stopTime), at) - Number(session.startTime));
    const streamed = (totalAmount * BigInt(elapsed)) / BigInt(durationSeconds);
    return streamed > totalAmount ? totalAmount : streamed;
}

function computeSessionClaimable(session, at = nowSeconds()) {
    const streamed = computeSessionStreamed(session, at);
    const amountWithdrawn = normalizeSessionAmount(session.amountWithdrawn);
    return streamed > amountWithdrawn ? streamed - amountWithdrawn : 0n;
}

function computeSessionRefundable(session, at = nowSeconds()) {
    const totalAmount = normalizeSessionAmount(session.totalAmount);
    const streamed = computeSessionStreamed(session, at);
    return totalAmount > streamed ? totalAmount - streamed : 0n;
}

function computeYieldStreamed(stream, at = nowSeconds()) {
    const totalAmount = normalizeSessionAmount(stream.totalAmount);
    const durationSeconds = Math.max(
        1,
        Number(stream.durationSeconds || (Number(stream.stopTime) - Number(stream.startTime)) || 1)
    );
    const elapsed = Math.max(0, Math.min(Number(stream.stopTime), at) - Number(stream.startTime));
    const streamed = (totalAmount * BigInt(elapsed)) / BigInt(durationSeconds);
    return streamed > totalAmount ? totalAmount : streamed;
}

function computeYieldClaimable(stream, at = nowSeconds()) {
    const streamed = computeYieldStreamed(stream, at);
    const withdrawnAmount = normalizeSessionAmount(stream.withdrawnAmount);
    const flashAdvanceOutstanding = normalizeSessionAmount(stream.flashAdvanceOutstanding);
    const reserved = withdrawnAmount + flashAdvanceOutstanding;
    return streamed > reserved ? streamed - reserved : 0n;
}

function normalizeChainSession(session, fallbackMetadata = "") {
    const startTime = Number(session?.start_time || 0);
    const stopTime = Number(session?.stop_time || 0);
    const durationSeconds = Math.max(1, stopTime - startTime);
    const totalAmount = normalizeSessionAmount(session?.total_amount);
    const amountWithdrawn = normalizeSessionAmount(session?.claimed_amount);
    const flowRate = totalAmount / BigInt(durationSeconds);
    return {
        id: Number(session?.session_id || 0),
        sender: session?.payer || "",
        recipient: session?.recipient || "",
        totalAmount: totalAmount.toString(),
        flowRate: flowRate.toString(),
        durationSeconds,
        startTime,
        stopTime,
        amountWithdrawn: amountWithdrawn.toString(),
        isActive: Number(session?.status || 0) === 1,
        isFrozen: Boolean(session?.frozen),
        metadata: fallbackMetadata || "",
        txHash: "",
        fundingTxHash: "",
        fundedOnchain: true,
        assetCode: session?.asset_code || "",
        assetIssuer: session?.asset_issuer || "",
        escrowAddress: "",
    };
}

function normalizeChainAttestation(record) {
    if (!record) {
        return null;
    }

    const role = Number(record.role || 0);
    return {
        attestationId: Number(record.attestation_id || record.attestationId || 0),
        tokenId: Number(record.token_id || record.tokenId || 0),
        role,
        roleLabel: codeToAttestationRole(role),
        attestor: record.attestor || "",
        evidenceHash: record.evidence_hash || record.evidenceHash || "",
        statementType: record.statement_type || record.statementType || "",
        issuedAt: Number(record.issued_at || record.issuedAt || 0),
        expiry: Number(record.expiry || 0),
        revoked: Boolean(record.revoked),
        revocationReason: record.revocation_reason || record.revocationReason || "",
    };
}

function normalizeYieldStream(stream) {
    if (!stream) {
        return null;
    }

    const startTime = Number(stream.start_time || stream.startTime || 0);
    const stopTime = Number(stream.stop_time || stream.stopTime || 0);
    return {
        streamId: Number(stream.stream_id || stream.streamId || 0),
        tokenId: Number(stream.token_id || stream.tokenId || 0),
        sender: stream.sender || "",
        token: stream.token || "",
        totalAmount: String(stream.total_amount || stream.totalAmount || "0"),
        withdrawnAmount: String(stream.withdrawn_amount || stream.withdrawnAmount || "0"),
        flashAdvanceOutstanding: String(
            stream.flash_advance_outstanding || stream.flashAdvanceOutstanding || "0"
        ),
        startTime,
        stopTime,
        durationSeconds: Math.max(1, stopTime - startTime),
        status: Number(stream.status || 0),
        isActive: Number(stream.status || 0) === 1,
    };
}

function deriveAssetPolicy(verificationStatus, statusReason = "") {
    const status = Number(verificationStatus || 0);
    return {
        frozen: status === VERIFICATION_STATUS_CODES.frozen,
        disputed: status === VERIFICATION_STATUS_CODES.disputed,
        revoked: status === VERIFICATION_STATUS_CODES.revoked,
        updatedAt: nowSeconds(),
        updatedBy: "",
        reason: statusReason || "",
    };
}

function deriveRentalReadiness(asset) {
    const ownerAddress = String(asset?.currentOwner || asset?.ownerAddress || asset?.assetAddress || "").trim();
    const verificationStatus = String(asset?.verificationStatusLabel || "").trim();
    const statusReason = String(asset?.statusReason || asset?.assetPolicy?.reason || "").trim();
    const policy = asset?.assetPolicy || {};

    if (!ownerAddress) {
        return {
            ready: false,
            code: "owner_missing",
            label: "Needs Owner Sync",
            reason: "This asset does not have a Stellar owner account yet.",
            severity: "warning",
        };
    }

    if (!StrKey.isValidEd25519PublicKey(ownerAddress)) {
        return {
            ready: false,
            code: "owner_sync_required",
            label: "Needs Owner Sync",
            reason: "The asset owner is still using a legacy non-Stellar address.",
            severity: "warning",
        };
    }

    if (policy.revoked || verificationStatus === "revoked") {
        return {
            ready: false,
            code: "revoked",
            label: "Rental Disabled",
            reason: statusReason || "This asset has been revoked and cannot open new rental sessions.",
            severity: "error",
        };
    }

    if (policy.disputed || verificationStatus === "disputed") {
        return {
            ready: false,
            code: "disputed",
            label: "Rental Blocked",
            reason: statusReason || "This asset is under dispute and cannot open new rental sessions.",
            severity: "error",
        };
    }

    if (policy.frozen || verificationStatus === "frozen") {
        return {
            ready: false,
            code: "frozen",
            label: "Rental Paused",
            reason: statusReason || "This asset is frozen and cannot open new rental sessions.",
            severity: "error",
        };
    }

    if (verificationStatus === "stale") {
        return {
            ready: false,
            code: "stale",
            label: "Refresh Required",
            reason: statusReason || "Evidence freshness has lapsed and the asset needs compliance refresh.",
            severity: "warning",
        };
    }

    if (verificationStatus === "incomplete" || verificationStatus === "legacy_incomplete" || verificationStatus === "mismatch") {
        return {
            ready: false,
            code: verificationStatus || "incomplete",
            label: "Verification Incomplete",
            reason: statusReason || "This asset still needs verification work before rentals can start.",
            severity: "warning",
        };
    }

    if (verificationStatus === "pending_attestation") {
        return {
            ready: true,
            code: "ready_pending_attestation",
            label: "Stellar Rental Ready",
            reason: "The asset can open rental sessions while attestation review is still pending.",
            severity: "info",
        };
    }

    if (verificationStatus === "verified_with_warnings") {
        return {
            ready: true,
            code: "ready_with_warnings",
            label: "Stellar Rental Ready",
            reason: statusReason || "The asset is rentable, but there are verification warnings to review.",
            severity: "info",
        };
    }

    return {
        ready: true,
        code: "ready",
        label: "Stellar Rental Ready",
        reason: statusReason || "The asset owner and policy state are ready for live Stellar rental sessions.",
        severity: "success",
    };
}

function normalizeChainAsset(asset, extras = {}) {
    if (!asset) {
        return null;
    }

    const verificationStatus = Number(asset.verification_status || asset.verificationStatus || 0);
    const statusReason = asset.status_reason || asset.statusReason || "";
    const normalizedAsset = {
        tokenId: Number(asset.token_id || asset.tokenId || 0),
        schemaVersion: Number(asset.schema_version || asset.schemaVersion || 2),
        assetType: Number(asset.asset_type || asset.assetType || 0),
        rightsModel: Number(asset.rights_model || asset.rightsModel || 0),
        rightsModelLabel: codeToRightsModel(Number(asset.rights_model || asset.rightsModel || 0)),
        verificationStatus,
        verificationStatusLabel: codeToVerificationStatus(verificationStatus),
        cidHash: asset.cid_hash || asset.cidHash || "",
        tagHash: asset.tag_hash || asset.tagHash || "",
        issuer: asset.issuer || "",
        activeStreamId: Number(asset.active_stream_id || asset.activeStreamId || 0),
        propertyRefHash: asset.property_ref_hash || asset.propertyRefHash || "",
        publicMetadataHash: asset.public_metadata_hash || asset.publicMetadataHash || "",
        evidenceRoot: asset.evidence_root || asset.evidenceRoot || "",
        evidenceManifestHash: asset.evidence_manifest_hash || asset.evidenceManifestHash || "",
        publicMetadataURI: asset.public_metadata_uri || asset.publicMetadataURI || "",
        metadataURI: asset.public_metadata_uri || asset.publicMetadataURI || "",
        tokenURI: asset.public_metadata_uri || asset.publicMetadataURI || "",
        jurisdiction: asset.jurisdiction || "",
        statusReason,
        createdAt: Number(asset.created_at || asset.createdAt || nowSeconds()),
        updatedAt: Number(asset.updated_at || asset.updatedAt || nowSeconds()),
        verificationUpdatedAt: Number(asset.verification_updated_at || asset.verificationUpdatedAt || nowSeconds()),
        exists: true,
        currentOwner: asset.current_owner || asset.currentOwner || "",
        claimableYield: String(extras.claimableYield || "0"),
        totalYieldDeposited: String(extras.totalYieldDeposited || "0"),
        flashAdvanceOutstanding: String(extras.flashAdvanceOutstanding || "0"),
        stream: extras.stream || null,
        compliance: extras.compliance || null,
        assetPolicy: deriveAssetPolicy(verificationStatus, statusReason),
        attestationPolicies: extras.attestationPolicies || [],
        attestations: extras.attestations || [],
        txHash: "",
    };

    const rentalReadiness = deriveRentalReadiness(normalizedAsset);
    normalizedAsset.rentalReady = rentalReadiness.ready;
    normalizedAsset.rentalReadiness = rentalReadiness;
    normalizedAsset.readinessCode = rentalReadiness.code;
    normalizedAsset.readinessLabel = rentalReadiness.label;
    normalizedAsset.readinessReason = rentalReadiness.reason;

    return normalizedAsset;
}

function applyRentalReadiness(asset) {
    const rentalReadiness = deriveRentalReadiness(asset);
    asset.rentalReady = rentalReadiness.ready;
    asset.rentalReadiness = rentalReadiness;
    asset.readinessCode = rentalReadiness.code;
    asset.readinessLabel = rentalReadiness.label;
    asset.readinessReason = rentalReadiness.reason;
    return asset;
}

function applyRentalActivity(asset, sessions = []) {
    asset.rentalActivity = deriveRentalActivity(asset, sessions);
    asset.currentlyRented = Boolean(asset.rentalActivity.currentlyRented);
    return asset;
}

function deriveSessionStatus(session, claimable, refundableAmount, consumedAmount) {
    if (session?.isFrozen) {
        return { code: "frozen", label: "Frozen" };
    }
    if (session?.isActive) {
        return { code: "active", label: "Active" };
    }
    if (refundableAmount > 0n) {
        return { code: "cancelled", label: "Cancelled" };
    }
    if (claimable > 0n || consumedAmount > 0n) {
        return { code: "settled", label: "Settled" };
    }
    return { code: "ended", label: "Ended" };
}

class StellarRWAChainService {
    constructor(config = {}) {
        this.runtime = config.runtime || {};
        this.store = config.store;
        this.anchorService = new StellarAnchorService({
            horizonUrl: this.runtime.horizonUrl,
            networkPassphrase: this.runtime.networkPassphrase,
            operatorSecret:
                config.operatorSecret
                || process.env.STELLAR_OPERATOR_SECRET
                || process.env.PRIVATE_KEY
                || "",
            operatorPublicKey:
                config.operatorPublicKey
                || process.env.STELLAR_OPERATOR_PUBLIC_KEY
                || "",
            anchorMode: process.env.STELLAR_ANCHOR_MODE || "simulated",
        });
        this.signer = {
            address:
                this.anchorService.operatorPublicKey
                || process.env.STELLAR_OPERATOR_PUBLIC_KEY
                || process.env.STELLAR_PLATFORM_ADDRESS
                || "",
        };
        this.provider = {
            getNetwork: async () => ({
                chainId: BigInt(this.runtime.chainId || 0),
                name: this.runtime.networkName || "Stellar Testnet",
            }),
        };
        this.kind = "stellar";
        this.hubAddress = resolveStellarRuntimeId(
            config.hubAddress || process.env.STREAM_ENGINE_RWA_HUB_ADDRESS,
            this.runtime.contracts?.rwaRegistry?.contractId || DEFAULT_STELLAR_DEPLOYMENTS.rwaRegistry
        );
        this.assetNFTAddress = resolveStellarRuntimeId(
            config.assetNFTAddress || process.env.STREAM_ENGINE_RWA_ASSET_NFT_ADDRESS,
            this.runtime.contracts?.rwaRegistry?.contractId || DEFAULT_STELLAR_DEPLOYMENTS.rwaRegistry
        );
        this.assetRegistryAddress = resolveStellarRuntimeId(
            config.assetRegistryAddress || process.env.STREAM_ENGINE_RWA_ASSET_REGISTRY_ADDRESS,
            this.runtime.contracts?.rwaRegistry?.contractId || DEFAULT_STELLAR_DEPLOYMENTS.rwaRegistry
        );
        this.attestationRegistryAddress = resolveStellarRuntimeId(
            config.attestationRegistryAddress || process.env.STREAM_ENGINE_RWA_ATTESTATION_REGISTRY_ADDRESS,
            this.runtime.contracts?.attestationRegistry?.contractId || DEFAULT_STELLAR_DEPLOYMENTS.attestationRegistry
        );
        this.assetStreamAddress = resolveStellarRuntimeId(
            config.assetStreamAddress || process.env.STREAM_ENGINE_RWA_ASSET_STREAM_ADDRESS,
            this.runtime.contracts?.yieldVault?.contractId || DEFAULT_STELLAR_DEPLOYMENTS.yieldVault
        );
        this.complianceGuardAddress = config.complianceGuardAddress || process.env.STREAM_ENGINE_RWA_COMPLIANCE_GUARD_ADDRESS || "stellar:policy";
        this.sessionEscrowAddress =
            config.sessionEscrowAddress
            || this.signer.address
            || process.env.STELLAR_OPERATOR_PUBLIC_KEY
            || process.env.STREAM_ENGINE_RECIPIENT_ADDRESS
            || "";
        this.sessionMeterAddress =
            resolveStellarRuntimeId(
                config.sessionMeterAddress
                || process.env.STREAM_ENGINE_CONTRACT_ADDRESS,
                this.runtime.contracts?.sessionMeter?.contractId || DEFAULT_STELLAR_DEPLOYMENTS.sessionMeter
            );
        this.nativeTokenAddress =
            resolveStellarRuntimeId(
                process.env.STELLAR_NATIVE_XLM_SAC_ADDRESS,
                this.runtime.sac?.nativeXlm || DEFAULT_STELLAR_DEPLOYMENTS.nativeXlmSac
            );
        this.contractService = new StellarSorobanContractService({
            rpcUrl: this.runtime.sorobanRpcUrl || this.runtime.rpcUrl,
            horizonUrl: this.runtime.horizonUrl,
            networkPassphrase: this.runtime.networkPassphrase,
            operatorSecret:
                config.operatorSecret
                || process.env.STELLAR_OPERATOR_SECRET
                || process.env.PRIVATE_KEY
                || "",
            operatorPublicKey:
                config.operatorPublicKey
                || process.env.STELLAR_OPERATOR_PUBLIC_KEY
                || process.env.STELLAR_PLATFORM_ADDRESS
                || "",
        });
        this.attestationPoliciesCache = new Map();
        this.complianceCache = new Map();
        this.attestationsCache = new Map();
        this.assetSnapshotCache = new Map();
    }

    isConfigured() {
        return Boolean(this.store && this.contractService.isConfigured());
    }

    async init() {
        return null;
    }

    canOperatorAuthorize(address) {
        return sameAddress(address, this.signer.address);
    }

    getCacheValue(cache, key) {
        const entry = cache.get(key);
        if (!entry) {
            return null;
        }
        if (Date.now() > Number(entry.expiresAt || 0)) {
            cache.delete(key);
            return null;
        }
        return entry.value;
    }

    setCacheValue(cache, key, value, ttlMs) {
        cache.set(key, cacheEntry(value, ttlMs));
        return value;
    }

    cloneCachedAsset(asset) {
        return asset ? JSON.parse(JSON.stringify(asset)) : null;
    }

    async getCurrentBlockNumber() {
        return nowSeconds();
    }

    async getBlockTimestamp(blockNumber) {
        return Number(blockNumber || nowSeconds());
    }

    getEventSources() {
        return [];
    }

    async getIssuerApproval(issuer) {
        try {
            const approval = await this.contractService.invokeView({
                contractId: this.assetRegistryAddress,
                method: "get_issuer_approval",
                args: [
                    { type: "address", value: issuer },
                ],
            });
            const record = {
                issuer,
                approved: Boolean(approval?.approved),
                note: approval?.note || "",
                updatedAt: Number(approval?.updated_at || 0),
            };
            await this.store.upsertIssuerApproval(record);
            return record;
        } catch (error) {
            return this.store.getIssuerApproval(issuer);
        }
    }

    async setIssuerApproval({ issuer, approved, note = "" }) {
        const chainWrite = await this.contractService.invokeWrite({
            contractId: this.assetRegistryAddress,
            method: "set_issuer_approval",
            args: [
                { type: "address", value: this.signer.address },
                { type: "address", value: issuer },
                { type: "bool", value: approved },
                { type: "string", value: note },
            ],
        });
        const record = {
            issuer,
            approved: Boolean(approved),
            note,
            updatedAt: nowSeconds(),
            updatedBy: this.signer.address,
            txHash: chainWrite.txHash,
        };
        await this.store.upsertIssuerApproval(record);
        await this.store.recordActivity(
            toActivity("policy", "IssuerApprovalUpdated", chainWrite.txHash, null, record)
        );
        return { txHash: chainWrite.txHash, issuer, approved: Boolean(approved) };
    }

    async getCompliance(user, assetType) {
        const cacheKey = `${normalizeAddress(user)}:${Number(assetType)}`;
        const cached = this.getCacheValue(this.complianceCache, cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const record = await this.contractService.invokeView({
                contractId: this.assetRegistryAddress,
                method: "get_compliance",
                args: [
                    { type: "address", value: user },
                    { type: "u32", value: Number(assetType) },
                ],
            });
            const payload = {
                approved: Boolean(record?.approved),
                expiry: Number(record?.expiry || 0),
                jurisdiction: record?.jurisdiction || "",
                updatedAt: Number(record?.updated_at || 0),
                currentlyValid:
                    Boolean(record?.approved)
                    && (!Number(record?.expiry || 0) || Number(record?.expiry || 0) >= nowSeconds()),
            };
            await this.store.upsertRecord(`compliance:${String(user).toLowerCase()}:${Number(assetType)}`, payload);
            return this.setCacheValue(
                this.complianceCache,
                cacheKey,
                payload,
                Number(process.env.STELLAR_COMPLIANCE_CACHE_TTL_MS || 15_000)
            );
        } catch (error) {
            const fallback = await this.store.getRecord(`compliance:${String(user).toLowerCase()}:${Number(assetType)}`);
            if (!fallback) {
                return null;
            }
            return this.setCacheValue(
                this.complianceCache,
                cacheKey,
                fallback,
                Number(process.env.STELLAR_COMPLIANCE_CACHE_TTL_MS || 15_000)
            );
        }
    }

    async setCompliance({ user, assetType, approved, expiry, jurisdiction }) {
        const payload = {
            user,
            assetType: Number(assetType),
            approved: Boolean(approved),
            expiry: Number(expiry || 0),
            jurisdiction: jurisdiction || "",
            updatedAt: nowSeconds(),
            updatedBy: this.signer.address,
        };
        const chainWrite = await this.contractService.invokeWrite({
            contractId: this.assetRegistryAddress,
            method: "set_compliance",
            args: [
                { type: "address", value: this.signer.address },
                { type: "address", value: user },
                { type: "u32", value: Number(assetType) },
                { type: "bool", value: Boolean(approved) },
                { type: "u64", value: BigInt(Number(expiry || 0)) },
                { type: "string", value: jurisdiction || "" },
            ],
        });
        payload.txHash = chainWrite.txHash;
        await this.store.upsertRecord(`compliance:${String(user).toLowerCase()}:${Number(assetType)}`, payload);
        this.setCacheValue(
            this.complianceCache,
            `${normalizeAddress(user)}:${Number(assetType)}`,
            payload,
            Number(process.env.STELLAR_COMPLIANCE_CACHE_TTL_MS || 15_000)
        );
        await this.store.recordActivity(
            toActivity("policy", "ComplianceUpdated", chainWrite.txHash, null, payload)
        );
        return { txHash: chainWrite.txHash };
    }

    async getAttestationPolicies(assetType) {
        const resolvedAssetType = Number(assetType || 1);
        const cached = this.getCacheValue(this.attestationPoliciesCache, String(resolvedAssetType));
        if (cached) {
            return cached;
        }
        const policies = [];
        const defaults = DEFAULT_ATTESTATION_POLICIES[resolvedAssetType] || [];
        const defaultByRole = new Map(defaults.map((entry) => [Number(entry.role), entry]));

        try {
            const chainPolicies = await this.contractService.invokeView({
                contractId: this.attestationRegistryAddress,
                method: "get_policies",
                args: [
                    { type: "u32", value: resolvedAssetType },
                ],
            });

            for (const entry of Array.isArray(chainPolicies) ? chainPolicies : []) {
                const role = Number(entry?.role || 0);
                const payload = {
                    role,
                    roleLabel: codeToAttestationRole(role),
                    required: Boolean(entry?.required),
                    maxAge: Number(entry?.max_age || 0),
                };
                policies.push(payload);
                await this.store.upsertRecord(`policy:attestation:${resolvedAssetType}:${role}`, payload);
                defaultByRole.delete(role);
            }
        } catch {
            // Fall back to cached defaults below.
        }

        for (const entry of defaults) {
            const override = await this.store.getRecord(`policy:attestation:${resolvedAssetType}:${entry.role}`);
            policies.push({
                ...entry,
                ...(override || {}),
                role: Number((override && override.role) || entry.role),
                roleLabel: codeToAttestationRole(Number((override && override.role) || entry.role)),
                required:
                    override?.required == null ? Boolean(entry.required) : Boolean(override.required),
                maxAge:
                    override?.maxAge == null ? Number(entry.maxAge) : Number(override.maxAge),
            });
        }

        const deduped = Array.from(
            new Map(policies.map((entry) => [Number(entry.role), entry])).values()
        );
        return this.setCacheValue(
            this.attestationPoliciesCache,
            String(resolvedAssetType),
            deduped.sort((left, right) => Number(left.role) - Number(right.role)),
            Number(process.env.STELLAR_POLICY_CACHE_TTL_MS || 60_000)
        );
    }

    async setAttestationPolicy({ assetType, role, required, maxAge }) {
        const normalizedRole = normalizeAttestationRole(role);
        const payload = {
            assetType: Number(assetType),
            role: normalizedRole.code,
            roleLabel: normalizedRole.label,
            required: Boolean(required),
            maxAge: Number(maxAge || 0),
            updatedAt: nowSeconds(),
            updatedBy: this.signer.address,
        };
        const chainWrite = await this.contractService.invokeWrite({
            contractId: this.attestationRegistryAddress,
            method: "set_policy",
            args: [
                { type: "address", value: this.signer.address },
                { type: "u32", value: Number(assetType) },
                { type: "u32", value: normalizedRole.code },
                { type: "bool", value: Boolean(required) },
                { type: "u64", value: BigInt(Number(maxAge || 0)) },
            ],
        });
        payload.txHash = chainWrite.txHash;
        await this.store.upsertRecord(`policy:attestation:${payload.assetType}:${payload.role}`, payload);
        this.attestationPoliciesCache.delete(String(payload.assetType));
        await this.store.recordActivity(
            toActivity("policy", "AttestationPolicyUpdated", chainWrite.txHash, null, payload)
        );
        return { txHash: chainWrite.txHash };
    }

    async mintAsset({
        publicMetadataURI,
        assetType = 1,
        rightsModel = 1,
        publicMetadataHash,
        evidenceRoot,
        evidenceManifestHash,
        propertyRefHash,
        jurisdiction = "",
        cidHash,
        tagHash,
        issuer,
        statusReason = "",
    }) {
        const attestationPolicies = await this.getAttestationPolicies(assetType);
        const requiresAttestations = attestationPolicies.some((policy) => policy.required);
        const verificationStatus = requiresAttestations
            ? VERIFICATION_STATUS_CODES.pending_attestation
            : VERIFICATION_STATUS_CODES.verified;
        const canWriteOnchain = this.assetRegistryAddress && this.contractService.isConfigured();

        if (!canWriteOnchain) {
            throw createError(
                "backend_unavailable",
                "The Stellar registry backend is not configured for mint writes."
            );
        }

        const chainWrite = await this.contractService.invokeWrite({
            contractId: this.assetRegistryAddress,
            method: "mint_asset",
            args: [
                { type: "address", value: issuer },
                { type: "u32", value: Number(assetType) },
                { type: "u32", value: Number(rightsModel) },
                { type: "string", value: publicMetadataURI },
                { type: "string", value: publicMetadataHash },
                { type: "string", value: evidenceRoot },
                { type: "string", value: evidenceManifestHash },
                { type: "string", value: propertyRefHash },
                { type: "string", value: jurisdiction || "" },
                { type: "string", value: cidHash || "" },
                { type: "string", value: tagHash || "" },
                { type: "string", value: statusReason || "" },
            ],
        });
        const tokenId = Number(chainWrite.result || 0);
        const txHash = chainWrite.txHash;

        const compliance = (await this.getCompliance(issuer, assetType)) || {
            approved: true,
            expiry: 0,
            jurisdiction,
            currentlyValid: true,
        };
        const snapshot = {
            tokenId,
            schemaVersion: 2,
            assetType: Number(assetType),
            rightsModel: Number(rightsModel),
            rightsModelLabel: codeToRightsModel(rightsModel),
            verificationStatus,
            verificationStatusLabel: codeToVerificationStatus(verificationStatus),
            cidHash,
            tagHash,
            issuer,
            activeStreamId: 0,
            propertyRefHash,
            publicMetadataHash,
            evidenceRoot,
            evidenceManifestHash,
            publicMetadataURI,
            metadataURI: publicMetadataURI,
            tokenURI: publicMetadataURI,
            jurisdiction,
            statusReason:
                statusReason
                || (requiresAttestations
                    ? "Awaiting attestation review"
                    : "Verified productive rental twin"),
            createdAt: nowSeconds(),
            updatedAt: nowSeconds(),
            verificationUpdatedAt: nowSeconds(),
            exists: true,
            currentOwner: issuer,
            claimableYield: "0",
            totalYieldDeposited: "0",
            flashAdvanceOutstanding: "0",
            stream: {
                streamId: 0,
                sender: issuer,
                assetType: Number(assetType),
                totalAmount: "0",
                flowRate: "0",
                startTime: 0,
                stopTime: 0,
                amountWithdrawn: "0",
                isActive: false,
                isFrozen: false,
            },
            compliance: {
                ...compliance,
                currentlyValid:
                    Boolean(compliance.approved)
                    && (!Number(compliance.expiry) || Number(compliance.expiry) >= nowSeconds()),
            },
            assetPolicy: {
                frozen: false,
                disputed: false,
                revoked: false,
                updatedAt: nowSeconds(),
                updatedBy: this.signer.address,
                reason: "",
            },
            attestationPolicies,
            attestations: [],
            txHash,
        };

        const onchainSnapshot = await this.getAssetSnapshot(tokenId);
        if (onchainSnapshot) {
            snapshot.verificationStatus = onchainSnapshot.verificationStatus;
            snapshot.verificationStatusLabel = onchainSnapshot.verificationStatusLabel;
            snapshot.statusReason = onchainSnapshot.statusReason;
            snapshot.createdAt = onchainSnapshot.createdAt;
            snapshot.updatedAt = onchainSnapshot.updatedAt;
            snapshot.verificationUpdatedAt = onchainSnapshot.verificationUpdatedAt;
        }

        await this.store.upsertAsset(snapshot);
        await this.store.recordActivity(
            toActivity("registry", "AssetRegistered", txHash, tokenId, {
                tokenId,
                issuer,
                assetType: Number(assetType),
                rightsModel: codeToRightsModel(rightsModel),
            })
        );

        return { tokenId, txHash };
    }

    async getAttestationRecord(attestationId) {
        try {
            const record = await this.contractService.invokeView({
                contractId: this.attestationRegistryAddress,
                method: "get_attestation",
                args: [
                    { type: "u64", value: BigInt(Number(attestationId)) },
                ],
            });
            const normalized = normalizeChainAttestation(record);
            if (!normalized) {
                return null;
            }
            await this.store.upsertRecord(`attestation:${normalized.attestationId}`, normalized);
            return normalized;
        } catch (error) {
            return this.store.getRecord(`attestation:${Number(attestationId)}`);
        }
    }

    async getAttestations(tokenId) {
        const cacheKey = String(Number(tokenId));
        const cached = this.getCacheValue(this.attestationsCache, cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const records = await this.contractService.invokeView({
                contractId: this.attestationRegistryAddress,
                method: "list_for_token",
                args: [
                    { type: "u64", value: BigInt(Number(tokenId)) },
                ],
            });
            const normalized = (Array.isArray(records) ? records : [])
                .map((record) => normalizeChainAttestation(record))
                .filter(Boolean)
                .sort((left, right) => Number(left.attestationId) - Number(right.attestationId));
            for (const entry of normalized) {
                await this.store.upsertRecord(`attestation:${entry.attestationId}`, entry);
            }
            return this.setCacheValue(
                this.attestationsCache,
                cacheKey,
                normalized,
                Number(process.env.STELLAR_ATTESTATION_CACHE_TTL_MS || 15_000)
            );
        } catch (error) {
            const asset = await this.store.getAsset(tokenId);
            const fallback = asset?.attestations || [];
            return this.setCacheValue(
                this.attestationsCache,
                cacheKey,
                fallback,
                Number(process.env.STELLAR_ATTESTATION_CACHE_TTL_MS || 15_000)
            );
        }
    }

    async registerAttestation({ tokenId, role, attestor, evidenceHash, statementType, expiry }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }

        const normalizedRole = normalizeAttestationRole(role);
        const canWriteOnchain = this.attestationRegistryAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(attestor);

        if (canWriteOnchain) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.attestationRegistryAddress,
                method: "register_attestation",
                args: [
                    { type: "address", value: attestor },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "u32", value: normalizedRole.code },
                    { type: "string", value: evidenceHash },
                    { type: "string", value: statementType },
                    { type: "u64", value: BigInt(Number(expiry || 0)) },
                ],
            });
            const attestationId = Number(chainWrite.result || 0);
            const attestation = await this.getAttestationRecord(attestationId);
            const refreshed = await this.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.store.upsertAsset(refreshed);
            }
            await this.store.recordActivity(
                toActivity("attestation", "AttestationRegistered", chainWrite.txHash, tokenId, attestation || {
                    attestationId,
                    role: normalizedRole.code,
                    roleLabel: normalizedRole.label,
                    attestor,
                })
            );
            return { attestationId, txHash: chainWrite.txHash };
        }
        throw directWalletRequired("attestation registration", {
            attestor,
            tokenId: Number(tokenId),
            operator: this.signer.address,
            authPath: "wallet_native",
        });
    }

    async revokeAttestation({ attestationId, reason = "" }) {
        const attestation = await this.getAttestationRecord(attestationId);
        if (!attestation) {
            throw createError("attestation_not_found", `Attestation ${attestationId} was not found.`);
        }
        const canWriteOnchain = this.attestationRegistryAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(attestation.attestor);

        if (canWriteOnchain) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.attestationRegistryAddress,
                method: "revoke_attestation",
                args: [
                    { type: "address", value: attestation.attestor },
                    { type: "u64", value: BigInt(Number(attestationId)) },
                    { type: "string", value: reason || "" },
                ],
            });
            const refreshedAttestation = await this.getAttestationRecord(attestationId);
            const asset = await this.getAssetSnapshot(attestation.tokenId);
            if (asset) {
                await this.store.upsertAsset(asset);
            }
            await this.store.recordActivity(
                toActivity(
                    "attestation",
                    "AttestationRevoked",
                    chainWrite.txHash,
                    attestation.tokenId,
                    refreshedAttestation || { ...attestation, revoked: true, revocationReason: reason }
                )
            );
            return { txHash: chainWrite.txHash };
        }
        throw directWalletRequired("attestation revocation", {
            attestor: attestation.attestor,
            attestationId: Number(attestationId),
            operator: this.signer.address,
            authPath: "wallet_native",
        });
    }

    async setVerificationStatus({ tokenId, status, reason = "" }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const normalizedStatus = normalizeVerificationStatus(status);
        try {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetRegistryAddress,
                method: "set_verification_status",
                args: [
                    { type: "address", value: this.signer.address },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "u32", value: normalizedStatus.code },
                    { type: "string", value: reason || "" },
                ],
            });
            asset.verificationStatus = normalizedStatus.code;
            asset.verificationStatusLabel = normalizedStatus.label;
            asset.statusReason = reason || asset.statusReason;
            asset.verificationUpdatedAt = nowSeconds();
            asset.updatedAt = nowSeconds();
            await this.store.upsertAsset(asset);
            await this.store.recordActivity(
                toActivity("policy", "VerificationStatusUpdated", chainWrite.txHash, tokenId, {
                    status: normalizedStatus.label,
                    reason,
                })
            );
            return { txHash: chainWrite.txHash };
        } catch (error) {
            const anchor = await this.anchorService.submitAnchor("verification_status", {
                tokenId: Number(tokenId),
                status: normalizedStatus.code,
                reason,
            });
            asset.verificationStatus = normalizedStatus.code;
            asset.verificationStatusLabel = normalizedStatus.label;
            asset.statusReason = reason || asset.statusReason;
            asset.verificationUpdatedAt = nowSeconds();
            asset.updatedAt = nowSeconds();
            await this.store.upsertAsset(asset);
            await this.store.recordActivity(
                toActivity("policy", "VerificationStatusUpdated", anchor.txHash, tokenId, {
                    status: normalizedStatus.label,
                    reason,
                })
            );
            return { txHash: anchor.txHash };
        }
    }

    async setAssetPolicy({ tokenId, frozen, disputed, revoked, reason = "" }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        try {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetRegistryAddress,
                method: "set_asset_policy",
                args: [
                    { type: "address", value: this.signer.address },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "bool", value: Boolean(frozen) },
                    { type: "bool", value: Boolean(disputed) },
                    { type: "bool", value: Boolean(revoked) },
                    { type: "string", value: reason || "" },
                ],
            });
            asset.assetPolicy = {
                frozen: Boolean(frozen),
                disputed: Boolean(disputed),
                revoked: Boolean(revoked),
                updatedAt: nowSeconds(),
                updatedBy: this.signer.address,
                reason,
            };
            this.recomputeAssetStatus(asset);
            await this.store.upsertAsset(asset);
            await this.store.recordActivity(
                toActivity("policy", "AssetPolicyUpdated", chainWrite.txHash, tokenId, asset.assetPolicy)
            );
            return { txHash: chainWrite.txHash };
        } catch (error) {
            const anchor = await this.anchorService.submitAnchor("asset_policy", {
                tokenId: Number(tokenId),
                frozen: Boolean(frozen),
                disputed: Boolean(disputed),
                revoked: Boolean(revoked),
                reason,
            });
            asset.assetPolicy = {
                frozen: Boolean(frozen),
                disputed: Boolean(disputed),
                revoked: Boolean(revoked),
                updatedAt: nowSeconds(),
                updatedBy: this.signer.address,
                reason,
            };
            this.recomputeAssetStatus(asset);
            await this.store.upsertAsset(asset);
            await this.store.recordActivity(
                toActivity("policy", "AssetPolicyUpdated", anchor.txHash, tokenId, asset.assetPolicy)
            );
            return { txHash: anchor.txHash };
        }
    }

    async updateAssetMetadata({ tokenId, metadataURI, cidHash, publicMetadataHash = "" }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const canWriteOnchain = this.assetRegistryAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(asset.currentOwner);

        if (canWriteOnchain) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetRegistryAddress,
                method: "update_asset_metadata",
                args: [
                    { type: "address", value: asset.currentOwner },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "string", value: metadataURI },
                    { type: "string", value: cidHash || hashText(metadataURI) },
                    { type: "string", value: publicMetadataHash || asset.publicMetadataHash || hashText(metadataURI) },
                ],
            });
            const refreshed = await this.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.store.upsertAsset(refreshed);
            }
            await this.store.recordActivity(
                toActivity("registry", "MetadataUpdated", chainWrite.txHash, tokenId, {
                    metadataURI,
                    cidHash: cidHash || hashText(metadataURI),
                })
            );
            return { txHash: chainWrite.txHash };
        }
        throw directWalletRequired("metadata update", {
            owner: asset.currentOwner,
            tokenId: Number(tokenId),
            operator: this.signer.address,
            authPath: "wallet_native",
        });
    }

    async updateAssetEvidence({ tokenId, evidenceRoot, evidenceManifestHash }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const canWriteOnchain = this.assetRegistryAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(asset.currentOwner);

        if (canWriteOnchain) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetRegistryAddress,
                method: "update_asset_evidence",
                args: [
                    { type: "address", value: asset.currentOwner },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "string", value: evidenceRoot },
                    { type: "string", value: evidenceManifestHash },
                ],
            });
            const refreshed = await this.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.store.upsertAsset(refreshed);
            }
            await this.store.recordActivity(
                toActivity("registry", "EvidenceUpdated", chainWrite.txHash, tokenId, {
                    evidenceRoot,
                    evidenceManifestHash,
                })
            );
            return { txHash: chainWrite.txHash };
        }
        throw directWalletRequired("evidence update", {
            owner: asset.currentOwner,
            tokenId: Number(tokenId),
            operator: this.signer.address,
            authPath: "wallet_native",
        });
    }

    async updateVerificationTag({ tokenId, tagHash }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const canWriteOnchain = this.assetRegistryAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(asset.currentOwner);

        if (canWriteOnchain) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetRegistryAddress,
                method: "update_verification_tag",
                args: [
                    { type: "address", value: asset.currentOwner },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "string", value: tagHash },
                ],
            });
            const refreshed = await this.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.store.upsertAsset(refreshed);
            }
            await this.store.recordActivity(
                toActivity("registry", "VerificationTagUpdated", chainWrite.txHash, tokenId, {
                    tagHash,
                })
            );
            return { txHash: chainWrite.txHash };
        }
        throw directWalletRequired("verification tag update", {
            owner: asset.currentOwner,
            tokenId: Number(tokenId),
            operator: this.signer.address,
            authPath: "wallet_native",
        });
    }

    async createAssetYieldStream({ tokenId, totalAmount, duration, sender }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const startTime = nowSeconds();
        const stopTime = startTime + Math.max(1, Number(duration || 1));
        const fundingSender = sender || this.signer.address || asset.currentOwner;
        const tokenAddress = this.runtime.paymentTokenAddress || this.nativeTokenAddress || "";

        let txHash = "";
        let streamId = 0;

        if (
            this.assetStreamAddress
            && this.contractService.isConfigured()
            && tokenAddress
            && fundingSender
            && String(fundingSender).toLowerCase() === String(this.signer.address || "").toLowerCase()
        ) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetStreamAddress,
                method: "open_stream",
                args: [
                    { type: "address", value: fundingSender },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "address", value: tokenAddress },
                    { type: "i128", value: BigInt(totalAmount) },
                    { type: "u64", value: BigInt(startTime) },
                    { type: "u64", value: BigInt(stopTime) },
                ],
            });
            streamId = Number(chainWrite.result || 0);
            txHash = chainWrite.txHash;
            if (streamId > 0) {
                try {
                    await this.contractService.invokeWrite({
                        contractId: this.assetRegistryAddress,
                        method: "bind_active_stream",
                        args: [
                            { type: "address", value: this.signer.address },
                            { type: "u64", value: BigInt(Number(tokenId)) },
                            { type: "u64", value: BigInt(streamId) },
                        ],
                    });
                } catch {
                    // The asset snapshot path can still recover the active stream from YieldVault.
                }
            }
        } else {
            throw directWalletRequired("yield stream open", {
                owner: fundingSender,
                tokenId: Number(tokenId),
                operator: this.signer.address,
                authPath: "wallet_native",
            });
        }

        asset.activeStreamId = Number(streamId);
        asset.stream = {
            streamId: Number(streamId),
            sender: fundingSender,
            assetType: asset.assetType,
            totalAmount: String(totalAmount),
            flowRate: String(BigInt(totalAmount) / BigInt(Math.max(1, Number(duration)))),
            startTime,
            stopTime,
            amountWithdrawn: asset.stream?.amountWithdrawn || "0",
            isActive: true,
            isFrozen: false,
        };
        asset.totalYieldDeposited = String(
            BigInt(asset.totalYieldDeposited || "0") + BigInt(totalAmount)
        );
        await this.store.upsertAsset(asset);
        await this.store.recordActivity(
            toActivity("yield", "YieldStreamOpened", txHash, tokenId, {
                tokenId: Number(tokenId),
                streamId: Number(streamId),
                sender: fundingSender,
                totalAmount: String(totalAmount),
            })
        );
        return { txHash, streamId: Number(streamId) };
    }

    async claimYield({ tokenId }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        if (asset.assetPolicy?.frozen || asset.assetPolicy?.disputed || asset.assetPolicy?.revoked) {
            throw createError("asset_claim_blocked", "Yield claim is blocked by the current asset policy.");
        }
        const operatorOwnsAsset =
            asset.currentOwner
            && this.signer.address
            && String(asset.currentOwner).toLowerCase() === String(this.signer.address).toLowerCase();
        if (this.assetStreamAddress && this.contractService.isConfigured() && operatorOwnsAsset) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetStreamAddress,
                method: "claim",
                args: [
                    { type: "address", value: this.signer.address },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                ],
            });
            const refreshed = await this.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.store.upsertAsset(refreshed);
            }
            await this.store.recordActivity(
                toActivity("yield", "YieldClaimed", chainWrite.txHash, tokenId, {
                    amount: String(chainWrite.result || "0"),
                })
            );
            return { txHash: chainWrite.txHash, amount: String(chainWrite.result || "0") };
        }
        throw directWalletRequired("yield claim", {
            owner: asset.currentOwner,
            tokenId: Number(tokenId),
            operator: this.signer.address,
            authPath: "wallet_native",
        });
    }

    async flashAdvance({ tokenId, amount }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        if (asset.assetPolicy?.frozen || asset.assetPolicy?.disputed || asset.assetPolicy?.revoked) {
            throw createError("asset_claim_blocked", "Flash advance is blocked by the current asset policy.");
        }
        const operatorOwnsAsset =
            asset.currentOwner
            && this.signer.address
            && String(asset.currentOwner).toLowerCase() === String(this.signer.address).toLowerCase();
        if (this.assetStreamAddress && this.contractService.isConfigured() && operatorOwnsAsset) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.assetStreamAddress,
                method: "flash_advance",
                args: [
                    { type: "address", value: this.signer.address },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "i128", value: BigInt(amount) },
                ],
            });
            const refreshed = await this.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.store.upsertAsset(refreshed);
            }
            await this.store.recordActivity(
                toActivity("yield", "FlashAdvanceIssued", chainWrite.txHash, tokenId, {
                    amount: String(chainWrite.result || amount),
                })
            );
            return { txHash: chainWrite.txHash };
        }
        throw directWalletRequired("flash advance", {
            owner: asset.currentOwner,
            tokenId: Number(tokenId),
            operator: this.signer.address,
            authPath: "wallet_native",
        });
    }

    async openSession({
        sender,
        recipient,
        duration,
        totalAmount,
        metadata = "{}",
        assetCode = "",
        assetIssuer = "",
        fundingTxHash = "",
    }) {
        const parsedDuration = Math.max(1, Number(duration || 1));
        const startTime = nowSeconds();
        const stopTime = startTime + parsedDuration;
        const flowRate = BigInt(totalAmount) / BigInt(parsedDuration);
        const paymentAssetCode = String(assetCode || this.runtime.paymentAssetCode || "USDC").toUpperCase();
        const paymentAssetIssuer = paymentAssetCode === "XLM"
            ? ""
            : String(assetIssuer || this.runtime.paymentAssetIssuer || "");
        const tokenAddress = paymentAssetCode === "XLM"
            ? (this.nativeTokenAddress || "")
            : (this.runtime.paymentTokenAddress || "");

        let txHash = "";
        let fundedOnchain = false;
        let sessionId = 0;
        if (
            !fundingTxHash
            && this.sessionMeterAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(sender)
            && tokenAddress
        ) {
            const metadataHash = crypto.createHash("sha256").update(String(metadata || "{}")).digest("hex");
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.sessionMeterAddress,
                method: "open_session",
                args: [
                    { type: "address", value: sender },
                    { type: "address", value: recipient },
                    { type: "address", value: tokenAddress },
                    { type: "string", value: paymentAssetCode },
                    { type: "string", value: paymentAssetIssuer },
                    { type: "i128", value: BigInt(totalAmount) },
                    { type: "u64", value: BigInt(startTime) },
                    { type: "u64", value: BigInt(stopTime) },
                    { type: "bytes32", value: `0x${metadataHash}` },
                ],
            });
            txHash = chainWrite.txHash;
            fundedOnchain = true;
            sessionId = Number(chainWrite.result || 0);
        } else if (fundingTxHash) {
            if (!this.sessionEscrowAddress) {
                throw createError(
                    "missing_session_escrow",
                    "No Stellar session escrow address is configured for real payment settlement."
                );
            }

            const verifiedFunding = await this.anchorService.verifyPayment({
                txHash: fundingTxHash,
                source: sender,
                destination: this.sessionEscrowAddress,
                amount: formatStellarAmount(totalAmount),
                assetCode: paymentAssetCode,
                assetIssuer: paymentAssetIssuer,
            });
            txHash = verifiedFunding.txHash;
            fundedOnchain = true;
            sessionId = await this.store.nextCounter("sessionId");
        } else {
            sessionId = await this.store.nextCounter("sessionId");
            const anchor = await this.anchorService.submitAnchor("open_session", {
                sessionId,
                sender,
                recipient,
                totalAmount: String(totalAmount),
                duration: parsedDuration,
                metadata,
                assetCode: paymentAssetCode,
                assetIssuer: paymentAssetIssuer,
            });
            txHash = anchor.txHash;
        }
        const session = {
            id: sessionId,
            sender,
            recipient,
            totalAmount: String(totalAmount),
            flowRate: flowRate.toString(),
            durationSeconds: parsedDuration,
            startTime,
            stopTime,
            amountWithdrawn: "0",
            isActive: true,
            isFrozen: false,
            metadata,
            txHash,
            fundingTxHash: fundingTxHash || txHash,
            fundedOnchain,
            assetCode: paymentAssetCode,
            assetIssuer: paymentAssetIssuer,
            escrowAddress: this.sessionEscrowAddress,
        };
        await this.store.upsertSession(session);
        const metadataObject = parseMetadata(metadata);
        if (metadataObject.assetTokenId) {
            const asset = await this.getAssetSnapshot(metadataObject.assetTokenId);
            if (asset) {
                asset.activeStreamId = Number(sessionId);
                await this.store.upsertAsset(asset);
            }
        }
        await this.store.recordActivity(
            toActivity("session", "SessionOpened", txHash, metadataObject.assetTokenId || null, {
                sessionId,
                sender,
                recipient,
                assetCode: paymentAssetCode,
                assetIssuer: paymentAssetIssuer,
                fundedOnchain,
            })
        );
        return { streamId: String(sessionId), startTime, txHash };
    }

    async cancelSession({ sessionId, cancelledBy }) {
        const session = await this.getSessionSnapshot(sessionId);
        if (!session) {
            throw createError("session_not_found", `Session ${sessionId} was not found.`);
        }
        const metadataObject = parseMetadata(session.metadata);
        let txHash = "";
        let claimable = 0n;
        let refundableAmount = 0n;
        if (
            this.sessionMeterAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(session.sender)
        ) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.sessionMeterAddress,
                method: "cancel",
                args: [
                    { type: "address", value: session.sender },
                    { type: "u64", value: BigInt(Number(sessionId)) },
                ],
            });
            txHash = chainWrite.txHash;
            claimable = BigInt(String(
                chainWrite.result?.claimable_amount
                || chainWrite.result?.claimableAmount
                || 0
            ));
            refundableAmount = BigInt(String(
                chainWrite.result?.refundable_amount
                || chainWrite.result?.refundableAmount
                || 0
            ));
        } else if (session.fundedOnchain && computeSessionRefundable(session, nowSeconds()) > 0n) {
            const cancelledAt = nowSeconds();
            claimable = computeSessionClaimable(session, cancelledAt);
            refundableAmount = computeSessionRefundable(session, cancelledAt);
            const payout = await this.anchorService.submitPayment({
                destination: session.sender,
                amount: formatStellarAmount(refundableAmount),
                assetCode: session.assetCode || this.runtime.paymentAssetCode || "USDC",
                assetIssuer: session.assetIssuer || this.runtime.paymentAssetIssuer || "",
                memoText: `refund:${sessionId}`,
            });
            txHash = payout.txHash;
        } else {
            const cancelledAt = nowSeconds();
            claimable = computeSessionClaimable(session, cancelledAt);
            refundableAmount = computeSessionRefundable(session, cancelledAt);
            const anchor = await this.anchorService.submitAnchor("cancel_session", {
                sessionId: Number(sessionId),
                cancelledBy,
            });
            txHash = anchor.txHash;
        }
        const cancelledAt = nowSeconds();
        session.isActive = false;
        session.cancelledAt = cancelledAt;
        session.cancelledBy = cancelledBy || "";
        session.refundableAmount = refundableAmount.toString();
        session.claimableAtCancel = claimable.toString();
        session.txHash = txHash;
        await this.store.upsertSession(session);
        if (metadataObject.assetTokenId) {
            const asset = await this.getAssetSnapshot(metadataObject.assetTokenId);
            if (asset && Number(asset.activeStreamId || 0) === Number(sessionId)) {
                asset.activeStreamId = 0;
                await this.store.upsertAsset(asset);
            }
        }
        await this.store.recordActivity(
            toActivity("session", "SessionCancelled", txHash, null, {
                sessionId: Number(sessionId),
                cancelledBy,
                refundableAmount: refundableAmount.toString(),
                claimableAmount: claimable.toString(),
            })
        );
        return {
            txHash,
            refundableAmount: refundableAmount.toString(),
            claimableAmount: claimable.toString(),
        };
    }

    async claimSession({ sessionId, claimer = "" }) {
        const session = await this.getSessionSnapshot(sessionId);
        if (!session) {
            throw createError("session_not_found", `Session ${sessionId} was not found.`);
        }
        if (session.isFrozen) {
            throw createError("session_frozen", `Session ${sessionId} is frozen.`);
        }
        const claimable = computeSessionClaimable(session);
        if (claimable <= 0n) {
            throw createError("nothing_to_claim", `Session ${sessionId} has no accrued balance to claim.`);
        }
        let txHash = "";
        if (
            this.sessionMeterAddress
            && this.contractService.isConfigured()
            && this.canOperatorAuthorize(session.recipient)
        ) {
            const chainWrite = await this.contractService.invokeWrite({
                contractId: this.sessionMeterAddress,
                method: "claim",
                args: [
                    { type: "address", value: session.recipient },
                    { type: "u64", value: BigInt(Number(sessionId)) },
                ],
            });
            txHash = chainWrite.txHash;
        } else if (session.fundedOnchain) {
            const payout = await this.anchorService.submitPayment({
                destination: session.recipient,
                amount: formatStellarAmount(claimable),
                assetCode: session.assetCode || this.runtime.paymentAssetCode || "USDC",
                assetIssuer: session.assetIssuer || this.runtime.paymentAssetIssuer || "",
                memoText: `claim:${sessionId}`,
            });
            txHash = payout.txHash;
        } else {
            const anchor = await this.anchorService.submitAnchor("claim_session", {
                sessionId: Number(sessionId),
                claimer,
                amount: claimable.toString(),
            });
            txHash = anchor.txHash;
        }
        session.amountWithdrawn = String(
            normalizeSessionAmount(session.amountWithdrawn) + claimable
        );
        session.txHash = txHash;
        await this.store.upsertSession(session);
        await this.store.recordActivity(
            toActivity("session", "SessionClaimed", txHash, null, {
                sessionId: Number(sessionId),
                claimer,
                amount: claimable.toString(),
            })
        );
        return {
            txHash,
            amount: claimable.toString(),
        };
    }

    async freezeStream({ streamId, frozen, reason = "" }) {
        const session = await this.getSessionSnapshot(streamId);
        if (!session) {
            throw createError("session_not_found", `Session ${streamId} was not found.`);
        }
        const chainWrite = await this.contractService.invokeWrite({
            contractId: this.sessionMeterAddress,
            method: "freeze_session",
            args: [
                { type: "address", value: this.signer.address },
                { type: "u64", value: BigInt(Number(streamId)) },
                { type: "bool", value: Boolean(frozen) },
            ],
        });
        session.isFrozen = Boolean(frozen);
        session.freezeReason = reason;
        session.txHash = chainWrite.txHash;
        await this.store.upsertSession(session);
        await this.store.recordActivity(
            toActivity("session", "SessionFrozen", chainWrite.txHash, null, {
                streamId: Number(streamId),
                frozen: Boolean(frozen),
                reason,
            })
        );
        return { txHash: chainWrite.txHash };
    }

    async getSessionSnapshot(sessionId) {
        try {
            const chainSession = await this.contractService.invokeView({
                contractId: this.sessionMeterAddress,
                method: "get_session",
                args: [
                    { type: "u64", value: BigInt(Number(sessionId)) },
                ],
            });
            const cached = await this.store.getSession(sessionId);
            const session = normalizeChainSession(chainSession, cached?.metadata || "");
            session.escrowAddress = this.sessionMeterAddress;
            await this.store.upsertSession(session);
            return this.decorateSession(session);
        } catch (error) {
            const session = await this.store.getSession(sessionId);
            if (!session) {
                return null;
            }
            return this.decorateSession(session);
        }
    }

    async listSessions({ owner } = {}) {
        if (!owner) {
            const sessions = await this.store.listSessions({ owner });
            return sessions.map((session) => this.decorateSession(session));
        }

        try {
            const [payerIds, recipientIds] = await Promise.all([
                this.contractService.invokeView({
                    contractId: this.sessionMeterAddress,
                    method: "list_payer_sessions",
                    args: [
                        { type: "address", value: owner },
                    ],
                }),
                this.contractService.invokeView({
                    contractId: this.sessionMeterAddress,
                    method: "list_recipient_sessions",
                    args: [
                        { type: "address", value: owner },
                    ],
                }),
            ]);

            const ids = Array.from(
                new Set(
                    [...(payerIds || []), ...(recipientIds || [])]
                        .map((value) => Number(value))
                        .filter((value) => Number.isFinite(value) && value > 0)
                )
            );
            const snapshots = await mapWithConcurrency(
                ids,
                Number(process.env.STELLAR_RWA_SESSION_CONCURRENCY || 8),
                async (id) => this.getSessionSnapshot(id)
            );
            return snapshots
                .filter(Boolean)
                .sort((left, right) => Number(left.id) - Number(right.id));
        } catch (error) {
            const sessions = await this.store.listSessions({ owner });
            return sessions.map((session) => this.decorateSession(session));
        }
    }

    async getClaimableBalance(streamId) {
        const session = await this.getSessionSnapshot(streamId);
        if (!session) {
            return "0";
        }
        return session.claimableInitial || "0";
    }

    async getAssetSnapshot(tokenId, options = {}) {
        const snapshotKey = String(Number(tokenId));
        const useCache = options?.useCache !== false;
        const snapshotCacheTtlMs = Number(process.env.STELLAR_ASSET_SNAPSHOT_CACHE_TTL_MS || 10_000);
        const lightweight = Boolean(options?.lightweight);
        if (useCache) {
            const cachedSnapshot = this.getCacheValue(this.assetSnapshotCache, snapshotKey);
            if (cachedSnapshot) {
                const cloned = this.cloneCachedAsset(cachedSnapshot);
                let sessions = [];
                if (Array.isArray(options.sessions)) {
                    sessions = options.sessions;
                } else {
                    try {
                        sessions = await this.listSessions();
                    } catch {
                        sessions = [];
                    }
                }
                applyRentalActivity(cloned, sessions);
                return cloned;
            }
        }
        try {
            const cachedAsset = await this.store.getAsset(tokenId).catch(() => null);
            const rawAsset = await this.contractService.invokeView({
                contractId: this.assetRegistryAddress,
                method: "get_asset",
                args: [
                    { type: "u64", value: BigInt(Number(tokenId)) },
                ],
            });
            const rawAssetType = Number(rawAsset?.asset_type || 0);
            const attestationPolicies = lightweight
                ? (cachedAsset?.attestationPolicies || DEFAULT_ATTESTATION_POLICIES[rawAssetType] || [])
                : await this.getAttestationPolicies(rawAssetType);
            const attestations = lightweight
                ? (cachedAsset?.attestations || [])
                : await this.getAttestations(Number(tokenId));
            const compliance = lightweight
                ? (cachedAsset?.compliance || null)
                : await this.getCompliance(rawAsset?.issuer, rawAssetType);
            let latestYieldStreamId = Number(rawAsset?.active_stream_id || 0);
            let stream = lightweight ? (cachedAsset?.stream || null) : null;
            if (!lightweight && this.assetStreamAddress) {
                try {
                    latestYieldStreamId = Number(
                        await this.contractService.invokeView({
                            contractId: this.assetStreamAddress,
                            method: "latest_stream_for_asset",
                            args: [
                                { type: "u64", value: BigInt(Number(tokenId)) },
                            ],
                        })
                    ) || latestYieldStreamId;
                } catch {
                    latestYieldStreamId = Number(rawAsset?.active_stream_id || 0);
                }
                if (latestYieldStreamId > 0) {
                    try {
                        const rawStream = await this.contractService.invokeView({
                            contractId: this.assetStreamAddress,
                            method: "get_stream",
                            args: [
                                { type: "u64", value: BigInt(latestYieldStreamId) },
                            ],
                        });
                        stream = normalizeYieldStream(rawStream);
                    } catch {
                        stream = null;
                    }
                }
            }
            const claimableYield = stream ? computeYieldClaimable(stream).toString() : "0";
            const asset = normalizeChainAsset(rawAsset, {
                attestationPolicies,
                attestations,
                compliance,
                stream: stream
                    ? {
                        streamId: stream.streamId,
                        sender: stream.sender,
                        assetType: Number(rawAsset?.asset_type || 0),
                        totalAmount: stream.totalAmount,
                        flowRate: String(
                            normalizeSessionAmount(stream.totalAmount)
                            / BigInt(Math.max(1, Number(stream.durationSeconds || 1)))
                        ),
                        startTime: stream.startTime,
                        stopTime: stream.stopTime,
                        amountWithdrawn: stream.withdrawnAmount,
                        isActive: stream.isActive,
                        isFrozen: false,
                    }
                    : null,
                claimableYield,
                totalYieldDeposited: stream?.totalAmount || "0",
                flashAdvanceOutstanding: stream?.flashAdvanceOutstanding || "0",
            });
            if (
                (!asset.publicMetadata || typeof asset.publicMetadata !== "object" || Object.keys(asset.publicMetadata).length === 0)
                && cachedAsset?.publicMetadata
            ) {
                asset.publicMetadata = cachedAsset.publicMetadata;
                asset.metadata = cachedAsset.metadata || cachedAsset.publicMetadata;
                asset.metadataURI = asset.metadataURI || cachedAsset.metadataURI || cachedAsset.publicMetadataURI || "";
                asset.publicMetadataURI = asset.publicMetadataURI || cachedAsset.publicMetadataURI || cachedAsset.metadataURI || "";
            }
            asset.activeStreamId = latestYieldStreamId;
            this.recomputeAssetStatus(asset);
            applyRentalReadiness(asset);
            let sessions = [];
            if (Array.isArray(options.sessions)) {
                sessions = options.sessions;
            } else {
                try {
                    sessions = await this.listSessions();
                } catch {
                    sessions = [];
                }
            }
            applyRentalActivity(asset, sessions);
            await this.store.upsertAsset(asset);
            this.setCacheValue(this.assetSnapshotCache, snapshotKey, asset, snapshotCacheTtlMs);
            return asset;
        } catch (error) {
            const asset = await this.store.getAsset(tokenId);
            if (!asset) {
                return null;
            }

            const cloned = {
                ...asset,
                attestationPolicies: lightweight
                    ? (asset.attestationPolicies || DEFAULT_ATTESTATION_POLICIES[Number(asset.assetType || 0)] || [])
                    : await this.getAttestationPolicies(asset.assetType),
            };
            this.recomputeAssetStatus(cloned);
            applyRentalReadiness(cloned);
            let sessions = [];
            if (Array.isArray(options.sessions)) {
                sessions = options.sessions;
            } else {
                try {
                    sessions = await this.listSessions();
                } catch {
                    sessions = [];
                }
            }
            applyRentalActivity(cloned, sessions);
            this.setCacheValue(this.assetSnapshotCache, snapshotKey, cloned, snapshotCacheTtlMs);
            return cloned;
        }
    }

    async listAssetSnapshots({ owner, limit = 200, lightweight = false } = {}) {
        const maxSnapshots = Math.max(1, Number(limit || 200));
        const concurrency = Number(process.env.STELLAR_RWA_SNAPSHOT_CONCURRENCY || 16);
        let sessions = [];
        try {
            sessions = await this.listSessions();
        } catch {
            sessions = [];
        }
        let chainListFailed = false;
        try {
            if (owner) {
                const tokenIds = await this.contractService.invokeView({
                    contractId: this.assetRegistryAddress,
                    method: "list_owned_assets",
                    args: [
                        { type: "address", value: owner },
                    ],
                });
                const hydrated = await mapWithConcurrency(
                    (tokenIds || []).slice(0, maxSnapshots),
                    concurrency,
                    async (tokenId) => this.getAssetSnapshot(Number(tokenId), { sessions, lightweight })
                );
                return hydrated.filter(Boolean);
            }

            const lastTokenId = Number(
                await this.contractService.invokeView({
                    contractId: this.assetRegistryAddress,
                    method: "last_token_id",
                    args: [],
                })
            );
            if (lastTokenId > 0) {
                const startTokenId = Math.max(1, lastTokenId - maxSnapshots + 1);
                const tokenIds = [];
                for (let tokenId = startTokenId; tokenId <= lastTokenId; tokenId += 1) {
                    tokenIds.push(tokenId);
                }
                const hydrated = await mapWithConcurrency(
                    tokenIds,
                    concurrency,
                    async (tokenId) => this.getAssetSnapshot(tokenId, { sessions, lightweight })
                );
                return hydrated.filter(Boolean);
            }
        } catch {
            // Fall back to cached assets below.
            chainListFailed = true;
        }

        const assets = await this.store.listAssets({ owner });
        if (chainListFailed) {
            return assets
                .slice(-maxSnapshots)
                .map((asset) => {
                    const cloned = { ...asset };
                    this.recomputeAssetStatus(cloned);
                    applyRentalReadiness(cloned);
                    applyRentalActivity(cloned, sessions);
                    return cloned;
                });
        }
        const hydrated = await mapWithConcurrency(
            assets.slice(-maxSnapshots),
            concurrency,
            async (asset) => this.getAssetSnapshot(asset.tokenId, { sessions, lightweight })
        );
        return hydrated.filter(Boolean);
    }

    async getVerificationStatus(tokenId, cidHash, tagHash) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            return {
                assetExists: false,
                cidMatches: false,
                tagMatches: false,
                activeStreamId: 0,
            };
        }

        return {
            assetExists: true,
            cidMatches: !cidHash || asset.cidHash === cidHash,
            tagMatches: !tagHash || asset.tagHash === tagHash,
            activeStreamId: Number(asset.activeStreamId || 0),
        };
    }

    decorateSession(session) {
        const now = nowSeconds();
        const claimable = computeSessionClaimable(session, now);
        const refundableAmount = computeSessionRefundable(session, now);
        const totalAmount = normalizeSessionAmount(session.totalAmount);
        const consumedAmount = totalAmount > refundableAmount ? totalAmount - refundableAmount : 0n;
        const status = deriveSessionStatus(session, claimable, refundableAmount, consumedAmount);
        const metadata = parseMetadata(session.metadata);
        return {
            ...session,
            totalAmount: String(session.totalAmount || "0"),
            flowRate: String(session.flowRate || "0"),
            durationSeconds: Number(session.durationSeconds || Math.max(1, Number(session.stopTime) - Number(session.startTime))),
            amountWithdrawn: String(session.amountWithdrawn || "0"),
            claimableInitial: claimable.toString(),
            claimableAmount: claimable.toString(),
            refundableAmount: refundableAmount.toString(),
            consumedAmount: consumedAmount.toString(),
            sessionStatus: status.code,
            sessionStatusLabel: status.label,
            linkedAssetTokenId: metadata.assetTokenId ? Number(metadata.assetTokenId) : 0,
            linkedAssetName: metadata.assetName || metadata.name || "",
            linkedAssetType: metadata.assetType || "",
        };
    }

    recomputeAssetStatus(asset) {
        const policy = asset.assetPolicy || {};
        if (policy.revoked) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.revoked;
            asset.verificationStatusLabel = "revoked";
            asset.statusReason = policy.reason || asset.statusReason;
            applyRentalReadiness(asset);
            return;
        }
        if (policy.disputed) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.disputed;
            asset.verificationStatusLabel = "disputed";
            asset.statusReason = policy.reason || asset.statusReason;
            applyRentalReadiness(asset);
            return;
        }
        if (policy.frozen) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.frozen;
            asset.verificationStatusLabel = "frozen";
            asset.statusReason = policy.reason || asset.statusReason;
            applyRentalReadiness(asset);
            return;
        }

        const requiredRoles = (asset.attestationPolicies || []).filter((policyItem) => policyItem.required);
        const missingRoles = requiredRoles.filter((policyItem) => {
            const active = (asset.attestations || []).find(
                (attestation) =>
                    Number(attestation.role) === Number(policyItem.role) && !attestation.revoked
            );
            return !active;
        });
        const staleRoles = requiredRoles.filter((policyItem) => {
            const active = (asset.attestations || []).find(
                (attestation) =>
                    Number(attestation.role) === Number(policyItem.role) && !attestation.revoked
            );
            if (!active || !policyItem.maxAge) {
                return false;
            }
            const expiry = Number(active.expiry || 0);
            if (expiry && expiry < nowSeconds()) {
                return true;
            }
            return active.issuedAt + Number(policyItem.maxAge) < nowSeconds();
        });

        if (missingRoles.length > 0) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.pending_attestation;
            asset.verificationStatusLabel = "pending_attestation";
            asset.statusReason = "Awaiting required attestations";
            applyRentalReadiness(asset);
            return;
        }
        if (staleRoles.length > 0) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.stale;
            asset.verificationStatusLabel = "stale";
            asset.statusReason = "One or more attestations have expired";
            applyRentalReadiness(asset);
            return;
        }

        asset.verificationStatus = VERIFICATION_STATUS_CODES.verified;
        asset.verificationStatusLabel = "verified";
        asset.statusReason = asset.statusReason || "Verified productive rental twin";
        applyRentalReadiness(asset);
    }

    async syncSessionMetadata({
        sessionId,
        metadata,
        txHash = "",
        fundingTxHash = "",
        sender = "",
        recipient = "",
        assetCode = "",
        assetIssuer = "",
    }) {
        const existing = await this.getSessionSnapshot(sessionId);
        const serializedMetadata = typeof metadata === "string"
            ? metadata
            : JSON.stringify(metadata || {});
        const nextSession = {
            ...(existing || {}),
            id: Number(sessionId),
            metadata: serializedMetadata,
            txHash: txHash || existing?.txHash || "",
            fundingTxHash: fundingTxHash || existing?.fundingTxHash || txHash || existing?.txHash || "",
            sender: sender || existing?.sender || "",
            recipient: recipient || existing?.recipient || "",
            assetCode: assetCode || existing?.assetCode || this.runtime.paymentAssetCode || "",
            assetIssuer: assetIssuer || existing?.assetIssuer || this.runtime.paymentAssetIssuer || "",
            isActive: existing?.isActive !== false ? true : false,
        };
        await this.store.upsertSession(nextSession);
        return this.decorateSession(nextSession);
    }
}

module.exports = {
    StellarRWAChainService,
    createError,
};
