const express = require("express");
const { ethers } = require("ethers");
const { generateDueDiligence, aggregateMarketIntel } = require("../services/assetIntelligence");
const { screenAssets, parseGoal } = require("../services/assetScreener");
const { formatStellarAmount } = require("../services/stellarAnchorService");

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

const MARKET_TYPE_TO_CHAIN_ASSET_TYPE = {
    real_estate: 1,
    vehicle: 2,
    commodity: 3,
};

function assetTypeKey(assetType) {
    const numericType = Number(assetType || 0);
    if (numericType === 1) return "real_estate";
    if (numericType === 2) return "vehicle";
    return "commodity";
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

function percentage(part, total) {
    if (!total) return 0;
    return Number(((Number(part || 0) / Number(total)) * 100).toFixed(1));
}

function sumStringAmounts(values = []) {
    return values.reduce((sum, value) => sum + BigInt(value || "0"), 0n);
}

function normalizeText(value = "") {
    return String(value || "").trim().toLowerCase();
}

function parseBooleanQuery(value) {
    if (value === undefined || value === null || value === "") return false;
    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseOptionalNumber(value) {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function buildMarketBrowseFilters(query = {}) {
    const search = String(query.search || "").trim();
    const goal = String(query.goal || "").trim();
    const type = String(query.type || "").trim();
    const criteria = goal ? { ...parseGoal(goal) } : {};
    const mappedType = MARKET_TYPE_TO_CHAIN_ASSET_TYPE[type];
    const minYield = parseOptionalNumber(query.minYield);
    const maxYield = parseOptionalNumber(query.maxYield);
    const maxRisk = parseOptionalNumber(query.maxRisk);
    const verifiedOnly = parseBooleanQuery(query.verifiedOnly);
    const rentalReady = parseBooleanQuery(query.rentalReady);
    const hasAuction = parseBooleanQuery(query.hasAuction);
    const limit = parseOptionalNumber(query.limit);

    if (mappedType) criteria.assetTypes = [mappedType];
    if (minYield !== undefined) criteria.minYield = minYield;
    if (maxYield !== undefined) criteria.maxYield = maxYield;
    if (maxRisk !== undefined) criteria.maxRisk = maxRisk;
    if (verifiedOnly) criteria.verifiedOnly = true;
    if (rentalReady) criteria.rentalReadyOnly = true;
    if (limit !== undefined) criteria.limit = limit;

    const appliedFilters = {
        search: search || null,
        goal: goal || null,
        type: type || null,
        minYield: minYield ?? null,
        maxYield: maxYield ?? null,
        maxRisk: maxRisk ?? null,
        verifiedOnly,
        rentalReady,
        hasAuction,
        limit: limit ?? null,
    };

    return {
        search,
        goal,
        hasAuction,
        criteria,
        appliedFilters,
        activeFilterCount: Object.values(appliedFilters).filter((value) => {
            if (value === null || value === undefined || value === false) return false;
            if (typeof value === "string") return Boolean(value.trim());
            return true;
        }).length,
    };
}

function assetMatchesSearch(asset, search = "") {
    const query = normalizeText(search);
    if (!query) return true;
    const haystack = [
        asset?.publicMetadata?.name,
        asset?.publicMetadata?.description,
        asset?.publicMetadata?.location,
        asset?.publicMetadataURI,
        asset?.metadataURI,
        asset?.name,
        asset?.description,
        asset?.location,
        asset?.jurisdiction,
        asset?.issuer,
    ]
        .filter(Boolean)
        .map((value) => normalizeText(value))
        .join(" ");
    return haystack.includes(query);
}

function applyMarketBrowseFilters(assets = [], browseFilters = {}) {
    const baseFiltered = assets.filter((asset) => {
        if (!assetMatchesSearch(asset, browseFilters.search)) return false;
        if (browseFilters.hasAuction && !asset.market?.hasActiveAuction) return false;
        return true;
    });

    const rankedAssets = screenAssets(baseFiltered, {
        ...browseFilters.criteria,
        limit: baseFiltered.length,
    });
    const rankedByTokenId = new Map(
        rankedAssets.map(({ asset: _asset, ...entry }) => [Number(entry.tokenId), entry]),
    );
    const requiresScreening = Object.keys(browseFilters.criteria || {}).length > 0;
    const filteredAssets = requiresScreening
        ? baseFiltered.filter((asset) => rankedByTokenId.has(Number(asset.tokenId)))
        : baseFiltered;

    return {
        assets: filteredAssets.map((asset) => ({
            ...asset,
            screening: rankedByTokenId.get(Number(asset.tokenId)) || null,
        })),
        rankedAssets,
    };
}

function summarizeActivity(activity = []) {
    return activity
        .slice(-5)
        .reverse()
        .map((entry) => ({
            eventName: entry.eventName,
            txHash: entry.txHash,
            blockNumber: entry.blockNumber,
            occurredAt: entry.occurredAt || null,
        }));
}

function sortBidsByAmountAndTime(bids = []) {
    return [...bids].sort((left, right) => {
        const amountDelta = BigInt(right.amountStroops || "0") - BigInt(left.amountStroops || "0");
        if (amountDelta !== 0n) {
            return amountDelta > 0n ? 1 : -1;
        }
        return Number(left.placedAt || 0) - Number(right.placedAt || 0);
    });
}

function sortBidsByRecent(bids = []) {
    return [...bids].sort((left, right) => Number(right.placedAt || 0) - Number(left.placedAt || 0));
}

function buildBidSummary(bid, { isLeading = false } = {}) {
    return {
        bidId: bid.bidId,
        bidder: bid.bidder,
        amountStroops: bid.amountStroops,
        amountDisplay: bid.amountDisplay || ethers.formatUnits(BigInt(bid.amountStroops || "0"), 7),
        placedAt: Number(bid.placedAt || 0),
        status: bid.status || "active",
        isLeading,
        txHash: bid.txHash || "",
    };
}

function enrichAuction(auction) {
    if (!auction) return null;
    const bids = Array.isArray(auction.bids) ? auction.bids : [];
    const activeBids = bids.filter((bid) => bid.status === "active");
    const rankedActiveBids = sortBidsByAmountAndTime(activeBids);
    const highestBid = auction.highestBid || rankedActiveBids[0] || null;
    const highestAmount = BigInt(highestBid?.amountStroops || "0");
    const reserveAmount = BigInt(auction.reservePrice || "0");
    const bidIncrement = 10_000_000n;
    const minimumNextBid = highestBid
        ? highestAmount + bidIncrement
        : reserveAmount;
    const uniqueBidderCount = new Set(
        activeBids.map((bid) => normalizeAddress(bid.bidder)),
    ).size;

    return {
        ...auction,
        bids,
        highestBid,
        highestBidDisplay: highestBid ? formatStellarAmount(highestBid.amountStroops) : null,
        reserveMet: highestBid ? highestAmount >= reserveAmount : false,
        bidCount: bids.length,
        activeBidCount: activeBids.length,
        uniqueBidderCount,
        minimumNextBidStroops: minimumNextBid.toString(),
        minimumNextBid: formatStellarAmount(minimumNextBid),
        minimumNextBidDisplay: formatStellarAmount(minimumNextBid),
        recentBids: sortBidsByRecent(activeBids).slice(0, 5).map((bid) => buildBidSummary(bid, {
            isLeading: Number(bid.bidId) === Number(highestBid?.bidId),
        })),
        bidLadder: rankedActiveBids.slice(0, 5).map((bid) => buildBidSummary(bid, {
            isLeading: Number(bid.bidId) === Number(highestBid?.bidId),
        })),
        marketDepth: {
            reservePrice: formatStellarAmount(reserveAmount),
            highestBid: highestBid ? formatStellarAmount(highestBid.amountStroops) : null,
            minimumNextBid: formatStellarAmount(minimumNextBid),
            spreadToReserve: highestBid ? formatStellarAmount(highestAmount - reserveAmount) : "0.0000000",
            uniqueBidderCount,
            activeBidCount: activeBids.length,
        },
    };
}

function buildMarketSummary(assets = [], activeAuctions = [], rankedAssets = [], browseFilters = {}, universeCount = assets.length) {
    const marketIntel = aggregateMarketIntel(assets);
    const totalClaimableYield = sumStringAmounts(assets.map((asset) => asset.claimableYield || "0"));
    const typeBreakdown = {
        real_estate: Number(marketIntel.sectorBreakdown?.[1] || 0),
        vehicle: Number(marketIntel.sectorBreakdown?.[2] || 0),
        commodity: Number(marketIntel.sectorBreakdown?.[3] || 0),
    };
    const topOpportunities = (rankedAssets.length ? rankedAssets : (marketIntel.topPerformers || [])).slice(0, 3).map((entry) => ({
        tokenId: entry.tokenId,
        name: entry.name || `Asset #${entry.tokenId}`,
        assetType: assetTypeKey(entry.assetType),
        yieldRate: Number(entry.yieldRate || 0),
        riskScore: Number(entry.riskScore || 0),
        score: Number(entry.score || 0),
        verificationStatus: entry.verificationStatus || "unknown",
    }));
    const auctionsClosingSoon = [...activeAuctions]
        .sort((left, right) => Number(left.endTime || 0) - Number(right.endTime || 0))
        .slice(0, 3)
        .map((auction) => ({
            auctionId: auction.auctionId,
            assetId: auction.assetId,
            title: auction.title || `Twin #${auction.assetId}`,
            endTime: Number(auction.endTime || 0),
            reservePrice: auction.reservePriceDisplay || auction.marketDepth?.reservePrice || null,
            highestBid: auction.highestBidDisplay || null,
            uniqueBidderCount: Number(auction.uniqueBidderCount || 0),
            minimumNextBid: auction.minimumNextBidDisplay || auction.marketDepth?.minimumNextBid || null,
        }));

    return {
        totalProductiveTwins: assets.length,
        universeProductiveTwins: universeCount,
        liveAuctions: activeAuctions.length,
        verifiedCount: Number(marketIntel.verifiedCount || 0),
        verifiedSharePct: percentage(marketIntel.verifiedCount, marketIntel.totalAssets),
        rentalReadyCount: Number(marketIntel.rentalReadyCount || 0),
        rentalReadySharePct: percentage(marketIntel.rentalReadyCount, marketIntel.totalAssets),
        avgYield: Number(marketIntel.avgYield || 0),
        avgRisk: Number(marketIntel.avgRisk || 0),
        topYield: Number(marketIntel.maxYield || 0),
        totalClaimableYield: totalClaimableYield.toString(),
        totalClaimableYieldDisplay: formatStellarAmount(totalClaimableYield),
        typeBreakdown,
        activeFilterCount: Number(browseFilters.activeFilterCount || 0),
        browse: browseFilters.appliedFilters || {},
        highlights: {
            topOpportunities,
            auctionsClosingSoon,
        },
    };
}

function defaultSavedScreenName(filters = {}, summary = {}) {
    const parts = [];
    if (filters.type && filters.type !== "all") {
        parts.push(assetTypeKey(MARKET_TYPE_TO_CHAIN_ASSET_TYPE[filters.type] || filters.type).replace("_", " "));
    }
    if (filters.verifiedOnly) parts.push("verified");
    if (filters.rentalReady) parts.push("rental ready");
    if (filters.hasAuction) parts.push("live auctions");
    if (filters.minYield != null) parts.push(`${filters.minYield}%+ yield`);
    if (filters.maxRisk != null) parts.push(`risk <= ${filters.maxRisk}`);
    if (filters.goal) parts.push("goal screen");
    const base = parts.filter(Boolean).slice(0, 3).join(" · ");
    return base || `Market screen · ${Number(summary.totalProductiveTwins || 0)} twins`;
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
    const browseFilters = buildMarketBrowseFilters(req.query || {});
    const rawAssets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ limit: 200 })
        : await services.store.listAssets();
    const productiveAssets = rawAssets.filter(productiveOnly);
    const activeAuctions = (await services.auctionEngine.listAuctions({ status: "active" }))
        .map((auction) => enrichAuction(auction));
    const assets = await Promise.all(productiveAssets.map(async (asset) => {
        const auction = activeAuctions.find((entry) => Number(entry.assetId) === Number(asset.tokenId)) || null;
        return marketAssetSummary(await hydrateAsset(services, asset), auction);
    }));
    const browseResult = applyMarketBrowseFilters(assets, browseFilters);
    res.json({
        code: "market_assets_listed",
        assets: browseResult.assets,
        summary: buildMarketSummary(
            browseResult.assets,
            activeAuctions.filter((auction) => browseResult.assets.some((asset) => Number(asset.tokenId) === Number(auction.assetId))),
            browseResult.rankedAssets,
            browseFilters,
            assets.length,
        ),
    });
}));

