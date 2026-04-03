const express = require("express");
const cors = require("cors");
const { StrKey } = require("@stellar/stellar-sdk");
const streamEngineMiddleware = require("./middleware/streamEngineMiddleware");
const { IPFSService, normalizeCid } = require("./services/ipfsService");
const {
    buildVerificationPayload,
    buildVerificationUrl,
    parseVerificationPayload,
} = require("./services/verificationPayload");
const { createIndexerStore, MemoryIndexerStore } = require("./services/indexerStore");
const { StellarRWAChainService } = require("./services/stellarRwaChainService");
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
const { createRuntimeConfig } = require("../utils/runtimeConfig");
const { AgentWalletService } = require("./services/agentWalletService");
const agentRoutes = require("./routes/agent");

require("dotenv").config({ path: "../.env" });

const PORT = Number(process.env.PORT || 3001);
const runtimeConfig = createRuntimeConfig();
const PAYMENT_TOKEN_ADDRESS = runtimeConfig.paymentTokenAddress;
const CONTRACT_ADDRESS =
    process.env.STREAM_ENGINE_CONTRACT_ADDRESS
    || process.env.VITE_STREAM_ENGINE_CONTRACT_ADDRESS
    || runtimeConfig.contracts?.sessionMeter?.contractId
    || "stellar:session-meter";
const RPC_URL = runtimeConfig.rpcUrl;
const RECIPIENT_ADDRESS =
    process.env.STELLAR_OPERATOR_PUBLIC_KEY
    || process.env.STREAM_ENGINE_RECIPIENT_ADDRESS
    || process.env.STELLAR_PLATFORM_ADDRESS
    || "";

const defaultConfig = {
    rpcUrl: RPC_URL,
    streamEngineContractAddress: CONTRACT_ADDRESS,
    paymentTokenAddress: PAYMENT_TOKEN_ADDRESS,
    tokenSymbol: runtimeConfig.paymentTokenSymbol,
    tokenDecimals: runtimeConfig.paymentTokenDecimals,
    chainId: runtimeConfig.chainId,
    runtimeKind: runtimeConfig.kind,
    networkName: runtimeConfig.networkName,
    horizonUrl: runtimeConfig.horizonUrl || "",
    sorobanRpcUrl: runtimeConfig.sorobanRpcUrl || runtimeConfig.rpcUrl,
    networkPassphrase: runtimeConfig.networkPassphrase || "",
    paymentAssetCode: runtimeConfig.paymentAssetCode || "",
    paymentAssetIssuer: runtimeConfig.paymentAssetIssuer || "",
    settlement: runtimeConfig.settlement || "",
    recipientAddress: RECIPIENT_ADDRESS,
    appBaseUrl: process.env.STREAM_ENGINE_APP_BASE_URL || "http://localhost:5173",
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
        "/api/rwa/assets/analytics": {
            price: "0.10",
            mode: "per-request",
            description: "Premium asset analytics",
        },
        "/api/rwa/relay": {
            price: "0.05",
            mode: "per-request",
            description: "RWA execution relay",
        },
        "/api/rwa/assets/bid": {
            price: "0.01",
            mode: "per-request",
            description: "Asset bid placement",
        },
    },
    rwa: {
        hubAddress:
            process.env.STREAM_ENGINE_RWA_HUB_ADDRESS
            || runtimeConfig.contracts?.rwaRegistry?.contractId
            || "",
        assetNFTAddress: process.env.STREAM_ENGINE_RWA_ASSET_NFT_ADDRESS || "",
        assetRegistryAddress:
            process.env.STREAM_ENGINE_RWA_ASSET_REGISTRY_ADDRESS
            || runtimeConfig.contracts?.rwaRegistry?.contractId
            || "",
        attestationRegistryAddress:
            process.env.STREAM_ENGINE_RWA_ATTESTATION_REGISTRY_ADDRESS
            || runtimeConfig.contracts?.attestationRegistry?.contractId
            || "",
        assetStreamAddress:
            process.env.STREAM_ENGINE_RWA_ASSET_STREAM_ADDRESS
            || runtimeConfig.contracts?.yieldVault?.contractId
            || "",
        complianceGuardAddress: process.env.STREAM_ENGINE_RWA_COMPLIANCE_GUARD_ADDRESS || "",
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

    if (!services.store) {
        try {
            services.store = await createIndexerStore({ postgresUrl: config.postgresUrl });
        } catch (error) {
            services.store = new MemoryIndexerStore();
            await services.store.init();
        }
    }

    if (!services.chainService) {
        services.chainService = new StellarRWAChainService({
            runtime: runtimeConfig,
            store: services.store,
            hubAddress: config.rwa?.hubAddress,
            assetNFTAddress: config.rwa?.assetNFTAddress,
            assetRegistryAddress: config.rwa?.assetRegistryAddress,
            attestationRegistryAddress: config.rwa?.attestationRegistryAddress,
            assetStreamAddress: config.rwa?.assetStreamAddress,
            complianceGuardAddress: config.rwa?.complianceGuardAddress,
            operatorSecret: process.env.STELLAR_OPERATOR_SECRET || process.env.PRIVATE_KEY,
            operatorPublicKey: process.env.STELLAR_OPERATOR_PUBLIC_KEY || process.env.STELLAR_PLATFORM_ADDRESS,
        });
    }

    if (!services.agentWallet) {
        services.agentWallet = new AgentWalletService({
            agentSecret: process.env.AGENT_SECRET_KEY || "",
            encryptionKey: process.env.AGENT_ENCRYPTION_KEY || "",
            store: services.store,
            chainService: services.chainService,
        });
    }

    return services;
}

