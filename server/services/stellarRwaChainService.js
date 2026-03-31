const crypto = require("crypto");
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
        this.hubAddress = config.hubAddress || process.env.STREAM_ENGINE_RWA_HUB_ADDRESS || "stellar:rwa-registry";
        this.assetNFTAddress = config.assetNFTAddress || process.env.STREAM_ENGINE_RWA_ASSET_NFT_ADDRESS || "stellar:rwa-nft";
        this.assetRegistryAddress = config.assetRegistryAddress || process.env.STREAM_ENGINE_RWA_ASSET_REGISTRY_ADDRESS || "stellar:rwa-registry";
        this.attestationRegistryAddress = config.attestationRegistryAddress || process.env.STREAM_ENGINE_RWA_ATTESTATION_REGISTRY_ADDRESS || "stellar:rwa-attestation";
        this.assetStreamAddress = config.assetStreamAddress || process.env.STREAM_ENGINE_RWA_ASSET_STREAM_ADDRESS || "stellar:yield-vault";
        this.complianceGuardAddress = config.complianceGuardAddress || process.env.STREAM_ENGINE_RWA_COMPLIANCE_GUARD_ADDRESS || "stellar:policy";
        this.sessionEscrowAddress =
            config.sessionEscrowAddress
            || this.signer.address
            || process.env.STELLAR_OPERATOR_PUBLIC_KEY
            || process.env.STREAM_ENGINE_RECIPIENT_ADDRESS
            || "";
    }

    isConfigured() {
        return Boolean(this.store);
    }

    async init() {
        return null;
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

    async ensureIssuerApproved(issuer) {
        const approval = await this.store.getIssuerApproval(issuer);
        if (!approval?.approved) {
            throw createError(
                "issuer_not_onboarded",
                `Issuer ${issuer} is not onboarded for Stellar RWA minting.`,
                {
                    issuer,
                    operator: this.signer.address,
                }
            );
        }
        return {
            approved: true,
            alreadyApproved: true,
            txHash: approval.txHash || "",
        };
    }

    async getIssuerApproval(issuer) {
        return this.store.getIssuerApproval(issuer);
    }

    async setIssuerApproval({ issuer, approved, note = "" }) {
        const anchor = await this.anchorService.submitAnchor("issuer_approval", {
            issuer,
            approved,
            note,
        });
        const record = {
            issuer,
            approved: Boolean(approved),
            note,
            updatedAt: nowSeconds(),
            updatedBy: this.signer.address,
            txHash: anchor.txHash,
        };
        await this.store.upsertIssuerApproval(record);
        await this.store.recordActivity(
            toActivity("policy", "IssuerApprovalUpdated", anchor.txHash, null, record)
        );
        return { txHash: anchor.txHash, issuer, approved: Boolean(approved) };
    }

    async getCompliance(user, assetType) {
        return this.store.getRecord(`compliance:${String(user).toLowerCase()}:${Number(assetType)}`);
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
        const anchor = await this.anchorService.submitAnchor("compliance", payload);
        payload.txHash = anchor.txHash;
        await this.store.upsertRecord(`compliance:${String(user).toLowerCase()}:${Number(assetType)}`, payload);
        await this.store.recordActivity(
            toActivity("policy", "ComplianceUpdated", anchor.txHash, null, payload)
        );
        return { txHash: anchor.txHash };
    }

    async getAttestationPolicies(assetType) {
        const resolvedAssetType = Number(assetType || 1);
        const policies = [];
        const defaults = DEFAULT_ATTESTATION_POLICIES[resolvedAssetType] || [];
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

        const extraRoles = Object.keys(ATTESTATION_ROLE_LABELS).map(Number);
        for (const role of extraRoles) {
            if (policies.find((policy) => Number(policy.role) === role)) {
                continue;
            }
            const override = await this.store.getRecord(`policy:attestation:${resolvedAssetType}:${role}`);
            if (override) {
                policies.push({
                    role,
                    roleLabel: codeToAttestationRole(role),
                    required: Boolean(override.required),
                    maxAge: Number(override.maxAge || 0),
                });
            }
        }

        return policies.sort((left, right) => Number(left.role) - Number(right.role));
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
        const anchor = await this.anchorService.submitAnchor("attestation_policy", payload);
        payload.txHash = anchor.txHash;
        await this.store.upsertRecord(`policy:attestation:${payload.assetType}:${payload.role}`, payload);
        await this.store.recordActivity(
            toActivity("policy", "AttestationPolicyUpdated", anchor.txHash, null, payload)
        );
        return { txHash: anchor.txHash };
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
        const approval = await this.store.getIssuerApproval(issuer);
        if (!approval?.approved) {
            throw createError(
                "issuer_not_onboarded",
                `Issuer ${issuer} is not onboarded for Stellar RWA minting.`,
                {
                    issuer,
                    operator: this.signer.address,
                }
            );
        }

        const tokenId = await this.store.nextCounter("assetTokenId");
        const attestationPolicies = await this.getAttestationPolicies(assetType);
        const requiresAttestations = attestationPolicies.some((policy) => policy.required);
        const verificationStatus = requiresAttestations
            ? VERIFICATION_STATUS_CODES.pending_attestation
            : VERIFICATION_STATUS_CODES.verified;
        const anchor = await this.anchorService.submitAnchor("mint_asset", {
            tokenId,
            issuer,
            assetType,
            rightsModel,
            publicMetadataHash,
            evidenceRoot,
            propertyRefHash,
        });

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
            txHash: anchor.txHash,
        };

        await this.store.upsertAsset(snapshot);
        await this.store.recordActivity(
            toActivity("registry", "AssetRegistered", anchor.txHash, tokenId, {
                tokenId,
                issuer,
                assetType: Number(assetType),
                rightsModel: codeToRightsModel(rightsModel),
            })
        );

        return { tokenId, txHash: anchor.txHash };
    }

    async getAttestationRecord(attestationId) {
        return this.store.getRecord(`attestation:${Number(attestationId)}`);
    }

    async getAttestations(tokenId) {
        const asset = await this.getAssetSnapshot(tokenId);
        return asset?.attestations || [];
    }

    async registerAttestation({ tokenId, role, attestor, evidenceHash, statementType, expiry }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }

        const normalizedRole = normalizeAttestationRole(role);
        const attestationId = await this.store.nextCounter("attestationId");
        const anchor = await this.anchorService.submitAnchor("register_attestation", {
            tokenId,
            role: normalizedRole.code,
            attestor,
            evidenceHash,
            statementType,
            expiry: Number(expiry || 0),
        });
        const attestation = {
            attestationId,
            tokenId: Number(tokenId),
            role: normalizedRole.code,
            roleLabel: normalizedRole.label,
            attestor,
            evidenceHash,
            statementType,
            issuedAt: nowSeconds(),
            expiry: Number(expiry || 0),
            revoked: false,
            revocationReason: "",
            txHash: anchor.txHash,
        };

        asset.attestations = [
            ...(asset.attestations || []).filter(
                (entry) =>
                    !(Number(entry.role) === normalizedRole.code && String(entry.attestor).toLowerCase() === String(attestor).toLowerCase())
            ),
            attestation,
        ];
        await this.store.upsertRecord(`attestation:${attestationId}`, attestation);
        this.recomputeAssetStatus(asset);
        await this.store.upsertAsset(asset);
        await this.store.recordActivity(
            toActivity("attestation", "AttestationRegistered", anchor.txHash, tokenId, attestation)
        );
        return { attestationId, txHash: anchor.txHash };
    }

    async revokeAttestation({ attestationId, reason = "" }) {
        const attestation = await this.getAttestationRecord(attestationId);
        if (!attestation) {
            throw createError("attestation_not_found", `Attestation ${attestationId} was not found.`);
        }
        const anchor = await this.anchorService.submitAnchor("revoke_attestation", {
            attestationId: Number(attestationId),
            reason,
        });
        attestation.revoked = true;
        attestation.revocationReason = reason;
        attestation.revokedAt = nowSeconds();
        attestation.txHash = anchor.txHash;
        await this.store.upsertRecord(`attestation:${Number(attestationId)}`, attestation);

        const asset = await this.getAssetSnapshot(attestation.tokenId);
        if (asset) {
            asset.attestations = (asset.attestations || []).map((entry) =>
                Number(entry.attestationId) === Number(attestationId) ? { ...attestation } : entry
            );
            this.recomputeAssetStatus(asset);
            await this.store.upsertAsset(asset);
        }
        await this.store.recordActivity(
            toActivity("attestation", "AttestationRevoked", anchor.txHash, attestation.tokenId, attestation)
        );
        return { txHash: anchor.txHash };
    }

    async setVerificationStatus({ tokenId, status, reason = "" }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const normalizedStatus = normalizeVerificationStatus(status);
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

    async setAssetPolicy({ tokenId, frozen, disputed, revoked, reason = "" }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
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

    async updateAssetMetadata({ tokenId, metadataURI, cidHash }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const anchor = await this.anchorService.submitAnchor("update_metadata", {
            tokenId: Number(tokenId),
            metadataURI,
            cidHash,
        });
        asset.publicMetadataURI = metadataURI;
        asset.metadataURI = metadataURI;
        asset.tokenURI = metadataURI;
        asset.cidHash = cidHash || hashText(metadataURI);
        asset.updatedAt = nowSeconds();
        await this.store.upsertAsset(asset);
        await this.store.recordActivity(
            toActivity("registry", "MetadataUpdated", anchor.txHash, tokenId, {
                metadataURI,
                cidHash: asset.cidHash,
            })
        );
        return { txHash: anchor.txHash };
    }

    async updateAssetEvidence({ tokenId, evidenceRoot, evidenceManifestHash }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const anchor = await this.anchorService.submitAnchor("update_evidence", {
            tokenId: Number(tokenId),
            evidenceRoot,
            evidenceManifestHash,
        });
        asset.evidenceRoot = evidenceRoot;
        asset.evidenceManifestHash = evidenceManifestHash;
        asset.updatedAt = nowSeconds();
        await this.store.upsertAsset(asset);
        await this.store.recordActivity(
            toActivity("registry", "EvidenceUpdated", anchor.txHash, tokenId, {
                evidenceRoot,
                evidenceManifestHash,
            })
        );
        return { txHash: anchor.txHash };
    }

    async updateVerificationTag({ tokenId, tagHash }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const anchor = await this.anchorService.submitAnchor("update_tag", {
            tokenId: Number(tokenId),
            tagHash,
        });
        asset.tagHash = tagHash;
        asset.updatedAt = nowSeconds();
        await this.store.upsertAsset(asset);
        await this.store.recordActivity(
            toActivity("registry", "VerificationTagUpdated", anchor.txHash, tokenId, {
                tagHash,
            })
        );
        return { txHash: anchor.txHash };
    }

    async createAssetYieldStream({ tokenId, totalAmount, duration, sender }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        const session = await this.createSession({
            sender: sender || asset.currentOwner,
            recipient: asset.currentOwner,
            totalAmount,
            duration,
            metadata: JSON.stringify({
                type: "asset-yield",
                assetTokenId: Number(tokenId),
            }),
        });
        asset.activeStreamId = Number(session.streamId);
        asset.stream = {
            streamId: Number(session.streamId),
            sender: sender || asset.currentOwner,
            assetType: asset.assetType,
            totalAmount: String(totalAmount),
            flowRate: String(BigInt(totalAmount) / BigInt(Math.max(1, Number(duration)))),
            startTime: session.startTime,
            stopTime: session.stopTime,
            amountWithdrawn: asset.stream?.amountWithdrawn || "0",
            isActive: true,
            isFrozen: false,
        };
        asset.totalYieldDeposited = String(
            BigInt(asset.totalYieldDeposited || "0") + BigInt(totalAmount)
        );
        await this.store.upsertAsset(asset);
        return { txHash: session.txHash, streamId: Number(session.streamId) };
    }

    async claimYield({ tokenId }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        if (asset.assetPolicy?.frozen || asset.assetPolicy?.disputed || asset.assetPolicy?.revoked) {
            throw createError("asset_claim_blocked", "Yield claim is blocked by the current asset policy.");
        }
        const claimable = BigInt(asset.claimableYield || "0");
        const anchor = await this.anchorService.submitAnchor("claim_yield", {
            tokenId: Number(tokenId),
            claimable: claimable.toString(),
        });
        asset.claimableYield = "0";
        if (asset.stream) {
            asset.stream.amountWithdrawn = String(
                BigInt(asset.stream.amountWithdrawn || "0") + claimable
            );
        }
        await this.store.upsertAsset(asset);
        await this.store.recordActivity(
            toActivity("yield", "YieldClaimed", anchor.txHash, tokenId, {
                amount: claimable.toString(),
            })
        );
        return { txHash: anchor.txHash, amount: claimable.toString() };
    }

    async flashAdvance({ tokenId, amount }) {
        const asset = await this.getAssetSnapshot(tokenId);
        if (!asset) {
            throw createError("asset_not_found", `Asset ${tokenId} was not found.`);
        }
        if (asset.assetPolicy?.frozen || asset.assetPolicy?.disputed || asset.assetPolicy?.revoked) {
            throw createError("asset_claim_blocked", "Flash advance is blocked by the current asset policy.");
        }
        const anchor = await this.anchorService.submitAnchor("flash_advance", {
            tokenId: Number(tokenId),
            amount: String(amount),
        });
        asset.flashAdvanceOutstanding = String(
            BigInt(asset.flashAdvanceOutstanding || "0") + BigInt(amount)
        );
        await this.store.upsertAsset(asset);
        await this.store.recordActivity(
            toActivity("yield", "FlashAdvanceIssued", anchor.txHash, tokenId, {
                amount: String(amount),
            })
        );
        return { txHash: anchor.txHash };
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
        const sessionId = await this.store.nextCounter("sessionId");
        const parsedDuration = Math.max(1, Number(duration || 1));
        const startTime = nowSeconds();
        const stopTime = startTime + parsedDuration;
        const flowRate = BigInt(totalAmount) / BigInt(parsedDuration);
        const paymentAssetCode = String(assetCode || this.runtime.paymentAssetCode || "USDC").toUpperCase();
        const paymentAssetIssuer = paymentAssetCode === "XLM"
            ? ""
            : String(assetIssuer || this.runtime.paymentAssetIssuer || "");

        let txHash = "";
        let fundedOnchain = false;
        if (fundingTxHash) {
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
        } else {
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
        const session = await this.store.getSession(sessionId);
        if (!session) {
            throw createError("session_not_found", `Session ${sessionId} was not found.`);
        }
        const metadataObject = parseMetadata(session.metadata);
        const cancelledAt = nowSeconds();
        const claimable = computeSessionClaimable(session, cancelledAt);
        const refundableAmount = computeSessionRefundable(session, cancelledAt);
        let txHash = "";
        if (session.fundedOnchain && refundableAmount > 0n) {
            const payout = await this.anchorService.submitPayment({
                destination: session.sender,
                amount: formatStellarAmount(refundableAmount),
                assetCode: session.assetCode || this.runtime.paymentAssetCode || "USDC",
                assetIssuer: session.assetIssuer || this.runtime.paymentAssetIssuer || "",
                memoText: `refund:${sessionId}`,
            });
            txHash = payout.txHash;
        } else {
            const anchor = await this.anchorService.submitAnchor("cancel_session", {
                sessionId: Number(sessionId),
                cancelledBy,
            });
            txHash = anchor.txHash;
        }
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
        const session = await this.store.getSession(sessionId);
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
        if (session.fundedOnchain) {
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
        const session = await this.store.getSession(streamId);
        if (!session) {
            throw createError("session_not_found", `Session ${streamId} was not found.`);
        }
        const anchor = await this.anchorService.submitAnchor("freeze_session", {
            streamId: Number(streamId),
            frozen: Boolean(frozen),
            reason,
        });
        session.isFrozen = Boolean(frozen);
        session.freezeReason = reason;
        session.txHash = anchor.txHash;
        await this.store.upsertSession(session);
        await this.store.recordActivity(
            toActivity("session", "SessionFrozen", anchor.txHash, null, {
                streamId: Number(streamId),
                frozen: Boolean(frozen),
                reason,
            })
        );
        return { txHash: anchor.txHash };
    }

    async getSessionSnapshot(sessionId) {
        const session = await this.store.getSession(sessionId);
        if (!session) {
            return null;
        }
        return this.decorateSession(session);
    }

    async listSessions({ owner } = {}) {
        const sessions = await this.store.listSessions({ owner });
        return sessions.map((session) => this.decorateSession(session));
    }

    async getClaimableBalance(streamId) {
        const session = await this.getSessionSnapshot(streamId);
        if (!session) {
            return "0";
        }
        return session.claimableInitial || "0";
    }

    async getAssetSnapshot(tokenId) {
        const asset = await this.store.getAsset(tokenId);
        if (!asset) {
            return null;
        }

        const cloned = {
            ...asset,
            attestationPolicies: await this.getAttestationPolicies(asset.assetType),
        };
        this.recomputeAssetStatus(cloned);
        return cloned;
    }

    async listAssetSnapshots({ owner, limit = 200 } = {}) {
        const assets = await this.store.listAssets({ owner });
        const hydrated = [];
        for (const asset of assets.slice(0, limit)) {
            hydrated.push(await this.getAssetSnapshot(asset.tokenId));
        }
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
        return {
            ...session,
            totalAmount: String(session.totalAmount || "0"),
            flowRate: String(session.flowRate || "0"),
            durationSeconds: Number(session.durationSeconds || Math.max(1, Number(session.stopTime) - Number(session.startTime))),
            amountWithdrawn: String(session.amountWithdrawn || "0"),
            claimableInitial: claimable.toString(),
            refundableAmount: refundableAmount.toString(),
        };
    }

    recomputeAssetStatus(asset) {
        const policy = asset.assetPolicy || {};
        if (policy.revoked) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.revoked;
            asset.verificationStatusLabel = "revoked";
            asset.statusReason = policy.reason || asset.statusReason;
            return;
        }
        if (policy.disputed) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.disputed;
            asset.verificationStatusLabel = "disputed";
            asset.statusReason = policy.reason || asset.statusReason;
            return;
        }
        if (policy.frozen) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.frozen;
            asset.verificationStatusLabel = "frozen";
            asset.statusReason = policy.reason || asset.statusReason;
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
            return;
        }
        if (staleRoles.length > 0) {
            asset.verificationStatus = VERIFICATION_STATUS_CODES.stale;
            asset.verificationStatusLabel = "stale";
            asset.statusReason = "One or more attestations have expired";
            return;
        }

        asset.verificationStatus = VERIFICATION_STATUS_CODES.verified;
        asset.verificationStatusLabel = "verified";
        asset.statusReason = asset.statusReason || "Verified productive rental twin";
    }
}

module.exports = {
    StellarRWAChainService,
    createError,
};
