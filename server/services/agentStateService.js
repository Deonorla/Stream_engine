function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function agentKey(agentId, suffix = "") {
    return suffix
        ? `continuum:agent:${String(agentId).toUpperCase()}:${suffix}`
        : `continuum:agent:${String(agentId).toUpperCase()}`;
}

function defaultRuntime(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        status: "idle",
        running: false,
        executeTreasury: false,
        executeClaims: true,
        heartbeatCount: 0,
        startedAt: 0,
        pausedAt: 0,
        lastTickAt: 0,
        lastScreenedAt: 0,
        lastRebalanceAt: 0,
        nextTickAt: 0,
        lastError: "",
        lastErrorAt: 0,
        lastSummary: {
            opportunities: 0,
            riskAlerts: 0,
            rebalanceActions: 0,
            autoClaims: 0,
            autoBids: 0,
            settledAuctions: 0,
            treasuryExecuted: false,
            screenMatches: 0,
            watchlistSignals: 0,
            screenHighlights: [],
            watchlistHighlights: [],
            bidFocus: null,
            plannedAction: null,
            blockedBy: "",
            degradedMode: false,
            wakeReason: "",
        },
        fingerprints: {
            opportunities: "",
            risks: "",
            rebalance: "",
            screens: "",
            watchlist: "",
        },
        updatedAt: nowSeconds(),
    };
}

function ownerKey(ownerPublicKey) {
    return `continuum:owner:${String(ownerPublicKey).toUpperCase()}:agent`;
}

const AGENT_INDEX_KEY = "continuum:agents:index";

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringAmount(value, fallback = "0") {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    return String(value);
}

function normalizeStringList(values, fallback = []) {
    if (!Array.isArray(values) || values.length === 0) {
        return [...fallback];
    }
    return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function defaultPerformance(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        realizedYield: "0",
        treasuryReturn: "0",
        realizedTradePnL: "0",
        paidActionFees: "0",
        netPnL: "0",
        drawdown: "0",
        auctionWins: 0,
        auctionLosses: 0,
        defiMetrics: {
            txCount: 0,
            bidsPlaced: 0,
            auctionsSettled: 0,
            buyCount: 0,
            sellCount: 0,
            claimCount: 0,
            treasuryActions: 0,
            feeActions: 0,
            bidVolume: "0",
            buyVolume: "0",
            sellVolume: "0",
            volumeTradedGross: "0",
            yieldClaimedVolume: "0",
            treasuryRoutedVolume: "0",
            feeVolume: "0",
            tradedTokenIds: [],
            uniqueAssetsTraded: 0,
            activeDayKeys: [],
            activeDays: 0,
            lastActiveDay: "",
            participationScore: 0,
            costBasisByToken: {},
            realizedTradePnL: "0",
        },
        attribution: {
            yieldContribution: "0",
            treasuryContribution: "0",
            tradeContribution: "0",
            feeDrag: "0",
            grossPositivePnL: "0",
            netPnL: "0",
            auctionWins: 0,
            auctionLosses: 0,
            totalAuctionOutcomes: 0,
            winRatePct: 0,
        },
        recentEvents: [],
        updatedAt: nowSeconds(),
    };
}

function buildPerformanceEvent({
    category = "info",
    label = "",
    amount = "",
    direction = "neutral",
    metadata = {},
}) {
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        ts: Date.now(),
        category,
        label,
        amount: amount === undefined || amount === null || amount === "" ? "" : toStringAmount(amount),
        direction,
        metadata,
    };
}

function normalizePerformance(agentId, current = {}) {
    const base = defaultPerformance(agentId);
    const rawMetrics = current.defiMetrics && typeof current.defiMetrics === "object"
        ? current.defiMetrics
        : {};
    const tradedTokenIds = Array.isArray(rawMetrics.tradedTokenIds)
        ? Array.from(new Set(rawMetrics.tradedTokenIds.map((tokenId) => String(tokenId).trim()).filter(Boolean)))
        : [];
    const activeDayKeys = Array.isArray(rawMetrics.activeDayKeys)
        ? Array.from(new Set(rawMetrics.activeDayKeys.map((day) => String(day).trim()).filter(Boolean)))
        : [];
    const costBasisByToken = rawMetrics.costBasisByToken && typeof rawMetrics.costBasisByToken === "object"
        ? Object.entries(rawMetrics.costBasisByToken).reduce((acc, [tokenId, amount]) => {
            const key = String(tokenId || "").trim();
            if (!key) return acc;
            acc[key] = toStringAmount(amount, "0");
            return acc;
        }, {})
        : {};
    const normalizedMetrics = {
        ...base.defiMetrics,
        ...rawMetrics,
        txCount: Number(rawMetrics.txCount ?? base.defiMetrics.txCount),
        bidsPlaced: Number(rawMetrics.bidsPlaced ?? base.defiMetrics.bidsPlaced),
        auctionsSettled: Number(rawMetrics.auctionsSettled ?? base.defiMetrics.auctionsSettled),
        buyCount: Number(rawMetrics.buyCount ?? base.defiMetrics.buyCount),
        sellCount: Number(rawMetrics.sellCount ?? base.defiMetrics.sellCount),
        claimCount: Number(rawMetrics.claimCount ?? base.defiMetrics.claimCount),
        treasuryActions: Number(rawMetrics.treasuryActions ?? base.defiMetrics.treasuryActions),
        feeActions: Number(rawMetrics.feeActions ?? base.defiMetrics.feeActions),
        bidVolume: toStringAmount(rawMetrics.bidVolume, base.defiMetrics.bidVolume),
        buyVolume: toStringAmount(rawMetrics.buyVolume, base.defiMetrics.buyVolume),
        sellVolume: toStringAmount(rawMetrics.sellVolume, base.defiMetrics.sellVolume),
        volumeTradedGross: toStringAmount(rawMetrics.volumeTradedGross, base.defiMetrics.volumeTradedGross),
        yieldClaimedVolume: toStringAmount(rawMetrics.yieldClaimedVolume, base.defiMetrics.yieldClaimedVolume),
        treasuryRoutedVolume: toStringAmount(rawMetrics.treasuryRoutedVolume, base.defiMetrics.treasuryRoutedVolume),
        feeVolume: toStringAmount(rawMetrics.feeVolume, base.defiMetrics.feeVolume),
        tradedTokenIds,
        uniqueAssetsTraded: Number(rawMetrics.uniqueAssetsTraded ?? tradedTokenIds.length),
        activeDayKeys,
        activeDays: Number(rawMetrics.activeDays ?? activeDayKeys.length),
        lastActiveDay: String(rawMetrics.lastActiveDay || activeDayKeys[activeDayKeys.length - 1] || ""),
        participationScore: Number(rawMetrics.participationScore ?? 0),
        costBasisByToken,
        realizedTradePnL: toStringAmount(
            rawMetrics.realizedTradePnL,
            current.realizedTradePnL ?? base.defiMetrics.realizedTradePnL,
        ),
    };
    return {
        ...base,
        ...current,
        agentId: String(agentId).toUpperCase(),
        realizedTradePnL: toStringAmount(current.realizedTradePnL, base.realizedTradePnL),
        auctionWins: Number(current.auctionWins ?? base.auctionWins),
        auctionLosses: Number(current.auctionLosses ?? base.auctionLosses),
        defiMetrics: normalizedMetrics,
        attribution: {
            ...base.attribution,
            ...(current.attribution || {}),
            auctionWins: Number(current.attribution?.auctionWins ?? current.auctionWins ?? base.attribution.auctionWins),
            auctionLosses: Number(current.attribution?.auctionLosses ?? current.auctionLosses ?? base.attribution.auctionLosses),
        },
        recentEvents: Array.isArray(current.recentEvents) ? current.recentEvents.slice(-20) : [],
    };
}

