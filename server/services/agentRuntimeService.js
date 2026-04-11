const crypto = require("crypto");

const { screenAssets, parseGoal, extractYieldRate, estimateRiskScore } = require("./assetScreener");
const { monitorRisks } = require("./assetIntelligence");
const { buildPortfolio, computeRebalanceActions } = require("./portfolioManager");
const { checkCompliance } = require("./complianceChecker");
const { formatStellarAmount, normalizeStellarAmount } = require("./stellarAnchorService");
const { inferMarketAssetClass, isSupportedProductiveTwin } = require("./rwaAssetScope");

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function productiveOnly(asset) {
    return isSupportedProductiveTwin(asset);
}

const MARKET_TYPE_TO_CHAIN_ASSET_TYPE = {
    real_estate: 1,
    land: 1,
};

function assetClassLabel(asset) {
    return inferMarketAssetClass(asset);
}

function toDisplayAmount(value) {
    return (Number(value || 0) / 1e7).toFixed(2);
}

function findWalletBalance(walletState = {}, assetCode = "USDC", assetIssuer = "") {
    const normalizedCode = String(assetCode || "USDC").toUpperCase();
    const normalizedIssuer = String(assetIssuer || "");
    return (walletState.balances || []).find((balance) => (
        String(balance.assetCode || "").toUpperCase() === normalizedCode
        && String(balance.assetIssuer || "") === normalizedIssuer
    )) || null;
}

