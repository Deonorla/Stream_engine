const express = require("express");
const { ethers } = require("ethers");
const { generateDueDiligence, aggregateMarketIntel } = require("../services/assetIntelligence");
const { screenAssets, parseGoal } = require("../services/assetScreener");
const { formatStellarAmount, normalizeStellarAmount } = require("../services/stellarAnchorService");
const { inferMarketAssetClass, isSupportedProductiveTwin } = require("../services/rwaAssetScope");

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

function hasNonEmptyObject(value) {
    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function mergeAssetWithCachedMetadata(incoming = {}, cached = null) {
    if (!cached) return incoming;
    const merged = { ...incoming };
    if (!hasNonEmptyObject(merged.publicMetadata) && hasNonEmptyObject(cached.publicMetadata)) {
        merged.publicMetadata = cached.publicMetadata;
    }
    if (!hasNonEmptyObject(merged.metadata) && hasNonEmptyObject(cached.metadata)) {
        merged.metadata = cached.metadata;
    }
    if (!merged.publicMetadataURI && cached.publicMetadataURI) {
        merged.publicMetadataURI = cached.publicMetadataURI;
    }
    if (!merged.metadataURI && cached.metadataURI) {
        merged.metadataURI = cached.metadataURI;
    }
    if (!merged.tokenURI && cached.tokenURI) {
        merged.tokenURI = cached.tokenURI;
    }
    return merged;
}

async function hydrateAsset(services, asset) {
    const publicMetadataURI = asset?.publicMetadataURI || asset?.metadataURI;
    if (!publicMetadataURI) {
        return asset;
    }
    if (
        asset?.publicMetadata
        && typeof asset.publicMetadata === "object"
        && Object.keys(asset.publicMetadata).length > 0
    ) {
        return asset;
    }
    try {
        const result = await services.ipfsService.fetchJSON(publicMetadataURI);
        const hydrated = {
            ...asset,
            publicMetadataURI,
            metadataURI: publicMetadataURI,
            publicMetadata: result.metadata,
            metadata: result.metadata,
        };
        if (services.store?.upsertAsset && hydrated?.tokenId != null) {
            void services.store.upsertAsset(hydrated).catch(() => {});
        }
        return hydrated;
    } catch {
        const cached = asset?.tokenId != null ? await services.store.getAsset(asset.tokenId).catch(() => null) : null;
        return mergeAssetWithCachedMetadata({
            ...asset,
            publicMetadataURI: asset?.publicMetadataURI || publicMetadataURI || "",
            metadataURI: asset?.metadataURI || publicMetadataURI || "",
            tokenURI: asset?.tokenURI || publicMetadataURI || "",
        }, cached);
    }
}

function productiveOnly(asset) {
    return isSupportedProductiveTwin(asset);
}

const MARKET_TYPE_TO_CHAIN_ASSET_TYPE = {
    real_estate: 1,
    land: 1,
};

function assetTypeKey(assetType, asset = null) {
    if (asset) {
        return inferMarketAssetClass(asset);
    }
    const numericType = Number(assetType || 0);
    if (numericType === 1) return "real_estate";
    return "unsupported";
}

function marketAssetSummary(asset, auction) {
    return {
        ...asset,
        marketAssetClass: inferMarketAssetClass(asset),
        rentalActivity: asset.rentalActivity || null,
        currentlyRented: Boolean(asset.rentalActivity?.currentlyRented),
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
        if (browseFilters.appliedFilters?.type && browseFilters.appliedFilters.type !== "all") {
            return inferMarketAssetClass(asset) === browseFilters.appliedFilters.type;
        }
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

function findWalletBalance(walletState = {}, assetCode = "USDC", assetIssuer = "") {
    const normalizedCode = String(assetCode || "USDC").toUpperCase();
    const normalizedIssuer = String(assetIssuer || "");
    return (walletState.balances || []).find((balance) => {
        if (normalizedCode === "XLM") {
            return String(balance.assetCode || "XLM").toUpperCase() === "XLM";
        }
        return (
            String(balance.assetCode || "").toUpperCase() === normalizedCode
            && String(balance.assetIssuer || "") === normalizedIssuer
        );
    }) || null;
}

function liquidityStatusLabel(status) {
    if (status === "below_floor") return "Below floor";
    if (status === "near_floor") return "Near floor";
    return "Healthy";
}

function buildLiquiditySummary({
    walletState = {},
    mandate = {},
    reservations = [],
    treasury = {},
    assetCode = "USDC",
    assetIssuer = "",
}) {
    const reservePolicy = mandate.reservePolicy || {};
    const capitalBase = normalizeStellarAmount(mandate.capitalBase || "0");
    const liquidityFloorPct = Number(mandate.liquidityFloorPct ?? reservePolicy.minLiquidPct ?? 10);
    const targetLiquidPct = Number(reservePolicy.targetLiquidPct ?? 20);
    const walletBalanceRecord = findWalletBalance(walletState, assetCode, assetIssuer);
    const walletBalance = walletBalanceRecord
        ? normalizeStellarAmount(walletBalanceRecord.balance || "0")
        : 0n;
    const reservedCapital = sumStringAmounts(
        (reservations || []).map((reservation) => reservation.reservedAmount || "0"),
    );
    const treasuryDeployed = BigInt(
        treasury?.summary?.deployed
        || sumStringAmounts((treasury?.positions || []).map((position) => position.allocatedAmount || "0"))
    );
    const liquidityFloorAmount = capitalBase > 0n
        ? (capitalBase * BigInt(Math.max(0, Math.round(liquidityFloorPct)))) / 100n
        : 0n;
    const targetReserveAmount = capitalBase > 0n
        ? (capitalBase * BigInt(Math.max(0, Math.round(targetLiquidPct)))) / 100n
        : 0n;
    const immediateBidHeadroom = walletBalance > liquidityFloorAmount
        ? walletBalance - liquidityFloorAmount
        : 0n;
    const status = walletBalance < liquidityFloorAmount
        ? "below_floor"
        : walletBalance < targetReserveAmount
            ? "near_floor"
            : "healthy";

    return {
        assetCode: String(assetCode || "USDC").toUpperCase(),
        assetIssuer: String(assetIssuer || ""),
        walletBalance: walletBalance.toString(),
        walletBalanceDisplay: formatStellarAmount(walletBalance),
        reservedCapital: reservedCapital.toString(),
        reservedCapitalDisplay: formatStellarAmount(reservedCapital),
        treasuryDeployed: treasuryDeployed.toString(),
        treasuryDeployedDisplay: formatStellarAmount(treasuryDeployed),
        liquidityFloorAmount: liquidityFloorAmount.toString(),
        liquidityFloorAmountDisplay: formatStellarAmount(liquidityFloorAmount),
        targetReserveAmount: targetReserveAmount.toString(),
        targetReserveAmountDisplay: formatStellarAmount(targetReserveAmount),
        immediateBidHeadroom: immediateBidHeadroom.toString(),
        immediateBidHeadroomDisplay: formatStellarAmount(immediateBidHeadroom),
        liquidityFloorPct,
        targetLiquidPct,
        canRecallFromTreasury: treasuryDeployed > 0n,
        status,
        statusLabel: liquidityStatusLabel(status),
    };
}

function buildWalletReadinessSummary(wallet = {}, { paymentAssetCode = "USDC", paymentAssetIssuer = "" } = {}) {
    const nativeBalance = findWalletBalance(wallet, "XLM", "");
    const paymentBalance = findWalletBalance(wallet, paymentAssetCode, paymentAssetIssuer);
    const nativeAmount = nativeBalance
        ? normalizeStellarAmount(nativeBalance.balance || "0")
        : 0n;
    const paymentAmount = paymentBalance
        ? normalizeStellarAmount(paymentBalance.balance || "0")
        : 0n;
    const funded = nativeAmount > 0n;
    const hasPaymentTrustline = Boolean(paymentBalance);
    const paymentReady = funded && hasPaymentTrustline;
    const status = paymentReady
        ? "ready"
        : !funded
            ? "unfunded"
            : "needs_trustline";
    const statusLabel = paymentReady
        ? "Ready for paid actions"
        : !funded
            ? "Needs XLM funding"
            : "Needs USDC trustline";

    return {
        funded,
        hasPaymentTrustline,
        paymentReady,
        status,
        statusLabel,
        balanceCount: Array.isArray(wallet.balances) ? wallet.balances.length : 0,
        nativeBalance: nativeAmount.toString(),
        nativeBalanceDisplay: formatStellarAmount(nativeAmount),
        paymentAssetCode: String(paymentAssetCode || "USDC").toUpperCase(),
        paymentAssetIssuer: String(paymentAssetIssuer || ""),
        paymentBalance: paymentAmount.toString(),
        paymentBalanceDisplay: formatStellarAmount(paymentAmount),
    };
}

function buildReservationExposureEntry(reservation, auction) {
    const reservedAmount = BigInt(reservation?.reservedAmount || "0");
    const highestBidAmount = BigInt(auction?.highestBid?.amountStroops || "0");
    const minimumNextBidAmount = BigInt(auction?.minimumNextBidStroops || "0");
    const now = nowSeconds();
    const ended = Boolean(auction && Number(auction.endTime || 0) <= now);
    const isLeading = Boolean(auction && Number(auction.highestBid?.bidId || 0) === Number(reservation?.bidId || 0));
    const readyToSettle = Boolean(ended && isLeading);
    const nextBidGap = auction && !isLeading && minimumNextBidAmount > reservedAmount
        ? minimumNextBidAmount - reservedAmount
        : 0n;
    const status = !auction
        ? "auction_unavailable"
        : readyToSettle
            ? "ready_to_settle"
            : ended
                ? "closed_outbid"
                : isLeading
                    ? "leading"
                    : "outbid";
    const statusLabel = status === "ready_to_settle"
        ? "Leading · ready to settle"
        : status === "leading"
            ? "Leading"
            : status === "outbid"
                ? "Outbid"
                : status === "closed_outbid"
                    ? "Closed · lost lead"
                    : "Auction snapshot unavailable";

    return {
        bidId: Number(reservation?.bidId || 0),
        auctionId: Number(reservation?.auctionId || 0),
        assetId: Number(reservation?.assetId || 0),
        issuer: reservation?.issuer || "",
        reservedAmount: reservedAmount.toString(),
        reservedAmountDisplay: formatStellarAmount(reservedAmount),
        status,
        statusLabel,
        isLeading,
        readyToSettle,
        highestBidDisplay: auction?.highestBidDisplay || "0.0000000",
        minimumNextBidDisplay: auction?.minimumNextBidDisplay || auction?.minimumNextBid || "0.0000000",
        nextBidGap: nextBidGap.toString(),
        nextBidGapDisplay: formatStellarAmount(nextBidGap),
        endTime: Number(auction?.endTime || 0),
        timeRemainingSeconds: auction
            ? Math.max(0, Number(auction.endTime || 0) - now)
            : 0,
        title: auction?.title || `Auction #${Number(reservation?.auctionId || 0)}`,
        auction: auction
            ? {
                auctionId: Number(auction.auctionId || 0),
                assetId: Number(auction.assetId || 0),
                title: auction.title || "",
                status: auction.status || "unknown",
                highestBidDisplay: auction.highestBidDisplay || "0.0000000",
                minimumNextBidDisplay: auction.minimumNextBidDisplay || auction.minimumNextBid || "0.0000000",
                endTime: Number(auction.endTime || 0),
                reservePriceDisplay: auction.reservePriceDisplay || auction.reservePrice || "0.0000000",
            }
            : null,
    };
}

async function buildReservationExposure(services, reservations = []) {
    if (!Array.isArray(reservations) || reservations.length === 0) {
        return [];
    }
    const auctionIds = Array.from(new Set(
        reservations
            .map((reservation) => Number(reservation?.auctionId || 0))
            .filter((auctionId) => Number.isFinite(auctionId) && auctionId > 0),
    ));
    const auctionsById = new Map(await Promise.all(
        auctionIds.map(async (auctionId) => [
            auctionId,
            enrichAuction(await services.auctionEngine.getAuction(auctionId)),
        ]),
    ));

    return reservations.map((reservation) => buildReservationExposureEntry(
        reservation,
        auctionsById.get(Number(reservation?.auctionId || 0)) || null,
    ));
}

async function loadAgentStateBundle(services, { agentId, ownerPublicKey, agentPublicKey }) {
    const [
        walletState,
        mandate,
        objective,
        brain,
        performance,
        treasury,
        reservations,
        decisionLog,
        journalPreview,
        chatPreview,
        assets,
        sessions,
        runtime,
        savedScreens,
        watchlist,
    ] = await Promise.all([
        services.agentWallet.getBalances({ owner: ownerPublicKey }),
        services.agentState.getMandate(agentId),
        services.agentState.getObjective(agentId),
        services.agentState.getBrainState(agentId),
        services.agentState.getPerformance(agentId),
        services.agentState.getTreasury(agentId),
        services.agentState.listOpenReservations(agentId),
        services.agentState.getDecisionLog(agentId, 50),
        services.agentState.getJournal(agentId, 12),
        services.agentState.getChatMessages(agentId, 20),
        services.chainService.listAssetSnapshots({ owner: agentPublicKey, lightweight: true }),
        services.chainService.listSessions({ owner: agentPublicKey }),
        services.agentRuntime.getState({ agentId }),
        services.agentState.getSavedScreens(agentId),
        services.agentState.getWatchlist(agentId),
    ]);
    const liquidity = buildLiquiditySummary({
        walletState,
        mandate,
        reservations,
        treasury,
        assetCode: "USDC",
        assetIssuer: services.chainService.runtime?.paymentAssetIssuer || "",
    });
    const reservationExposure = await buildReservationExposure(services, reservations);
    return {
        walletState,
        mandate,
        objective,
        brain,
        liquidity,
        performance,
        treasury,
        reservations,
        reservationExposure,
        savedScreens,
        watchlist,
        decisionLog,
        journalPreview,
        chatPreview,
        runtime,
        positions: {
            assets,
            sessions,
        },
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
    const currentRentalCount = assets.filter((asset) => asset.rentalActivity?.currentlyRented).length;
    const typeBreakdown = {
        real_estate: assets.filter((asset) => inferMarketAssetClass(asset) === "real_estate").length,
        land: assets.filter((asset) => inferMarketAssetClass(asset) === "land").length,
    };
    const topOpportunities = (rankedAssets.length ? rankedAssets : (marketIntel.topPerformers || [])).slice(0, 3).map((entry) => ({
        tokenId: entry.tokenId,
        name: entry.name || `Asset #${entry.tokenId}`,
        assetType: assetTypeKey(entry.assetType, entry.asset || null),
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
        currentRentalCount,
        currentRentalSharePct: percentage(currentRentalCount, marketIntel.totalAssets),
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
        parts.push(String(filters.type).replace("_", " "));
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
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200) || 200));
    const forceRefresh = ["1", "true", "yes"].includes(
        String(req.query.refresh || req.query.sync || "").trim().toLowerCase()
    );
    let rawAssets = !forceRefresh
        ? (await services.store.listAssets()).slice(-limit)
        : [];
    let loadedFromChain = false;
    if (
        (forceRefresh || rawAssets.length === 0)
        && services.chainService?.isConfigured?.()
    ) {
        loadedFromChain = true;
        rawAssets = await services.chainService.listAssetSnapshots({ limit, lightweight: true });
    }
    let productiveAssets = rawAssets.filter(productiveOnly);
    if (loadedFromChain) {
        productiveAssets = await Promise.all(
            productiveAssets.map(async (asset) => {
                const cached = asset?.tokenId != null ? await services.store.getAsset(asset.tokenId).catch(() => null) : null;
                const merged = mergeAssetWithCachedMetadata(asset, cached);
                await services.store.upsertAsset(merged).catch(() => {});
                return merged;
            })
        );
    }
    const activeAuctions = (await services.auctionEngine.listAuctions({ status: "active" }))
        .map((auction) => enrichAuction(auction));
    const activeAuctionByAssetId = new Map(
        activeAuctions.map((auction) => [Number(auction.assetId), auction])
    );

    // Build set of tokenIds that have an active rental session
    const allSessions = await services.store.listSessions().catch(() => []);
    const now = Math.floor(Date.now() / 1000);
    const rentedTokenIds = new Set();
    for (const session of (allSessions || [])) {
        if (!session || session.cancelledAt) continue;
        const active = session.isActive !== false && (
            session.isActive === true
            || (session.stopTime && Number(session.stopTime) > now)
            || (!session.stopTime && session.txHash)
        );
        if (!active) continue;
        let metadata = {};
        try {
            metadata = JSON.parse(String(session.metadata || "{}"));
        } catch {
            metadata = {};
        }
        if (metadata.assetTokenId) {
            rentedTokenIds.add(String(metadata.assetTokenId));
        }
    }

    const assets = await Promise.all(productiveAssets.map(async (asset) => {
        const auction = activeAuctionByAssetId.get(Number(asset.tokenId)) || null;
        const hydrated = await hydrateAsset(services, asset);
        const summary = marketAssetSummary(hydrated, auction);
        summary.isRented = rentedTokenIds.has(String(asset.tokenId));
        return summary;
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
    const tokenId = Number(req.params.assetId);
    const forceRefresh = ["1", "true", "yes"].includes(
        String(req.query.refresh || req.query.sync || "").trim().toLowerCase()
    );
    let asset = !forceRefresh
        ? await services.store.getAsset(tokenId)
        : null;
    if (
        (forceRefresh || !asset)
        && services.chainService?.isConfigured?.()
    ) {
        asset = await services.chainService.getAssetSnapshot(tokenId);
        if (asset) {
            const cached = await services.store.getAsset(tokenId).catch(() => null);
            asset = mergeAssetWithCachedMetadata(asset, cached);
            await services.store.upsertAsset(asset);
        }
    }
    if (!asset) {
        return res.status(404).json({ error: "Asset not found.", code: "asset_not_found" });
    }
    const auctions = (await services.auctionEngine.listAuctions({ tokenId }))
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
        ? await services.chainService.listAssetSnapshots({ limit: 200, lightweight: true })
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
            rentalActivity: asset.rentalActivity || null,
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
                currentRentalSharePct: percentage(
                    productiveAssets.filter((entry) => entry.rentalActivity?.currentlyRented).length,
                    marketIntel.totalAssets,
                ),
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
    const { services, ownerPublicKey, agentId } = await resolveAgentContext(req);
    const auction = await services.auctionEngine.createAuction({
        sellerOwnerPublicKey: ownerPublicKey,
        tokenId: Number(req.params.assetId),
        reservePrice: req.body?.reservePrice || "0",
        startTime: req.body?.startTime,
        endTime: req.body?.endTime,
        note: req.body?.note || "",
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "auction_opened",
        allowWhenIdle: true,
    });
    res.status(201).json({
        code: "auction_created",
        action: "createAuction",
        auction,
        wake,
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
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "auction_bid_placed",
        allowWhenIdle: true,
    });
    if (
        result?.previousHighestBid?.bidderOwnerPublicKey
        && normalizeAddress(result.previousHighestBid.bidderOwnerPublicKey) !== normalizeAddress(ownerPublicKey)
    ) {
        const previousProfile = await services.agentState.getAgentProfileByOwner(result.previousHighestBid.bidderOwnerPublicKey);
        if (previousProfile?.agentId) {
            await services.agentRuntime.requestWake({
                agentId: previousProfile.agentId,
                ownerPublicKey: result.previousHighestBid.bidderOwnerPublicKey,
                reason: "auction_outbid",
                allowWhenIdle: true,
            });
        }
    }
    res.status(201).json({
        code: "auction_bid_placed",
        action: "placeBid",
        bid: result.bid,
        auction: result.auction,
        paidVia: req.streamEngine || null,
        wake,
    });
}));

router.post("/market/auctions/:auctionId/settle", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    const settlement = await services.auctionEngine.settleAuction({
        auctionId: Number(req.params.auctionId),
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "auction_closed",
        allowWhenIdle: true,
    });
    res.json({
        code: "auction_settled",
        action: "settleAuction",
        ...settlement,
        wake,
    });
}));

router.get("/market/positions", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, agentPublicKey, ownerPublicKey } = await resolveAgentContext(req);
    const forceRefresh = ["1", "true", "yes"].includes(
        String(req.query.refresh || req.query.sync || "").trim().toLowerCase()
    );
    const [cachedAssets, cachedSessions] = forceRefresh
        ? [[], []]
        : await Promise.all([
            services.store.listAssets({ owner: agentPublicKey }).catch(() => []),
            services.store.listSessions({ owner: agentPublicKey }).catch(() => []),
        ]);
    const shouldRefreshAssets = forceRefresh || !Array.isArray(cachedAssets) || cachedAssets.length === 0;
    const shouldRefreshSessions = forceRefresh || !Array.isArray(cachedSessions) || cachedSessions.length === 0;
    const [assets, sessions, walletState, mandate, treasury, reservations, performance] = await Promise.all([
        shouldRefreshAssets && services.chainService?.isConfigured?.()
            ? services.chainService.listAssetSnapshots({ owner: agentPublicKey, lightweight: true })
            : Promise.resolve(cachedAssets || []),
        shouldRefreshSessions && services.chainService?.isConfigured?.()
            ? services.chainService.listSessions({ owner: agentPublicKey })
            : Promise.resolve(cachedSessions || []),
        services.agentWallet.getBalances({ owner: ownerPublicKey }),
        services.agentState.getMandate(agentId),
        services.agentState.getTreasury(agentId),
        services.agentState.listOpenReservations(agentId),
        services.agentState.getPerformance(agentId),
    ]);
    const liquidity = buildLiquiditySummary({
        walletState,
        mandate,
        reservations,
        treasury,
        assetCode: "USDC",
        assetIssuer: services.chainService.runtime?.paymentAssetIssuer || "",
    });
    const reservationExposure = await buildReservationExposure(services, reservations);
    res.json({
        code: "market_positions_loaded",
        agentId,
        positions: {
            ownedAssets: assets,
            sessions,
            treasury,
            reservations,
            reservationExposure,
            performance,
            liquidity,
        },
    });
}));