function finalizePerformance(agentId, performance = {}) {
    const current = normalizePerformance(agentId, performance);
    const realizedYield = BigInt(current.realizedYield || "0");
    const treasuryReturn = BigInt(current.treasuryReturn || "0");
    const tradePnL = BigInt(current.realizedTradePnL || current.defiMetrics?.realizedTradePnL || "0");
    const paidActionFees = BigInt(current.paidActionFees || "0");
    const grossPositivePnL = realizedYield + treasuryReturn + (tradePnL > 0n ? tradePnL : 0n);
    const netPnL = realizedYield + treasuryReturn + tradePnL - paidActionFees;
    const auctionWins = Number(current.auctionWins || 0);
    const auctionLosses = Number(current.auctionLosses || 0);
    const totalAuctionOutcomes = auctionWins + auctionLosses;
    const winRatePct = totalAuctionOutcomes > 0
        ? Number(((auctionWins / totalAuctionOutcomes) * 100).toFixed(1))
        : 0;
    const defiMetrics = {
        ...(current.defiMetrics || {}),
    };
    const bidVolume = BigInt(defiMetrics.bidVolume || "0");
    const buyVolume = BigInt(defiMetrics.buyVolume || "0");
    const sellVolume = BigInt(defiMetrics.sellVolume || "0");
    const tradedTokenIds = Array.isArray(defiMetrics.tradedTokenIds)
        ? Array.from(new Set(defiMetrics.tradedTokenIds.map((tokenId) => String(tokenId).trim()).filter(Boolean)))
        : [];
    const activeDayKeys = Array.isArray(defiMetrics.activeDayKeys)
        ? Array.from(new Set(defiMetrics.activeDayKeys.map((day) => String(day).trim()).filter(Boolean)))
        : [];
    const grossTradeVolume = buyVolume + sellVolume;
    const participationScore = Number(
        Number(defiMetrics.txCount || 0) * 5
        + tradedTokenIds.length * 20
        + Number(grossTradeVolume / 10_000_000n)
    );

    return {
        ...current,
        realizedYield: realizedYield.toString(),
        treasuryReturn: treasuryReturn.toString(),
        realizedTradePnL: tradePnL.toString(),
        paidActionFees: paidActionFees.toString(),
        netPnL: netPnL.toString(),
        defiMetrics: {
            ...defiMetrics,
            bidVolume: bidVolume.toString(),
            buyVolume: buyVolume.toString(),
            sellVolume: sellVolume.toString(),
            volumeTradedGross: grossTradeVolume.toString(),
            tradedTokenIds,
            uniqueAssetsTraded: tradedTokenIds.length,
            activeDayKeys,
            activeDays: activeDayKeys.length,
            lastActiveDay: String(defiMetrics.lastActiveDay || activeDayKeys[activeDayKeys.length - 1] || ""),
            participationScore: Number.isFinite(participationScore) ? participationScore : 0,
            realizedTradePnL: tradePnL.toString(),
        },
        attribution: {
            ...current.attribution,
            yieldContribution: realizedYield.toString(),
            treasuryContribution: treasuryReturn.toString(),
            tradeContribution: tradePnL.toString(),
            feeDrag: paidActionFees.toString(),
            grossPositivePnL: grossPositivePnL.toString(),
            netPnL: netPnL.toString(),
            auctionWins,
            auctionLosses,
            totalAuctionOutcomes,
            winRatePct,
        },
        recentEvents: current.recentEvents.slice(-20),
        updatedAt: nowSeconds(),
    };
}

function appendRecentEvent(performance, event) {
    return [...(Array.isArray(performance.recentEvents) ? performance.recentEvents : []), event].slice(-20);
}

function addStringAmounts(left = "0", right = "0") {
    return (BigInt(toStringAmount(left, "0")) + BigInt(toStringAmount(right, "0"))).toString();
}

