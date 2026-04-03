const express = require("express");
const { ethers } = require("ethers");

const router = express.Router();

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function normalizeAddress(value = "") {
    return String(value || "").trim().toUpperCase();
}

async function getAgentAuth(req) {
    const services = await req.app.locals.ready;
    return req.app.locals.agentAuth || services.agentAuth;
}

const requireJwt = asyncHandler(async (req, _res, next) => {
    req.agentSession = await (await getAgentAuth(req)).verifyRequest(req);
    next();
});

async function resolveOwner(req, { requireAuth = false } = {}) {
    return (await getAgentAuth(req)).resolveOwnerPublicKey(req, { requireAuth });
}

async function resolveAgentContext(req) {
    const services = await req.app.locals.ready;
    const ownerPublicKey = req.agentSession?.ownerPublicKey;
    const wallet = await services.agentWallet.getWallet(ownerPublicKey);
    if (!wallet?.publicKey) {
        throw Object.assign(new Error("No managed agent wallet found for this session."), {
            status: 404,
            code: "agent_wallet_not_found",
        });
    }
    const profile = await services.agentState.ensureAgentProfile({
        ownerPublicKey,
        agentPublicKey: wallet.publicKey,
    });
    return {
        services,
        ownerPublicKey,
        agentPublicKey: wallet.publicKey,
        agentId: profile.agentId,
        profile,
    };
}

async function hydrateAsset(services, asset) {
    const publicMetadataURI = asset?.publicMetadataURI || asset?.metadataURI;
    if (!publicMetadataURI) {
        return asset;
    }
    try {
        const result = await services.ipfsService.fetchJSON(publicMetadataURI);
        return {
            ...asset,
            publicMetadataURI,
            metadataURI: publicMetadataURI,
            publicMetadata: result.metadata,
            metadata: result.metadata,
        };
    } catch {
        return asset;
    }
}

function productiveOnly(asset) {
    return [1, 2, 3].includes(Number(asset?.assetType || 0));
}

function marketAssetSummary(asset, auction) {
    return {
        ...asset,
        market: {
            activeAuction: auction || null,
            hasActiveAuction: Boolean(auction && auction.status === "active"),
        },
    };
}

function send402Response(req, res, price, description) {
    const config = req.app.locals.config || {};
    const decimals = Number(config.tokenDecimals || 7);
    const requiredAmount = ethers.parseUnits(String(price), decimals);
    const sessionEndpoint = `${String(config.sessionApiUrl || "").replace(/\/$/, "")}/api/sessions`;
    res.set("X-Payment-Required", "true");
    res.set("X-Stream-Mode", "per-request");
    res.set("X-Stream-Rate", ethers.formatUnits(requiredAmount, decimals));
    res.set("X-Stream-Token", config.paymentTokenAddress || "");
    res.set("X-Stream-Token-Decimals", String(decimals));
    res.set("X-Payment-Currency", config.tokenSymbol || "USDC");
    res.set("X-Stream-Settlement", String(config.settlement || "soroban-sac"));
    res.set("X-Stream-Contract", config.streamEngineContractAddress || "");
    res.set("X-Stream-Recipient", config.recipientAddress || "");
    if (config.sessionApiUrl) {
        res.set("X-Stream-Session-Endpoint", sessionEndpoint);
    }
    return res.status(402).json({
        message: "Payment Required",
        requirements: {
            mode: "per-request",
            price: String(price),
            currency: config.tokenSymbol || "USDC",
            token: config.paymentTokenAddress || "",
            recipient: config.recipientAddress || "",
            contract: config.streamEngineContractAddress || "",
            settlement: config.settlement || "soroban-sac",
            sessionEndpoint: config.sessionApiUrl ? sessionEndpoint : undefined,
            description,
        },
    });
}

