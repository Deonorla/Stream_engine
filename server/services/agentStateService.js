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
        },
        fingerprints: {
            opportunities: "",
            risks: "",
            rebalance: "",
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
            agentId,
            realizedYield: "0",
            treasuryReturn: "0",
            paidActionFees: "0",
            netPnL: "0",
            drawdown: "0",
            auctionWins: 0,
            auctionLosses: 0,
            updatedAt: nowSeconds(),
        });
        await this.store.upsertRecord(agentKey(agentId, "decision-log"), { entries: [] });
        await this.store.upsertRecord(agentKey(agentId, "reservations"), { reservations: [] });
        await this.store.upsertRecord(agentKey(agentId, "treasury"), {
            positions: [],
            reservePolicy: mandate.reservePolicy,
            updatedAt: nowSeconds(),
        });
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
            updatedAt: nowSeconds(),
        };
    }

    async setTreasury(agentId, treasury) {
        const next = {
            positions: Array.isArray(treasury?.positions) ? treasury.positions : [],
            reservePolicy: treasury?.reservePolicy || (await this.getMandate(agentId)).reservePolicy,
            summary: treasury?.summary || {},
            updatedAt: nowSeconds(),
        };
        await this.store.upsertRecord(agentKey(agentId, "treasury"), next);
        return next;
    }

    async updatePerformance(agentId, patch = {}) {
        const current = await this.store.getRecord(agentKey(agentId, "performance")) || {
            agentId: String(agentId).toUpperCase(),
            realizedYield: "0",
            treasuryReturn: "0",
            paidActionFees: "0",
            netPnL: "0",
            drawdown: "0",
            auctionWins: 0,
            auctionLosses: 0,
        };
        const next = {
            ...current,
            ...patch,
            auctionWins: Number(patch.auctionWins ?? current.auctionWins ?? 0),
            auctionLosses: Number(patch.auctionLosses ?? current.auctionLosses ?? 0),
            updatedAt: nowSeconds(),
        };
        await this.store.upsertRecord(agentKey(agentId, "performance"), next);
        return next;
    }

    async getPerformance(agentId) {
        return (await this.store.getRecord(agentKey(agentId, "performance"))) || {
            agentId: String(agentId).toUpperCase(),
            realizedYield: "0",
            treasuryReturn: "0",
            paidActionFees: "0",
            netPnL: "0",
            drawdown: "0",
            auctionWins: 0,
            auctionLosses: 0,
            updatedAt: nowSeconds(),
        };
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
        const current = await this.store.getRecord(agentKey(agentId, "performance")) || {
            agentId: String(agentId).toUpperCase(),
            realizedYield: "0",
            treasuryReturn: "0",
            paidActionFees: "0",
            netPnL: "0",
            drawdown: "0",
            auctionWins: 0,
            auctionLosses: 0,
        };
        const nextFee = (
            BigInt(current.paidActionFees || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const treasuryReturn = BigInt(current.treasuryReturn || "0");
        const realizedYield = BigInt(current.realizedYield || "0");
        const netPnL = (realizedYield + treasuryReturn - BigInt(nextFee)).toString();
        const updated = await this.updatePerformance(agentId, {
            paidActionFees: nextFee,
            netPnL,
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
        const current = await this.store.getRecord(agentKey(agentId, "performance")) || {};
        const nextYield = (
            BigInt(current.realizedYield || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const netPnL = (
            BigInt(nextYield)
            + BigInt(current.treasuryReturn || "0")
            - BigInt(current.paidActionFees || "0")
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            realizedYield: nextYield,
            netPnL,
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
        const current = await this.store.getRecord(agentKey(agentId, "performance")) || {};
        const nextTreasuryReturn = (
            BigInt(current.treasuryReturn || "0")
            + BigInt(toStringAmount(amount))
        ).toString();
        const netPnL = (
            BigInt(current.realizedYield || "0")
            + BigInt(nextTreasuryReturn)
            - BigInt(current.paidActionFees || "0")
        ).toString();
        const updated = await this.updatePerformance(agentId, {
            treasuryReturn: nextTreasuryReturn,
            netPnL,
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
}

module.exports = {
    AgentStateService,
    defaultRuntime,
    defaultMandate,
    mergeMandate,
};