function markDefiActivity(metrics = {}, tokenId = null) {
    const dayKey = new Date().toISOString().slice(0, 10);
    const activeDayKeys = Array.isArray(metrics.activeDayKeys)
        ? Array.from(new Set([...(metrics.activeDayKeys || []), dayKey]))
        : [dayKey];
    const tradedTokenIds = Number(tokenId) > 0
        ? Array.from(new Set([...(Array.isArray(metrics.tradedTokenIds) ? metrics.tradedTokenIds : []), String(Number(tokenId))]))
        : (Array.isArray(metrics.tradedTokenIds) ? Array.from(new Set(metrics.tradedTokenIds)) : []);
    return {
        ...metrics,
        txCount: Number(metrics.txCount || 0) + 1,
        activeDayKeys,
        activeDays: activeDayKeys.length,
        lastActiveDay: dayKey,
        tradedTokenIds,
        uniqueAssetsTraded: tradedTokenIds.length,
    };
}

function defaultMandate(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        capitalBase: "1000",
        approvedAssetClasses: ["real_estate", "land"],
        issuerCapPct: 65,
        assetCapPct: 40,
        liquidityFloorPct: 5,
        allowedTreasuryStrategies: ["safe_yield", "blend_lending", "stellar_amm"],
        maxDrawdownPct: 25,
        approvalThreshold: "400",
        targetReturnMinPct: 5,
        targetReturnMaxPct: 25,
        jurisdictions: [],
        rentalUseRule: "human_approval_required",
        rebalanceCadenceMinutes: 180,
        investmentHorizonDays: 90,
        reservePolicy: {
            minLiquidPct: 5,
            targetLiquidPct: 25,
            maxLiquidPct: 50,
        },
        updatedAt: nowSeconds(),
    };
}

function defaultObjective(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        goal: "Grow capital safely through productive RWA opportunities.",
        style: "balanced",
        instructions: "",
        updatedAt: nowSeconds(),
    };
}

function mergeObjective(agentId, payload = {}, current = defaultObjective(agentId)) {
    return {
        ...current,
        agentId: String(agentId).toUpperCase(),
        goal: String(payload.goal ?? current.goal ?? "").trim() || current.goal,
        style: String(payload.style ?? current.style ?? "balanced").trim() || "balanced",
        instructions: String(payload.instructions ?? current.instructions ?? "").trim(),
        updatedAt: nowSeconds(),
    };
}

function defaultBrainState(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        status: "idle",
        currentThesis: "",
        nextAction: null,
        confidence: 0,
        wakeReason: "",
        blockedBy: "",
        degradedMode: false,
        degradedReason: "",
        provider: "",
        model: "",
        lastModelRunAt: 0,
        lastDecisionAt: 0,
        updatedAt: nowSeconds(),
    };
}

function defaultJournal(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        entries: [],
        updatedAt: nowSeconds(),
    };
}

function defaultChatHistory(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        messages: [],
        updatedAt: nowSeconds(),
    };
}

function defaultMemorySummary(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        summary: "",
        sourceCount: 0,
        updatedAt: nowSeconds(),
    };
}

function defaultSavedScreens(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        screens: [],
        updatedAt: nowSeconds(),
    };
}

function defaultWatchlist(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        assets: [],
        updatedAt: nowSeconds(),
    };
}

function mergeMandate(agentId, payload = {}, current = defaultMandate(agentId)) {
    const next = {
        ...current,
        capitalBase: toStringAmount(payload.capitalBase, current.capitalBase),
        approvedAssetClasses: normalizeStringList(
            payload.approvedAssetClasses,
            current.approvedAssetClasses,
        ),
        issuerCapPct: toNumber(payload.issuerCapPct, current.issuerCapPct),
        assetCapPct: toNumber(payload.assetCapPct, current.assetCapPct),
        liquidityFloorPct: toNumber(payload.liquidityFloorPct, current.liquidityFloorPct),
        allowedTreasuryStrategies: normalizeStringList(
            payload.allowedTreasuryStrategies,
            current.allowedTreasuryStrategies,
        ),
        maxDrawdownPct: toNumber(payload.maxDrawdownPct, current.maxDrawdownPct),
        approvalThreshold: toStringAmount(payload.approvalThreshold, current.approvalThreshold),
        targetReturnMinPct: toNumber(payload.targetReturnMinPct, current.targetReturnMinPct),
        targetReturnMaxPct: toNumber(payload.targetReturnMaxPct, current.targetReturnMaxPct),
        jurisdictions: normalizeStringList(payload.jurisdictions, current.jurisdictions),
        rentalUseRule: String(payload.rentalUseRule || current.rentalUseRule || "human_approval_required"),
        rebalanceCadenceMinutes: toNumber(
            payload.rebalanceCadenceMinutes,
            current.rebalanceCadenceMinutes,
        ),
        investmentHorizonDays: toNumber(
            payload.investmentHorizonDays,
            current.investmentHorizonDays,
        ),
        reservePolicy: {
            minLiquidPct: toNumber(
                payload.reservePolicy?.minLiquidPct,
                current.reservePolicy?.minLiquidPct ?? 10,
            ),
            targetLiquidPct: toNumber(
                payload.reservePolicy?.targetLiquidPct,
                current.reservePolicy?.targetLiquidPct ?? 20,
            ),
            maxLiquidPct: toNumber(
                payload.reservePolicy?.maxLiquidPct,
                current.reservePolicy?.maxLiquidPct ?? 30,
            ),
        },
        updatedAt: nowSeconds(),
    };

    next.agentId = String(agentId).toUpperCase();
    return next;
}

class AgentStateService {
    constructor(config = {}) {
        this.store = config.store;
    }

