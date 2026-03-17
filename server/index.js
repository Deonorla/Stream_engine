const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const flowPayMiddleware = require("./middleware/flowPayMiddleware");
const { IPFSService, normalizeCid } = require("./services/ipfsService");
const { buildVerificationPayload, buildVerificationUrl, parseVerificationPayload } = require("./services/verificationPayload");
const { createIndexerStore, MemoryIndexerStore } = require("./services/indexerStore");
const { RWAIndexer } = require("./services/rwaIndexer");
const { RWAChainService } = require("./services/rwaChainService");
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
        assetStreamAddress: process.env.FLOWPAY_RWA_ASSET_STREAM_ADDRESS || "",
        complianceGuardAddress: process.env.FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS || "",
        startBlock: Number(process.env.RWA_INDEXER_START_BLOCK || 0),
    },
};

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function hashText(value) {
    return ethers.keccak256(ethers.toUtf8Bytes(value || ""));
}

async function hydrateAssetMetadata(services, asset) {
    if (!asset?.metadataURI) {
        return asset;
    }

    try {
        const ipfsMetadata = await services.ipfsService.fetchJSON(asset.metadataURI);
        return {
            ...asset,
            metadata: ipfsMetadata.metadata,
        };
    } catch (error) {
        return asset;
    }
}