router.post("/agents/:agentId/sessions", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot open another agent payment session.", code: "agent_scope_forbidden" });
    }

    const config = req.app.locals.config || {};
    const recipient = String(req.body?.recipient || config.recipientAddress || "").trim();
    if (!recipient) {
        return res.status(503).json({ error: "Continuum payment recipient is not configured.", code: "recipient_not_configured" });
    }

    const decimals = Number(config.tokenDecimals || 7);
    const amountInput = String(req.body?.amount || req.body?.budget || "5").trim();
    const durationSeconds = Math.max(300, Number(req.body?.durationSeconds || 3 * 60 * 60));
    const metadata = typeof req.body?.metadata === "string"
        ? req.body.metadata
        : JSON.stringify({
            lane: "continuum_marketplace",
            purpose: "paid_market_actions",
            scope: "managed_agent",
            ...(req.body?.metadata || {}),
        });

    const result = await services.agentWallet.openSession({
        owner: ownerPublicKey,
        recipient,
        totalAmount: ethers.parseUnits(amountInput, decimals).toString(),
        durationSeconds,
        metadata,
        assetCode: services.chainService.runtime?.paymentAssetCode || config.tokenSymbol || "USDC",
        assetIssuer: services.chainService.runtime?.paymentAssetIssuer || "",
    });

    await services.agentState.appendDecision(agentId, {
        type: "action",
        message: `Managed market session #${result.streamId} opened`,
        detail: `${amountInput} ${(config.tokenSymbol || "USDC")} reserved for premium analysis, bidding, and treasury actions.`,
    });

    const session = await services.chainService.getSessionSnapshot(result.streamId);
    res.status(201).json({
        code: "agent_session_opened",
        agentId,
        action: "openPaymentSession",
        session: session || {
            id: Number(result.streamId),
            sender: "",
            recipient,
            isActive: true,
        },
        txHash: result.txHash || "",
    });
}));