    async ensureAgentProfile({ ownerPublicKey, agentPublicKey }) {
        const agentId = String(agentPublicKey || "").toUpperCase();
        if (!agentId) {
            throw Object.assign(new Error("agentPublicKey is required"), { status: 400 });
        }
        const existing = await this.getAgentProfile(agentId);
        if (existing) {
            if (ownerPublicKey) {
                await this.store.upsertRecord(ownerKey(ownerPublicKey), {
                    agentId,
                    ownerPublicKey: String(ownerPublicKey).toUpperCase(),
                    updatedAt: nowSeconds(),
                });
            }
            await this.trackAgentId(agentId);
            return existing;
        }

        const profile = {
            agentId,
            ownerPublicKey: String(ownerPublicKey || "").toUpperCase(),
            agentPublicKey: agentId,
            createdAt: nowSeconds(),
            updatedAt: nowSeconds(),
            status: "active",
        };
        await this.store.upsertRecord(agentKey(agentId), profile);
        if (ownerPublicKey) {
            await this.store.upsertRecord(ownerKey(ownerPublicKey), {
                agentId,
                ownerPublicKey: String(ownerPublicKey).toUpperCase(),
                updatedAt: nowSeconds(),
            });
        }
        await this.trackAgentId(agentId);
        const mandate = defaultMandate(agentId);
        await this.store.upsertRecord(agentKey(agentId, "mandate"), mandate);
        await this.store.upsertRecord(agentKey(agentId, "performance"), {
            ...defaultPerformance(agentId),
        });
        await this.store.upsertRecord(agentKey(agentId, "decision-log"), { entries: [] });
        await this.store.upsertRecord(agentKey(agentId, "reservations"), { reservations: [] });
        await this.store.upsertRecord(agentKey(agentId, "treasury"), {
            positions: [],
            reservePolicy: mandate.reservePolicy,
            updatedAt: nowSeconds(),
        });
        await this.store.upsertRecord(agentKey(agentId, "screens"), defaultSavedScreens(agentId));
        await this.store.upsertRecord(agentKey(agentId, "watchlist"), defaultWatchlist(agentId));
        await this.store.upsertRecord(agentKey(agentId, "runtime"), defaultRuntime(agentId));
        await this.store.upsertRecord(agentKey(agentId, "objective"), defaultObjective(agentId));
        await this.store.upsertRecord(agentKey(agentId, "brain"), defaultBrainState(agentId));
        await this.store.upsertRecord(agentKey(agentId, "journal"), defaultJournal(agentId));
        await this.store.upsertRecord(agentKey(agentId, "chat"), defaultChatHistory(agentId));
        await this.store.upsertRecord(agentKey(agentId, "memory-summary"), defaultMemorySummary(agentId));
        return profile;
    }

    async trackAgentId(agentId) {
        const normalizedAgentId = String(agentId || "").toUpperCase();
        if (!normalizedAgentId) {
            return [];
        }
        const index = await this.store.getRecord(AGENT_INDEX_KEY) || { agentIds: [] };
        const currentIds = Array.isArray(index.agentIds) ? index.agentIds : [];
        const nextIds = Array.from(new Set([
            ...currentIds.map((entry) => String(entry || "").toUpperCase()).filter(Boolean),
            normalizedAgentId,
        ]));
        await this.store.upsertRecord(AGENT_INDEX_KEY, {
            agentIds: nextIds,
            updatedAt: nowSeconds(),
        });
        return nextIds;
    }

    async listAgentIds() {
        const index = await this.store.getRecord(AGENT_INDEX_KEY);
        const indexedIds = Array.isArray(index?.agentIds)
            ? Array.from(new Set(index.agentIds.map((entry) => String(entry || "").toUpperCase()).filter(Boolean)))
            : [];
        if (indexedIds.length > 0) {
            return indexedIds;
        }
        if (typeof this.store.listRecordsByPrefix !== "function") {
            return [];
        }
        const records = await this.store.listRecordsByPrefix("continuum:agent:");
        const scannedIds = records
            .filter((entry) => /^continuum:agent:[^:]+$/.test(String(entry?.key || "")))
            .map((entry) => String(entry?.payload?.agentId || String(entry.key).split(":").pop() || "").toUpperCase())
            .filter(Boolean);
        const uniqueIds = Array.from(new Set(scannedIds));
        if (uniqueIds.length > 0) {
            await this.store.upsertRecord(AGENT_INDEX_KEY, {
                agentIds: uniqueIds,
                updatedAt: nowSeconds(),
            });
        }
        return uniqueIds;
    }

    async getParticipationSnapshot(limit = 5) {
        const agentIds = await this.listAgentIds();
        if (agentIds.length === 0) {
            return {
                leaderboard: [],
                totals: {
                    trackedAgents: 0,
                    activeAgents: 0,
                    totalTxCount: 0,
                    totalParticipationScore: 0,
                    totalVolumeTradedGross: "0",
                    totalYieldClaimedVolume: "0",
                    totalNetPnL: "0",
                },
            };
        }

        const entries = (await Promise.all(agentIds.map(async (id) => {
            const [profile, performance] = await Promise.all([
                this.getAgentProfile(id),
                this.getPerformance(id),
            ]);
            if (!profile || !performance) {
                return null;
            }
            const metrics = performance.defiMetrics || {};
            return {
                agentId: String(profile.agentId || id).toUpperCase(),
                ownerPublicKey: String(profile.ownerPublicKey || "").toUpperCase(),
                agentPublicKey: String(profile.agentPublicKey || profile.agentId || id).toUpperCase(),
                participationScore: Number(metrics.participationScore || 0),
                txCount: Number(metrics.txCount || 0),
                bidsPlaced: Number(metrics.bidsPlaced || 0),
                buyCount: Number(metrics.buyCount || 0),
                sellCount: Number(metrics.sellCount || 0),
                activeDays: Number(metrics.activeDays || 0),
                uniqueAssetsTraded: Number(metrics.uniqueAssetsTraded || 0),
                volumeTradedGross: toStringAmount(metrics.volumeTradedGross, "0"),
                yieldClaimedVolume: toStringAmount(metrics.yieldClaimedVolume, "0"),
                netPnL: toStringAmount(performance.netPnL, "0"),
                realizedTradePnL: toStringAmount(performance.realizedTradePnL, "0"),
                realizedYield: toStringAmount(performance.realizedYield, "0"),
                treasuryReturn: toStringAmount(performance.treasuryReturn, "0"),
                auctionWins: Number(performance.auctionWins || 0),
                auctionLosses: Number(performance.auctionLosses || 0),
                lastActiveDay: String(metrics.lastActiveDay || ""),
            };
        }))).filter(Boolean);

        const sorted = entries.sort((left, right) => {
            if (Number(right.participationScore || 0) !== Number(left.participationScore || 0)) {
                return Number(right.participationScore || 0) - Number(left.participationScore || 0);
            }
            if (Number(right.txCount || 0) !== Number(left.txCount || 0)) {
                return Number(right.txCount || 0) - Number(left.txCount || 0);
            }
            const volumeDelta = BigInt(right.volumeTradedGross || "0") - BigInt(left.volumeTradedGross || "0");
            if (volumeDelta !== 0n) {
                return volumeDelta > 0n ? 1 : -1;
            }
            const pnlDelta = BigInt(right.netPnL || "0") - BigInt(left.netPnL || "0");
            if (pnlDelta !== 0n) {
                return pnlDelta > 0n ? 1 : -1;
            }
            return String(left.agentId).localeCompare(String(right.agentId));
        });

        const leaderboard = sorted.slice(0, Math.max(1, Number(limit) || 5)).map((entry, index) => ({
            ...entry,
            rank: index + 1,
        }));

        const totals = entries.reduce((acc, entry) => ({
            trackedAgents: acc.trackedAgents + 1,
            activeAgents: acc.activeAgents + (entry.txCount > 0 ? 1 : 0),
            totalTxCount: acc.totalTxCount + Number(entry.txCount || 0),
            totalParticipationScore: acc.totalParticipationScore + Number(entry.participationScore || 0),
            totalVolumeTradedGross: addStringAmounts(acc.totalVolumeTradedGross, entry.volumeTradedGross || "0"),
            totalYieldClaimedVolume: addStringAmounts(acc.totalYieldClaimedVolume, entry.yieldClaimedVolume || "0"),
            totalNetPnL: addStringAmounts(acc.totalNetPnL, entry.netPnL || "0"),
        }), {
            trackedAgents: 0,
            activeAgents: 0,
            totalTxCount: 0,
            totalParticipationScore: 0,
            totalVolumeTradedGross: "0",
            totalYieldClaimedVolume: "0",
            totalNetPnL: "0",
        });

        return {
            leaderboard,
            totals,
        };
    }