router.get("/market/assets/:assetId", asyncHandler(async (req, res) => {
    const services = await req.app.locals.ready;
    const asset = await services.chainService.getAssetSnapshot(Number(req.params.assetId));
    if (!asset) {
        return res.status(404).json({ error: "Asset not found.", code: "asset_not_found" });
    }
    const auctions = (await services.auctionEngine.listAuctions({ tokenId: Number(req.params.assetId) }))
        .map((auction) => enrichAuction(auction));
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
    const rawAssets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ limit: 200 })
        : await services.store.listAssets();
    const productiveAssets = rawAssets.filter(productiveOnly);
    const activity = await services.store.getActivities(tokenId);
    const auctions = await services.auctionEngine.listAuctions({ tokenId });
    const auctionCount = auctions.length;
    const activeAuction = auctions.find((entry) => entry.status === "active") || null;
    const winningAuction = [...auctions]
        .filter((entry) => entry.status === "settled")
        .sort((left, right) => Number(right.settledAt || 0) - Number(left.settledAt || 0))[0] || null;
    const projectedAnnualYield = Number(asset.stream?.flowRate || 0) * 3600 * 24 * 365;
    const dueDiligence = await generateDueDiligence(asset, process.env.GEMINI_API_KEY);
    const marketIntel = aggregateMarketIntel(productiveAssets);
    const rankedAssets = screenAssets(productiveAssets, { limit: productiveAssets.length });
    const overallPeerRank = rankedAssets.findIndex((entry) => Number(entry.tokenId) === tokenId);
    const sameTypePeers = rankedAssets.filter((entry) => Number(entry.assetType) === Number(asset.assetType));
    const assetTypePeerRank = sameTypePeers.findIndex((entry) => Number(entry.tokenId) === tokenId);
    const issuerPeers = productiveAssets.filter(
        (entry) => normalizeAddress(entry.issuer) === normalizeAddress(asset.issuer),
    );
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
            verdict: dueDiligence.verdict,
            confidence: dueDiligence.confidence,
            summary: dueDiligence.summary,
            risks: dueDiligence.risks || [],
            positives: dueDiligence.positives || [],
            yieldAssessment: dueDiligence.yieldAssessment || "",
            dueDiligence,
            marketContext: {
                totalProductiveTwins: marketIntel.totalAssets || 0,
                verifiedSharePct: percentage(marketIntel.verifiedCount, marketIntel.totalAssets),
                rentalReadySharePct: percentage(marketIntel.rentalReadyCount, marketIntel.totalAssets),
                avgYield: marketIntel.avgYield || 0,
                avgRisk: marketIntel.avgRisk || 0,
                topYield: marketIntel.maxYield || 0,
                peerRank: overallPeerRank >= 0 ? overallPeerRank + 1 : null,
                peerCount: rankedAssets.length,
                assetTypePeerRank: assetTypePeerRank >= 0 ? assetTypePeerRank + 1 : null,
                assetTypePeerCount: sameTypePeers.length,
                issuerPeerCount: issuerPeers.length,
            },
            auctionContext: {
                activeAuction: activeAuction
                    ? {
                        auctionId: activeAuction.auctionId,
                        reservePrice: activeAuction.reservePriceDisplay || activeAuction.reservePrice || null,
                        highestBid: activeAuction.highestBidDisplay || null,
                        reserveMet: Boolean(activeAuction.reserveMet),
                        bidCount: Array.isArray(activeAuction.bids) ? activeAuction.bids.length : 0,
                        timeRemainingSeconds: Math.max(0, Number(activeAuction.endTime || 0) - nowSeconds()),
                    }
                    : null,
                settledAuctionCount: auctions.filter((entry) => entry.status === "settled").length,
                latestWinningBid: winningAuction?.highestBidDisplay || null,
            },
            recentActivity: summarizeActivity(activity),
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
    const auction = enrichAuction(await services.auctionEngine.getAuction(Number(req.params.auctionId)));
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
        optimization: treasury.optimization || null,
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
        optimization: treasury.optimization || null,
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
    const [walletState, mandate, performance, treasury, reservations, decisionLog, assets, sessions, runtime, savedScreens, watchlist] = await Promise.all([
        services.agentWallet.getBalances({ owner: ownerPublicKey }),
        services.agentState.getMandate(agentId),
        services.agentState.getPerformance(agentId),
        services.agentState.getTreasury(agentId),
        services.agentState.listOpenReservations(agentId),
        services.agentState.getDecisionLog(agentId, 50),
        services.chainService.listAssetSnapshots({ owner: agentPublicKey }),
        services.chainService.listSessions({ owner: agentPublicKey }),
        services.agentRuntime.getState({ agentId }),
        services.agentState.getSavedScreens(agentId),
        services.agentState.getWatchlist(agentId),
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
            savedScreens,
            watchlist,
            decisionLog,
            runtime,
            positions: {
                assets,
                sessions,
            },
        },
    });
}));