async function buildServices(config) {
    const services = config.services ? { ...config.services } : {};

    if (!services.ipfsService) {
        services.ipfsService = new IPFSService(config.ipfs || {});
    }

    if (!services.chainService) {
        services.chainService = new RWAChainService({
            rpcUrl: config.rpcUrl,
            chainId: config.chainId,
            hubAddress: config.rwa?.hubAddress,
            assetNFTAddress: config.rwa?.assetNFTAddress,
            assetRegistryAddress: config.rwa?.assetRegistryAddress,
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
                assetStreamAddress: resolvedConfig.rwa?.assetStreamAddress || "",
                complianceGuardAddress: resolvedConfig.rwa?.complianceGuardAddress || "",
            },
            routes,
        });
    });

    app.get("/api/rwa/assets", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        await services.indexer.sync();
        const rawAssets = await services.store.listAssets({ owner: req.query.owner });
        const assets = await Promise.all(rawAssets.map((asset) => hydrateAssetMetadata(services, asset)));
        res.json({ assets });
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

    app.post("/api/rwa/assets", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const chainService = services.chainService;
        if (!chainService?.signer) {
            return res.status(503).json({ error: "RWA minting signer is not configured" });
        }

        const { issuer, assetType = 1, metadata, metadataURI, tag, tagHash } = req.body || {};
        if (!issuer) {
            return res.status(400).json({ error: "issuer is required" });
        }

        let resolvedMetadataURI = metadataURI;
        let cid = normalizeCid(metadataURI);
        if (!resolvedMetadataURI) {
            if (!metadata || typeof metadata !== "object") {
                return res.status(400).json({ error: "metadata or metadataURI is required" });
            }
            const pinResult = await services.ipfsService.pinJSON(metadata);
            resolvedMetadataURI = pinResult.uri;
            cid = pinResult.cid;
        }

        const resolvedTagHash = tagHash || hashText(tag || `${issuer}:${resolvedMetadataURI}`);
        const cidHash = hashText(resolvedMetadataURI);

        const mintResult = await chainService.mintAsset({
            metadataURI: resolvedMetadataURI,
            assetType,
            cidHash,
            tagHash: resolvedTagHash,
            issuer,
        });

        await services.indexer.sync();

        const snapshot = await chainService.getAssetSnapshot(mintResult.tokenId);
        if (snapshot) {
            await services.store.upsertAsset(snapshot);
        }
        const hydratedSnapshot = snapshot ? await hydrateAssetMetadata(services, snapshot) : null;

        const verificationPayload = buildVerificationPayload({
            chainId: chainService.provider ? (await chainService.provider.getNetwork()).chainId : BigInt(resolvedConfig.chainId || runtimeConfig.chainId),
            assetContract: chainService.assetNFTAddress,
            tokenId: mintResult.tokenId,
            cid,
            tagHash: resolvedTagHash,
        });

        res.status(201).json({
            tokenId: mintResult.tokenId,
            txHash: mintResult.txHash,
            cid,
            metadataURI: resolvedMetadataURI,
            verificationPayload,
            verificationUrl: buildVerificationUrl(resolvedConfig.appBaseUrl, verificationPayload),
            verificationApiUrl: `${resolvedConfig.appBaseUrl.replace(/5173$/, "3001")}/api/rwa/verify`,
            asset: hydratedSnapshot,
        });
    }));

    app.get("/api/rwa/assets/:tokenId", asyncHandler(async (req, res) => {
        const tokenId = Number(req.params.tokenId);
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            return res.status(400).json({ error: "invalid tokenId" });
        }

        const services = await app.locals.ready;
        await services.indexer.sync();

        let asset = await services.store.getAsset(tokenId);
        if (!asset && services.chainService?.isConfigured()) {
            asset = await services.chainService.getAssetSnapshot(tokenId);
            if (asset) {
                await services.store.upsertAsset(asset);
            }
        }

        if (!asset) {
            return res.status(404).json({ error: "asset not found" });
        }

        asset = await hydrateAssetMetadata(services, asset);
        res.json({ asset });
    }));

    app.get("/api/rwa/assets/:tokenId/activity", asyncHandler(async (req, res) => {
        const tokenId = Number(req.params.tokenId);
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            return res.status(400).json({ error: "invalid tokenId" });
        }

        const services = await app.locals.ready;
        await services.indexer.sync();
        const activity = await services.store.getActivities(tokenId);
        res.json({ activity });
    }));

    app.post("/api/rwa/verify", asyncHandler(async (req, res) => {
        const services = await app.locals.ready;
        const { payload, tokenId, cid, uri, tag, tagHash } = req.body || {};
        const parsedPayload = payload ? parseVerificationPayload(payload) : null;

        const resolvedTokenId = Number(tokenId || parsedPayload?.tokenId);
        const resolvedCid = normalizeCid(cid || uri || parsedPayload?.cid);
        const resolvedTagHash = tagHash || parsedPayload?.tagHash || hashText(tag || "");

        if (!Number.isFinite(resolvedTokenId) || resolvedTokenId <= 0) {
            return res.status(400).json({ error: "tokenId or payload is required" });
        }
        if (!resolvedCid) {
            return res.status(400).json({ error: "cid, uri, or payload is required" });
        }

        await services.indexer.sync();

        let asset = await services.store.getAsset(resolvedTokenId);
        if (!asset && services.chainService?.isConfigured()) {
            asset = await services.chainService.getAssetSnapshot(resolvedTokenId);
            if (asset) {
                await services.store.upsertAsset(asset);
            }
        }
        if (!asset) {
            return res.status(404).json({ error: "asset not found" });
        }

        const ipfsMetadata = await services.ipfsService.fetchJSON(resolvedCid);
        const canonicalURI = `ipfs://${resolvedCid}`;
        const cidHash = hashText(canonicalURI);

        const onChainVerification = services.chainService?.isConfigured()
            ? await services.chainService.getVerificationStatus(resolvedTokenId, cidHash, resolvedTagHash)
            : {
                assetExists: true,
                cidMatches: asset.cidHash === cidHash,
                tagMatches: asset.tagHash === resolvedTagHash,
                activeStreamId: asset.activeStreamId || 0,
            };

        const activity = await services.store.getActivities(resolvedTokenId);
        const tokenUriMatches = asset.tokenURI === canonicalURI || asset.metadataURI === canonicalURI;
        const authentic = Boolean(
            onChainVerification.assetExists &&
            onChainVerification.cidMatches &&
            onChainVerification.tagMatches &&
            tokenUriMatches
        );

        res.json({
            authentic,
            verification: {
                tokenId: resolvedTokenId,
                cid: resolvedCid,
                tagHash: resolvedTagHash,
                tokenUriMatches,
                onChain: {
                    assetExists: onChainVerification.assetExists,
                    cidMatches: onChainVerification.cidMatches,
                    tagMatches: onChainVerification.tagMatches,
                    activeStreamId: Number(onChainVerification.activeStreamId || 0),
                },
            },
            metadata: ipfsMetadata.metadata,
            asset,
            activity,
        });
    }));

    app.use((error, _req, res, _next) => {
        console.error(error);
        res.status(error.statusCode || 500).json({
            error: error.message || "Internal server error",
        });
    });

    return app;
}

if (require.main === module) {
    const app = createApp();
    app.listen(PORT, () => {
        console.log(`FlowPay server running on port ${PORT}`);
        console.log(`Payment recipient: ${RECIPIENT_ADDRESS}`);
        console.log(`FlowPay stream contract: ${CONTRACT_ADDRESS}`);
        console.log(`Payment token (${runtimeConfig.paymentTokenSymbol}): ${PAYMENT_TOKEN_ADDRESS}`);
        console.log(`RWA hub: ${process.env.FLOWPAY_RWA_HUB_ADDRESS || "not configured"}`);
    });
}

module.exports = createApp;
module.exports.defaultConfig = defaultConfig;