    async getAgentProfile(agentId) {
        return this.store.getRecord(agentKey(agentId));
    }

    async getAgentProfileByOwner(ownerPublicKey) {
        const ownerRecord = await this.store.getRecord(ownerKey(ownerPublicKey));
        if (!ownerRecord?.agentId) {
            return null;
        }
        return this.getAgentProfile(ownerRecord.agentId);
    }

    async getMandate(agentId) {
        const mandate = await this.store.getRecord(agentKey(agentId, "mandate"));
        return mandate || defaultMandate(agentId);
    }

    async getObjective(agentId) {
        const objective = await this.store.getRecord(agentKey(agentId, "objective"));
        return objective || defaultObjective(agentId);
    }

    async setObjective(agentId, payload = {}) {
        const current = await this.getObjective(agentId);
        const next = mergeObjective(agentId, payload, current);
        await this.store.upsertRecord(agentKey(agentId, "objective"), next);
        return next;
    }

    async getBrainState(agentId) {
        return (await this.store.getRecord(agentKey(agentId, "brain"))) || defaultBrainState(agentId);
    }

    async setBrainState(agentId, brain = {}) {
        const next = {
            ...(await this.getBrainState(agentId)),
            ...brain,
            agentId: String(agentId).toUpperCase(),
            updatedAt: nowSeconds(),
        };
        await this.store.upsertRecord(agentKey(agentId, "brain"), next);
        return next;
    }

    async getJournal(agentId, limit = 50) {
        const journal = await this.store.getRecord(agentKey(agentId, "journal"));
        const entries = Array.isArray(journal?.entries) ? journal.entries : [];
        return entries.slice(-Math.max(1, Number(limit) || 50)).reverse();
    }