router.get("/agents/:agentId/runtime", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent runtime.", code: "agent_scope_forbidden" });
    }
    const runtime = await services.agentRuntime.getState({ agentId });
    res.json({
        code: "agent_runtime_loaded",
        agentId,
        runtime,
    });
}));

router.post("/agents/:agentId/runtime/start", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot start another agent runtime.", code: "agent_scope_forbidden" });
    }
    const result = await services.agentRuntime.start({
        agentId,
        ownerPublicKey,
        executeTreasury: req.body?.executeTreasury !== false,
        executeClaims: req.body?.executeClaims !== false,
    });
    res.json({
        code: "agent_runtime_started",
        agentId,
        ...result,
    });
}));

router.post("/agents/:agentId/runtime/pause", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot pause another agent runtime.", code: "agent_scope_forbidden" });
    }
    const runtime = await services.agentRuntime.pause({ agentId });
    res.json({
        code: "agent_runtime_paused",
        agentId,
        runtime,
    });
}));

router.post("/agents/:agentId/runtime/tick", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot tick another agent runtime.", code: "agent_scope_forbidden" });
    }
    const result = await services.agentRuntime.tick({
        agentId,
        ownerPublicKey,
        reason: "manual",
    });
    res.json({
        code: "agent_runtime_ticked",
        agentId,
        ...result,
    });
}));