function requirePaidAction(price, description) {
    return asyncHandler(async (req, res, next) => {
        const txHashHeader = req.headers["x-stream-tx-hash"];
        const streamIdHeader = req.headers["x-stream-stream-id"];
        const services = await req.app.locals.ready;
        const config = req.app.locals.config || {};
        const decimals = Number(config.tokenDecimals || 7);
        req.streamEngineActionFee = ethers.parseUnits(String(price), decimals).toString();

        if (txHashHeader) {
            req.streamEngine = {
                mode: "direct",
                txHash: String(txHashHeader),
            };
            return next();
        }

        if (!streamIdHeader) {
            return send402Response(req, res, price, description);
        }

        const session = await services.chainService.getSessionSnapshot(streamIdHeader);
        if (!session || !session.isActive) {
            return res.status(402).json({
                error: "Session is inactive",
                code: "session_not_active",
            });
        }
        if (session.isFrozen) {
            return res.status(402).json({
                error: "Session is frozen",
                code: "session_frozen",
            });
        }
        if (
            config.recipientAddress
            && session.recipient
            && normalizeAddress(session.recipient) !== normalizeAddress(config.recipientAddress)
        ) {
            return res.status(402).json({
                error: "Session recipient mismatch",
                code: "session_recipient_mismatch",
            });
        }

        req.streamEngine = {
            mode: "streaming",
            streamId: String(streamIdHeader),
            session,
        };
        next();
    });
}

router.get("/market/assets", asyncHandler(async (req, res) => {
    const services = await req.app.locals.ready;
    const rawAssets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ limit: 200 })
        : await services.store.listAssets();
    const productiveAssets = rawAssets.filter(productiveOnly);
    const activeAuctions = await services.auctionEngine.listAuctions({ status: "active" });
    const assets = await Promise.all(productiveAssets.map(async (asset) => {
        const auction = activeAuctions.find((entry) => Number(entry.assetId) === Number(asset.tokenId)) || null;
        return marketAssetSummary(await hydrateAsset(services, asset), auction);
    }));
    res.json({
        code: "market_assets_listed",
        assets,
    });
}));

router.get("/market/assets/:assetId", asyncHandler(async (req, res) => {
    const services = await req.app.locals.ready;
    const asset = await services.chainService.getAssetSnapshot(Number(req.params.assetId));
    if (!asset) {
        return res.status(404).json({ error: "Asset not found.", code: "asset_not_found" });
    }
    const auctions = await services.auctionEngine.listAuctions({ tokenId: Number(req.params.assetId) });
    res.json({
        code: "market_asset_loaded",
        asset: marketAssetSummary(await hydrateAsset(services, asset), auctions.find((entry) => entry.status === "active") || null),
        auctions,
    });
}));

router.get("/market/assets/:assetId/analytics", requirePaidAction("0.10", "Premium asset analysis"), asyncHandler(async (req, res) => {
    const services = await req.app.locals.ready;
    const tokenId = Number(req.params.assetId);
    const asset = await services.chainService.getAssetSnapshot(tokenId);
    if (!asset) {
        return res.status(404).json({ error: "Asset not found.", code: "asset_not_found" });
    }
    const activity = await services.store.getActivities(tokenId);
    const auctions = await services.auctionEngine.listAuctions({ tokenId });
    const auctionCount = auctions.length;
    const winningAuction = [...auctions]
        .filter((entry) => entry.status === "settled")
        .sort((left, right) => Number(right.settledAt || 0) - Number(left.settledAt || 0))[0] || null;
    const projectedAnnualYield = Number(asset.stream?.flowRate || 0) * 3600 * 24 * 365;
    res.json({
        code: "market_analysis_ready",
        action: "analyze",
        assetId: tokenId,
        analytics: {
            claimableYield: String(asset.claimableYield || "0"),
            projectedAnnualYield: Number(projectedAnnualYield.toFixed(6)),
            verificationStatus: asset.verificationStatusLabel || asset.verificationStatus,
            auctionCount,
            lastWinningBid: winningAuction?.highestBidDisplay || null,
            activityCount: activity.length,
            rentalReady: Boolean(asset.rentalReady),
        },
        paidVia: req.streamEngine || null,
    });
}));