    async appendJournal(agentId, entry = {}) {
        const journal = await this.store.getRecord(agentKey(agentId, "journal")) || defaultJournal(agentId);
        const nextEntry = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            ts: Date.now(),
            kind: entry.kind || "observation",
            message: entry.message || "",
            detail: entry.detail || "",
            rationale: entry.rationale || "",
            blockedBy: entry.blockedBy || "",
            proposedAction: entry.proposedAction || null,
            executedAction: entry.executedAction || null,
            result: entry.result || null,
            performanceImpact: entry.performanceImpact || null,
            metadata: entry.metadata || {},
        };
        journal.entries = [...(Array.isArray(journal.entries) ? journal.entries : []), nextEntry].slice(-200);
        journal.updatedAt = nowSeconds();
        await this.store.upsertRecord(agentKey(agentId, "journal"), journal);
        return nextEntry;
    }

    async getChatMessages(agentId, limit = 30) {
        const chat = await this.store.getRecord(agentKey(agentId, "chat"));
        const messages = Array.isArray(chat?.messages) ? chat.messages : [];
        return messages.slice(-Math.max(1, Number(limit) || 30));
    }

    async appendChatMessage(agentId, message = {}) {
        const chat = await this.store.getRecord(agentKey(agentId, "chat")) || defaultChatHistory(agentId);
        const nextMessage = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            ts: Date.now(),
            role: message.role || "assistant",
            content: message.content || "",
            metadata: message.metadata || {},
        };
        chat.messages = [...(Array.isArray(chat.messages) ? chat.messages : []), nextMessage].slice(-80);
        chat.updatedAt = nowSeconds();
        await this.store.upsertRecord(agentKey(agentId, "chat"), chat);
        return nextMessage;
    }

    async getMemorySummary(agentId) {
        return (await this.store.getRecord(agentKey(agentId, "memory-summary"))) || defaultMemorySummary(agentId);
    }

    async setMemorySummary(agentId, payload = {}) {
        const next = {
            ...(await this.getMemorySummary(agentId)),
            ...payload,
            agentId: String(agentId).toUpperCase(),
            updatedAt: nowSeconds(),
        };
        await this.store.upsertRecord(agentKey(agentId, "memory-summary"), next);
        return next;
    }

    async getSavedScreens(agentId) {
        const record = await this.store.getRecord(agentKey(agentId, "screens"));
        const screens = Array.isArray(record?.screens) ? record.screens : [];
        return screens
            .map((screen) => ({ ...screen }))
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
    }

    async saveScreen(agentId, payload = {}) {
        const record = await this.store.getRecord(agentKey(agentId, "screens")) || defaultSavedScreens(agentId);
        const screens = Array.isArray(record.screens) ? record.screens : [];
        const now = nowSeconds();
        const screenId = String(payload.screenId || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
        const nextScreen = {
            screenId,
            name: String(payload.name || "Saved Screen").trim() || "Saved Screen",
            description: String(payload.description || "").trim(),
            filters: { ...(payload.filters || {}) },
            summary: { ...(payload.summary || {}) },
            createdAt: Number(payload.createdAt || now),
            updatedAt: now,
        };
        const index = screens.findIndex((screen) => String(screen.screenId) === screenId);
        if (index >= 0) {
            screens[index] = {
                ...screens[index],
                ...nextScreen,
                createdAt: Number(screens[index].createdAt || now),
            };
        } else {
            screens.push(nextScreen);
        }
        record.agentId = String(agentId).toUpperCase();
        record.screens = screens.slice(-20);
        record.updatedAt = now;
        await this.store.upsertRecord(agentKey(agentId, "screens"), record);
        return nextScreen;
    }

    async deleteSavedScreen(agentId, screenId) {
        const record = await this.store.getRecord(agentKey(agentId, "screens")) || defaultSavedScreens(agentId);
        const screens = Array.isArray(record.screens) ? record.screens : [];
        const nextScreens = screens.filter((screen) => String(screen.screenId) !== String(screenId));
        record.agentId = String(agentId).toUpperCase();
        record.screens = nextScreens;
        record.updatedAt = nowSeconds();
        await this.store.upsertRecord(agentKey(agentId, "screens"), record);
        return nextScreens;
    }

    async getWatchlist(agentId) {
        const record = await this.store.getRecord(agentKey(agentId, "watchlist"));
        const assets = Array.isArray(record?.assets) ? record.assets : [];
        return assets
            .map((asset) => ({ ...asset }))
            .sort((left, right) => Number(right.watchedAt || 0) - Number(left.watchedAt || 0));
    }

    async watchAsset(agentId, payload = {}) {
        const record = await this.store.getRecord(agentKey(agentId, "watchlist")) || defaultWatchlist(agentId);
        const assets = Array.isArray(record.assets) ? record.assets : [];
        const tokenId = Number(payload.tokenId);
        if (!Number.isFinite(tokenId) || tokenId <= 0) {
            throw Object.assign(new Error("tokenId is required"), { status: 400, code: "watch_asset_invalid" });
        }
        const now = nowSeconds();
        const nextAsset = {
            tokenId,
            name: String(payload.name || `Twin #${tokenId}`).trim() || `Twin #${tokenId}`,
            assetType: String(payload.assetType || "").trim(),
            verificationStatus: String(payload.verificationStatus || "").trim(),
            yieldRate: Number(payload.yieldRate || 0),
            riskScore: Number(payload.riskScore || 0),
            watchedAt: now,
            note: String(payload.note || "").trim(),
        };
        const index = assets.findIndex((asset) => Number(asset.tokenId) === tokenId);
        if (index >= 0) {
            assets[index] = {
                ...assets[index],
                ...nextAsset,
                watchedAt: Number(assets[index].watchedAt || now),
            };
        } else {
            assets.push(nextAsset);
        }
        record.agentId = String(agentId).toUpperCase();
        record.assets = assets.slice(-50);
        record.updatedAt = now;
        await this.store.upsertRecord(agentKey(agentId, "watchlist"), record);
        return nextAsset;
    }

    async unwatchAsset(agentId, tokenId) {
        const record = await this.store.getRecord(agentKey(agentId, "watchlist")) || defaultWatchlist(agentId);
        const assets = Array.isArray(record.assets) ? record.assets : [];
        const nextAssets = assets.filter((asset) => Number(asset.tokenId) !== Number(tokenId));
        record.agentId = String(agentId).toUpperCase();
        record.assets = nextAssets;
        record.updatedAt = nowSeconds();
        await this.store.upsertRecord(agentKey(agentId, "watchlist"), record);
        return nextAssets;
    }

    async setMandate(agentId, payload = {}) {
        const current = await this.getMandate(agentId);
        const next = mergeMandate(agentId, payload, current);
        await this.store.upsertRecord(agentKey(agentId, "mandate"), next);
        return next;
    }

    async getDecisionLog(agentId, limit = 50) {
        const log = await this.store.getRecord(agentKey(agentId, "decision-log"));
        const entries = Array.isArray(log?.entries) ? log.entries : [];
        return entries.slice(-Math.max(1, Number(limit) || 50)).reverse();
    }

    async appendDecision(agentId, entry) {
        const log = await this.store.getRecord(agentKey(agentId, "decision-log")) || { entries: [] };
        const nextEntry = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            ts: Date.now(),
            type: entry?.type || "info",
            message: entry?.message || "",
            detail: entry?.detail || "",
            amount: entry?.amount || "",
            metadata: entry?.metadata || {},
        };
        log.entries = [...(Array.isArray(log.entries) ? log.entries : []), nextEntry].slice(-200);
        await this.store.upsertRecord(agentKey(agentId, "decision-log"), log);
        return nextEntry;
    }

    async getReservations(agentId) {
        const record = await this.store.getRecord(agentKey(agentId, "reservations"));
        return Array.isArray(record?.reservations) ? record.reservations : [];
    }

    async listOpenReservations(agentId) {
        const reservations = await this.getReservations(agentId);
        return reservations.filter((reservation) => reservation.status === "reserved");
    }

    async upsertReservation(agentId, reservation) {
        const record = await this.store.getRecord(agentKey(agentId, "reservations")) || { reservations: [] };
        const reservations = Array.isArray(record.reservations) ? record.reservations : [];
        const index = reservations.findIndex((entry) => entry.bidId === reservation.bidId);
        const nextReservation = {
            ...reservation,
            reservedAmount: toStringAmount(reservation.reservedAmount),
            updatedAt: nowSeconds(),
        };
        if (index >= 0) {
            reservations[index] = nextReservation;
        } else {
            reservations.push(nextReservation);
        }
        await this.store.upsertRecord(agentKey(agentId, "reservations"), { reservations });
        return nextReservation;
    }

    async resolveReservation(agentId, bidId, patch = {}) {
        const record = await this.store.getRecord(agentKey(agentId, "reservations")) || { reservations: [] };
        const reservations = Array.isArray(record.reservations) ? record.reservations : [];
        const index = reservations.findIndex((entry) => entry.bidId === bidId);
        if (index < 0) {
            return null;
        }
        reservations[index] = {
            ...reservations[index],
            ...patch,
            updatedAt: nowSeconds(),
        };
        await this.store.upsertRecord(agentKey(agentId, "reservations"), { reservations });
        return reservations[index];
    }

    async getTreasury(agentId) {
        const record = await this.store.getRecord(agentKey(agentId, "treasury"));
        return record || {
            positions: [],
            reservePolicy: (await this.getMandate(agentId)).reservePolicy,
            optimization: null,
            updatedAt: nowSeconds(),
        };
    }

    async setTreasury(agentId, treasury) {
        const next = {
            positions: Array.isArray(treasury?.positions) ? treasury.positions : [],
            reservePolicy: treasury?.reservePolicy || (await this.getMandate(agentId)).reservePolicy,
            summary: treasury?.summary || {},
            optimization: treasury?.optimization || null,
            updatedAt: nowSeconds(),
        };
        await this.store.upsertRecord(agentKey(agentId, "treasury"), next);
        return next;
    }

    async updatePerformance(agentId, patch = {}) {
        const current = normalizePerformance(
            agentId,
            await this.store.getRecord(agentKey(agentId, "performance")) || {},
        );
        const next = finalizePerformance(agentId, {
            ...current,
            ...patch,
            auctionWins: Number(patch.auctionWins ?? current.auctionWins ?? 0),
            auctionLosses: Number(patch.auctionLosses ?? current.auctionLosses ?? 0),
            attribution: {
                ...current.attribution,
                ...(patch.attribution || {}),
            },
            recentEvents: Array.isArray(patch.recentEvents) ? patch.recentEvents : current.recentEvents,
        });
        await this.store.upsertRecord(agentKey(agentId, "performance"), next);
        return next;
    }

    async getPerformance(agentId) {
        return finalizePerformance(
            agentId,
            await this.store.getRecord(agentKey(agentId, "performance")) || {},
        );
    }

    async getRuntime(agentId) {
        return (await this.store.getRecord(agentKey(agentId, "runtime"))) || defaultRuntime(agentId);
    }

    async setRuntime(agentId, runtime = {}) {
        const next = {
            ...(await this.getRuntime(agentId)),
            ...runtime,
            agentId: String(agentId).toUpperCase(),
            running: Boolean(runtime.running ?? runtime.status === "running" ?? false),
            updatedAt: nowSeconds(),
        };
        await this.store.upsertRecord(agentKey(agentId, "runtime"), next);
        return next;
    }

    async recordPaidActionFee(agentId, amount, metadata = {}) {
        const current = await this.getPerformance(agentId);
        const nextMetrics = markDefiActivity({
            ...(current.defiMetrics || {}),
            feeActions: Number(current.defiMetrics?.feeActions || 0) + 1,
            feeVolume: addStringAmounts(current.defiMetrics?.feeVolume || "0", amount),
        }, metadata.tokenId);
        const nextFee = (
            BigInt(current.paidActionFees || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            paidActionFees: nextFee,
            defiMetrics: nextMetrics,
            recentEvents: appendRecentEvent(current, buildPerformanceEvent({
                category: "fee",
                label: metadata.action ? `${metadata.action} fee` : "Platform action fee",
                amount,
                direction: "outflow",
                metadata,
            })),
        });
        await this.appendDecision(agentId, {
            type: "action",
            message: metadata.action ? `${metadata.action} fee recorded` : "Platform action fee recorded",
            detail: `${toStringAmount(amount)} stroops reserved as platform fee`,
            amount: `-${toStringAmount(amount)}`,
            metadata,
        });
        return updated;
    }

    async recordRealizedYield(agentId, amount, metadata = {}) {
        const current = await this.getPerformance(agentId);
        const nextMetrics = markDefiActivity({
            ...(current.defiMetrics || {}),
            claimCount: Number(current.defiMetrics?.claimCount || 0) + 1,
            yieldClaimedVolume: addStringAmounts(current.defiMetrics?.yieldClaimedVolume || "0", amount),
        }, metadata.tokenId);
        const nextYield = (
            BigInt(current.realizedYield || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            realizedYield: nextYield,
            defiMetrics: nextMetrics,
            recentEvents: appendRecentEvent(current, buildPerformanceEvent({
                category: "yield",
                label: metadata.message || "Yield claimed",
                amount,
                direction: "inflow",
                metadata,
            })),
        });
        await this.appendDecision(agentId, {
            type: "profit",
            message: metadata.message || "Yield claimed",
            detail: metadata.detail || "",
            amount: `+${toStringAmount(amount)}`,
            metadata,
        });
        return updated;
    }

    async recordTreasuryReturn(agentId, amount, metadata = {}) {
        const current = await this.getPerformance(agentId);
        const nextMetrics = markDefiActivity({
            ...(current.defiMetrics || {}),
            treasuryActions: Number(current.defiMetrics?.treasuryActions || 0) + 1,
            treasuryRoutedVolume: addStringAmounts(current.defiMetrics?.treasuryRoutedVolume || "0", amount),
        }, metadata.tokenId);
        const nextTreasuryReturn = (
            BigInt(current.treasuryReturn || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            treasuryReturn: nextTreasuryReturn,
            defiMetrics: nextMetrics,
            recentEvents: appendRecentEvent(current, buildPerformanceEvent({
                category: "treasury",
                label: metadata.message || "Treasury yield realized",
                amount,
                direction: "inflow",
                metadata,
            })),
        });
        await this.appendDecision(agentId, {
            type: "profit",
            message: metadata.message || "Treasury yield realized",
            detail: metadata.detail || "",
            amount: `+${toStringAmount(amount)}`,
            metadata,
        });
        return updated;
    }

    async recordAuctionOutcome(agentId, { outcome = "loss", amount = "", metadata = {} } = {}) {
        const current = await this.getPerformance(agentId);
        const auctionWins = Number(current.auctionWins || 0) + (outcome === "win" ? 1 : 0);
        const auctionLosses = Number(current.auctionLosses || 0) + (outcome === "loss" ? 1 : 0);
        const nextMetrics = outcome === "win" || outcome === "loss"
            ? markDefiActivity({
                ...(current.defiMetrics || {}),
                auctionsSettled: Number(current.defiMetrics?.auctionsSettled || 0) + 1,
            }, metadata.assetId)
            : (current.defiMetrics || {});
        const label = outcome === "win"
            ? `Auction #${metadata.auctionId || "?"} won`
            : `Auction #${metadata.auctionId || "?"} closed without a win`;
        return this.updatePerformance(agentId, {
            auctionWins,
            auctionLosses,
            defiMetrics: nextMetrics,
            recentEvents: appendRecentEvent(current, buildPerformanceEvent({
                category: "auction",
                label,
                amount,
                direction: "neutral",
                metadata,
            })),
        });
    }

    async recordTradeExecution(agentId, {
        side = "bid",
        tokenId = 0,
        auctionId = 0,
        amount = "0",
        txHash = "",
        assetName = "",
        metadata = {},
    } = {}) {
        const normalizedSide = String(side || "bid").trim().toLowerCase();
        const current = await this.getPerformance(agentId);
        const tokenIdNumber = Number(tokenId || metadata.tokenId || 0);
        const baseMetrics = {
            ...(current.defiMetrics || {}),
        };
        const metrics = markDefiActivity(baseMetrics, tokenIdNumber);
        const amountStr = toStringAmount(amount, "0");
        const amountBig = BigInt(amountStr);

        if (normalizedSide === "bid") {
            metrics.bidsPlaced = Number(metrics.bidsPlaced || 0) + 1;
            metrics.bidVolume = addStringAmounts(metrics.bidVolume || "0", amountStr);
        } else if (normalizedSide === "buy") {
            metrics.buyCount = Number(metrics.buyCount || 0) + 1;
            metrics.buyVolume = addStringAmounts(metrics.buyVolume || "0", amountStr);
            if (tokenIdNumber > 0) {
                metrics.costBasisByToken = {
                    ...(metrics.costBasisByToken || {}),
                    [String(tokenIdNumber)]: amountStr,
                };
            }
        } else if (normalizedSide === "sell") {
            metrics.sellCount = Number(metrics.sellCount || 0) + 1;
            metrics.sellVolume = addStringAmounts(metrics.sellVolume || "0", amountStr);
            if (tokenIdNumber > 0) {
                const tokenKey = String(tokenIdNumber);
                const basis = BigInt(metrics.costBasisByToken?.[tokenKey] || "0");
                const realizedTradePnL = addStringAmounts(metrics.realizedTradePnL || "0", (amountBig - basis).toString());
                metrics.realizedTradePnL = realizedTradePnL;
                metrics.costBasisByToken = {
                    ...(metrics.costBasisByToken || {}),
                };
                delete metrics.costBasisByToken[tokenKey];
            } else {
                metrics.realizedTradePnL = addStringAmounts(metrics.realizedTradePnL || "0", amountStr);
            }
        }

        metrics.volumeTradedGross = addStringAmounts(metrics.buyVolume || "0", metrics.sellVolume || "0");

        const updated = await this.updatePerformance(agentId, {
            realizedTradePnL: metrics.realizedTradePnL || current.realizedTradePnL || "0",
            defiMetrics: metrics,
            recentEvents: appendRecentEvent(current, buildPerformanceEvent({
                category: "trade",
                label: normalizedSide === "sell"
                    ? "Trade sell executed"
                    : normalizedSide === "buy"
                        ? "Trade buy executed"
                        : "Trade bid submitted",
                amount: amountStr,
                direction: normalizedSide === "sell" ? "inflow" : "outflow",
                metadata: {
                    side: normalizedSide,
                    tokenId: tokenIdNumber || null,
                    auctionId: Number(auctionId || metadata.auctionId || 0) || null,
                    txHash,
                    assetName: String(assetName || metadata.assetName || ""),
                    ...metadata,
                },
            })),
        });

        const tradeLabel = String(assetName || metadata.assetName || (tokenIdNumber > 0 ? `Twin #${tokenIdNumber}` : "asset")).trim();
        const pnlAmount = updated.realizedTradePnL || "0";
        await this.appendDecision(agentId, {
            type: normalizedSide === "sell" ? "profit" : "action",
            message: normalizedSide === "sell"
                ? `Sold ${tradeLabel}`
                : normalizedSide === "buy"
                    ? `Bought ${tradeLabel}`
                    : `Bid submitted on ${tradeLabel}`,
            detail: [
                auctionId ? `Auction #${Number(auctionId)}` : "",
                `Amount ${amountStr} stroops`,
                txHash ? `Tx ${String(txHash).slice(0, 16)}...` : "",
                normalizedSide === "sell" ? `Realized trade PnL ${pnlAmount} stroops` : "",
            ].filter(Boolean).join(" · "),
            amount: `${normalizedSide === "sell" ? "+" : "-"}${amountStr}`,
            metadata: {
                side: normalizedSide,
                tokenId: tokenIdNumber || null,
                auctionId: Number(auctionId || 0) || null,
                txHash,
                assetName: tradeLabel,
            },
        });

        return updated;
    }
}

module.exports = {
    AgentStateService,
    defaultRuntime,
    defaultMandate,
    defaultObjective,
    mergeMandate,
    defaultPerformance,
    defaultBrainState,
};