router.post("/agents/:agentId/sessions/:sessionId/cancel", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot cancel another agent payment session.", code: "agent_scope_forbidden" });
    }

    const result = await services.agentWallet.cancelSession({
        owner: ownerPublicKey,
        sessionId: req.params.sessionId,
    });

    await services.agentState.appendDecision(agentId, {
        type: "action",
        message: `Managed market session #${Number(req.params.sessionId)} ended`,
        detail: `${formatStellarAmount(result.refundableAmount || "0")} ${(req.app.locals.config?.tokenSymbol || "USDC")} refundable balance returned to the managed agent.`,
    });

    const session = await services.chainService.getSessionSnapshot(req.params.sessionId);
    res.json({
        code: "agent_session_cancelled",
        agentId,
        action: "cancelPaymentSession",
        session: session || {
            id: Number(req.params.sessionId),
            isActive: false,
        },
        txHash: result.txHash || "",
        refundableAmount: result.refundableAmount || "0",
        claimableAmount: result.claimableAmount || "0",
    });
}));

router.post("/market/yield/claim", requirePaidAction("0.01", "Yield claim"), requireJwt, asyncHandler(async (req, res) => {
    const { services, ownerPublicKey, agentId } = await resolveAgentContext(req);
    const result = await services.agentWallet.claimYield({
        owner: ownerPublicKey,
        tokenId: Number(req.body?.tokenId),
    });
    await services.agentState.recordRealizedYield(agentId, result.amount || "0", {
        message: `Yield claimed on asset #${Number(req.body?.tokenId)}`,
        detail: `Transaction ${String(result.txHash || "").slice(0, 12)}...`,
    });
    await services.agentState.recordPaidActionFee(agentId, req.streamEngineActionFee, {
        action: "yield_claim",
        tokenId: req.body?.tokenId ? Number(req.body.tokenId) : null,
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "yield_claimable",
        allowWhenIdle: true,
    });
    res.json({
        code: "market_yield_claimed",
        action: "claimYield",
        txHash: result.txHash,
        amount: result.amount || "0",
        paidVia: req.streamEngine || null,
        wake,
    });
}));

