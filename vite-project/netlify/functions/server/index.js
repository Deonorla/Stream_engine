const express = require("express");
const cors = require("cors");
const flowPayMiddleware = require("./middleware/flowPayMiddleware");
const { IPFSService, normalizeCid } = require("./services/ipfsService");
const {
    buildVerificationPayload,
    buildVerificationUrl,
    parseVerificationPayload,
} = require("./services/verificationPayload");
const { createIndexerStore, MemoryIndexerStore } = require("./services/indexerStore");
const { RWAIndexer } = require("./services/rwaIndexer");
const { RWAChainService } = require("./services/rwaChainService");
const { EvidenceVaultService } = require("./services/evidenceVault");
const {
    verifyAttestationAuthorization,
    verifyAttestationRevocationAuthorization,
    verifyIssuerAuthorization,
} = require("./services/issuerAuthorization");
const { evaluateVerification } = require("./services/rwaVerification");
const {
    hashJson,
    hashText,
    normalizeAttestationRole,
    normalizeRightsModel,
} = require("./services/rwaModel");
const { createFlowPayRuntimeConfig } = require("../utils/polkadot");

require("dotenv").config({ path: "../.env" });

const PORT = Number(process.env.PORT || 3001);
const runtimeConfig = createFlowPayRuntimeConfig();
const PAYMENT_TOKEN_ADDRESS = runtimeConfig.paymentTokenAddress;
const CONTRACT_ADDRESS =
    process.env.FLOWPAY_CONTRACT_ADDRESS
    || process.env.VITE_CONTRACT_ADDRESS
    || "0x0000000000000000000000000000000000000000";
const RPC_URL = runtimeConfig.rpcUrl;
const RECIPIENT_ADDRESS =
    process.env.FLOWPAY_RECIPIENT_ADDRESS || process.env.FLOWPAY_SERVICE_RECIPIENT || "0x0000000000000000000000000000000000000000";

const defaultConfig = {
    rpcUrl: RPC_URL,
    flowPayContractAddress: CONTRACT_ADDRESS,
    paymentTokenAddress: PAYMENT_TOKEN_ADDRESS,
    tokenSymbol: runtimeConfig.paymentTokenSymbol,
    tokenDecimals: runtimeConfig.paymentTokenDecimals,
    chainId: runtimeConfig.chainId,
    networkName: runtimeConfig.networkName,
    paymentAssetId: runtimeConfig.paymentAssetId,
    recipientAddress: RECIPIENT_ADDRESS,
    useSubstrateReads:
        process.env.FLOWPAY_USE_SUBSTRATE_READS === "true"
        || process.env.FLOWPAY_USE_SUBSTRATE_WRITES === "true",
    appBaseUrl: process.env.FLOWPAY_APP_BASE_URL || "http://localhost:5173",
    postgresUrl: process.env.POSTGRES_URL || "",
    routes: {
        "/api/free": {
            price: "0",
            mode: "free",
            description: "Public route with no payment requirement.",
        },
        "/api/weather": {
            price: "0.0001",
            mode: "streaming",
            description: "Real-time weather data",
        },
        "/api/premium": {
            price: "1.0",
            mode: "per-request",
            description: "Premium content",
        },
    },
    rwa: {
        hubAddress: process.env.FLOWPAY_RWA_HUB_ADDRESS || "",
        assetNFTAddress: process.env.FLOWPAY_RWA_ASSET_NFT_ADDRESS || "",
        assetRegistryAddress: process.env.FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS || "",
        attestationRegistryAddress: process.env.FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS || "",
        assetStreamAddress: process.env.FLOWPAY_RWA_ASSET_STREAM_ADDRESS || "",
        complianceGuardAddress: process.env.FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS || "",
        startBlock: Number(process.env.RWA_INDEXER_START_BLOCK || 0),
    },
};

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function hydrateAssetMetadata(services, asset) {
    const publicMetadataURI = asset?.publicMetadataURI || asset?.metadataURI;
    if (!publicMetadataURI) {
        return asset;
    }

    try {
        const ipfsMetadata = await services.ipfsService.fetchJSON(publicMetadataURI);
        return {
            ...asset,
            publicMetadataURI,
            metadataURI: publicMetadataURI,
            publicMetadata: ipfsMetadata.metadata,
            metadata: ipfsMetadata.metadata,
        };
    } catch (error) {
        return {
            ...asset,
            publicMetadataURI,
            metadataURI: publicMetadataURI,
        };
    }
}