function beginIndexerSync(app, options = {}) {
    void app;
    void options;
    return null;
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
        app.locals.agentWallet = services.agentWallet;
        return services;
    });

    app.use("/api/agent", agentRoutes);

    app.use(streamEngineMiddleware({
        ...resolvedConfig,
        runtimeKind: runtimeConfig.kind,
        sessionResolver: async (streamId) => {
            const services = await app.locals.ready;
            if (typeof services.chainService?.getSessionSnapshot !== "function") {
                return null;
            }
            return services.chainService.getSessionSnapshot(streamId);
        },
    }));

    app.get("/api/weather", (req, res) => {
        res.json({
            temperature: 22,
            city: "London",
            condition: "Cloudy",
            paidWithStream: req.streamEngine?.streamId || null,
            paidWithRecipient: resolvedConfig.recipientAddress,
        });
    });

    app.get("/api/premium", (req, res) => {
        res.json({
            content: "This is premium content.",
            paidWithStream: req.streamEngine?.streamId || null,
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
                kind: runtimeConfig.kind,
                passphrase: resolvedConfig.networkPassphrase || runtimeConfig.networkPassphrase || "",
                horizonUrl: resolvedConfig.horizonUrl || runtimeConfig.horizonUrl || "",
                sorobanRpcUrl: resolvedConfig.sorobanRpcUrl || runtimeConfig.sorobanRpcUrl || runtimeConfig.rpcUrl,
            },
            payments: {
                tokenAddress: resolvedConfig.paymentTokenAddress,
                tokenSymbol: resolvedConfig.tokenSymbol,
                tokenDecimals: resolvedConfig.tokenDecimals,
                assetCode: resolvedConfig.paymentAssetCode || runtimeConfig.paymentAssetCode || "",
                assetIssuer: resolvedConfig.paymentAssetIssuer || runtimeConfig.paymentAssetIssuer || "",
                settlement: resolvedConfig.settlement || runtimeConfig.settlement || "",
                recipientAddress: resolvedConfig.recipientAddress,
                contractAddress: resolvedConfig.streamEngineContractAddress,
                supportedAssets: [
                    {
                        code: resolvedConfig.paymentAssetCode || runtimeConfig.paymentAssetCode || "USDC",
                        issuer: resolvedConfig.paymentAssetIssuer || runtimeConfig.paymentAssetIssuer || "",
                        decimals: resolvedConfig.tokenDecimals,
                    },
                    {
                        code: "XLM",
                        issuer: "",
                        decimals: 7,
                    },
                ],
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

    app.get("/api/health", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        res.json({
            ok: true,
            runtime: runtimeConfig.kind,
            network: runtimeConfig.networkName,
            operator: services.chainService?.signer?.address || "",
            payments: {
                tokenAddress: runtimeConfig.paymentTokenAddress,
                assetCode: runtimeConfig.paymentAssetCode || "",
            },
            rwa: {
                hubAddress: resolvedConfig.rwa?.hubAddress || "",
            },
        });
    }));

    app.get("/api/rwa/assets", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        void beginIndexerSync(app);
        void beginAssetPrime(app);
        const rawAssets = services.chainService?.isConfigured?.()
            ? await services.chainService.listAssetSnapshots({ owner: req.query.owner, limit: 200 })
            : await services.store.listAssets({ owner: req.query.owner });
        for (const asset of rawAssets) {
            await services.store.upsertAsset(asset);
        }
        const assets = await Promise.all(rawAssets.map((asset) => hydrateAssetMetadata(services, asset)));
        res.json({
            assets,
            code: "assets_listed",
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

        const documentKeys = Object.keys(evidenceBundle.documents || evidenceBundle || {});
        if (documentKeys.length > 20) {
            return res.status(400).json({ error: "evidenceBundle exceeds the maximum of 20 document entries" });
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
        if (!chainService?.signer) {
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

        let mintResult;
        try {
            mintResult = await chainService.mintAsset({
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
        } catch (error) {
            const statusCode = error.code === "issuer_not_onboarded" ? 400 : 500;
            return res.status(statusCode).json({
                error: error.message || "Asset mint failed",
                code: error.code || "mint_failed",
                action: "mintAsset",
                details: error.details || {},
            });
        }

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
            code: "asset_minted",
            action: "mintAsset",
            tokenId: mintResult.tokenId,
            txHash: mintResult.txHash,
            publicMetadataURI: resolvedPublicMetadataURI,
            publicMetadataHash,
            evidenceRoot: evidenceRecord.evidenceRoot,
            evidenceManifestHash: evidenceRecord.evidenceManifestHash,
            verificationStatus: resolvedVerificationStatus,
            statusReason: resolvedStatusReason,
            details: {
                runtime: runtimeConfig.kind,
                issuerApproved: true,
            },
            issuerOnboarding: {
                alreadyApproved: true,
                automaticallyApproved: false,
            },
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
        if (!chainService?.signer) {
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
            code: "attestation_registered",
            action: "register",
            attestationId: result.attestationId,
            txHash: result.txHash,
            role: normalizedRole.label,
            asset: snapshot ? await hydrateAssetMetadata(services, snapshot) : null,
            details: {
                runtime: runtimeConfig.kind,
            },
        });
    }));

    app.get("/api/sessions", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const sessions = typeof services.chainService.listSessions === "function"
            ? await services.chainService.listSessions({ owner: req.query.owner })
            : [];
        res.json({
            sessions,
            code: "sessions_listed",
        });
    }));

    app.post("/api/sessions", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const {
            sender,
            recipient,
            duration,
            amount,
            metadata = "{}",
            assetCode = "",
            assetIssuer = "",
            fundingTxHash = "",
        } = req.body || {};

        if (!sender || !recipient || !duration || !amount) {
            return res.status(400).json({
                error: "sender, recipient, duration, and amount are required",
                code: "invalid_session_request",
            });
        }

        if (!StrKey.isValidEd25519PublicKey(String(sender))) {
            return res.status(400).json({
                error: "sender must be a valid Stellar public key",
                code: "invalid_stellar_sender",
            });
        }
        if (!StrKey.isValidEd25519PublicKey(String(recipient))) {
            return res.status(400).json({
                error: "recipient must be a valid Stellar public key",
                code: "invalid_stellar_recipient",
            });
        }

        const result = await services.chainService.openSession({
            sender,
            recipient,
            duration: Number(duration),
            totalAmount: BigInt(String(amount)),
            metadata,
            assetCode,
            assetIssuer,
            fundingTxHash,
        });
        const session = await services.chainService.getSessionSnapshot(result.streamId);
        res.status(201).json({
            code: "session_opened",
            action: "openSession",
            streamId: result.streamId,
            txHash: result.txHash,
            session,
            details: {
                runtime: runtimeConfig.kind,
            },
        });
    }));

    app.post("/api/sessions/:sessionId/metadata", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const {
            metadata = "{}",
            txHash = "",
            fundingTxHash = "",
            sender = "",
            recipient = "",
            assetCode = "",
            assetIssuer = "",
        } = req.body || {};

        const session = await services.chainService.syncSessionMetadata({
            sessionId: Number(req.params.sessionId),
            metadata,
            txHash,
            fundingTxHash,
            sender,
            recipient,
            assetCode,
            assetIssuer,
        });

        res.status(200).json({
            code: "session_metadata_synced",
            action: "syncSessionMetadata",
            session,
            details: {
                runtime: runtimeConfig.kind,
            },
        });
    }));

    app.get("/api/sessions/:sessionId", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const session = await services.chainService.getSessionSnapshot(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: "session not found", code: "session_not_found" });
        }
        res.json({
            code: "session_loaded",
            session,
        });
    }));

    app.post("/api/sessions/:sessionId/cancel", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const { cancelledBy = "" } = req.body || {};
        const result = await services.chainService.cancelSession({
            sessionId: Number(req.params.sessionId),
            cancelledBy,
        });
        const session = await services.chainService.getSessionSnapshot(req.params.sessionId);
        res.json({
            code: "session_cancelled",
            action: "cancelSession",
            txHash: result.txHash,
            refundableAmount: result.refundableAmount,
            claimableAmount: result.claimableAmount,
            session,
            details: {
                runtime: runtimeConfig.kind,
            },
        });
    }));

    app.post("/api/sessions/:sessionId/claim", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const { claimer = "" } = req.body || {};
        const result = await services.chainService.claimSession({
            sessionId: Number(req.params.sessionId),
            claimer,
        });
        const session = await services.chainService.getSessionSnapshot(req.params.sessionId);
        res.json({
            code: "session_claimed",
            action: "claimSession",
            txHash: result.txHash,
            amount: result.amount,
            session,
            details: {
                runtime: runtimeConfig.kind,
            },
        });
    }));

    app.post("/api/agent/chat", asyncHandler(async (req, res) => {
        const { message, context = {} } = req.body || {};
        if (!message) {
            return res.status(400).json({ error: "message is required" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "your_gemini_api_key_here") {
            return res.json({ reply: "Gemini API key is not configured. Add GEMINI_API_KEY to your .env to enable agent chat." });
        }

        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `You are Stream Engine Agent — an autonomous AI payment agent running on Stellar testnet.
You can stream USDC or XLM per-second to any service, rent tokenized real-world assets, and manage payment sessions.

Agent context:
${JSON.stringify(context, null, 2)}

Human instruction: ${message}

Respond concisely. If the human is asking you to take an action (stream payment, rent asset, cancel session, claim earnings), describe exactly what you would do and what parameters you'd use. If it's a question, answer it directly.`;

        const result = await model.generateContent(prompt);
        const reply = (await result.response).text();
        res.json({ reply });
    }));

    app.post("/api/rwa/relay", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const { action } = req.body || {};
        const chainService = services.chainService;

        if (action === "createAssetYieldStream") {
            const { tokenId, totalAmount, duration, sender } = req.body || {};
            const result = await chainService.createAssetYieldStream({
                tokenId: Number(tokenId),
                totalAmount: BigInt(String(totalAmount || 0)),
                duration: Number(duration || 0),
                sender,
            });
            const asset = await getHydratedAsset(services, Number(tokenId));
            return res.status(201).json({
                code: "asset_yield_stream_created",
                action,
                txHash: result.txHash,
                streamId: result.streamId,
                asset,
                details: { runtime: runtimeConfig.kind },
            });
        }

        if (action === "claimYield") {
            const { tokenId } = req.body || {};
            const result = await chainService.claimYield({
                tokenId: Number(tokenId),
            });
            const asset = await getHydratedAsset(services, Number(tokenId));
            return res.json({
                code: "yield_claimed",
                action,
                txHash: result.txHash,
                amount: result.amount,
                asset,
                details: { runtime: runtimeConfig.kind },
            });
        }

        if (action === "flashAdvance") {
            const { tokenId, amount } = req.body || {};
            const result = await chainService.flashAdvance({
                tokenId: Number(tokenId),
                amount: BigInt(String(amount || 0)),
            });
            const asset = await getHydratedAsset(services, Number(tokenId));
            return res.json({
                code: "flash_advance_issued",
                action,
                txHash: result.txHash,
                asset,
                details: { runtime: runtimeConfig.kind },
            });
        }

        if (action === "updateAssetMetadata") {
            const { tokenId, metadataURI, publicMetadataHash } = req.body || {};
            let resolvedPublicMetadataHash = publicMetadataHash || "";
            if (!resolvedPublicMetadataHash && metadataURI) {
                try {
                    const metadataResult = await services.ipfsService.fetchJSON(metadataURI);
                    resolvedPublicMetadataHash = hashJson(metadataResult.metadata);
                } catch {
                    resolvedPublicMetadataHash = "";
                }
            }
            const result = await chainService.updateAssetMetadata({
                tokenId: Number(tokenId),
                metadataURI,
                cidHash: hashText(metadataURI || ""),
                publicMetadataHash: resolvedPublicMetadataHash,
            });
            const asset = await getHydratedAsset(services, Number(tokenId));
            return res.json({
                code: "asset_metadata_updated",
                action,
                txHash: result.txHash,
                asset,
                details: { runtime: runtimeConfig.kind },
            });
        }

        if (action === "updateAssetEvidence") {
            const { tokenId, evidenceRoot, evidenceManifestHash } = req.body || {};
            const result = await chainService.updateAssetEvidence({
                tokenId: Number(tokenId),
                evidenceRoot,
                evidenceManifestHash,
            });
            const asset = await getHydratedAsset(services, Number(tokenId));
            return res.json({
                code: "asset_evidence_updated",
                action,
                txHash: result.txHash,
                asset,
                details: { runtime: runtimeConfig.kind },
            });
        }

        if (action === "updateVerificationTag") {
            const { tokenId, tag } = req.body || {};
            const result = await chainService.updateVerificationTag({
                tokenId: Number(tokenId),
                tagHash: hashText(tag || ""),
            });
            const asset = await getHydratedAsset(services, Number(tokenId));
            return res.json({
                code: "asset_tag_updated",
                action,
                txHash: result.txHash,
                asset,
                details: { runtime: runtimeConfig.kind },
            });
        }

        return res.status(400).json({
            error: `Unknown relay action: ${action}`,
            code: "unknown_relay_action",
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
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            return res.status(400).json({ error: "invalid tokenId" });
        }

        const services = await app.locals.ready;
        void beginIndexerSync(app);
        const activity = await services.store.getActivities(tokenId);
        res.json({ activity, syncing: Boolean(app.locals.indexerSyncPromise) });
    }));

    // ── Analytics (x402 gated) ────────────────────────────────────────────────
    app.get("/api/rwa/assets/:tokenId/analytics", asyncHandler(async (req, res) => {
        const tokenId = Number(req.params.tokenId);
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            return res.status(400).json({ error: "invalid tokenId" });
        }
        const services = await app.locals.ready;
        const asset = await services.store.getAsset(tokenId);
        if (!asset) return res.status(404).json({ error: "asset not found" });

        const activity = await services.store.getActivities(tokenId);
        const sessions = activity.filter(a => a.event === "SessionOpened" || a.event === "RentalStarted");
        const claims = activity.filter(a => a.event === "YieldClaimed");
        const totalClaimed = claims.reduce((s, c) => s + Number(c.amount || 0), 0);
        const occupancyRate = sessions.length > 0
            ? Math.min(1, sessions.length / Math.max(1, Math.ceil((Date.now() / 1000 - Number(asset.createdAt || 0)) / 86400)))
            : 0;
        const flowRate = Number(asset.stream?.flowRate || 0);
        const projectedAnnualYield = flowRate * 3600 * 24 * 365;

        res.json({
            tokenId,
            analytics: {
                totalSessions: sessions.length,
                totalYieldClaimed: totalClaimed,
                occupancyRate: Number(occupancyRate.toFixed(4)),
                projectedAnnualYield: Number(projectedAnnualYield.toFixed(6)),
                currentFlowRate: flowRate,
                claimableYield: Number(asset.claimableYield || 0),
                verificationStatus: asset.verificationStatusLabel || asset.verificationStatus,
                rentalReady: Boolean(asset.rentalReady),
                activityCount: activity.length,
            },
            paidVia: req.streamEngine || null,
        });
    }));

    // ── Bid on asset ──────────────────────────────────────────────────────────
    app.post("/api/rwa/assets/:tokenId/bid", asyncHandler(async (req, res) => {
        const tokenId = Number(req.params.tokenId);
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            return res.status(400).json({ error: "invalid tokenId" });
        }
        const { bidder, amount, currency = "USDC", message = "" } = req.body || {};
        if (!bidder) return res.status(400).json({ error: "bidder is required" });
        if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "amount must be > 0" });

        const services = await app.locals.ready;
        const asset = await services.store.getAsset(tokenId);
        if (!asset) return res.status(404).json({ error: "asset not found" });

        const bid = {
            tokenId,
            bidder,
            amount: String(amount),
            currency,
            message,
            placedAt: Math.floor(Date.now() / 1000),
            status: "pending",
        };

        await services.store.recordActivity(
            { source: "marketplace", event: "BidPlaced", txHash: "", tokenId,
              data: bid, timestamp: bid.placedAt }
        );

        res.status(201).json({ bid });
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

        const resolvedTokenId = tokenId !== undefined && tokenId !== null ? tokenId : parsedPayload?.tokenId;
        if ((resolvedTokenId === undefined || resolvedTokenId === null || resolvedTokenId === "") && !payload) {
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
        if (!chainService?.signer) {
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
            return res.json({ code: "compliance_updated", action, txHash: result.txHash, details: { runtime: runtimeConfig.kind } });
        }

        if (action === "setIssuerApproval") {
            const { issuer, approved = false, note = "" } = req.body || {};
            if (!issuer) {
                return res.status(400).json({ error: "issuer is required" });
            }
            const result = await chainService.setIssuerApproval({
                issuer,
                approved: Boolean(approved),
                note,
            });
            return res.json({
                code: "issuer_approval_updated",
                action,
                txHash: result.txHash,
                details: { runtime: runtimeConfig.kind },
            });
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
            return res.json({ code: "verification_status_updated", action, txHash: result.txHash, asset: snapshot ? await hydrateAssetMetadata(services, snapshot) : null, details: { runtime: runtimeConfig.kind } });
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
            return res.json({ code: "asset_policy_updated", action, txHash: result.txHash, asset: snapshot ? await hydrateAssetMetadata(services, snapshot) : null, details: { runtime: runtimeConfig.kind } });
        }

        if (action === "setAttestationPolicy") {
            const { required = false, maxAge = 0 } = req.body;
            if (assetType === undefined || role === undefined) {
                return res.status(400).json({ error: "assetType and role are required" });
            }
            const result = await chainService.setAttestationPolicy({ assetType: Number(assetType), role: Number(role), required: Boolean(required), maxAge: Number(maxAge) });
            void beginIndexerSync(app);
            return res.json({ code: "attestation_policy_updated", action, txHash: result.txHash, details: { runtime: runtimeConfig.kind } });
        }

        if (action === "freezeStream") {
            const { frozen = false, reason = "" } = req.body;
            if (!streamId) {
                return res.status(400).json({ error: "streamId is required" });
            }
            const result = await chainService.freezeStream({ streamId: Number(streamId), frozen: Boolean(frozen), reason });
            void beginIndexerSync(app);
            return res.json({ code: "session_freeze_updated", action, txHash: result.txHash, details: { runtime: runtimeConfig.kind } });
        }

        return res.status(400).json({ error: `Unknown admin action: ${action}`, code: "unknown_admin_action" });
    }));

    app.use((error, _req, res, _next) => {
        console.error(error);
        res.status(error.statusCode || 500).json({
            error: error.message || "Internal server error",
            code: error.code || "internal_error",
            details: error.details || {},
        });
    });

    return app;
}

if (require.main === module) {
    const app = createApp();
    app.listen(PORT, () => {
        console.log(`Stream Engine server running on port ${PORT}`);
        console.log(`Payment recipient: ${RECIPIENT_ADDRESS}`);
        console.log(`Stream contract: ${CONTRACT_ADDRESS}`);
        console.log(`Payment token (${runtimeConfig.paymentTokenSymbol}): ${PAYMENT_TOKEN_ADDRESS}`);
        console.log(`RWA hub: ${process.env.STREAM_ENGINE_RWA_HUB_ADDRESS || "not configured"}`);
        console.log(`RWA attestation registry: ${process.env.STREAM_ENGINE_RWA_ATTESTATION_REGISTRY_ADDRESS || "not configured"}`);
    });
}

module.exports = createApp;
module.exports.defaultConfig = defaultConfig;