function fingerprint(value) {
    return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function normalizeText(value = "") {
    return String(value || "").trim().toLowerCase();
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

function buildScreenCriteria(filters = {}) {
    const criteria = filters.goal ? { ...parseGoal(filters.goal) } : {};
    const mappedType = MARKET_TYPE_TO_CHAIN_ASSET_TYPE[String(filters.type || "").trim()];
    if (mappedType) criteria.assetTypes = [mappedType];
    if (filters.minYield !== undefined && filters.minYield !== null && filters.minYield !== "") {
        criteria.minYield = Number(filters.minYield);
    }
    if (filters.maxYield !== undefined && filters.maxYield !== null && filters.maxYield !== "") {
        criteria.maxYield = Number(filters.maxYield);
    }
    if (filters.maxRisk !== undefined && filters.maxRisk !== null && filters.maxRisk !== "") {
        criteria.maxRisk = Number(filters.maxRisk);
    }
    if (filters.verifiedOnly) criteria.verifiedOnly = true;
    if (filters.rentalReady) criteria.rentalReadyOnly = true;
    return criteria;
}

function plannerIdentity(brain = {}) {
    return {
        provider: String(brain?.provider || "").trim(),
        model: String(brain?.model || "").trim(),
        degradedMode: Boolean(brain?.degradedMode),
        degradedReason: String(brain?.degradedReason || "").trim(),
    };
}

function buildPlannerHealthDecision(currentBrain = {}, nextBrain = {}, wakeReason = "") {
    const previous = plannerIdentity(currentBrain);
    const next = plannerIdentity(nextBrain);

    const changed =
        previous.provider !== next.provider
        || previous.model !== next.model
        || previous.degradedMode !== next.degradedMode
        || previous.degradedReason !== next.degradedReason;

    if (!changed) {
        return null;
    }

    const providerLabel = next.provider || "fallback";
    const modelLabel = next.model ? ` · ${next.model}` : "";
    const wakeLabel = wakeReason ? ` · wake ${String(wakeReason).replace(/_/g, " ")}` : "";

    if (next.degradedMode) {
        return {
            type: "info",
            message: "Planner fell back to deterministic mode",
            detail: `${providerLabel}${modelLabel}${wakeLabel}${next.degradedReason ? ` · ${next.degradedReason}` : ""}`,
        };
    }

    if (previous.degradedMode && !next.degradedMode) {
        return {
            type: "decision",
            message: `Planner recovered with ${providerLabel}`,
            detail: `Model ${next.model || "configured default"}${wakeLabel}`,
        };
    }

    return {
        type: "info",
        message: `Planner using ${providerLabel}`,
        detail: `Model ${next.model || "configured default"}${wakeLabel}`,
    };
}

function treasuryBlockedReasonMessage(reason = "") {
    const normalized = String(reason || "").trim().toLowerCase();
    if (normalized === "reserve_floor_blocked") {
        return "Treasury rebalance is blocked because liquid balance is below the reserve floor.";
    }
    if (normalized === "capital_base_exhausted") {
        return "Treasury rebalance is blocked because the capital base is already fully allocated.";
    }
    if (normalized === "no_eligible_venues") {
        return "Treasury rebalance is blocked because no approved treasury venues are currently eligible.";
    }
    return "";
}

class AgentRuntimeService {
    constructor(config = {}) {
        this.store = config.store;
        this.chainService = config.chainService;
        this.agentWallet = config.agentWallet;
        this.agentState = config.agentState;
        this.agentBrain = config.agentBrain;
        this.treasuryManager = config.treasuryManager;
        this.auctionEngine = config.auctionEngine || null;
        this.tickIntervalMs = Math.max(5000, Number(process.env.CONTINUUM_AGENT_TICK_MS || 15000));
        this.intervals = new Map();
        this.wakeTimers = new Map();
        this.pendingWakeReasons = new Map();
    }

    clearInterval(agentId) {
        const key = String(agentId || "").toUpperCase();
        const existing = this.intervals.get(key);
        if (existing) {
            clearInterval(existing);
            this.intervals.delete(key);
        }
    }

    clearWake(agentId) {
        const key = String(agentId || "").toUpperCase();
        const existing = this.wakeTimers.get(key);
        if (existing) {
            clearTimeout(existing);
            this.wakeTimers.delete(key);
        }
        this.pendingWakeReasons.delete(key);
    }

    schedule(agentId, ownerPublicKey) {
        const key = String(agentId || "").toUpperCase();
        this.clearInterval(key);
        const handle = setInterval(() => {
            void this.tick({ agentId: key, ownerPublicKey, reason: "scheduled" });
        }, this.tickIntervalMs);
        handle.unref?.();
        this.intervals.set(key, handle);
    }

    async requestWake({ agentId, ownerPublicKey, reason = "event", allowWhenIdle = false }) {
        const key = String(agentId || "").toUpperCase();
        this.pendingWakeReasons.set(key, String(reason || "event"));
        if (this.wakeTimers.has(key)) {
            return { queued: true, reason: this.pendingWakeReasons.get(key) };
        }

        const handle = setTimeout(async () => {
            this.wakeTimers.delete(key);
            const wakeReason = this.pendingWakeReasons.get(key) || String(reason || "event");
            this.pendingWakeReasons.delete(key);
            const currentRuntime = await this.agentState.getRuntime(key);
            if (!currentRuntime.running && !allowWhenIdle) {
                await this.agentState.setBrainState(key, {
                    status: "idle",
                    wakeReason,
                });
                return;
            }
            await this.tick({
                agentId: key,
                ownerPublicKey,
                reason: wakeReason,
                previewOnly: !currentRuntime.running && allowWhenIdle,
            });
        }, 25);
        handle.unref?.();
        this.wakeTimers.set(key, handle);
        return { queued: true, reason: this.pendingWakeReasons.get(key) };
    }

    async refreshMemorySummary(agentId, objective, journalEntries = [], chatMessages = []) {
        const currentSummary = await this.agentState.getMemorySummary(agentId);
        const sourceCount = journalEntries.length + chatMessages.length;
        const minIntervalSeconds = Math.max(
            60,
            Number(process.env.AGENT_MEMORY_SUMMARY_MIN_SECONDS || 300),
        );

        if (
            currentSummary?.summary
            && Number(currentSummary.sourceCount || 0) === sourceCount
            && nowSeconds() - Number(currentSummary.updatedAt || 0) < minIntervalSeconds
        ) {
            return currentSummary;
        }

        if (!this.agentBrain) {
            return currentSummary;
        }
        const summary = await this.agentBrain.summarize({
            objective,
            journal: journalEntries.slice(0, 12),
            recentMessages: chatMessages.slice(-8),
        });
        return this.agentState.setMemorySummary(agentId, {
            summary,
            sourceCount,
        });
    }

    async start({ agentId, ownerPublicKey, executeTreasury = true, executeClaims = true }) {
        const normalizedAgentId = String(agentId || "").toUpperCase();
        this.clearWake(normalizedAgentId);
        const runtime = await this.agentState.setRuntime(normalizedAgentId, {
            status: "running",
            running: true,
            executeTreasury,
            executeClaims,
            startedAt: nowSeconds(),
            pausedAt: 0,
            nextTickAt: nowSeconds() + Math.ceil(this.tickIntervalMs / 1000),
            lastError: "",
            lastErrorAt: 0,
        });
        await this.agentState.appendDecision(normalizedAgentId, {
            type: "info",
            message: "Autonomous Continuum runtime started",
            detail: `Treasury ${executeTreasury ? "enabled" : "disabled"} · Auto-claims ${executeClaims ? "enabled" : "disabled"} · Tick interval ${Math.ceil(this.tickIntervalMs / 1000)}s · First scan running now…`,
        });
        this.schedule(normalizedAgentId, ownerPublicKey);
        return this.tick({ agentId: normalizedAgentId, ownerPublicKey, reason: "start" });
    }

    async pause({ agentId }) {
        const normalizedAgentId = String(agentId || "").toUpperCase();
        this.clearInterval(normalizedAgentId);
        this.clearWake(normalizedAgentId);
        const runtime = await this.agentState.setRuntime(normalizedAgentId, {
            status: "paused",
            running: false,
            pausedAt: nowSeconds(),
            nextTickAt: 0,
        });
        await this.agentState.setBrainState(normalizedAgentId, {
            status: "paused",
            wakeReason: "paused",
        });
        await this.agentState.appendDecision(normalizedAgentId, {
            type: "info",
            message: "Autonomous Continuum runtime paused",
            detail: "Managed agent execution is paused, but server state remains live.",
        });
        return runtime;
    }

    async getState({ agentId }) {
        return this.agentState.getRuntime(agentId);
    }

    async settleReadyAuctions({ agentId }) {
        if (!this.auctionEngine?.listAuctions || !this.auctionEngine?.settleAuction) {
            return [];
        }

        const activeAuctions = await this.auctionEngine.listAuctions({ status: "active" });
        const readyAuctions = activeAuctions.filter(
            (auction) => Number(auction?.endTime || 0) > 0 && Number(auction.endTime) <= nowSeconds()
        );
        const settled = [];

        for (const auction of readyAuctions) {
            try {
                const result = await this.auctionEngine.settleAuction({
                    auctionId: Number(auction.auctionId),
                });
                settled.push({
                    auctionId: Number(auction.auctionId),
                    assetId: Number(auction.assetId),
                    status: result?.settlement?.status || "settled",
                    txHash: result?.settlement?.txHash || "",
                });
            } catch (error) {
                await this.agentState.appendDecision(agentId, {
                    type: "error",
                    message: `Auction #${Number(auction.auctionId)} settlement failed`,
                    detail: error.message || "Unknown settlement error",
                });
            }
        }

        return settled;
    }

    async maybePlaceAuctionBid({
        agentId,
        ownerPublicKey,
        walletPublicKey,
        opportunities,
        mandate,
        activeAuctions = null,
        screenSignals = [],
        watchlistSignals = [],
    }) {
        if (!this.auctionEngine?.listAuctions || !this.auctionEngine?.placeBid) {
            return [];
        }

        const auctions = Array.isArray(activeAuctions)
            ? activeAuctions
            : await this.auctionEngine.listAuctions({ status: "active" });
        const placedBids = [];

        const rankedAuctions = this.buildBidFocus({
            auctions,
            opportunities,
            walletPublicKey,
            mandate,
            screenSignals,
            watchlistSignals,
        });

        for (const candidate of rankedAuctions.slice(0, 1)) {
            if (!candidate.eligible) {
                continue;
            }
            const { auction, opportunity, nextBid, prioritySource } = candidate;

            try {
                const result = await this.auctionEngine.placeBid({
                    auctionId: Number(auction.auctionId),
                    bidderOwnerPublicKey: ownerPublicKey,
                    amount: formatStellarAmount(nextBid),
                    note: "autonomous-runtime",
                });
                await this.agentState.recordPaidActionFee(agentId, "500000", {
                    action: "auction_bid_auto",
                    auctionId: Number(auction.auctionId),
                    assetId: Number(auction.assetId),
                });
                await this.agentState.appendDecision(agentId, {
                    type: "decision",
                    message: `Autonomous runtime selected auction #${Number(auction.auctionId)}`,
                    detail: `Twin #${Number(auction.assetId)} scored ${Number(opportunity?.score || 0)} with bid ${result.bid.amountDisplay} USDC${prioritySource.length ? ` · focus ${prioritySource.join(" + ")}` : ""}.`,
                });
                placedBids.push({
                    ...result.bid,
                    prioritySource,
                });
            } catch (error) {
                await this.agentState.appendDecision(agentId, {
                    type: "error",
                    message: `Autonomous bid skipped for auction #${Number(auction.auctionId)}`,
                    detail: error.message || "Unknown bidding error",
                });
            }
        }

        return placedBids;
    }

    evaluateSavedScreens({ savedScreens = [], productiveAssets = [], activeAuctions = [] }) {
        const activeAuctionTokenIds = new Set(activeAuctions.map((auction) => Number(auction.assetId)));
        return savedScreens.slice(0, 8).map((screen) => {
            const filters = screen?.filters || {};
            const baseAssets = productiveAssets.filter((asset) => {
                if (!assetMatchesSearch(asset, filters.search)) return false;
                if (filters.hasAuction && !activeAuctionTokenIds.has(Number(asset.tokenId))) return false;
                return true;
            });
            const criteria = buildScreenCriteria(filters);
            const ranked = screenAssets(baseAssets, {
                ...criteria,
                limit: baseAssets.length,
            });
            const top = ranked[0] || null;
            return {
                screenId: screen.screenId,
                name: screen.name || "Saved Screen",
                matches: ranked.length,
                matchedTokenIds: ranked.slice(0, 5).map((entry) => Number(entry.tokenId)),
                topTokenId: top ? Number(top.tokenId) : null,
                topName: top?.name || "",
                topScore: Number(top?.score || 0),
                topYieldRate: Number(top?.yieldRate || 0),
                topRiskScore: Number(top?.riskScore || 0),
            };
        });
    }

    evaluateWatchlistSignals({ watchlist = [], productiveAssets = [], activeAuctions = [], mandate = {} }) {
        const assetByTokenId = new Map(productiveAssets.map((asset) => [Number(asset.tokenId), asset]));
        const auctionByTokenId = new Map(activeAuctions.map((auction) => [Number(auction.assetId), auction]));
        const minTargetYield = Number(mandate?.targetReturnMinPct || 0);

        return watchlist.slice(0, 12).map((item) => {
            const tokenId = Number(item.tokenId);
            const asset = assetByTokenId.get(tokenId);
            if (!asset) {
                return {
                    tokenId,
                    name: item.name || `Twin #${tokenId}`,
                    severity: "medium",
                    reasons: ["missing_from_market"],
                    hasLiveAuction: false,
                    yieldRate: 0,
                    riskScore: 0,
                };
            }
            const assetAlerts = monitorRisks([asset]);
            const liveAuction = auctionByTokenId.get(tokenId) || null;
            const yieldRate = Number(extractYieldRate(asset) || 0);
            const riskScore = Number(estimateRiskScore(asset) || 0);
            const reasons = [];
            if (liveAuction) reasons.push("live_auction");
            if (yieldRate >= minTargetYield && minTargetYield > 0) reasons.push("yield_floor_met");
            if (assetAlerts.length) reasons.push(assetAlerts[0].type || "risk_alert");
            if (reasons.length === 0) return null;
            return {
                tokenId,
                name: asset.publicMetadata?.name || item.name || `Twin #${tokenId}`,
                severity: assetAlerts[0]?.severity || (liveAuction ? "info" : "low"),
                reasons,
                hasLiveAuction: Boolean(liveAuction),
                auctionId: liveAuction ? Number(liveAuction.auctionId) : null,
                yieldRate,
                riskScore,
            };
        }).filter(Boolean);
    }

    buildBidFocus({ auctions = [], opportunities = [], walletPublicKey = "", mandate = {}, liquidity = null, screenSignals = [], watchlistSignals = [] }) {
        const opportunityByTokenId = new Map(
            opportunities.map((entry) => [Number(entry.tokenId), entry])
        );
        const watchlistByTokenId = new Map(
            watchlistSignals
                .filter((entry) => entry?.hasLiveAuction)
                .map((entry) => [Number(entry.tokenId), entry])
        );
        const screenTokenIds = new Set(
            screenSignals
                .flatMap((entry) => (
                    Array.isArray(entry?.matchedTokenIds) && entry.matchedTokenIds.length > 0
                        ? entry.matchedTokenIds
                        : entry?.topTokenId
                            ? [entry.topTokenId]
                            : []
                ))
                .map((tokenId) => Number(tokenId))
        );
        const approvalThreshold = normalizeStellarAmount(mandate?.approvalThreshold || "250");
        const bidIncrement = 10_000_000n;
        const hasLiquidityContext = liquidity && typeof liquidity === "object";
        const immediateBidHeadroom = hasLiquidityContext
            ? normalizeStellarAmount(liquidity.immediateBidHeadroom || "0")
            : null;
        const now = nowSeconds();

        return auctions
            .filter((auction) => Number(auction?.startTime || 0) <= now && Number(auction?.endTime || 0) > now)
            .filter((auction) => opportunityByTokenId.has(Number(auction.assetId)))
            .filter((auction) => String(auction.seller || "").toUpperCase() !== String(walletPublicKey || "").toUpperCase())
            .filter((auction) => String(auction.highestBid?.bidder || "").toUpperCase() !== String(walletPublicKey || "").toUpperCase())
            .map((auction) => {
                const tokenId = Number(auction.assetId);
                const opportunity = opportunityByTokenId.get(tokenId);
                const watchSignal = watchlistByTokenId.get(tokenId) || null;
                const screenMatched = screenTokenIds.has(tokenId);
                const reserve = BigInt(auction.reservePrice || "0");
                const highest = BigInt(auction.highestBid?.amountStroops || "0");
                const nextBid = highest > 0n ? highest + bidIncrement : reserve;
                const exceedsApprovalThreshold = nextBid > approvalThreshold;
                const exceedsLiquidityHeadroom =
                    immediateBidHeadroom != null
                    && immediateBidHeadroom >= 0n
                    && nextBid > immediateBidHeadroom;
                const prioritySource = [];
                let preferenceBoost = 0;

                if (watchSignal) {
                    prioritySource.push("watchlist");
                    preferenceBoost += 100;
                }
                if (screenMatched) {
                    prioritySource.push("saved_screen");
                    preferenceBoost += 40;
                }
                if (watchSignal?.reasons?.includes("yield_floor_met")) {
                    preferenceBoost += 10;
                }

                return {
                    auction,
                    tokenId,
                    opportunity,
                    nextBid,
                    nextBidDisplay: formatStellarAmount(nextBid),
                    eligible: nextBid > 0n && !exceedsApprovalThreshold && !exceedsLiquidityHeadroom,
                    blockedReason: nextBid <= 0n
                        ? "No valid next bid is available."
                        : exceedsApprovalThreshold
                            ? "The next valid bid exceeds the approval threshold."
                            : exceedsLiquidityHeadroom
                                ? "The next valid bid exceeds the immediate liquidity headroom."
                            : "",
                    prioritySource,
                    preferenceScore: Number(opportunity?.score || 0) + preferenceBoost,
                };
            })
            .sort((left, right) => right.preferenceScore - left.preferenceScore);
    }

    buildLiquidityContext({ walletState, mandate, reservations = [], treasury = {} }) {
        const paymentAssetIssuer = this.chainService?.runtime?.paymentAssetIssuer || "";
        const balanceRecord = findWalletBalance(walletState, "USDC", paymentAssetIssuer);
        const walletBalance = normalizeStellarAmount(balanceRecord?.balance || "0");
        const reservedAmount = reservations.reduce((sum, entry) => sum + BigInt(entry?.reservedAmount || "0"), 0n);
        const treasuryDeployed = (treasury?.positions || []).reduce(
            (sum, position) => sum + BigInt(position?.allocatedAmount || "0"),
            0n,
        );
        const capitalBase = normalizeStellarAmount(mandate?.capitalBase || "0");
        const floorPct = BigInt(Number(mandate?.liquidityFloorPct || 10));
        const targetPct = BigInt(Number(mandate?.reservePolicy?.targetLiquidPct || 20));
        const floorAmount = capitalBase > 0n ? (capitalBase * floorPct) / 100n : 0n;
        const targetAmount = capitalBase > 0n ? (capitalBase * targetPct) / 100n : 0n;
        const immediateBidHeadroom = walletBalance > floorAmount ? walletBalance - floorAmount : 0n;
        return {
            walletBalance: walletBalance.toString(),
            walletBalanceDisplay: toDisplayAmount(walletBalance),
            reservedAmount: reservedAmount.toString(),
            reservedAmountDisplay: toDisplayAmount(reservedAmount),
            treasuryDeployed: treasuryDeployed.toString(),
            treasuryDeployedDisplay: toDisplayAmount(treasuryDeployed),
            liquidityFloorAmount: floorAmount.toString(),
            liquidityFloorAmountDisplay: toDisplayAmount(floorAmount),
            targetReserveAmount: targetAmount.toString(),
            targetReserveAmountDisplay: toDisplayAmount(targetAmount),
            immediateBidHeadroom: immediateBidHeadroom.toString(),
            immediateBidHeadroomDisplay: toDisplayAmount(immediateBidHeadroom),
            outsideTargetBand: walletBalance < floorAmount || walletBalance > targetAmount,
        };
    }

    validateDecisionProposal(proposal = {}, context = {}) {
        const supported = new Set([
            "analyze",
            "bid",
            "settle_auction",
            "claim_yield",
            "route_yield",
            "rebalance_treasury",
            "watch",
            "hold",
        ]);
        const actionType = String(proposal?.actionType || "hold").trim().toLowerCase();
        if (!supported.has(actionType)) {
            return { valid: false, blockedBy: `Model proposed unsupported action "${actionType}".` };
        }

        if (["hold", "watch", "analyze"].includes(actionType)) {
            return { valid: true, actionType, actionArgs: proposal.actionArgs || {} };
        }

        if (actionType === "bid") {
            const auctionId = Number(proposal?.actionArgs?.auctionId || context?.bidFocus?.auctionId || 0);
            const amount = String(
                proposal?.actionArgs?.amount
                || context?.bidFocus?.nextBidDisplay
                || context?.bidFocus?.nextBidAmountDisplay
                || ""
            ).trim();
            if (!auctionId || !amount) {
                return { valid: false, blockedBy: "Bid proposal is missing an auction id or amount." };
            }
            if (context?.bidFocus && Number(context.bidFocus.auctionId) === auctionId && context.bidFocus.eligible === false) {
                return { valid: false, blockedBy: context.bidFocus.blockedReason || "Top auction candidate is outside mandate limits." };
            }
            return { valid: true, actionType, actionArgs: { auctionId, amount } };
        }

        if (actionType === "settle_auction") {
            const auctionId = Number(proposal?.actionArgs?.auctionId || context?.readySettlements?.[0]?.auctionId || 0);
            if (!auctionId) {
                return { valid: false, blockedBy: "No auction is currently ready to settle." };
            }
            return { valid: true, actionType, actionArgs: { auctionId } };
        }

        if (actionType === "claim_yield") {
            const tokenId = Number(proposal?.actionArgs?.tokenId || context?.claimableAssets?.[0]?.tokenId || 0);
            if (!tokenId) {
                return { valid: false, blockedBy: "No claimable yield is currently available." };
            }
            return { valid: true, actionType, actionArgs: { tokenId } };
        }

        if (actionType === "route_yield") {
            const tokenId = Number(proposal?.actionArgs?.tokenId || context?.claimableAssets?.[0]?.tokenId || 0);
            return { valid: true, actionType, actionArgs: tokenId ? { tokenId } : {} };
        }

        if (actionType === "rebalance_treasury") {
            if (!context?.capabilities?.treasury) {
                return { valid: false, blockedBy: "Treasury automation is not enabled for this runtime." };
            }
            return { valid: true, actionType, actionArgs: {} };
        }

        return { valid: true, actionType, actionArgs: proposal.actionArgs || {} };
    }

    async executeDecision({
        agentId,
        ownerPublicKey,
        proposal,
        context,
        currentRuntime,
        previewOnly = false,
    }) {
        const actionType = String(proposal.actionType || "hold");
        const executed = {
            actionType,
            actionArgs: proposal.actionArgs || {},
            outcome: "skipped",
            details: {},
        };

        if (["hold", "watch", "analyze"].includes(actionType) || !currentRuntime.running || previewOnly) {
            return executed;
        }

        if (actionType === "settle_auction") {
            const settlement = await this.auctionEngine.settleAuction({
                auctionId: Number(proposal.actionArgs.auctionId),
            });
            return {
                actionType,
                actionArgs: proposal.actionArgs,
                outcome: "executed",
                details: {
                    auctionId: Number(proposal.actionArgs.auctionId),
                    txHash: settlement?.settlement?.txHash || "",
                    settlement,
                },
            };
        }

        if (actionType === "bid") {
            const result = await this.auctionEngine.placeBid({
                auctionId: Number(proposal.actionArgs.auctionId),
                bidderOwnerPublicKey: ownerPublicKey,
                amount: proposal.actionArgs.amount,
                note: "autonomous-brain",
            });
            await this.agentState.recordPaidActionFee(agentId, "500000", {
                action: "auction_bid_auto",
                auctionId: Number(proposal.actionArgs.auctionId),
                assetId: Number(result?.auction?.assetId || 0),
            });
            return {
                actionType,
                actionArgs: proposal.actionArgs,
                outcome: "executed",
                details: {
                    auctionId: Number(proposal.actionArgs.auctionId),
                    assetId: Number(result?.auction?.assetId || 0),
                    assetName: result?.auction?.title || "",
                    bidId: Number(result?.bid?.bidId || 0),
                    amount: result?.bid?.amountDisplay || proposal.actionArgs.amount,
                    txHash: result?.bid?.txHash || "",
                },
            };
        }

        if (actionType === "claim_yield") {
            const claim = await this.agentWallet.claimYield({
                owner: ownerPublicKey,
                tokenId: Number(proposal.actionArgs.tokenId),
            });
            await this.agentState.recordRealizedYield(agentId, claim.amount || "0", {
                message: `Agent auto-claimed yield on twin #${Number(proposal.actionArgs.tokenId)}`,
                detail: `Transaction ${String(claim.txHash || "").slice(0, 12)}...`,
            });
            return {
                actionType,
                actionArgs: proposal.actionArgs,
                outcome: "executed",
                details: {
                    tokenId: Number(proposal.actionArgs.tokenId),
                    amount: claim.amount || "0",
                    txHash: claim.txHash || "",
                },
            };
        }

        if (actionType === "route_yield") {
            let claim = null;
            if (proposal.actionArgs.tokenId) {
                claim = await this.agentWallet.claimYield({
                    owner: ownerPublicKey,
                    tokenId: Number(proposal.actionArgs.tokenId),
                });
                await this.agentState.recordRealizedYield(agentId, claim.amount || "0", {
                    message: `Agent auto-claimed yield on twin #${Number(proposal.actionArgs.tokenId)} before routing`,
                });
            }
            const treasury = await this.treasuryManager.rebalance({ ownerPublicKey, agentId });
            const treasuryReason = String(treasury?.optimization?.reason || "").trim();
            const deploymentCount = Number(treasury?.optimization?.execution?.deploymentCount || 0);
            const blockedBy = treasuryBlockedReasonMessage(treasuryReason);
            if (blockedBy && deploymentCount === 0 && !claim) {
                return {
                    actionType,
                    actionArgs: proposal.actionArgs,
                    outcome: "skipped",
                    details: {
                        blockedBy,
                        treasuryReason,
                        treasuryPositions: Number(treasury?.positions?.length || 0),
                    },
                };
            }
            return {
                actionType,
                actionArgs: proposal.actionArgs,
                outcome: "executed",
                details: {
                    tokenId: proposal.actionArgs.tokenId ? Number(proposal.actionArgs.tokenId) : null,
                    claimAmount: claim?.amount || "0",
                    treasuryPositions: Number(treasury?.positions?.length || 0),
                },
            };
        }

        if (actionType === "rebalance_treasury") {
            const treasury = await this.treasuryManager.rebalance({ ownerPublicKey, agentId });
            const treasuryReason = String(treasury?.optimization?.reason || "").trim();
            const deploymentCount = Number(treasury?.optimization?.execution?.deploymentCount || 0);
            const blockedBy = treasuryBlockedReasonMessage(treasuryReason);
            if (blockedBy && deploymentCount === 0) {
                return {
                    actionType,
                    actionArgs: proposal.actionArgs,
                    outcome: "skipped",
                    details: {
                        blockedBy,
                        treasuryReason,
                        treasuryPositions: Number(treasury?.positions?.length || 0),
                    },
                };
            }
            return {
                actionType,
                actionArgs: proposal.actionArgs,
                outcome: "executed",
                details: {
                    treasuryPositions: Number(treasury?.positions?.length || 0),
                    objective: treasury?.optimization?.objective || "",
                },
            };
        }

        return executed;
    }

    async tick({ agentId, ownerPublicKey, reason = "manual", previewOnly = false }) {
        const normalizedAgentId = String(agentId || "").toUpperCase();
        const currentRuntime = await this.agentState.getRuntime(normalizedAgentId);
        const currentBrainState = await this.agentState.getBrainState(normalizedAgentId);
        const nextTickAt = currentRuntime.running
            ? nowSeconds() + Math.ceil(this.tickIntervalMs / 1000)
            : 0;

        try {
            const wallet = await this.agentWallet.getWallet(ownerPublicKey);
            if (!wallet?.publicKey) {
                throw Object.assign(new Error("No managed agent wallet found for this runtime."), {
                    status: 404,
                    code: "agent_wallet_not_found",
                });
            }

            const [
                mandate,
                objective,
                treasury,
                reservations,
                walletState,
                savedScreens,
                watchlist,
                recentMessages,
                memorySummary,
                recentJournal,
                allAssets,
                ownedAssets,
                sessions,
                activeAuctions,
            ] = await Promise.all([
                this.agentState.getMandate(normalizedAgentId),
                this.agentState.getObjective(normalizedAgentId),
                this.agentState.getTreasury(normalizedAgentId),
                this.agentState.listOpenReservations(normalizedAgentId),
                this.agentWallet.getBalances({ owner: ownerPublicKey }),
                this.agentState.getSavedScreens(normalizedAgentId),
                this.agentState.getWatchlist(normalizedAgentId),
                this.agentState.getChatMessages(normalizedAgentId, 24),
                this.agentState.getMemorySummary(normalizedAgentId),
                this.agentState.getJournal(normalizedAgentId, 16),
                this.chainService?.isConfigured?.()
                    ? this.store.listAssets()
                    : this.store.listAssets(),
                this.chainService?.isConfigured?.()
                    ? this.store.listAssets({ owner: wallet.publicKey })
                    : this.store.listAssets({ owner: wallet.publicKey }),
                this.chainService.listSessions({ owner: wallet.publicKey }),
                this.auctionEngine?.listAuctions
                    ? this.auctionEngine.listAuctions({ status: "active" })
                    : Promise.resolve([]),
            ]);

            const productiveAssets = allAssets.filter(productiveOnly);
            const approvedClasses = new Set(mandate.approvedAssetClasses || []);
            let screened = screenAssets(productiveAssets, {
                minYield: Number(mandate.targetReturnMinPct || 0),
                maxRisk: 80,
                limit: 5,
            }).filter((candidate) => approvedClasses.has(assetClassLabel(candidate.asset)));

            // Live auctions should still be considered when yield telemetry is sparse.
            if (screened.length === 0 && activeAuctions.length > 0) {
                const liveAuctionTokenIds = new Set(
                    activeAuctions.map((auction) => Number(auction.assetId))
                );
                screened = productiveAssets
                    .filter((asset) => liveAuctionTokenIds.has(Number(asset.tokenId)))
                    .filter((asset) => approvedClasses.has(assetClassLabel(asset)))
                    .map((asset) => {
                        const yieldRate = Number(extractYieldRate(asset) || 0);
                        const riskScore = Number(estimateRiskScore(asset) || 0);
                        const score = Math.max(
                            1,
                            Math.round(
                                Math.max(0, 30 - (riskScore * 0.3))
                                + Math.min(yieldRate, 40)
                                + (asset.rentalReady ? 10 : 0)
                            )
                        );
                        return {
                            tokenId: Number(asset.tokenId),
                            name: asset.publicMetadata?.name || asset.name || `Asset #${asset.tokenId}`,
                            assetType: Number(asset.assetType || 0),
                            verificationStatus: asset.verificationStatusLabel || asset.verificationStatus || "",
                            issuer: asset.issuer,
                            jurisdiction: asset.jurisdiction,
                            yieldRate: Math.round(yieldRate * 100) / 100,
                            riskScore,
                            rentalReady: Boolean(asset.rentalReady),
                            claimableYield: asset.claimableYield,
                            score,
                            asset,
                        };
                    })
                    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
                    .slice(0, 5);
            }

            const opportunities = [];
            const complianceBlocked = [];
            for (const candidate of screened) {
                const compliance = await checkCompliance(this.chainService, {
                    walletAddress: wallet.publicKey,
                    asset: candidate.asset,
                    action: "trade",
                });
                if (compliance.allowed) {
                    opportunities.push({
                        ...candidate,
                        compliance,
                    });
                } else {
                    complianceBlocked.push({
                        tokenId: Number(candidate.tokenId),
                        reasons: compliance.reasons || [],
                    });
                }
            }

            const screenSignals = this.evaluateSavedScreens({
                savedScreens,
                productiveAssets,
                activeAuctions,
            });
            const watchlistSignals = this.evaluateWatchlistSignals({
                watchlist,
                productiveAssets,
                activeAuctions,
                mandate,
            });

            const riskAlerts = monitorRisks(ownedAssets);
            const portfolio = buildPortfolio(sessions, ownedAssets);
            const rebalanceActions = computeRebalanceActions(portfolio, productiveAssets, {
                maxPositions: Math.max(1, Math.floor(100 / Math.max(1, Number(mandate.assetCapPct || 25)))),
                maxBudgetPerPosition: Number(mandate.approvalThreshold || 250),
                minYield: Number(mandate.targetReturnMinPct || 0),
                maxRisk: 80,
            });

            const liquidity = this.buildLiquidityContext({
                walletState,
                mandate,
                reservations,
                treasury,
            });
            const cadenceSeconds = Math.max(60, Number(mandate.rebalanceCadenceMinutes || 60) * 60);
            const shouldRebalanceTreasury = Boolean(
                currentRuntime.executeTreasury
                && this.treasuryManager
                && (
                    !currentRuntime.lastRebalanceAt
                    || nowSeconds() - Number(currentRuntime.lastRebalanceAt || 0) >= cadenceSeconds
                    || liquidity.outsideTargetBand
                )
            );
            const readySettlements = activeAuctions
                .filter((auction) => Number(auction?.endTime || 0) > 0 && Number(auction.endTime) <= nowSeconds())
                .map((auction) => ({
                    auctionId: Number(auction.auctionId),
                    assetId: Number(auction.assetId),
                    highestBidder: String(auction.highestBid?.bidder || "").toUpperCase(),
                    reserveMet: Boolean(auction.reserveMet),
                }));
            const claimableAssets = currentRuntime.executeClaims !== false
                ? ownedAssets
                    .filter((asset) => BigInt(asset.claimableYield || "0") >= 10_000_000n)
                    .slice(0, 3)
                    .map((asset) => ({
                        tokenId: Number(asset.tokenId),
                        claimableYield: String(asset.claimableYield || "0"),
                        claimableYieldDisplay: toDisplayAmount(asset.claimableYield || "0"),
                    }))
                : [];

            const prioritizedAuctions = this.buildBidFocus({
                auctions: activeAuctions,
                opportunities,
                walletPublicKey: wallet.publicKey,
                mandate,
                liquidity,
                screenSignals,
                watchlistSignals,
            });
            const topBidFocusCandidate = prioritizedAuctions[0] || null;
            const noActionReason = screened.length === 0
                ? "No approved assets currently clear the active mandate floor."
                : opportunities.length === 0
                    ? "Screened assets are currently blocked by compliance guardrails."
                : prioritizedAuctions.length === 0
                    ? "No live auctions match the current objective."
                    : topBidFocusCandidate?.blockedReason || "The top live auction is outside the current guardrails.";
            const topBidFocus = topBidFocusCandidate ? {
                auctionId: Number(topBidFocusCandidate.auction.auctionId),
                assetId: Number(topBidFocusCandidate.auction.assetId),
                prioritySource: topBidFocusCandidate.prioritySource,
                preferenceScore: Number(topBidFocusCandidate.preferenceScore || 0),
                eligible: Boolean(topBidFocusCandidate.eligible),
                nextBidDisplay: topBidFocusCandidate.nextBidDisplay,
                blockedReason: topBidFocusCandidate.blockedReason || "",
                confidence: Math.min(95, Math.max(45, Math.round(Number(topBidFocusCandidate.opportunity?.score || 0)))),
            } : null;

            const compactOpportunities = opportunities.slice(0, 5).map((entry) => ({
                tokenId: Number(entry.tokenId),
                assetType: assetClassLabel(entry.asset),
                name: entry.name,
                score: Number(entry.score || 0),
                yieldRate: Number(entry.yieldRate || 0),
                riskScore: Number(entry.riskScore || 0),
            }));

            const brainContext = {
                objective,
                market: {
                    totalProductiveAssets: productiveAssets.length,
                    liveAuctionCount: activeAuctions.length,
                },
                mandate: {
                    approvedAssetClasses: mandate.approvedAssetClasses || [],
                    approvalThreshold: mandate.approvalThreshold,
                    issuerCapPct: mandate.issuerCapPct,
                    assetCapPct: mandate.assetCapPct,
                    liquidityFloorPct: mandate.liquidityFloorPct,
                    allowedTreasuryStrategies: mandate.allowedTreasuryStrategies || [],
                },
                liquidity,
                positions: {
                    ownedAssets: ownedAssets.map((asset) => ({
                        tokenId: Number(asset.tokenId),
                        claimableYield: String(asset.claimableYield || "0"),
                        verificationStatus: asset.verificationStatusLabel || asset.verificationStatus,
                    })),
                    sessionCount: Number(sessions.length || 0),
                },
                opportunities: compactOpportunities,
                bidFocus: topBidFocus,
                readySettlements,
                claimableAssets,
                screenSignals: screenSignals.slice(0, 4),
                watchlistSignals: watchlistSignals.slice(0, 4),
                riskAlerts: riskAlerts.slice(0, 4),
                rebalanceActions: rebalanceActions.slice(0, 4).map((entry) => ({
                    type: entry.type,
                    tokenId: entry.tokenId || null,
                    sessionId: entry.sessionId || null,
                })),
                shouldRebalanceTreasury,
                treasury: {
                    summary: treasury.summary || {},
                    optimization: treasury.optimization || null,
                },
                capabilities: {
                    trade: true,
                    treasury: Boolean(currentRuntime.executeTreasury),
                    claimYield: Boolean(currentRuntime.executeClaims),
                },
                noActionReason,
            };

            const decision = this.agentBrain
                ? await this.agentBrain.decide({
                    objective,
                    context: brainContext,
                    memorySummary: memorySummary.summary || "",
                    wakeReason: reason,
                })
                : {
                    proposal: {
                        actionType: "hold",
                        actionArgs: {},
                        thesis: "Autonomous brain is unavailable.",
                        rationale: noActionReason,
                        confidence: 35,
                        blockedBy: noActionReason,
                        requiresHuman: false,
                        wakeReason: reason,
                    },
                    degradedMode: true,
                    degradedReason: "Agent brain service is unavailable.",
                    provider: "",
                    model: "",
                };

            let proposal = {
                ...decision.proposal,
                blockedBy: decision.proposal?.blockedBy || "",
            };
            const validation = this.validateDecisionProposal(proposal, brainContext);
            if (!validation.valid) {
                proposal = {
                    ...proposal,
                    actionType: "hold",
                    actionArgs: {},
                    blockedBy: validation.blockedBy,
                    rationale: proposal.rationale || validation.blockedBy,
                };
            } else {
                proposal = {
                    ...proposal,
                    actionType: validation.actionType,
                    actionArgs: validation.actionArgs,
                };
            }

            const executed = await this.executeDecision({
                agentId: normalizedAgentId,
                ownerPublicKey,
                proposal,
                context: brainContext,
                currentRuntime,
                previewOnly,
            });

            const effectiveBlockedBy = String(
                proposal.blockedBy
                || executed?.details?.blockedBy
                || (executed.outcome === "skipped" && proposal.actionType !== "hold" && currentRuntime.running
                    ? `The proposed ${proposal.actionType.replace(/_/g, " ")} action was recorded but not executed.`
                    : "")
            ).trim();

            const nextAction = {
                actionType: proposal.actionType,
                actionArgs: proposal.actionArgs || {},
                previewOnly: Boolean(previewOnly || !currentRuntime.running),
            };
            const nextBrainState = await this.agentState.setBrainState(normalizedAgentId, {
                status: previewOnly || !currentRuntime.running
                    ? "planned"
                    : proposal.actionType === "hold"
                        ? "monitoring"
                        : "executing",
                currentThesis: proposal.thesis || currentBrainState.currentThesis || "",
                nextAction,
                confidence: Number(proposal.confidence || 0),
                wakeReason: reason,
                blockedBy: effectiveBlockedBy,
                degradedMode: Boolean(decision.degradedMode),
                degradedReason: decision.degradedReason || "",
                provider: decision.provider || "",
                model: decision.model || "",
                lastModelRunAt: nowSeconds(),
                lastDecisionAt: nowSeconds(),
            });

            const plannerHealthDecision = buildPlannerHealthDecision(
                currentBrainState,
                nextBrainState,
                reason,
            );
            if (plannerHealthDecision) {
                await this.agentState.appendDecision(normalizedAgentId, plannerHealthDecision);
            }

            const decisionChanged = JSON.stringify({
                thesis: nextBrainState.currentThesis,
                actionType: nextBrainState.nextAction?.actionType || "hold",
                blockedBy: nextBrainState.blockedBy || "",
                degradedMode: nextBrainState.degradedMode,
            }) !== JSON.stringify({
                thesis: currentBrainState.currentThesis,
                actionType: currentBrainState.nextAction?.actionType || "hold",
                blockedBy: currentBrainState.blockedBy || "",
                degradedMode: currentBrainState.degradedMode,
            });

            if (decisionChanged || executed.outcome === "executed") {
                const executionDetail = executed.outcome === "executed"
                    ? (
                        proposal.actionType === "bid"
                            ? [
                                `Bid ${executed.details?.amount || proposal.actionArgs?.amount || ""} USDC`,
                                executed.details?.auctionId ? `auction #${Number(executed.details.auctionId)}` : "",
                                executed.details?.assetId
                                    ? `twin #${Number(executed.details.assetId)}${executed.details?.assetName ? ` (${executed.details.assetName})` : ""}`
                                    : "",
                                executed.details?.txHash ? `tx ${String(executed.details.txHash).slice(0, 16)}...` : "",
                            ].filter(Boolean).join(" · ")
                            : proposal.actionType === "settle_auction"
                                ? [
                                    executed.details?.auctionId ? `Settled auction #${Number(executed.details.auctionId)}` : "Auction settled",
                                    executed.details?.txHash ? `tx ${String(executed.details.txHash).slice(0, 16)}...` : "",
                                ].filter(Boolean).join(" · ")
                                : ""
                    )
                    : "";
                await this.agentState.appendJournal(normalizedAgentId, {
                    kind: executed.outcome === "executed" ? "execution" : "plan",
                    message: executed.outcome === "executed"
                        ? `Executed ${proposal.actionType.replace(/_/g, " ")}`
                        : `Planned ${proposal.actionType.replace(/_/g, " ")}`,
                    detail: proposal.thesis || proposal.rationale || effectiveBlockedBy,
                    rationale: proposal.rationale || "",
                    blockedBy: effectiveBlockedBy,
                    proposedAction: proposal,
                    executedAction: executed.outcome === "executed" ? executed : null,
                    result: executed,
                    performanceImpact: executed.outcome === "executed" ? executed.details || {} : null,
                    metadata: {
                        wakeReason: reason,
                        degradedMode: Boolean(decision.degradedMode),
                    },
                });
                await this.agentState.appendDecision(normalizedAgentId, {
                    type: executed.outcome === "executed"
                        ? "decision"
                        : effectiveBlockedBy
                            ? "info"
                            : "decision",
                    message: executed.outcome === "executed"
                        ? `Autonomous agent executed ${proposal.actionType.replace(/_/g, " ")}`
                        : proposal.actionType === "hold"
                            ? "Autonomous agent held position"
                            : `Autonomous agent planned ${proposal.actionType.replace(/_/g, " ")}`,
                    detail: effectiveBlockedBy
                        || executionDetail
                        || (
                            executed.outcome === "executed"
                            && proposal.actionType === "bid"
                            && topBidFocus?.prioritySource?.length
                                ? `focus ${topBidFocus.prioritySource.join(" + ")} · ${proposal.rationale || proposal.thesis || ""}`.trim()
                                : ""
                        )
                        || proposal.rationale
                        || proposal.thesis
                        || "The planner updated the next action.",
                });
            }

            const updatedJournal = await this.agentState.getJournal(normalizedAgentId, 16);
            await this.refreshMemorySummary(normalizedAgentId, objective, updatedJournal, recentMessages);

            const opportunityFingerprint = fingerprint(
                opportunities.map((entry) => ({
                    tokenId: entry.tokenId,
                    yieldRate: entry.yieldRate,
                    riskScore: entry.riskScore,
                }))
            );
            const riskFingerprint = fingerprint(
                riskAlerts.map((entry) => ({
                    tokenId: entry.tokenId,
                    type: entry.type,
                    severity: entry.severity,
                }))
            );
            const rebalanceFingerprint = fingerprint(
                rebalanceActions.map((entry) => ({
                    type: entry.type,
                    tokenId: entry.tokenId || 0,
                    sessionId: entry.sessionId || 0,
                }))
            );
            const screenFingerprint = fingerprint(
                screenSignals.map((entry) => ({
                    screenId: entry.screenId,
                    matches: entry.matches,
                    topTokenId: entry.topTokenId,
                    topScore: entry.topScore,
                }))
            );
            const watchlistFingerprint = fingerprint(
                watchlistSignals.map((entry) => ({
                    tokenId: entry.tokenId,
                    reasons: entry.reasons,
                    hasLiveAuction: entry.hasLiveAuction,
                    severity: entry.severity,
                }))
            );

            // Always log a tick heartbeat so the owner sees the agent is alive
            await this.agentState.appendDecision(normalizedAgentId, {
                type: "info",
                message: `Tick #${Number(currentRuntime.heartbeatCount || 0) + 1} · scanned ${productiveAssets.length} assets · ${activeAuctions.length} live auction(s)`,
                detail: `${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} cleared mandate · ${riskAlerts.length} risk alert(s) · ${sessions.length} active session(s)`,
            });

            if (opportunityFingerprint !== currentRuntime.fingerprints?.opportunities) {
                const topOpportunity = opportunities[0];
                await this.agentState.appendDecision(normalizedAgentId, topOpportunity ? {
                    type: "decision",
                    message: `Top opportunity: twin #${topOpportunity.tokenId} — ${topOpportunity.asset?.publicMetadata?.name || topOpportunity.asset?.name || ""}`,
                    detail: `${Number(topOpportunity.yieldRate || 0).toFixed(2)}% yield · risk ${topOpportunity.riskScore}/100 · ${topOpportunity.asset?.publicMetadata?.location || ""}`,
                } : screened.length > 0 && complianceBlocked.length > 0 ? {
                    type: "info",
                    message: "Market scan complete — opportunities blocked by compliance",
                    detail: complianceBlocked
                        .slice(0, 2)
                        .map((entry) => `#${entry.tokenId}: ${(entry.reasons || []).join("; ") || "blocked"}`)
                        .join(" · "),
                } : {
                    type: "info",
                    message: "Market scan complete — no opportunities cleared mandate floor",
                    detail: `Mandate requires ≥${mandate.targetReturnMinPct || 0}% yield · approved classes: ${(mandate.approvedAssetClasses || []).join(", ")}`,
                });
            }

            if (riskFingerprint !== currentRuntime.fingerprints?.risks) {
                for (const alert of riskAlerts.slice(0, 3)) {
                    await this.agentState.appendDecision(normalizedAgentId, {
                        type: "error",
                        message: alert.message,
                        detail: `Severity: ${alert.severity} · Runtime ${reason}`,
                    });
                }
            }

            if (rebalanceFingerprint !== currentRuntime.fingerprints?.rebalance && rebalanceActions.length > 0) {
                await this.agentState.appendDecision(normalizedAgentId, {
                    type: "decision",
                    message: `Rebalance review generated ${rebalanceActions.length} action(s)`,
                    detail: rebalanceActions
                        .slice(0, 3)
                        .map((entry) => `${entry.type} ${entry.tokenId ? `#${entry.tokenId}` : `session ${entry.sessionId}`}`)
                        .join(" · "),
                });
            }

            if (screenFingerprint !== currentRuntime.fingerprints?.screens && savedScreens.length > 0) {
                const topScreen = screenSignals.find((entry) => entry.matches > 0) || null;
                await this.agentState.appendDecision(normalizedAgentId, topScreen ? {
                    type: "decision",
                    message: `Saved screen resurfaced ${topScreen.matches} shortlist match(es)`,
                    detail: `${topScreen.name} · top twin #${topScreen.topTokenId} · score ${topScreen.topScore}`,
                } : {
                    type: "info",
                    message: "Saved screens refreshed",
                    detail: "No saved screen currently has a live shortlist match.",
                });
            }

            if (watchlistFingerprint !== currentRuntime.fingerprints?.watchlist && watchlist.length > 0) {
                for (const signal of watchlistSignals.slice(0, 3)) {
                    await this.agentState.appendDecision(normalizedAgentId, {
                        type: signal.severity === "high" ? "error" : "info",
                        message: `Watchlist signal on twin #${signal.tokenId}`,
                        detail: `${signal.name} · ${signal.reasons.join(" · ")} · yield ${signal.yieldRate.toFixed(2)}% · risk ${signal.riskScore}/100`,
                    });
                }
            }

            const runtime = await this.agentState.setRuntime(normalizedAgentId, {
                status: currentRuntime.running ? "running" : currentRuntime.status || "idle",
                running: currentRuntime.running,
                lastTickAt: nowSeconds(),
                lastScreenedAt: nowSeconds(),
                lastRebalanceAt: executed.outcome === "executed" && ["rebalance_treasury", "route_yield"].includes(proposal.actionType)
                    ? nowSeconds()
                    : currentRuntime.lastRebalanceAt,
                nextTickAt,
                lastError: "",
                lastErrorAt: 0,
                heartbeatCount: Number(currentRuntime.heartbeatCount || 0) + 1,
                lastSummary: {
                    opportunities: opportunities.length,
                    riskAlerts: riskAlerts.length,
                    rebalanceActions: rebalanceActions.length,
                    autoClaims: executed.outcome === "executed" && ["claim_yield", "route_yield"].includes(proposal.actionType) ? 1 : 0,
                    autoBids: executed.outcome === "executed" && proposal.actionType === "bid" ? 1 : 0,
                    settledAuctions: executed.outcome === "executed" && proposal.actionType === "settle_auction" ? 1 : 0,
                    treasuryExecuted: executed.outcome === "executed" && ["rebalance_treasury", "route_yield"].includes(proposal.actionType),
                    screenMatches: screenSignals.reduce((sum, entry) => sum + Number(entry.matches || 0), 0),
                    watchlistSignals: watchlistSignals.length,
                    screenHighlights: screenSignals.filter((entry) => entry.matches > 0).slice(0, 3),
                    watchlistHighlights: watchlistSignals.slice(0, 3),
                    bidFocus: topBidFocus,
                    plannedAction: nextAction,
                    blockedBy: effectiveBlockedBy,
                    degradedMode: Boolean(decision.degradedMode),
                    wakeReason: reason,
                },
                fingerprints: {
                    opportunities: opportunityFingerprint,
                    risks: riskFingerprint,
                    rebalance: rebalanceFingerprint,
                    screens: screenFingerprint,
                    watchlist: watchlistFingerprint,
                },
            });

            return {
                runtime,
                brain: nextBrainState,
                objective,
                journalPreview: updatedJournal.slice(0, 8),
                opportunities: compactOpportunities,
                screenSignals,
                watchlistSignals,
                riskAlerts,
                rebalanceActions,
                liquidity,
                executed,
                portfolio: portfolio.summary,
            };
        } catch (error) {
            const runtime = await this.agentState.setRuntime(normalizedAgentId, {
                status: currentRuntime.running ? "running" : currentRuntime.status || "idle",
                running: currentRuntime.running,
                lastTickAt: nowSeconds(),
                nextTickAt,
                lastError: error.message || "Runtime tick failed",
                lastErrorAt: nowSeconds(),
                heartbeatCount: Number(currentRuntime.heartbeatCount || 0) + 1,
            });
            const brain = await this.agentState.setBrainState(normalizedAgentId, {
                status: "error",
                blockedBy: error.message || "Runtime tick failed",
                wakeReason: reason,
                lastModelRunAt: nowSeconds(),
            });
            await this.agentState.appendJournal(normalizedAgentId, {
                kind: "error",
                message: "Autonomous runtime tick failed",
                detail: error.message || "Unknown runtime error",
                blockedBy: error.message || "Unknown runtime error",
                result: { outcome: "error" },
                metadata: { wakeReason: reason },
            });
            await this.agentState.appendDecision(normalizedAgentId, {
                type: "error",
                message: "Autonomous runtime tick failed",
                detail: error.message || "Unknown runtime error",
            });
            return {
                runtime,
                brain,
                objective: await this.agentState.getObjective(normalizedAgentId),
                journalPreview: await this.agentState.getJournal(normalizedAgentId, 8),
                opportunities: [],
                screenSignals: [],
                watchlistSignals: [],
                riskAlerts: [],
                rebalanceActions: [],
                executed: null,
                portfolio: null,
            };
        }
    }
}

module.exports = {
    AgentRuntimeService,
    buildPlannerHealthDecision,
};