async function buildServices(config) {
    const services = config.services ? { ...config.services } : {};

    if (!services.ipfsService) {
        services.ipfsService = new IPFSService(config.ipfs || {});
    }

    if (!services.evidenceVault) {
        services.evidenceVault = new EvidenceVaultService(config.evidenceVault || {});
    }

    if (!services.chainService) {
        services.chainService = new RWAChainService({
            rpcUrl: config.rpcUrl,
            chainId: config.chainId,
            hubAddress: config.rwa?.hubAddress,
            assetNFTAddress: config.rwa?.assetNFTAddress,
            assetRegistryAddress: config.rwa?.assetRegistryAddress,
            attestationRegistryAddress: config.rwa?.attestationRegistryAddress,
            assetStreamAddress: config.rwa?.assetStreamAddress,
            complianceGuardAddress: config.rwa?.complianceGuardAddress,
            privateKey: process.env.PRIVATE_KEY,
        });
    }

    if (typeof services.chainService.init === "function") {
        await services.chainService.init();
    }

    if (!services.store) {
        try {
            services.store = await createIndexerStore({ postgresUrl: config.postgresUrl });
        } catch (error) {
            services.store = new MemoryIndexerStore();
            await services.store.init();
        }
    }

    if (!services.indexer) {
        services.indexer = new RWAIndexer({
            chainService: services.chainService,
            store: services.store,
            startBlock: config.rwa?.startBlock,
        });
    }

    return services;
}

function beginIndexerSync(app, options = {}) {
    if (app.locals.indexerSyncPromise) {
        return app.locals.indexerSyncPromise;
    }

    app.locals.indexerSyncPromise = (async () => {
        const services = await app.locals.ready;
        if (!services.indexer) {
            return null;
        }

        return services.indexer.sync(options);
    })()
        .catch((error) => {
            console.error("RWA indexer sync failed:", error);
            return null;
        })
        .finally(() => {
            app.locals.indexerSyncPromise = null;
        });

    return app.locals.indexerSyncPromise;
}

async function primeAssetsFromChain(services, { owner } = {}) {
    if (
        !services.chainService?.isConfigured?.()
        || typeof services.chainService.listAssetSnapshots !== "function"
    ) {
        return [];
    }

    const limit = Number(process.env.RWA_BOOTSTRAP_ASSET_LIMIT || 200);
    const snapshots = await services.chainService.listAssetSnapshots({ owner, limit });
    for (const snapshot of snapshots) {
        await services.store.upsertAsset(snapshot);
    }
    return snapshots;
}

function beginAssetPrime(app) {
    if (app.locals.assetPrimePromise) {
        return app.locals.assetPrimePromise;
    }

    app.locals.assetPrimePromise = (async () => {
        const services = await app.locals.ready;
        return primeAssetsFromChain(services);
    })()
        .catch((error) => {
            console.error("RWA asset bootstrap failed:", error);
            return [];
        })
        .finally(() => {
            app.locals.assetPrimePromise = null;
        });

    return app.locals.assetPrimePromise;
}

async function getHydratedAsset(services, tokenId) {
    let asset = await services.store.getAsset(tokenId);
    if (!asset && services.chainService?.isConfigured()) {
        asset = await services.chainService.getAssetSnapshot(tokenId);
        if (asset) {
            await services.store.upsertAsset(asset);
        }
    }
    if (!asset) {
        return null;
    }
    return hydrateAssetMetadata(services, asset);
}

function collectAttestationRequirements(asset) {
    return (asset?.attestationPolicies || [])
        .filter((policy) => policy.required)
        .map((policy) => ({
            role: policy.roleLabel,
            maxAge: policy.maxAge,
        }));
}

async function resolvePublicMetadata(services, publicMetadata, publicMetadataURI) {
    if (publicMetadata && typeof publicMetadata === "object") {
        return {
            metadata: publicMetadata,
            uri: publicMetadataURI || "",
        };
    }

    if (publicMetadataURI) {
        const resolved = await services.ipfsService.fetchJSON(publicMetadataURI);
        return {
            metadata: resolved.metadata,
            uri: resolved.uri,
        };
    }

    throw new Error("publicMetadata or publicMetadataURI is required");
}