router.get("/agents/:agentId/screens", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent screen set.", code: "agent_scope_forbidden" });
    }
    const screens = await services.agentState.getSavedScreens(agentId);
    res.json({
        code: "agent_screens_loaded",
        agentId,
        screens,
    });
}));

router.post("/agents/:agentId/screens", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot update another agent screen set.", code: "agent_scope_forbidden" });
    }
    const filters = { ...(req.body?.filters || {}) };
    const summary = { ...(req.body?.summary || {}) };
    const screen = await services.agentState.saveScreen(agentId, {
        screenId: req.body?.screenId,
        name: req.body?.name || defaultSavedScreenName(filters, summary),
        description: req.body?.description || "",
        filters,
        summary,
    });
    await services.agentState.appendDecision(agentId, {
        type: "decision",
        message: "Market screen saved",
        detail: `${screen.name} · ${Number(summary.totalProductiveTwins || 0)} twins matched`,
        metadata: {
            screenId: screen.screenId,
            activeFilterCount: Number(summary.activeFilterCount || 0),
        },
    });
    res.status(201).json({
        code: "agent_screen_saved",
        agentId,
        screen,
    });
}));

router.delete("/agents/:agentId/screens/:screenId", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot update another agent screen set.", code: "agent_scope_forbidden" });
    }
    await services.agentState.deleteSavedScreen(agentId, req.params.screenId);
    res.json({
        code: "agent_screen_deleted",
        agentId,
        screenId: req.params.screenId,
    });
}));

router.get("/agents/:agentId/watchlist", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent watchlist.", code: "agent_scope_forbidden" });
    }
    const watchlist = await services.agentState.getWatchlist(agentId);
    res.json({
        code: "agent_watchlist_loaded",
        agentId,
        watchlist,
    });
}));

router.post("/agents/:agentId/watchlist", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot update another agent watchlist.", code: "agent_scope_forbidden" });
    }
    const asset = await services.agentState.watchAsset(agentId, req.body || {});
    await services.agentState.appendDecision(agentId, {
        type: "decision",
        message: "Twin added to watchlist",
        detail: `${asset.name} is now being monitored from the marketplace shortlist.`,
        metadata: {
            tokenId: asset.tokenId,
        },
    });
    res.status(201).json({
        code: "agent_watchlist_added",
        agentId,
        asset,
    });
}));

router.delete("/agents/:agentId/watchlist/:assetId", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot update another agent watchlist.", code: "agent_scope_forbidden" });
    }
    await services.agentState.unwatchAsset(agentId, Number(req.params.assetId));
    res.json({
        code: "agent_watchlist_removed",
        agentId,
        assetId: Number(req.params.assetId),
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
