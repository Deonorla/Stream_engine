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
        paidActionFees: "0",
        netPnL: "0",
        drawdown: "0",
        auctionWins: 0,
        auctionLosses: 0,
        attribution: {
            yieldContribution: "0",
            treasuryContribution: "0",
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
    return {
        ...base,
        ...current,
        agentId: String(agentId).toUpperCase(),
        auctionWins: Number(current.auctionWins ?? base.auctionWins),
        auctionLosses: Number(current.auctionLosses ?? base.auctionLosses),
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
    const paidActionFees = BigInt(current.paidActionFees || "0");
    const grossPositivePnL = realizedYield + treasuryReturn;
    const netPnL = grossPositivePnL - paidActionFees;
    const auctionWins = Number(current.auctionWins || 0);
    const auctionLosses = Number(current.auctionLosses || 0);
    const totalAuctionOutcomes = auctionWins + auctionLosses;
    const winRatePct = totalAuctionOutcomes > 0
        ? Number(((auctionWins / totalAuctionOutcomes) * 100).toFixed(1))
        : 0;

    return {
        ...current,
        realizedYield: realizedYield.toString(),
        treasuryReturn: treasuryReturn.toString(),
        paidActionFees: paidActionFees.toString(),
        netPnL: netPnL.toString(),
        attribution: {
            ...current.attribution,
            yieldContribution: realizedYield.toString(),
            treasuryContribution: treasuryReturn.toString(),
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

function defaultMandate(agentId = "") {
    return {
        agentId: String(agentId).toUpperCase(),
        capitalBase: "1000",
        approvedAssetClasses: ["real_estate", "vehicle", "commodity"],
        issuerCapPct: 40,
        assetCapPct: 25,
        liquidityFloorPct: 10,
        allowedTreasuryStrategies: ["safe_yield", "blend_lending", "stellar_amm"],
        maxDrawdownPct: 20,
        approvalThreshold: "250",
        targetReturnMinPct: 8,
        targetReturnMaxPct: 18,
        jurisdictions: [],
        rentalUseRule: "human_approval_required",
        rebalanceCadenceMinutes: 60,
        investmentHorizonDays: 90,
        reservePolicy: {
            minLiquidPct: 10,
            targetLiquidPct: 20,
            maxLiquidPct: 30,
        },
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
        return profile;
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
        const nextFee = (
            BigInt(current.paidActionFees || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            paidActionFees: nextFee,
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
        const nextYield = (
            BigInt(current.realizedYield || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            realizedYield: nextYield,
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
        const nextTreasuryReturn = (
            BigInt(current.treasuryReturn || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            treasuryReturn: nextTreasuryReturn,
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
        const label = outcome === "win"
            ? `Auction #${metadata.auctionId || "?"} won`
            : `Auction #${metadata.auctionId || "?"} closed without a win`;
        return this.updatePerformance(agentId, {
            auctionWins,
            auctionLosses,
            recentEvents: appendRecentEvent(current, buildPerformanceEvent({
                category: "auction",
                label,
                amount,
                direction: "neutral",
                metadata,
            })),
        });
    }
}

module.exports = {
    AgentStateService,
    defaultRuntime,
    defaultMandate,
    mergeMandate,
    defaultPerformance,
};
