const crypto = require("crypto");

const { screenAssets } = require("./assetScreener");
const { monitorRisks } = require("./assetIntelligence");
const { buildPortfolio, computeRebalanceActions } = require("./portfolioManager");
const { checkCompliance } = require("./complianceChecker");
const { formatStellarAmount, normalizeStellarAmount } = require("./stellarAnchorService");

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function productiveOnly(asset) {
    return [1, 2, 3].includes(Number(asset?.assetType || 0));
}

function assetClassLabel(asset) {
    const assetType = Number(asset?.assetType || 0);
    if (assetType === 1) return "real_estate";
    if (assetType === 2) return "vehicle";
    return "commodity";
}

function toDisplayAmount(value) {
    return (Number(value || 0) / 1e7).toFixed(2);
}

function fingerprint(value) {
    return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

class AgentRuntimeService {
    constructor(config = {}) {
        this.store = config.store;
        this.chainService = config.chainService;
        this.agentWallet = config.agentWallet;
        this.agentState = config.agentState;
        this.treasuryManager = config.treasuryManager;
        this.auctionEngine = config.auctionEngine || null;
        this.tickIntervalMs = Math.max(5000, Number(process.env.CONTINUUM_AGENT_TICK_MS || 15000));
        this.intervals = new Map();
    }

    clearInterval(agentId) {
        const key = String(agentId || "").toUpperCase();
        const existing = this.intervals.get(key);
        if (existing) {
            clearInterval(existing);
            this.intervals.delete(key);
        }
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

    async start({ agentId, ownerPublicKey, executeTreasury = true, executeClaims = true }) {
        const normalizedAgentId = String(agentId || "").toUpperCase();
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
            detail: `Treasury ${executeTreasury ? "enabled" : "disabled"} · Auto-claims ${executeClaims ? "enabled" : "disabled"}`,
        });
        this.schedule(normalizedAgentId, ownerPublicKey);
        return this.tick({ agentId: normalizedAgentId, ownerPublicKey, reason: "start" });
    }

    async pause({ agentId }) {
        const normalizedAgentId = String(agentId || "").toUpperCase();
        this.clearInterval(normalizedAgentId);
        const runtime = await this.agentState.setRuntime(normalizedAgentId, {
            status: "paused",
            running: false,
            pausedAt: nowSeconds(),
            nextTickAt: 0,
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
    }) {
        if (!this.auctionEngine?.listAuctions || !this.auctionEngine?.placeBid) {
            return [];
        }

        const opportunityByTokenId = new Map(
            opportunities.map((entry) => [Number(entry.tokenId), entry])
        );
        const activeAuctions = await this.auctionEngine.listAuctions({ status: "active" });
        const approvalThreshold = normalizeStellarAmount(mandate?.approvalThreshold || "250");
        const bidIncrement = 10_000_000n;
        const now = nowSeconds();
        const placedBids = [];

        const rankedAuctions = activeAuctions
            .filter((auction) => Number(auction?.startTime || 0) <= now && Number(auction?.endTime || 0) > now)
            .filter((auction) => opportunityByTokenId.has(Number(auction.assetId)))
            .filter((auction) => String(auction.seller || "").toUpperCase() !== String(walletPublicKey || "").toUpperCase())
            .filter((auction) => String(auction.highestBid?.bidder || "").toUpperCase() !== String(walletPublicKey || "").toUpperCase())
            .sort((left, right) => {
                const leftOpportunity = opportunityByTokenId.get(Number(left.assetId));
                const rightOpportunity = opportunityByTokenId.get(Number(right.assetId));
                return Number(rightOpportunity?.score || 0) - Number(leftOpportunity?.score || 0);
            });

        for (const auction of rankedAuctions.slice(0, 1)) {
            const opportunity = opportunityByTokenId.get(Number(auction.assetId));
            const reserve = BigInt(auction.reservePrice || "0");
            const highest = BigInt(auction.highestBid?.amountStroops || "0");
            const nextBid = highest > 0n ? highest + bidIncrement : reserve;
            if (nextBid <= 0n || nextBid > approvalThreshold) {
                continue;
            }

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
                    detail: `Twin #${Number(auction.assetId)} scored ${Number(opportunity?.score || 0)} with bid ${result.bid.amountDisplay} USDC.`,
                });
                placedBids.push(result.bid);
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

    async tick({ agentId, ownerPublicKey, reason = "manual" }) {
        const normalizedAgentId = String(agentId || "").toUpperCase();
        const currentRuntime = await this.agentState.getRuntime(normalizedAgentId);
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

            const mandate = await this.agentState.getMandate(normalizedAgentId);
            const [allAssets, ownedAssets, sessions] = await Promise.all([
                this.chainService?.isConfigured?.()
                    ? this.chainService.listAssetSnapshots({ limit: 200 })
                    : this.store.listAssets(),
                this.chainService?.isConfigured?.()
                    ? this.chainService.listAssetSnapshots({ owner: wallet.publicKey })
                    : this.store.listAssets({ owner: wallet.publicKey }),
                this.chainService.listSessions({ owner: wallet.publicKey }),
            ]);

            const settledAuctions = await this.settleReadyAuctions({ agentId: normalizedAgentId });

            const productiveAssets = allAssets.filter(productiveOnly);
            const approvedClasses = new Set(mandate.approvedAssetClasses || []);
            const screened = screenAssets(productiveAssets, {
                minYield: Number(mandate.targetReturnMinPct || 0),
                maxRisk: 80,
                limit: 5,
            }).filter((candidate) => approvedClasses.has(assetClassLabel(candidate.asset)));

            const opportunities = [];
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
                }
            }

            const riskAlerts = monitorRisks(ownedAssets);
            const portfolio = buildPortfolio(sessions, ownedAssets);
            const rebalanceActions = computeRebalanceActions(portfolio, productiveAssets, {
                maxPositions: Math.max(1, Math.floor(100 / Math.max(1, Number(mandate.assetCapPct || 25)))),
                maxBudgetPerPosition: Number(mandate.approvalThreshold || 250),
                minYield: Number(mandate.targetReturnMinPct || 0),
                maxRisk: 80,
            });

            let autoClaims = 0;
            if (currentRuntime.executeClaims !== false) {
                const claimableAssets = ownedAssets
                    .filter((asset) => BigInt(asset.claimableYield || "0") >= 10_000_000n)
                    .slice(0, 3);
                for (const asset of claimableAssets) {
                    const compliance = await checkCompliance(this.chainService, {
                        walletAddress: wallet.publicKey,
                        asset,
                        action: "claim",
                    });
                    if (!compliance.allowed) {
                        continue;
                    }
                    const claim = await this.agentWallet.claimYield({
                        owner: ownerPublicKey,
                        tokenId: Number(asset.tokenId),
                    });
                    await this.agentState.recordRealizedYield(normalizedAgentId, claim.amount || "0", {
                        message: `Agent auto-claimed yield on twin #${Number(asset.tokenId)}`,
                        detail: `Transaction ${String(claim.txHash || "").slice(0, 12)}...`,
                    });
                    autoClaims += 1;
                }
            }

            const autoBids = await this.maybePlaceAuctionBid({
                agentId: normalizedAgentId,
                ownerPublicKey,
                walletPublicKey: wallet.publicKey,
                opportunities,
                mandate,
            });

            let treasury = null;
            let treasuryExecuted = false;
            const cadenceSeconds = Math.max(60, Number(mandate.rebalanceCadenceMinutes || 60) * 60);
            if (
                currentRuntime.executeTreasury
                && this.treasuryManager
                && (
                    !currentRuntime.lastRebalanceAt
                    || nowSeconds() - Number(currentRuntime.lastRebalanceAt || 0) >= cadenceSeconds
                )
            ) {
                treasury = await this.treasuryManager.rebalance({
                    ownerPublicKey,
                    agentId: normalizedAgentId,
                });
                treasuryExecuted = true;
                await this.agentState.appendDecision(normalizedAgentId, {
                    type: "decision",
                    message: "Treasury optimizer executed",
                    detail: `${(treasury?.positions || []).length} live positions · target reserve ${(mandate.reservePolicy?.targetLiquidPct || 20)}%`,
                });
            }

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

            if (opportunityFingerprint !== currentRuntime.fingerprints?.opportunities) {
                const topOpportunity = opportunities[0];
                await this.agentState.appendDecision(normalizedAgentId, topOpportunity ? {
                    type: "decision",
                    message: `Top opportunity spotted: twin #${topOpportunity.tokenId}`,
                    detail: `${Number(topOpportunity.yieldRate || 0).toFixed(2)}% yield · risk ${topOpportunity.riskScore}/100`,
                } : {
                    type: "info",
                    message: "Opportunity scan complete",
                    detail: "No approved assets currently clear the active mandate floor.",
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

            const runtime = await this.agentState.setRuntime(normalizedAgentId, {
                status: currentRuntime.running ? "running" : currentRuntime.status || "idle",
                running: currentRuntime.running,
                lastTickAt: nowSeconds(),
                lastScreenedAt: nowSeconds(),
                lastRebalanceAt: treasuryExecuted ? nowSeconds() : currentRuntime.lastRebalanceAt,
                nextTickAt,
                lastError: "",
                lastErrorAt: 0,
                heartbeatCount: Number(currentRuntime.heartbeatCount || 0) + 1,
                lastSummary: {
                    opportunities: opportunities.length,
                    riskAlerts: riskAlerts.length,
                    rebalanceActions: rebalanceActions.length,
                    autoClaims,
                    autoBids: autoBids.length,
                    settledAuctions: settledAuctions.length,
                    treasuryExecuted,
                },
                fingerprints: {
                    opportunities: opportunityFingerprint,
                    risks: riskFingerprint,
                    rebalance: rebalanceFingerprint,
                },
            });

            return {
                runtime,
                opportunities,
                riskAlerts,
                rebalanceActions,
                autoBids,
                settledAuctions,
                treasury,
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
            await this.agentState.appendDecision(normalizedAgentId, {
                type: "error",
                message: "Autonomous runtime tick failed",
                detail: error.message || "Unknown runtime error",
            });
            return {
                runtime,
                opportunities: [],
                riskAlerts: [],
                rebalanceActions: [],
                autoBids: [],
                settledAuctions: [],
                treasury: null,
                portfolio: null,
            };
        }
    }
}

module.exports = {
    AgentRuntimeService,
};