function createApp(config = defaultConfig) {
    const resolvedConfig = {
        ...defaultConfig,
        ...config,
        routes: config.routes || defaultConfig.routes,
        rwa: {
            ...defaultConfig.rwa,
            ...(config.rwa || {}),
        },
        services: config.services ? { ...config.services } : undefined,
    };
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "2mb" }));

    app.locals.services = resolvedConfig.services ? { ...resolvedConfig.services } : {};
    app.locals.indexerSyncPromise = null;
    app.locals.assetPrimePromise = null;
    app.locals.ready = buildServices(resolvedConfig).then((services) => {
        app.locals.services = services;
        return services;
    });

    app.use(flowPayMiddleware(resolvedConfig));

    app.get("/api/weather", (req, res) => {
        res.json({
            temperature: 22,
            city: "London",
            condition: "Cloudy",
            paidWithStream: req.flowPay?.streamId || null,
            paidWithRecipient: resolvedConfig.recipientAddress,
        });
    });

    app.get("/api/premium", (req, res) => {
        res.json({
            content: "This is premium content.",
            paidWithStream: req.flowPay?.streamId || null,
            paidWithRecipient: resolvedConfig.recipientAddress,
        });
    });

    app.get("/api/free", (req, res) => {
        res.json({
            message: "This is free content.",
        });
    });

    app.get("/api/engine/catalog", (req, res) => {
        const routes = Object.entries(resolvedConfig.routes || {}).map(([path, route]) => ({
            path,
            price: route.price,
            mode: route.mode,
            description: route.description || "",
        }));

        res.json({
            appName: "Stream Engine",
            network: {
                name: resolvedConfig.networkName,
                chainId: resolvedConfig.chainId,
                rpcUrl: resolvedConfig.rpcUrl,
            },
            payments: {
                tokenAddress: resolvedConfig.paymentTokenAddress,
                tokenSymbol: resolvedConfig.tokenSymbol,
                tokenDecimals: resolvedConfig.tokenDecimals,
                paymentAssetId: resolvedConfig.paymentAssetId,
                recipientAddress: resolvedConfig.recipientAddress,
                contractAddress: resolvedConfig.flowPayContractAddress,
            },
            rwa: {
                hubAddress: resolvedConfig.rwa?.hubAddress || "",
                assetNFTAddress: resolvedConfig.rwa?.assetNFTAddress || "",
                assetRegistryAddress: resolvedConfig.rwa?.assetRegistryAddress || "",
                attestationRegistryAddress: resolvedConfig.rwa?.attestationRegistryAddress || "",
                assetStreamAddress: resolvedConfig.rwa?.assetStreamAddress || "",
                complianceGuardAddress: resolvedConfig.rwa?.complianceGuardAddress || "",
            },
            routes,
        });
    });

    app.get("/api/rwa/assets", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        void beginIndexerSync(app);
        void beginAssetPrime(app);
        const rawAssets = await services.store.listAssets({ owner: req.query.owner });
        const assets = await Promise.all(rawAssets.map((asset) => hydrateAssetMetadata(services, asset)));
        res.json({
            assets,
            syncing: Boolean(app.locals.indexerSyncPromise || app.locals.assetPrimePromise),
        });
    }));

    app.post("/api/rwa/ipfs/metadata", asyncHandler(async (req, res) => {
        const { metadata } = req.body || {};
        if (!metadata || typeof metadata !== "object") {
            return res.status(400).json({ error: "metadata object is required" });
        }

        const services = await app.locals.ready;
        const result = await services.ipfsService.pinJSON(metadata);
        res.status(201).json(result);
    }));

    app.post("/api/rwa/evidence", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const { evidenceBundle, rightsModel = "verified_rental_asset", propertyRef = "", jurisdiction = "" } = req.body || {};
        if (!evidenceBundle || typeof evidenceBundle !== "object") {
            return res.status(400).json({ error: "evidenceBundle object is required" });
        }

        const normalizedRightsModel = normalizeRightsModel(rightsModel);
        const record = await services.evidenceVault.storeBundle(evidenceBundle, {
            rightsModel: normalizedRightsModel.label,
            propertyRef,
            jurisdiction,
        });

        res.status(201).json({
            evidenceRoot: record.evidenceRoot,
            evidenceManifestHash: record.evidenceManifestHash,
            evidenceSummary: record.evidenceSummary,
            storedAt: record.storedAt,
        });
    }));

    app.post("/api/rwa/assets", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const chainService = services.chainService;
        if (!chainService?.signer && !chainService?.useSubstrateWrites) {
            return res.status(503).json({ error: "RWA minting signer is not configured" });
        }

        const {
            issuer,
            assetType = 1,
            rightsModel = "verified_rental_asset",
            jurisdiction = "",
            propertyRef = "",
            publicMetadata,
            publicMetadataURI,
            evidenceBundle,
            evidenceRoot,
            evidenceManifestHash,
            tag,
            tagHash,
            issuerSignature,
            issuerAuthorization,
            statusReason = "Awaiting attestation review",
        } = req.body || {};

        if (!issuer) {
            return res.status(400).json({ error: "issuer is required" });
        }
        if (!propertyRef) {
            return res.status(400).json({ error: "propertyRef is required" });
        }

        const normalizedRightsModel = normalizeRightsModel(rightsModel);
        const metadataResult = await resolvePublicMetadata(services, publicMetadata, publicMetadataURI);
        let resolvedPublicMetadataURI = metadataResult.uri;
        if (!resolvedPublicMetadataURI) {
            const pinResult = await services.ipfsService.pinJSON(metadataResult.metadata);
            resolvedPublicMetadataURI = pinResult.uri;
        }
        const publicMetadataHash = hashJson(metadataResult.metadata);

        let evidenceRecord = null;
        if (evidenceRoot) {
            evidenceRecord = await services.evidenceVault.getBundle(evidenceRoot);
            if (!evidenceRecord) {
                return res.status(400).json({ error: "evidenceRoot was not found in the private evidence vault" });
            }
            if (evidenceManifestHash && evidenceRecord.evidenceManifestHash !== evidenceManifestHash) {
                return res.status(400).json({ error: "evidenceManifestHash does not match the stored evidence bundle" });
            }
        } else {
            if (!evidenceBundle || typeof evidenceBundle !== "object") {
                return res.status(400).json({ error: "evidenceBundle or evidenceRoot is required" });
            }
            evidenceRecord = await services.evidenceVault.storeBundle(evidenceBundle, {
                rightsModel: normalizedRightsModel.label,
                propertyRef,
                jurisdiction,
            });
        }

        const authorizationResult = await verifyIssuerAuthorization({
            issuer,
            issuerSignature,
            issuerAuthorization,
            rightsModel: normalizedRightsModel.label,
            jurisdiction,
            propertyRef,
            publicMetadataHash,
            evidenceRoot: evidenceRecord.evidenceRoot,
        });
        if (!authorizationResult.valid) {
            return res.status(400).json({ error: authorizationResult.reason || "invalid issuer authorization" });
        }

        const propertyRefHash = hashText(propertyRef);
        const resolvedTagHash = tagHash || hashText(tag || `${issuer}:${propertyRef}:${resolvedPublicMetadataURI}`);
        const cidHash = hashText(resolvedPublicMetadataURI);

        let issuerApprovalResult = null;
        if (typeof chainService.ensureIssuerApproved === "function") {
            try {
                issuerApprovalResult = await chainService.ensureIssuerApproved(
                    issuer,
                    "Auto-approved from signed Stream Engine mint authorization"
                );
            } catch (error) {
                throw new Error(
                    `RWA issuer approval failed before mint: ${error.message || error}`
                );
            }
        }

        const mintResult = await chainService.mintAsset({
            publicMetadataURI: resolvedPublicMetadataURI,
            assetType,
            rightsModel: normalizedRightsModel.code,
            publicMetadataHash,
            evidenceRoot: evidenceRecord.evidenceRoot,
            evidenceManifestHash: evidenceRecord.evidenceManifestHash,
            propertyRefHash,
            jurisdiction,
            cidHash,
            tagHash: resolvedTagHash,
            issuer,
            statusReason,
        });

        void beginIndexerSync(app);

        const snapshot = await chainService.getAssetSnapshot(mintResult.tokenId);
        if (snapshot) {
            await services.store.upsertAsset(snapshot);
        }
        const hydratedSnapshot = snapshot ? await hydrateAssetMetadata(services, snapshot) : null;
        let attestationRequirements = collectAttestationRequirements(hydratedSnapshot || {});
        let resolvedVerificationStatus = hydratedSnapshot?.verificationStatusLabel || "";
        if (!resolvedVerificationStatus) {
            const fallbackPolicies =
                typeof chainService.getAttestationPolicies === "function"
                    ? await chainService.getAttestationPolicies(assetType)
                    : [];
            attestationRequirements = collectAttestationRequirements({
                attestationPolicies: fallbackPolicies,
            });
            resolvedVerificationStatus = attestationRequirements.length > 0
                ? "pending_attestation"
                : "verified";
        }
        const resolvedStatusReason = hydratedSnapshot?.statusReason || statusReason;

        const chainId = chainService.provider
            ? (await chainService.provider.getNetwork()).chainId
            : BigInt(resolvedConfig.chainId || runtimeConfig.chainId);

        const verificationPayload = await buildVerificationPayload({
            chainId,
            assetContract: chainService.assetNFTAddress,
            tokenId: mintResult.tokenId,
            publicMetadataURI: resolvedPublicMetadataURI,
            publicMetadataHash,
            propertyRefHash,
            evidenceRoot: evidenceRecord.evidenceRoot,
            rightsModel: normalizedRightsModel.label,
            verificationStatus: resolvedVerificationStatus,
            signer: chainService.signer || null,
        });
        res.status(201).json({
            tokenId: mintResult.tokenId,
            txHash: mintResult.txHash,
            publicMetadataURI: resolvedPublicMetadataURI,
            publicMetadataHash,
            evidenceRoot: evidenceRecord.evidenceRoot,
            evidenceManifestHash: evidenceRecord.evidenceManifestHash,
            verificationStatus: resolvedVerificationStatus,
            statusReason: resolvedStatusReason,
            issuerOnboarding: issuerApprovalResult
                ? {
                    alreadyApproved: Boolean(issuerApprovalResult.alreadyApproved),
                    automaticallyApproved: !issuerApprovalResult.alreadyApproved,
                }
                : null,
            verificationPayload,
            verificationUrl: buildVerificationUrl(resolvedConfig.appBaseUrl, verificationPayload),
            verificationApiUrl: `${resolvedConfig.appBaseUrl.replace(/5173$/, "3001")}/api/rwa/verify`,
            asset: hydratedSnapshot,
            evidenceSummary: evidenceRecord.evidenceSummary,
            attestationRequirements,
        });
    }));

    app.post("/api/rwa/attestations", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const chainService = services.chainService;
        if (!chainService?.signer && !chainService?.useSubstrateWrites) {
            return res.status(503).json({ error: "RWA attestation signer is not configured" });
        }

        const {
            action = "register",
            tokenId,
            role,
            attestor,
            evidenceHash,
            statementType,
            expiry = 0,
            attestationId,
            reason = "",
            attestorSignature,
            attestationAuthorization,
        } = req.body || {};

        if (action === "revoke") {
            if (!attestationId) {
                return res.status(400).json({ error: "attestationId is required for revoke" });
            }
            const existingAttestation = await chainService.getAttestationRecord(Number(attestationId));
            if (!existingAttestation) {
                return res.status(404).json({ error: "attestation not found" });
            }
            const authorizationResult = await verifyAttestationRevocationAuthorization({
                attestationId: Number(attestationId),
                attestor: existingAttestation.attestor,
                reason,
                revocationAuthorization: req.body?.revocationAuthorization,
                attestorSignature: req.body?.attestorSignature,
            });
            if (!authorizationResult.valid) {
                return res.status(400).json({
                    error: authorizationResult.reason || "invalid attestation revocation authorization",
                });
            }
            const result = await chainService.revokeAttestation({
                attestationId,
                reason,
            });
            void beginIndexerSync(app);
            res.status(200).json({
                action: "revoke",
                attestationId: Number(attestationId),
                txHash: result.txHash,
            });
            return;
        }

        if (!tokenId || !role || !attestor || !evidenceHash || !statementType) {
            return res.status(400).json({
                error: "tokenId, role, attestor, evidenceHash, and statementType are required",
            });
        }

        const authorizationResult = await verifyAttestationAuthorization({
            tokenId: Number(tokenId),
            role,
            attestor,
            evidenceHash,
            statementType,
            expiry: Number(expiry || 0),
            attestorSignature,
            attestationAuthorization,
        });
        if (!authorizationResult.valid) {
            return res.status(400).json({
                error: authorizationResult.reason || "invalid attestation authorization",
            });
        }

        const normalizedRole = normalizeAttestationRole(role);
        const result = await chainService.registerAttestation({
            tokenId: Number(tokenId),
            role: normalizedRole.code,
            attestor,
            evidenceHash,
            statementType,
            expiry: Number(expiry || 0),
        });

        void beginIndexerSync(app);
        const snapshot = await chainService.getAssetSnapshot(Number(tokenId));
        if (snapshot) {
            await services.store.upsertAsset(snapshot);
        }

        res.status(201).json({
            action: "register",
            attestationId: result.attestationId,
            txHash: result.txHash,
            role: normalizedRole.label,
            asset: snapshot ? await hydrateAssetMetadata(services, snapshot) : null,
        });
    }));

    app.get("/api/rwa/assets/:tokenId", asyncHandler(async (req, res) => {
        const tokenId = Number(req.params.tokenId);
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            return res.status(400).json({ error: "invalid tokenId" });
        }

        const services = await app.locals.ready;
        void beginIndexerSync(app);

        const asset = await getHydratedAsset(services, tokenId);
        if (!asset) {
            return res.status(404).json({ error: "asset not found" });
        }

        res.json({ asset, syncing: Boolean(app.locals.indexerSyncPromise) });
    }));

    app.get("/api/rwa/assets/:tokenId/activity", asyncHandler(async (req, res) => {
        const tokenId = Number(req.params.tokenId);
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            return res.status(400).json({ error: "invalid tokenId" });
        }

        const services = await app.locals.ready;
        void beginIndexerSync(app);
        const activity = await services.store.getActivities(tokenId);
        res.json({ activity, syncing: Boolean(app.locals.indexerSyncPromise) });
    }));

    app.post("/api/rwa/verify", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const {
            payload,
            tokenId,
            cid,
            uri,
            publicMetadataURI,
            propertyRef,
            tag,
            tagHash,
        } = req.body || {};
        const parsedPayload = payload ? parseVerificationPayload(payload) : null;

        const resolvedTokenId = Number(tokenId || parsedPayload?.tokenId);
        if (!Number.isFinite(resolvedTokenId) || resolvedTokenId <= 0) {
            return res.status(400).json({ error: "tokenId or payload is required" });
        }

        void beginIndexerSync(app);

        const asset = await getHydratedAsset(services, resolvedTokenId);
        if (!asset) {
            return res.status(404).json({ error: "asset not found" });
        }

        const payloadVersion = Number(parsedPayload?.version || 1);
        const resolvedURI = publicMetadataURI
            || parsedPayload?.publicMetadataURI
            || (cid || uri || parsedPayload?.cid ? `ipfs://${normalizeCid(cid || uri || parsedPayload?.cid)}` : "")
            || asset.publicMetadataURI
            || asset.metadataURI
            || "";
        const resolvedTagHash = tagHash || parsedPayload?.tagHash || (tag ? hashText(tag) : "");

        let publicMetadataResult = null;
        if (resolvedURI) {
            try {
                publicMetadataResult = await services.ipfsService.fetchJSON(resolvedURI);
            } catch (error) {
                publicMetadataResult = null;
            }
        }

        let onChainVerification = null;
        if (payloadVersion <= 1 && resolvedURI) {
            const cidHash = hashText(resolvedURI);
            onChainVerification = services.chainService?.isConfigured()
                ? await services.chainService.getVerificationStatus(resolvedTokenId, cidHash, resolvedTagHash)
                : {
                    assetExists: true,
                    cidMatches: asset.cidHash === cidHash,
                    tagMatches: asset.tagHash === resolvedTagHash,
                    activeStreamId: asset.activeStreamId || 0,
                };
        }

        const evidenceRecord = asset.evidenceRoot
            ? await services.evidenceVault.getBundle(asset.evidenceRoot)
            : null;
        const activity = await services.store.getActivities(resolvedTokenId);
        const verificationResult = evaluateVerification({
            asset,
            evidenceRecord,
            publicMetadata: publicMetadataResult?.metadata || asset.publicMetadata,
            activity,
            verificationInput: {
                canonicalURI: resolvedURI,
                publicMetadataHash: publicMetadataResult ? hashJson(publicMetadataResult.metadata) : parsedPayload?.publicMetadataHash,
                propertyRef: propertyRef || parsedPayload?.propertyRef,
            },
            onChainVerification,
        });

        res.json({
            ...verificationResult,
            metadata: publicMetadataResult?.metadata || asset.publicMetadata || null,
            evidenceBundle: evidenceRecord ? services.evidenceVault.exportBundle(evidenceRecord) : null,
            verificationPayloadVersion: payloadVersion,
        });
    }));

    app.post("/api/rwa/admin", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const chainService = services.chainService;
        if (!chainService?.signer && !chainService?.useSubstrateWrites) {
            return res.status(503).json({ error: "RWA admin signer is not configured" });
        }

        const { action, tokenId, streamId, assetType, role, user } = req.body || {};

        if (action === "setCompliance") {
            const { approved, expiry = 0, jurisdiction = "" } = req.body;
            if (!user || assetType === undefined) {
                return res.status(400).json({ error: "user and assetType are required" });
            }
            const result = await chainService.setCompliance({ user, assetType: Number(assetType), approved: Boolean(approved), expiry: Number(expiry), jurisdiction });
            void beginIndexerSync(app);
            return res.json({ action, txHash: result.txHash });
        }

        if (action === "setVerificationStatus") {
            const { status, reason = "" } = req.body;
            if (!tokenId || status === undefined) {
                return res.status(400).json({ error: "tokenId and status are required" });
            }
            const result = await chainService.setVerificationStatus({ tokenId: Number(tokenId), status: Number(status), reason });
            void beginIndexerSync(app);
            const snapshot = await chainService.getAssetSnapshot(Number(tokenId));
            if (snapshot) await services.store.upsertAsset(snapshot);
            return res.json({ action, txHash: result.txHash, asset: snapshot ? await hydrateAssetMetadata(services, snapshot) : null });
        }

        if (action === "setAssetPolicy") {
            const { frozen = false, disputed = false, revoked = false, reason = "" } = req.body;
            if (!tokenId) {
                return res.status(400).json({ error: "tokenId is required" });
            }
            const result = await chainService.setAssetPolicy({ tokenId: Number(tokenId), frozen: Boolean(frozen), disputed: Boolean(disputed), revoked: Boolean(revoked), reason });
            void beginIndexerSync(app);
            const snapshot = await chainService.getAssetSnapshot(Number(tokenId));
            if (snapshot) await services.store.upsertAsset(snapshot);
            return res.json({ action, txHash: result.txHash, asset: snapshot ? await hydrateAssetMetadata(services, snapshot) : null });
        }

        if (action === "setAttestationPolicy") {
            const { required = false, maxAge = 0 } = req.body;
            if (assetType === undefined || role === undefined) {
                return res.status(400).json({ error: "assetType and role are required" });
            }
            const result = await chainService.setAttestationPolicy({ assetType: Number(assetType), role: Number(role), required: Boolean(required), maxAge: Number(maxAge) });
            void beginIndexerSync(app);
            return res.json({ action, txHash: result.txHash });
        }

        if (action === "freezeStream") {
            const { frozen = false, reason = "" } = req.body;
            if (!streamId) {
                return res.status(400).json({ error: "streamId is required" });
            }
            const result = await chainService.freezeStream({ streamId: Number(streamId), frozen: Boolean(frozen), reason });
            void beginIndexerSync(app);
            return res.json({ action, txHash: result.txHash });
        }

        return res.status(400).json({ error: `Unknown admin action: ${action}` });
    }));

    app.use((error, _req, res, _next) => {
    const app = createApp();
    app.listen(PORT, () => {
        console.log(`Stream Engine server running on port ${PORT}`);
        console.log(`Payment recipient: ${RECIPIENT_ADDRESS}`);
        console.log(`Stream contract: ${CONTRACT_ADDRESS}`);
        console.log(`Payment token (${runtimeConfig.paymentTokenSymbol}): ${PAYMENT_TOKEN_ADDRESS}`);
        console.log(`RWA hub: ${process.env.FLOWPAY_RWA_HUB_ADDRESS || "not configured"}`);
        console.log(`RWA attestation registry: ${process.env.FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS || "not configured"}`);
    });
}

module.exports = createApp;
module.exports.defaultConfig = defaultConfig;