router.post("/market/assets/:assetId/auctions", requireJwt, asyncHandler(async (req, res) => {
    const { services, ownerPublicKey } = await resolveAgentContext(req);
    const auction = await services.auctionEngine.createAuction({
        sellerOwnerPublicKey: ownerPublicKey,
        tokenId: Number(req.params.assetId),
        reservePrice: req.body?.reservePrice || "0",
        startTime: req.body?.startTime,
        endTime: req.body?.endTime,
        note: req.body?.note || "",
    });
    res.status(201).json({
        code: "auction_created",
        action: "createAuction",
        auction,
    });
}));

router.get("/market/auctions/:auctionId", asyncHandler(async (req, res) => {
    const services = await req.app.locals.ready;
    const auction = await services.auctionEngine.getAuction(Number(req.params.auctionId));
    if (!auction) {
        return res.status(404).json({ error: "Auction not found.", code: "auction_not_found" });
    }
    res.json({
        code: "auction_loaded",
        auction,
    });
}));

router.post("/market/auctions/:auctionId/bids", requirePaidAction("0.05", "Paid auction bid placement"), requireJwt, asyncHandler(async (req, res) => {
    const { services, ownerPublicKey, agentId } = await resolveAgentContext(req);
    const result = await services.auctionEngine.placeBid({
        auctionId: Number(req.params.auctionId),
        bidderOwnerPublicKey: ownerPublicKey,
        amount: req.body?.amount,
        note: req.body?.note || "",
    });
    await services.agentState.recordPaidActionFee(agentId, req.streamEngineActionFee, {
        action: "auction_bid",
        auctionId: Number(req.params.auctionId),
    });
    res.status(201).json({
        code: "auction_bid_placed",
        action: "placeBid",
        bid: result.bid,
        auction: result.auction,
        paidVia: req.streamEngine || null,
    });
}));

router.post("/market/auctions/:auctionId/settle", requireJwt, asyncHandler(async (req, res) => {
    const { services } = await resolveAgentContext(req);
    const settlement = await services.auctionEngine.settleAuction({
        auctionId: Number(req.params.auctionId),
    });
    res.json({
        code: "auction_settled",
        action: "settleAuction",
        ...settlement,
    });
}));

router.get("/market/positions", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    const [assets, sessions, treasury, reservations, performance] = await Promise.all([
        services.chainService.listAssetSnapshots({ owner: agentId }),
        services.chainService.listSessions({ owner: agentId }),
        services.agentState.getTreasury(agentId),
        services.agentState.listOpenReservations(agentId),
        services.agentState.getPerformance(agentId),
    ]);
    res.json({
        code: "market_positions_loaded",
        positions: {
            ownedAssets: assets,
            sessions,
            treasury,
            reservations,
            performance,
        },
    });
}));

router.post("/market/yield/claim", requireJwt, asyncHandler(async (req, res) => {
    const { services, ownerPublicKey, agentId } = await resolveAgentContext(req);
    const result = await services.agentWallet.claimYield({
        owner: ownerPublicKey,
        tokenId: Number(req.body?.tokenId),
    });
    await services.agentState.recordRealizedYield(agentId, result.amount || "0", {
        message: `Yield claimed on asset #${Number(req.body?.tokenId)}`,
        detail: `Transaction ${String(result.txHash || "").slice(0, 12)}...`,
    });
    res.json({
        code: "market_yield_claimed",
        action: "claimYield",
        txHash: result.txHash,
        amount: result.amount || "0",
    });
}));

router.post("/market/yield/route", requireJwt, asyncHandler(async (req, res) => {
    const { services, ownerPublicKey, agentId } = await resolveAgentContext(req);
    let claim = null;
    if (req.body?.tokenId) {
        claim = await services.agentWallet.claimYield({
            owner: ownerPublicKey,
            tokenId: Number(req.body.tokenId),
        });
        await services.agentState.recordRealizedYield(agentId, claim.amount || "0", {
            message: `Yield claimed for treasury routing on asset #${Number(req.body.tokenId)}`,
        });
    }
    const treasury = await services.treasuryManager.rebalance({ ownerPublicKey, agentId });
    res.json({
        code: "yield_routed",
        action: "routeYield",
        claim,
        treasury,
    });
}));