router.post("/market/yield/route", requirePaidAction("0.03", "Yield routing"), requireJwt, asyncHandler(async (req, res) => {
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
    await services.agentState.recordPaidActionFee(agentId, req.streamEngineActionFee, {
        action: "yield_route",
        tokenId: req.body?.tokenId ? Number(req.body.tokenId) : null,
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "treasury_liquidity_changed",
        allowWhenIdle: true,
    });
    res.json({
        code: "yield_routed",
        action: "routeYield",
        claim,
        treasury,
        optimization: treasury.optimization || null,
        paidVia: req.streamEngine || null,
        wake,
    });
}));

router.post("/market/treasury/rebalance", requirePaidAction("0.02", "Treasury optimization"), requireJwt, asyncHandler(async (req, res) => {
    const { services, ownerPublicKey, agentId } = await resolveAgentContext(req);
    const treasury = await services.treasuryManager.rebalance({ ownerPublicKey, agentId });
    await services.agentState.recordPaidActionFee(agentId, req.streamEngineActionFee, {
        action: "treasury_rebalance",
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "treasury_liquidity_changed",
        allowWhenIdle: true,
    });
    res.json({
        code: "treasury_rebalanced",
        action: "rebalanceTreasury",
        treasury,
        optimization: treasury.optimization || null,
        paidVia: req.streamEngine || null,
        wake,
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
    const state = await loadAgentStateBundle(services, {
        agentId,
        ownerPublicKey,
        agentPublicKey,
    });
    res.json({
        code: "agent_state_loaded",
        agentId,
        state: {
            wallet: state.walletState,
            mandate: state.mandate,
            objective: state.objective,
            brain: state.brain,
            liquidity: state.liquidity,
            degradedMode: Boolean(state.brain?.degradedMode),
            lastWakeReason: state.brain?.wakeReason || "",
            performance: state.performance,
            treasury: state.treasury,
            reservations: state.reservations,
            reservationExposure: state.reservationExposure,
            savedScreens: state.savedScreens,
            watchlist: state.watchlist,
            decisionLog: state.decisionLog,
            journalPreview: state.journalPreview,
            chatPreview: state.chatPreview,
            runtime: state.runtime,
            positions: state.positions,
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
        brain: await services.agentState.getBrainState(agentId),
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
        brain: await services.agentState.getBrainState(agentId),
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
        brain: await services.agentState.getBrainState(agentId),
    });
}));

router.get("/agents/:agentId/objective", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent objective.", code: "agent_scope_forbidden" });
    }
    const objective = await services.agentState.getObjective(agentId);
    res.json({
        code: "agent_objective_loaded",
        agentId,
        objective,
    });
}));