router.post("/market/treasury/rebalance", requirePaidAction("0.02", "Treasury optimization"), requireJwt, asyncHandler(async (req, res) => {
    const { services, ownerPublicKey, agentId } = await resolveAgentContext(req);
    const treasury = await services.treasuryManager.rebalance({ ownerPublicKey, agentId });
    await services.agentState.recordPaidActionFee(agentId, req.streamEngineActionFee, {
        action: "treasury_rebalance",
    });
    res.json({
        code: "treasury_rebalanced",
        action: "rebalanceTreasury",
        treasury,
        paidVia: req.streamEngine || null,
    });
}));

router.post("/agents", asyncHandler(async (req, res) => {
    const services = await req.app.locals.ready;
    const { ownerPublicKey, session } = await resolveOwner(req);
    const wallet = await services.agentWallet.getOrCreateWallet(ownerPublicKey);
    const profile = await services.agentState.ensureAgentProfile({
        ownerPublicKey,
        agentPublicKey: wallet.publicKey,
    });
    const token = (await getAgentAuth(req)).signLocalSession({
        ownerPublicKey,
        authProvider: session?.authProvider || "local",
        authSubject: session?.authSubject || "",
    });
    res.status(201).json({
        code: "agent_ready",
        token,
        authProvider: session?.authProvider || "local",
        agent: profile,
    });
}));

router.get("/agents/:agentId/state", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey, agentPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent state.", code: "agent_scope_forbidden" });
    }
    const [walletState, mandate, performance, treasury, reservations, decisionLog, assets, sessions] = await Promise.all([
        services.agentWallet.getBalances({ owner: ownerPublicKey }),
        services.agentState.getMandate(agentId),
        services.agentState.getPerformance(agentId),
        services.agentState.getTreasury(agentId),
        services.agentState.listOpenReservations(agentId),
        services.agentState.getDecisionLog(agentId, 50),
        services.chainService.listAssetSnapshots({ owner: agentPublicKey }),
        services.chainService.listSessions({ owner: agentPublicKey }),
    ]);
    res.json({
        code: "agent_state_loaded",
        agentId,
        state: {
            wallet: walletState,
            mandate,
            performance,
            treasury,
            reservations,
            decisionLog,
            positions: {
                assets,
                sessions,
            },
        },
    });
}));

router.get("/agents/:agentId/performance", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent performance.", code: "agent_scope_forbidden" });
    }
    const performance = await services.agentState.getPerformance(agentId);
    res.json({
        code: "agent_performance_loaded",
        agentId,
        performance,
    });
}));

router.get("/agents/:agentId/mandate", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent mandate.", code: "agent_scope_forbidden" });
    }
    const mandate = await services.agentState.getMandate(agentId);
    res.json({
        code: "agent_mandate_loaded",
        agentId,
        mandate,
    });
}));

router.post("/agents/:agentId/mandate", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot update another agent mandate.", code: "agent_scope_forbidden" });
    }
    const mandate = await services.agentState.setMandate(agentId, req.body || {});
    await services.agentState.appendDecision(agentId, {
        type: "decision",
        message: "Agent mandate updated",
        detail: `Liquidity floor ${mandate.liquidityFloorPct}% · approval threshold ${mandate.approvalThreshold} USDC`,
    });
    res.json({
        code: "agent_mandate_updated",
        agentId,
        mandate,
    });
}));

router.get("/agents/:agentId/wallet", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent wallet.", code: "agent_scope_forbidden" });
    }
    const wallet = await services.agentWallet.getBalances({ owner: ownerPublicKey });
    res.json({
        code: "agent_wallet_loaded",
        agentId,
        wallet,
    });
}));

router.use((error, _req, res, _next) => {
    res.status(error.status || error.statusCode || 500).json({
        error: error.message || "Internal server error",
        code: error.code || "internal_error",
        details: error.details || {},
    });
});

module.exports = router;