router.post("/agents/:agentId/objective", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot update another agent objective.", code: "agent_scope_forbidden" });
    }
    const objective = await services.agentState.setObjective(agentId, req.body || {});
    await services.agentState.appendDecision(agentId, {
        type: "decision",
        message: "Agent objective updated",
        detail: `${objective.style} strategy · ${objective.goal}`,
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "objective_changed",
        allowWhenIdle: true,
    });
    res.json({
        code: "agent_objective_updated",
        agentId,
        objective,
        wake,
        brain: await services.agentState.getBrainState(agentId),
    });
}));

router.get("/agents/:agentId/journal", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent journal.", code: "agent_scope_forbidden" });
    }
    const [journal, memorySummary] = await Promise.all([
        services.agentState.getJournal(agentId, Number(req.query.limit || 40)),
        services.agentState.getMemorySummary(agentId),
    ]);
    res.json({
        code: "agent_journal_loaded",
        agentId,
        journal,
        memorySummary,
    });
}));

router.post("/agents/:agentId/chat", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey, agentPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot chat with another managed agent.", code: "agent_scope_forbidden" });
    }
    const message = String(req.body?.message || "").trim();
    if (!message) {
        return res.status(400).json({ error: "message is required", code: "chat_message_required" });
    }

    const state = await loadAgentStateBundle(services, {
        agentId,
        ownerPublicKey,
        agentPublicKey,
    });
    await services.agentState.appendChatMessage(agentId, {
        role: "user",
        content: message,
    });
    const memorySummary = await services.agentState.getMemorySummary(agentId);
    const response = await services.agentBrain.chat({
        message,
        objective: state.objective,
        brainState: state.brain,
        context: {
            liquidity: state.liquidity,
            runtime: state.runtime,
            positions: state.positions,
            treasury: state.treasury,
            performance: state.performance,
        },
        recentMessages: state.chatPreview,
        memorySummary: memorySummary.summary || "",
    });

    let objective = state.objective;
    if (response.objectivePatch) {
        objective = await services.agentState.setObjective(agentId, response.objectivePatch);
        await services.agentState.appendDecision(agentId, {
            type: "decision",
            message: "Agent objective updated from chat",
            detail: `${objective.style} strategy · ${objective.goal}`,
        });
    }

    const assistantMessage = await services.agentState.appendChatMessage(agentId, {
        role: "assistant",
        content: response.reply,
        metadata: {
            degradedMode: Boolean(response.degradedMode),
            wakeReason: response.wakeReason || "chat_message",
        },
    });
    const journalEntry = await services.agentState.appendJournal(agentId, {
        kind: "conversation",
        message: "Agent conversation updated",
        detail: response.reply,
        rationale: "",
        metadata: {
            degradedMode: Boolean(response.degradedMode),
            wakeReason: response.wakeReason || "chat_message",
        },
    });
    const updatedMessages = await services.agentState.getChatMessages(agentId, 20);
    const summary = await services.agentBrain.summarize({
        objective,
        journal: await services.agentState.getJournal(agentId, 10),
        recentMessages: updatedMessages.slice(-8),
    });
    await services.agentState.setMemorySummary(agentId, {
        summary,
        sourceCount: updatedMessages.length,
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: response.wakeReason || "chat_message",
        allowWhenIdle: true,
    });

    res.json({
        code: "agent_chat_complete",
        agentId,
        reply: response.reply,
        objective,
        brain: await services.agentState.getBrainState(agentId),
        wake,
        degradedMode: Boolean(response.degradedMode),
        degradedReason: response.degradedReason || "",
        messages: updatedMessages,
        journalPreview: [journalEntry],
        assistantMessage,
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
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
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
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "screen_updated",
        allowWhenIdle: true,
    });
    res.status(201).json({
        code: "agent_screen_saved",
        agentId,
        screen,
        wake,
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
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
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
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "watchlist_updated",
        allowWhenIdle: true,
    });
    res.status(201).json({
        code: "agent_watchlist_added",
        agentId,
        asset,
        wake,
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
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot update another agent mandate.", code: "agent_scope_forbidden" });
    }
    const mandate = await services.agentState.setMandate(agentId, req.body || {});
    await services.agentState.appendDecision(agentId, {
        type: "decision",
        message: "Agent mandate updated",
        detail: `Liquidity floor ${mandate.liquidityFloorPct}% · approval threshold ${mandate.approvalThreshold} USDC`,
    });
    const wake = await services.agentRuntime.requestWake({
        agentId,
        ownerPublicKey,
        reason: "mandate_changed",
        allowWhenIdle: true,
    });
    res.json({
        code: "agent_mandate_updated",
        agentId,
        mandate,
        wake,
    });
}));

router.get("/agents/:agentId/wallet", requireJwt, asyncHandler(async (req, res) => {
    const { services, agentId, ownerPublicKey } = await resolveAgentContext(req);
    if (normalizeAddress(req.params.agentId) !== normalizeAddress(agentId)) {
        return res.status(403).json({ error: "Cannot inspect another agent wallet.", code: "agent_scope_forbidden" });
    }
    const wallet = await services.agentWallet.getBalances({ owner: ownerPublicKey });
    const summary = buildWalletReadinessSummary(wallet, {
        paymentAssetCode: "USDC",
        paymentAssetIssuer: services.chainService.runtime?.paymentAssetIssuer || "",
    });
    res.json({
        code: "agent_wallet_loaded",
        agentId,
        wallet: {
            ...wallet,
            summary,
        },
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
