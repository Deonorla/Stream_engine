const request = require("supertest");
const { expect } = require("chai");
const { Keypair } = require("@stellar/stellar-sdk");

const createApp = require("../index");
const { MemoryIndexerStore } = require("../services/indexerStore");
const { AgentStateService } = require("../services/agentStateService");

describe("Continuum API Integration", function () {
    const originalGeminiApiKey = process.env.GEMINI_API_KEY;
    let app;
    let store;
    let services;
    let agentState;
    let ownerKeypair;
    let agentKeypair;
    let competitorOwnerKeypair;
    let competitorAgentKeypair;
    let issuerKeypair;
    let serviceRecipientKeypair;
    let usdcIssuerKeypair;
    let token;
    let agentId;
    let auctionState;
    let externalAuctionState;
    let secondaryAuctionState;
    let ownerWallets;
    let managedSessionsState;
    let nextManagedSessionId;
    let listAssetSnapshotsCalls;

    function createManagedWallet(ownerPublicKey) {
        const normalizedOwner = String(ownerPublicKey || "").toUpperCase();
        if (!ownerWallets.has(normalizedOwner)) {
            ownerWallets.set(normalizedOwner, {
                ownerPublicKey: normalizedOwner,
                publicKey: ownerKeypair.publicKey() === normalizedOwner
                    ? agentKeypair.publicKey()
                    : competitorOwnerKeypair.publicKey() === normalizedOwner
                        ? competitorAgentKeypair.publicKey()
                    : Keypair.random().publicKey(),
            });
        }
        return ownerWallets.get(normalizedOwner);
    }

    async function bootstrapManagedAgent() {
        const response = await request(app)
            .post("/api/agents")
            .send({ ownerPublicKey: ownerKeypair.publicKey() })
            .expect(201);
        token = response.body.token;
        agentId = response.body.agent.agentId;
        return response.body;
    }

    function installAgentBrain(stub) {
        services.agentBrain = stub;
        if (services.agentRuntime) {
            services.agentRuntime.agentBrain = stub;
        }
        if (app?.locals) {
            app.locals.agentBrain = stub;
            if (app.locals.services) {
                app.locals.services.agentBrain = stub;
                if (app.locals.services.agentRuntime) {
                    app.locals.services.agentRuntime.agentBrain = stub;
                }
            }
        }
    }

    async function waitForWake(ms = 80) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    beforeEach(async () => {
        process.env.GEMINI_API_KEY = "your_gemini_api_key_here";
        store = new MemoryIndexerStore();
        await store.init();
        agentState = new AgentStateService({ store });
        ownerKeypair = Keypair.random();
        agentKeypair = Keypair.random();
        competitorOwnerKeypair = Keypair.random();
        competitorAgentKeypair = Keypair.random();
        issuerKeypair = Keypair.random();
        serviceRecipientKeypair = Keypair.random();
        usdcIssuerKeypair = Keypair.random();
        ownerWallets = new Map();

        await store.upsertAsset({
            tokenId: 7,
            assetType: 1,
            currentOwner: agentKeypair.publicKey(),
            issuer: issuerKeypair.publicKey(),
            verificationStatusLabel: "verified",
            claimableYield: "12500000",
            totalYieldDeposited: "50000000",
            rentalReady: true,
            publicMetadataURI: "ipfs://warehouse-alpha",
            stream: {
                flowRate: "250",
            },
            assetPolicy: {
                frozen: false,
                disputed: false,
                revoked: false,
            },
        });
        await store.recordActivity({
            tokenId: 7,
            eventName: "AssetRegistered",
            txHash: "0xasset",
            blockNumber: 1,
            logIndex: 0,
            metadata: {},
        });

        auctionState = {
            auctionId: 3,
            assetId: 7,
            seller: agentKeypair.publicKey(),
            sellerOwnerPublicKey: ownerKeypair.publicKey(),
            reservePrice: "2500000000",
            reservePriceDisplay: "250.0000000",
            currency: "USDC",
            startTime: Math.floor(Date.now() / 1000) - 60,
            endTime: Math.floor(Date.now() / 1000) + 3600,
            status: "active",
            bids: [],
            highestBid: null,
            highestBidDisplay: null,
            reserveMet: false,
            assetType: "real_estate",
            title: "Warehouse Alpha",
        };
        externalAuctionState = null;
        secondaryAuctionState = null;
        managedSessionsState = [{
            id: 77,
            sender: agentKeypair.publicKey(),
            recipient: serviceRecipientKeypair.publicKey(),
            isActive: true,
            sessionStatus: "active",
            refundableAmount: "1500000",
            consumedAmount: "500000",
            claimableInitial: "500000",
        }];
        nextManagedSessionId = 78;
        listAssetSnapshotsCalls = 0;

        services = {
            store,
            ipfsService: {
                async fetchJSON(uri) {
                    const source = String(uri);
                    return {
                        uri,
                        metadata: {
                            name: source.includes("land") ? "Lekki Parcel Beta" : "Warehouse Alpha",
                            description: source.includes("land") ? "Income-producing land parcel" : "Lagos logistics facility",
                            category: source.includes("land") ? "land" : "real_estate",
                        },
                    };
                },
            },
            chainService: {
                signer: {
                    address: serviceRecipientKeypair.publicKey(),
                    publicKey: serviceRecipientKeypair.publicKey(),
                },
                runtime: {
                    paymentAssetIssuer: usdcIssuerKeypair.publicKey(),
                },
                isConfigured() {
                    return true;
                },
                async getSessionSnapshot(sessionId) {
                    const session = managedSessionsState.find((entry) => String(entry.id) === String(sessionId));
                    if (!session) {
                        return null;
                    }
                    return {
                        ...session,
                        isFrozen: false,
                    };
                },
                async getAssetSnapshot(tokenId) {
                    return store.getAsset(Number(tokenId));
                },
                async listAssetSnapshots({ owner } = {}) {
                    listAssetSnapshotsCalls += 1;
                    return store.listAssets({ owner });
                },
                async listSessions({ owner } = {}) {
                    if (owner && String(owner).toUpperCase() !== agentKeypair.publicKey().toUpperCase()) {
                        return [];
                    }
                    return managedSessionsState;
                },
            },
            agentWallet: {
                async getOrCreateWallet(ownerPublicKey) {
                    return createManagedWallet(ownerPublicKey);
                },
                async getWallet(ownerPublicKey) {
                    return createManagedWallet(ownerPublicKey);
                },
                async getBalances({ owner }) {
                    const wallet = createManagedWallet(owner);
                    return {
                        publicKey: wallet.publicKey,
                        balances: [
                            {
                                assetCode: "USDC",
                                assetIssuer: usdcIssuerKeypair.publicKey(),
                                balance: "425.0000000",
                            },
                            {
                                assetCode: "XLM",
                                assetIssuer: "",
                                balance: "80.0000000",
                            },
                        ],
                    };
                },
                async openSession({ owner, recipient, totalAmount, durationSeconds }) {
                    const wallet = createManagedWallet(owner);
                    const session = {
                        id: nextManagedSessionId++,
                        sender: wallet.publicKey,
                        recipient,
                        isActive: true,
                        sessionStatus: "active",
                        refundableAmount: String(totalAmount),
                        consumedAmount: "0",
                        claimableInitial: "0",
                        durationSeconds: Number(durationSeconds || 0),
                    };
                    managedSessionsState = [session, ...managedSessionsState];
                    return {
                        streamId: String(session.id),
                        txHash: `session-open-${session.id}`,
                    };
                },
                async cancelSession({ sessionId }) {
                    const sessionIndex = managedSessionsState.findIndex((entry) => String(entry.id) === String(sessionId));
                    if (sessionIndex === -1) {
                        throw new Error("Session not found.");
                    }
                    const current = managedSessionsState[sessionIndex];
                    const next = {
                        ...current,
                        isActive: false,
                        sessionStatus: "cancelled",
                    };
                    managedSessionsState = managedSessionsState.map((entry, index) => (index === sessionIndex ? next : entry));
                    return {
                        txHash: `session-cancel-${sessionId}`,
                        refundableAmount: current.refundableAmount || "0",
                        claimableAmount: current.claimableInitial || "0",
                    };
                },
                async claimYield() {
                    return {
                        txHash: "yield-tx-1",
                        amount: "3500000",
                    };
                },
            },
            agentState,
            treasuryManager: {
                healthCheck() {
                    return {
                        ok: true,
                        configuredFamilies: ["safe_yield", "blend_lending", "stellar_amm"],
                    };
                },
                async rebalance({ agentId: currentAgentId }) {
                    const treasury = {
                        positions: [
                            {
                                strategyFamily: "safe_yield",
                                venueId: "yield-vault",
                                assetOrPool: "warehouse-income",
                                allocatedAmount: "180000000",
                                projectedNetApy: "11.20",
                                recallPriority: 3,
                            },
                        ],
                        reservePolicy: {
                            minLiquidPct: 10,
                            targetLiquidPct: 20,
                            maxLiquidPct: 30,
                        },
                        summary: {
                            liquidPct: 20,
                            deployedPct: 80,
                        },
                        optimization: {
                            objective: "highest_approved_return_first",
                            reason: "rebalanced",
                            deployableAmount: "180000000",
                            recallOrder: ["stellar_amm", "blend_lending", "safe_yield"],
                            execution: {
                                deploymentCount: 1,
                                deployedAmount: "180000000",
                                deployedVenues: [
                                    {
                                        strategyFamily: "safe_yield",
                                        venueId: "yield-vault",
                                        allocatedAmount: "180000000",
                                        projectedNetApy: "11.20",
                                    },
                                ],
                            },
                            candidates: [
                                {
                                    strategyFamily: "safe_yield",
                                    venueId: "yield-vault",
                                    label: "Yield Vault",
                                    projectedNetApy: "11.20",
                                    remainingCap: "600000000",
                                    selected: true,
                                    allocatedAmount: "180000000",
                                    recallPriority: 3,
                                },
                            ],
                            before: {
                                liquidBalance: "4250000000",
                                deployed: "0",
                            },
                            after: {
                                liquidBalance: "4250000000",
                                deployed: "180000000",
                            },
                        },
                    };
                    await agentState.setTreasury(currentAgentId, treasury);
                    return treasury;
                },
            },
        };

        services.auctionEngine = {
            async listAuctions({ status, tokenId } = {}) {
                return [auctionState, externalAuctionState, secondaryAuctionState]
                    .filter(Boolean)
                    .filter((entry) => !tokenId || Number(entry.assetId) === Number(tokenId))
                    .filter((entry) => !status || entry.status === status)
                    .map((entry) => ({ ...entry }));
            },
            async getAuction(auctionId) {
                if (Number(auctionId) === Number(auctionState.auctionId)) {
                    return { ...auctionState };
                }
                if (externalAuctionState && Number(auctionId) === Number(externalAuctionState.auctionId)) {
                    return { ...externalAuctionState };
                }
                if (secondaryAuctionState && Number(auctionId) === Number(secondaryAuctionState.auctionId)) {
                    return { ...secondaryAuctionState };
                }
                return null;
            },
            async createAuction({ tokenId, reservePrice, startTime, endTime }) {
                auctionState = {
                    ...auctionState,
                    assetId: Number(tokenId),
                    reservePrice: String(reservePrice || auctionState.reservePrice),
                    reservePriceDisplay: String(reservePrice || "250"),
                    startTime: Number(startTime || auctionState.startTime),
                    endTime: Number(endTime || auctionState.endTime),
                };
                return { ...auctionState };
            },
            async placeBid({ auctionId, bidderOwnerPublicKey, amount }) {
                const targetAuction = Number(auctionId) === Number(auctionState.auctionId)
                    ? auctionState
                    : externalAuctionState && Number(auctionId) === Number(externalAuctionState.auctionId)
                        ? externalAuctionState
                        : secondaryAuctionState && Number(auctionId) === Number(secondaryAuctionState.auctionId)
                            ? secondaryAuctionState
                        : null;
                if (!targetAuction) {
                    throw Object.assign(new Error("Auction not found"), {
                        status: 404,
                        code: "auction_not_found",
                    });
                }
                const bidderWallet = createManagedWallet(bidderOwnerPublicKey);
                const bidderProfile = await agentState.ensureAgentProfile({
                    ownerPublicKey: bidderOwnerPublicKey,
                    agentPublicKey: bidderWallet.publicKey,
                });
                const bid = {
                    bidId: Number(auctionId) * 10 + 1,
                    auctionId: Number(auctionId),
                    assetId: Number(targetAuction.assetId),
                    bidder: bidderWallet.publicKey,
                    amountDisplay: String(amount),
                    amountStroops: String(Math.round(Number(amount) * 1e7)),
                    placedAt: Math.floor(Date.now() / 1000),
                    status: "active",
                };
                await agentState.upsertReservation(bidderProfile.agentId, {
                    bidId: bid.bidId,
                    auctionId: Number(auctionId),
                    assetId: Number(targetAuction.assetId),
                    issuer: issuerKeypair.publicKey(),
                    reservedAmount: bid.amountStroops,
                    status: "reserved",
                });
                await agentState.appendDecision(bidderProfile.agentId, {
                    type: "action",
                    message: `Bid placed on auction #${auctionId}`,
                    detail: `${amount} USDC reserved for twin #${Number(targetAuction.assetId)}.`,
                    amount: `-${amount}`,
                });
                const nextAuction = {
                    ...targetAuction,
                    bids: [bid],
                    highestBid: bid,
                    highestBidDisplay: String(amount),
                    reserveMet: true,
                };
                if (Number(auctionId) === Number(auctionState.auctionId)) {
                    auctionState = nextAuction;
                } else if (externalAuctionState && Number(auctionId) === Number(externalAuctionState.auctionId)) {
                    externalAuctionState = nextAuction;
                } else {
                    secondaryAuctionState = nextAuction;
                }
                return {
                    bid,
                    auction: { ...nextAuction },
                };
            },
            async settleAuction({ auctionId }) {
                const targetAuction = Number(auctionId) === Number(auctionState.auctionId)
                    ? auctionState
                    : externalAuctionState && Number(auctionId) === Number(externalAuctionState.auctionId)
                        ? externalAuctionState
                        : secondaryAuctionState && Number(auctionId) === Number(secondaryAuctionState.auctionId)
                            ? secondaryAuctionState
                        : null;
                if (!targetAuction) {
                    throw Object.assign(new Error("Auction not found"), {
                        status: 404,
                        code: "auction_not_found",
                    });
                }
                const winningBid = targetAuction.highestBid || null;
                const nextAuction = {
                    ...targetAuction,
                    status: "settled",
                    winningBidId: winningBid?.bidId || null,
                };
                if (winningBid?.bidder) {
                    const winnerProfile = await agentState.getAgentProfile(String(winningBid.bidder).toUpperCase());
                    if (winnerProfile) {
                        await agentState.recordAuctionOutcome(winnerProfile.agentId, {
                            outcome: "win",
                            amount: winningBid.amountStroops,
                            metadata: {
                                auctionId: Number(auctionId),
                                assetId: Number(targetAuction.assetId),
                                winningBidAmount: winningBid.amountStroops,
                            },
                        });
                        await agentState.resolveReservation(winnerProfile.agentId, winningBid.bidId, {
                            status: "settled",
                            settledAt: Math.floor(Date.now() / 1000),
                        });
                    }
                    const settledAsset = await store.getAsset(Number(targetAuction.assetId));
                    await store.upsertAsset({
                        ...settledAsset,
                        currentOwner: winningBid.bidder,
                    });
                }
                if (Number(auctionId) === Number(auctionState.auctionId)) {
                    auctionState = nextAuction;
                } else if (externalAuctionState && Number(auctionId) === Number(externalAuctionState.auctionId)) {
                    externalAuctionState = nextAuction;
                } else {
                    secondaryAuctionState = nextAuction;
                }
                return {
                    auction: { ...nextAuction },
                    refunds: [],
                    settlement: {
                        txHash: "auction-settle-tx",
                        status: "settled",
                    },
                };
            },
        };

        app = createApp({
            recipientAddress: serviceRecipientKeypair.publicKey(),
            paymentTokenAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
            tokenSymbol: "USDC",
            tokenDecimals: 7,
            chainId: 0,
            streamEngineContractAddress: "CBC4DKMWZTHTA35LHKNWYNC5DNVT4VBRZLR7YF7HMZIDYJTAUECIAMHE",
            sessionApiUrl: "http://127.0.0.1:3001",
            services,
        });

        await bootstrapManagedAgent();
        installAgentBrain({
            async decide({ wakeReason }) {
                return {
                    proposal: {
                        actionType: "hold",
                        actionArgs: {},
                        thesis: "Default test planner is monitoring the market.",
                        rationale: "No deterministic test opportunity requires action.",
                        confidence: 60,
                        blockedBy: "No deterministic test opportunity requires action.",
                        requiresHuman: false,
                        wakeReason,
                    },
                    degradedMode: false,
                    degradedReason: "",
                    provider: "stub",
                    model: "test-planner",
                };
            },
            async chat() {
                return {
                    reply: "Default test planner chat reply.",
                    objectivePatch: null,
                    wakeReason: "chat_message",
                };
            },
            async summarize({ objective }) {
                return `Goal: ${objective?.goal || "test objective"}`;
            },
        });
    });

    after(() => {
        if (originalGeminiApiKey == null) {
            delete process.env.GEMINI_API_KEY;
            return;
        }
        process.env.GEMINI_API_KEY = originalGeminiApiKey;
    });

    it("lists productive market assets with active auction state", async () => {
        const response = await request(app)
            .get("/api/market/assets")
            .expect(200);

        expect(response.body.code).to.equal("market_assets_listed");
        expect(response.body.assets).to.have.length(1);
        expect(response.body.assets[0].publicMetadata.name).to.equal("Warehouse Alpha");
        expect(response.body.assets[0].market.hasActiveAuction).to.equal(true);
        expect(response.body.summary.totalProductiveTwins).to.equal(1);
        expect(response.body.summary.liveAuctions).to.equal(1);
        expect(response.body.summary.verifiedSharePct).to.equal(100);
        expect(response.body.summary.typeBreakdown.real_estate).to.equal(1);
        expect(response.body.summary.currentRentalCount).to.equal(0);
        expect(response.body.summary.highlights.topOpportunities).to.have.length(1);
        expect(response.body.summary.highlights.auctionsClosingSoon).to.have.length(1);
    });

    it("serves market listing from cache without forcing chain snapshot refresh", async () => {
        listAssetSnapshotsCalls = 0;
        const response = await request(app)
            .get("/api/market/assets")
            .expect(200);

        expect(response.body.code).to.equal("market_assets_listed");
        expect(response.body.assets).to.have.length(1);
        expect(listAssetSnapshotsCalls).to.equal(0);
    });

    it("applies free market screening filters server-side", async () => {
        const response = await request(app)
            .get("/api/market/assets")
            .query({
                search: "warehouse",
                type: "real_estate",
                minYield: "20",
                maxRisk: "40",
                verifiedOnly: "true",
                rentalReady: "true",
                hasAuction: "true",
            })
            .expect(200);

        expect(response.body.assets).to.have.length(1);
        expect(response.body.assets[0].tokenId).to.equal(7);
        expect(response.body.assets[0].screening.score).to.be.a("number");
        expect(response.body.summary.activeFilterCount).to.equal(7);
        expect(response.body.summary.browse.search).to.equal("warehouse");
        expect(response.body.summary.browse.type).to.equal("real_estate");
        expect(response.body.summary.browse.minYield).to.equal(20);
        expect(response.body.summary.browse.maxRisk).to.equal(40);
        expect(response.body.summary.browse.verifiedOnly).to.equal(true);
        expect(response.body.summary.browse.rentalReady).to.equal(true);
        expect(response.body.summary.browse.hasAuction).to.equal(true);
        expect(response.body.summary.universeProductiveTwins).to.equal(1);
    });

    it("returns 402 for premium analysis without a payment session", async () => {
        const response = await request(app)
            .get("/api/market/assets/7/analytics")
            .expect(402);

        expect(response.body.message).to.equal("Payment Required");
        expect(response.headers["x-stream-mode"]).to.equal("per-request");
        expect(response.headers["x-payment-currency"]).to.equal("USDC");
    });

    it("returns rich premium analysis once a valid payment session is supplied", async () => {
        const response = await request(app)
            .get("/api/market/assets/7/analytics")
            .set("x-stream-stream-id", "77")
            .expect(200);

        expect(response.body.code).to.equal("market_analysis_ready");
        expect(response.body.analytics.verdict).to.equal("BUY");
        expect(response.body.analytics.summary).to.include("Asset #7");
        expect(response.body.analytics.yieldAssessment).to.be.a("string");
        expect(response.body.analytics.marketContext.peerRank).to.equal(1);
        expect(response.body.analytics.marketContext.verifiedSharePct).to.equal(100);
        expect(response.body.analytics.auctionContext.activeAuction.auctionId).to.equal(3);
        expect(response.body.analytics.recentActivity).to.have.length(1);
        expect(response.body.paidVia.mode).to.equal("streaming");
        expect(response.body.paidVia.streamId).to.equal("77");
    });

    it("returns treasury optimization details for a paid rebalance", async () => {
        const response = await request(app)
            .post("/api/market/treasury/rebalance")
            .set("Authorization", `Bearer ${token}`)
            .set("x-stream-stream-id", "77")
            .send({})
            .expect(200);

        expect(response.body.code).to.equal("treasury_rebalanced");
        expect(response.body.optimization.objective).to.equal("highest_approved_return_first");
        expect(response.body.optimization.execution.deploymentCount).to.equal(1);
        expect(response.body.optimization.recallOrder).to.deep.equal([
            "stellar_amm",
            "blend_lending",
            "safe_yield",
        ]);
        expect(response.body.paidVia.mode).to.equal("streaming");
        expect(response.body.paidVia.streamId).to.equal("77");
    });

    it("loads live market positions for the managed agent wallet", async () => {
        auctionState = {
            ...auctionState,
            bids: [{
                bidId: 91,
                auctionId: 3,
                assetId: 7,
                bidder: agentKeypair.publicKey(),
                amountDisplay: "12.5",
                amountStroops: "125000000",
                placedAt: Math.floor(Date.now() / 1000),
                status: "active",
            }],
        };
        auctionState.highestBid = auctionState.bids[0];
        auctionState.highestBidDisplay = "12.5";
        auctionState.reserveMet = false;
        await agentState.upsertReservation(agentId, {
            bidId: 91,
            auctionId: 3,
            assetId: 7,
            issuer: issuerKeypair.publicKey(),
            reservedAmount: "125000000",
            status: "reserved",
        });
        await agentState.setTreasury(agentId, {
            positions: [
                {
                    positionId: "safe-1",
                    strategyFamily: "safe_yield",
                    venueId: "yield-vault",
                    allocatedAmount: "180000000",
                    projectedNetApy: "11.20",
                    status: "open",
                },
            ],
            summary: {
                deployed: "180000000",
                liquidBalance: "4250000000",
            },
        });

        const response = await request(app)
            .get("/api/market/positions")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body.code).to.equal("market_positions_loaded");
        expect(response.body.agentId).to.equal(agentId);
        expect(response.body.positions.ownedAssets).to.have.length(1);
        expect(response.body.positions.ownedAssets[0].tokenId).to.equal(7);
        expect(response.body.positions.sessions).to.have.length(1);
        expect(response.body.positions.sessions[0].id).to.equal(77);
        expect(response.body.positions.reservations).to.have.length(1);
        expect(response.body.positions.reservationExposure).to.have.length(1);
        expect(response.body.positions.reservationExposure[0].status).to.equal("leading");
        expect(response.body.positions.reservationExposure[0].reservedAmountDisplay).to.equal("12.5");
        expect(response.body.positions.treasury.positions).to.have.length(1);
        expect(response.body.positions.performance.realizedYield).to.equal("0");
        expect(response.body.positions.liquidity.walletBalanceDisplay).to.equal("425");
        expect(response.body.positions.liquidity.immediateBidHeadroomDisplay).to.equal("325");
        expect(response.body.positions.liquidity.status).to.equal("healthy");
    });

    it("opens a managed market payment session for the server-custodied agent", async () => {
        const response = await request(app)
            .post(`/api/agents/${agentId}/sessions`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                amount: "5",
                durationSeconds: 7200,
            })
            .expect(201);

        expect(response.body.code).to.equal("agent_session_opened");
        expect(response.body.action).to.equal("openPaymentSession");
        expect(response.body.session.id).to.equal(78);
        expect(response.body.session.recipient).to.equal(serviceRecipientKeypair.publicKey());
        expect(response.body.txHash).to.equal("session-open-78");

        const positionsResponse = await request(app)
            .get("/api/market/positions")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(positionsResponse.body.positions.sessions.some((session) => session.id === 78)).to.equal(true);
    });

    it("cancels a managed market payment session and returns refundable balance", async () => {
        await request(app)
            .post(`/api/agents/${agentId}/sessions`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                amount: "5",
                durationSeconds: 7200,
            })
            .expect(201);

        const response = await request(app)
            .post(`/api/agents/${agentId}/sessions/78/cancel`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body.code).to.equal("agent_session_cancelled");
        expect(response.body.action).to.equal("cancelPaymentSession");
        expect(response.body.session.id).to.equal(78);
        expect(response.body.session.isActive).to.equal(false);
        expect(response.body.txHash).to.equal("session-cancel-78");
        expect(response.body.refundableAmount).to.equal("50000000");

        const positionsResponse = await request(app)
            .get("/api/market/positions")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        const cancelled = positionsResponse.body.positions.sessions.find((session) => session.id === 78);
        expect(cancelled).to.exist;
        expect(cancelled.isActive).to.equal(false);
    });

    it("returns 402 for paid yield claim without a payment session", async () => {
        const response = await request(app)
            .post("/api/market/yield/claim")
            .set("Authorization", `Bearer ${token}`)
            .send({ tokenId: 7 })
            .expect(402);

        expect(response.body.message).to.equal("Payment Required");
        expect(response.headers["x-stream-rate"]).to.equal("0.01");
        expect(response.headers["x-payment-currency"]).to.equal("USDC");
    });

    it("claims yield through the paid market path once a valid session is supplied", async () => {
        const response = await request(app)
            .post("/api/market/yield/claim")
            .set("Authorization", `Bearer ${token}`)
            .set("x-stream-stream-id", "77")
            .send({ tokenId: 7 })
            .expect(200);

        expect(response.body.code).to.equal("market_yield_claimed");
        expect(response.body.amount).to.equal("3500000");
        expect(response.body.paidVia.mode).to.equal("streaming");
        expect(response.body.paidVia.streamId).to.equal("77");

        const stateResponse = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(stateResponse.body.state.performance.realizedYield).to.equal("3500000");
        expect(stateResponse.body.state.performance.paidActionFees).to.equal("100000");
        expect(stateResponse.body.state.performance.recentEvents.some((event) => event.category === "yield")).to.equal(true);
        expect(stateResponse.body.state.performance.recentEvents.some((event) => event.category === "fee")).to.equal(true);
    });

    it("returns 402 for paid yield routing without a payment session", async () => {
        const response = await request(app)
            .post("/api/market/yield/route")
            .set("Authorization", `Bearer ${token}`)
            .send({ tokenId: 7 })
            .expect(402);

        expect(response.body.message).to.equal("Payment Required");
        expect(response.headers["x-stream-rate"]).to.equal("0.03");
        expect(response.headers["x-payment-currency"]).to.equal("USDC");
    });

    it("routes yield through the paid treasury path once a valid session is supplied", async () => {
        const response = await request(app)
            .post("/api/market/yield/route")
            .set("Authorization", `Bearer ${token}`)
            .set("x-stream-stream-id", "77")
            .send({ tokenId: 7 })
            .expect(200);

        expect(response.body.code).to.equal("yield_routed");
        expect(response.body.claim.amount).to.equal("3500000");
        expect(response.body.optimization.objective).to.equal("highest_approved_return_first");
        expect(response.body.paidVia.mode).to.equal("streaming");
        expect(response.body.paidVia.streamId).to.equal("77");

        const stateResponse = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(stateResponse.body.state.performance.realizedYield).to.equal("3500000");
        expect(stateResponse.body.state.performance.paidActionFees).to.equal("300000");
        expect(stateResponse.body.state.performance.recentEvents.some((event) => event.category === "yield")).to.equal(true);
    });

    it("creates a managed agent and exposes its state", async () => {
        const response = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body.code).to.equal("agent_state_loaded");
        expect(response.body.agentId).to.equal(agentId);
        expect(response.body.state.wallet.publicKey).to.equal(agentKeypair.publicKey());
        expect(response.body.state.liquidity.walletBalanceDisplay).to.equal("425");
        expect(response.body.state.liquidity.targetReserveAmountDisplay).to.equal("200");
        expect(response.body.state.reservationExposure).to.deep.equal([]);
        expect(response.body.state.positions.assets).to.have.length(1);
        expect(response.body.state.runtime.status).to.equal("idle");
        expect(response.body.state.savedScreens).to.deep.equal([]);
        expect(response.body.state.watchlist).to.deep.equal([]);
    });

    it("loads the managed wallet readiness summary", async () => {
        const response = await request(app)
            .get(`/api/agents/${agentId}/wallet`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body.code).to.equal("agent_wallet_loaded");
        expect(response.body.wallet.publicKey).to.equal(agentKeypair.publicKey());
        expect(response.body.wallet.summary.funded).to.equal(true);
        expect(response.body.wallet.summary.hasPaymentTrustline).to.equal(true);
        expect(response.body.wallet.summary.paymentReady).to.equal(true);
        expect(response.body.wallet.summary.nativeBalanceDisplay).to.equal("80");
        expect(response.body.wallet.summary.paymentBalanceDisplay).to.equal("425");
        expect(response.body.wallet.summary.status).to.equal("ready");
    });

    it("loads dedicated performance attribution for the managed agent", async () => {
        await agentState.recordRealizedYield(agentId, "3500000", {
            message: "Yield claimed for asset #7",
        });
        await agentState.recordTreasuryReturn(agentId, "1500000", {
            message: "Treasury optimizer captured approved return",
        });
        await agentState.recordPaidActionFee(agentId, "100000", {
            action: "premium_analysis",
        });
        await agentState.recordAuctionOutcome(agentId, {
            outcome: "win",
            metadata: {
                auctionId: 3,
            },
        });

        const response = await request(app)
            .get(`/api/agents/${agentId}/performance`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body.code).to.equal("agent_performance_loaded");
        expect(response.body.performance.realizedYield).to.equal("3500000");
        expect(response.body.performance.treasuryReturn).to.equal("1500000");
        expect(response.body.performance.paidActionFees).to.equal("100000");
        expect(response.body.performance.netPnL).to.equal("4900000");
        expect(response.body.performance.attribution.winRatePct).to.equal(100);
        expect(response.body.performance.recentEvents.some((event) => event.category === "yield")).to.equal(true);
        expect(response.body.performance.recentEvents.some((event) => event.category === "treasury")).to.equal(true);
        expect(response.body.performance.recentEvents.some((event) => event.category === "auction")).to.equal(true);
    });

    it("persists saved screens and watchlist entries for the managed agent", async () => {
        const screenResponse = await request(app)
            .post(`/api/agents/${agentId}/screens`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Verified warehouses",
                filters: {
                    search: "warehouse",
                    type: "real_estate",
                    minYield: 20,
                    maxRisk: 40,
                    verifiedOnly: true,
                    hasAuction: true,
                },
                summary: {
                    totalProductiveTwins: 1,
                    activeFilterCount: 6,
                },
            })
            .expect(201);

        expect(screenResponse.body.code).to.equal("agent_screen_saved");
        expect(screenResponse.body.screen.name).to.equal("Verified warehouses");

        const watchResponse = await request(app)
            .post(`/api/agents/${agentId}/watchlist`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                tokenId: 7,
                name: "Warehouse Alpha",
                assetType: "real_estate",
                verificationStatus: "verified",
                yieldRate: 25,
                riskScore: 30,
            })
            .expect(201);

        expect(watchResponse.body.code).to.equal("agent_watchlist_added");
        expect(watchResponse.body.asset.tokenId).to.equal(7);

        const stateResponse = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(stateResponse.body.state.savedScreens).to.have.length(1);
        expect(stateResponse.body.state.savedScreens[0].filters.search).to.equal("warehouse");
        expect(stateResponse.body.state.watchlist).to.have.length(1);
        expect(stateResponse.body.state.watchlist[0].tokenId).to.equal(7);
    });

    it("runs the managed backend runtime and exposes live runtime state", async () => {
        installAgentBrain({
            async decide({ wakeReason }) {
                if (wakeReason === "start") {
                    return {
                        proposal: {
                            actionType: "route_yield",
                            actionArgs: {
                                tokenId: 7,
                            },
                            thesis: "Claim yield from productive twins and route it into treasury on startup.",
                            rationale: "Twin #7 already has claimable yield and treasury automation is enabled.",
                            confidence: 82,
                            blockedBy: "",
                            requiresHuman: false,
                            wakeReason,
                        },
                        degradedMode: false,
                        degradedReason: "",
                        provider: "test",
                        model: "deterministic",
                    };
                }

                return {
                    proposal: {
                        actionType: "hold",
                        actionArgs: {},
                        thesis: "Keep monitoring after the initial treasury route.",
                        rationale: "No additional deterministic action is required on this follow-up tick.",
                        confidence: 61,
                        blockedBy: "No deterministic test opportunity requires action.",
                        requiresHuman: false,
                        wakeReason,
                    },
                    degradedMode: false,
                    degradedReason: "",
                    provider: "test",
                    model: "deterministic",
                };
            },
            async chat() {
                return {
                    reply: "Deterministic test planner chat reply.",
                    objectivePatch: null,
                    wakeReason: "chat_message",
                    degradedMode: false,
                    degradedReason: "",
                };
            },
            async summarize({ objective }) {
                return `Goal: ${objective?.goal || "test objective"}`;
            },
        });

        await request(app)
            .post(`/api/agents/${agentId}/screens`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Runtime shortlist",
                filters: {
                    search: "warehouse",
                    type: "real_estate",
                    minYield: 20,
                    maxRisk: 40,
                    verifiedOnly: true,
                    hasAuction: true,
                },
                summary: {
                    totalProductiveTwins: 1,
                    activeFilterCount: 6,
                },
            })
            .expect(201);

        await request(app)
            .post(`/api/agents/${agentId}/watchlist`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                tokenId: 7,
                name: "Warehouse Alpha",
                assetType: "real_estate",
                verificationStatus: "verified",
                yieldRate: 25,
                riskScore: 30,
            })
            .expect(201);

        const startResponse = await request(app)
            .post(`/api/agents/${agentId}/runtime/start`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                executeTreasury: true,
                executeClaims: true,
            })
            .expect(200);

        expect(startResponse.body.code).to.equal("agent_runtime_started");
        expect(startResponse.body.runtime.running).to.equal(true);
        expect(startResponse.body.runtime.lastSummary.autoClaims).to.equal(1);
        expect(startResponse.body.runtime.lastSummary.treasuryExecuted).to.equal(true);
        expect(startResponse.body.runtime.lastSummary.screenMatches).to.equal(1);
        expect(startResponse.body.runtime.lastSummary.watchlistSignals).to.equal(1);

        const firstHeartbeat = Number(startResponse.body.runtime.heartbeatCount || 0);

        const tickResponse = await request(app)
            .post(`/api/agents/${agentId}/runtime/tick`)
            .set("Authorization", `Bearer ${token}`)
            .send({})
            .expect(200);

        expect(tickResponse.body.code).to.equal("agent_runtime_ticked");
        expect(Number(tickResponse.body.runtime.heartbeatCount)).to.be.greaterThan(firstHeartbeat);

        const stateResponse = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(stateResponse.body.state.runtime.running).to.equal(true);
        expect(stateResponse.body.state.brain.degradedMode).to.equal(false);
        expect(stateResponse.body.state.degradedMode).to.equal(false);
        expect(stateResponse.body.state.lastWakeReason).to.equal("manual");
        expect(stateResponse.body.state.performance.realizedYield).to.equal("3500000");
        expect(stateResponse.body.state.performance.attribution.yieldContribution).to.equal("3500000");
        expect(stateResponse.body.state.performance.attribution.grossPositivePnL).to.equal("3500000");
        expect(stateResponse.body.state.performance.recentEvents.some((event) => event.category === "yield")).to.equal(true);
        expect(stateResponse.body.state.treasury.positions).to.have.length(1);
        expect(stateResponse.body.state.runtime.lastSummary.screenHighlights[0].topTokenId).to.equal(7);
        expect(stateResponse.body.state.runtime.lastSummary.watchlistHighlights[0].tokenId).to.equal(7);
        expect(stateResponse.body.state.decisionLog.some((entry) => entry.message.includes("Saved screen resurfaced"))).to.equal(true);
        expect(stateResponse.body.state.decisionLog.some((entry) => entry.message.includes("Watchlist signal"))).to.equal(true);

        const pauseResponse = await request(app)
            .post(`/api/agents/${agentId}/runtime/pause`)
            .set("Authorization", `Bearer ${token}`)
            .send({})
            .expect(200);

        expect(pauseResponse.body.code).to.equal("agent_runtime_paused");
        expect(pauseResponse.body.runtime.running).to.equal(false);
        expect(pauseResponse.body.runtime.status).to.equal("paused");
    });

    it("updates the real objective and plans immediately when the objective changes", async () => {
        installAgentBrain({
            async decide({ objective, wakeReason }) {
                return {
                    proposal: {
                        actionType: "watch",
                        actionArgs: {},
                        thesis: `Stay patient and wait for discounted warehouse entries that match "${objective.goal}".`,
                        rationale: "No live auction beats the new strategy yet, so keep monitoring.",
                        confidence: 74,
                        blockedBy: "No live auction currently clears the updated objective.",
                        requiresHuman: false,
                        wakeReason,
                    },
                    degradedMode: false,
                    degradedReason: "",
                    provider: "stub",
                    model: "test-planner",
                };
            },
            async chat() {
                throw new Error("chat should not be called in this objective test");
            },
            async summarize({ objective }) {
                return `Goal: ${objective.goal}`;
            },
        });

        const response = await request(app)
            .post(`/api/agents/${agentId}/objective`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                goal: "Accumulate discounted warehouse opportunities and preserve 20% liquidity.",
                style: "aggressive",
                instructions: "Prioritize warehouse auctions but wait if spreads are thin.",
            })
            .expect(200);

        expect(response.body.code).to.equal("agent_objective_updated");
        expect(response.body.objective.style).to.equal("aggressive");
        expect(response.body.wake.queued).to.equal(true);

        await waitForWake();

        const stateResponse = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(stateResponse.body.state.objective.goal).to.include("discounted warehouse");
        expect(stateResponse.body.state.objective.style).to.equal("aggressive");
        expect(stateResponse.body.state.brain.currentThesis).to.include("discounted warehouse");
        expect(stateResponse.body.state.brain.nextAction.actionType).to.equal("watch");
        expect(stateResponse.body.state.brain.degradedMode).to.equal(false);
        expect(stateResponse.body.state.lastWakeReason).to.equal("objective_changed");
        expect(stateResponse.body.state.brain.provider).to.equal("stub");
        expect(stateResponse.body.state.journalPreview[0].message).to.include("Planned watch");
    });

    it("uses the managed chat route to update strategy, persist memory, and expose the journal", async () => {
        installAgentBrain({
            async decide({ objective, wakeReason }) {
                return {
                    proposal: {
                        actionType: "hold",
                        actionArgs: {},
                        thesis: `Focus remains on ${objective.goal}`,
                        rationale: "The shortlist is thin, so monitoring is better than forcing a trade.",
                        confidence: 68,
                        blockedBy: "No shortlist candidate currently beats the liquidity floor.",
                        requiresHuman: false,
                        wakeReason,
                    },
                    degradedMode: false,
                    degradedReason: "",
                    provider: "stub",
                    model: "test-planner",
                };
            },
            async chat({ message }) {
                return {
                    reply: "I updated the plan toward an aggressive warehouse accumulation strategy and will watch for a cleaner entry before bidding.",
                    objectivePatch: {
                        goal: "Build a discounted warehouse position with tight liquidity discipline.",
                        style: "aggressive",
                        instructions: message,
                    },
                    wakeReason: "chat_objective_update",
                    degradedMode: false,
                    degradedReason: "",
                    provider: "stub",
                    model: "test-planner",
                };
            },
            async summarize({ objective, recentMessages }) {
                return `Goal: ${objective.goal} · Recent chat turns: ${recentMessages.length}`;
            },
        });

        const chatResponse = await request(app)
            .post(`/api/agents/${agentId}/chat`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                message: "Shift to an aggressive warehouse strategy but keep tight liquidity discipline.",
            })
            .expect(200);

        expect(chatResponse.body.code).to.equal("agent_chat_complete");
        expect(chatResponse.body.reply).to.include("aggressive warehouse accumulation strategy");
        expect(chatResponse.body.objective.style).to.equal("aggressive");
        expect(chatResponse.body.degradedMode).to.equal(false);
        expect(chatResponse.body.wake.reason).to.equal("chat_objective_update");

        await waitForWake();

        const [stateResponse, journalResponse] = await Promise.all([
            request(app)
                .get(`/api/agents/${agentId}/state`)
                .set("Authorization", `Bearer ${token}`)
                .expect(200),
            request(app)
                .get(`/api/agents/${agentId}/journal`)
                .set("Authorization", `Bearer ${token}`)
                .expect(200),
        ]);

        expect(stateResponse.body.state.objective.goal).to.include("warehouse position");
        expect(stateResponse.body.state.chatPreview.some((entry) => entry.role === "assistant")).to.equal(true);
        expect(stateResponse.body.state.brain.nextAction.actionType).to.equal("hold");
        expect(stateResponse.body.state.lastWakeReason).to.equal("chat_objective_update");
        expect(journalResponse.body.memorySummary.summary).to.include("Goal:");
        expect(journalResponse.body.journal.some((entry) => entry.kind === "conversation")).to.equal(true);
        expect(journalResponse.body.journal.some((entry) => entry.message.includes("Agent conversation updated"))).to.equal(true);
    });

    it("lets the managed runtime prioritize shortlisted auctions before settling", async () => {
        installAgentBrain({
            async decide({ context, wakeReason }) {
                const readySettlement = Array.isArray(context?.readySettlements) ? context.readySettlements[0] : null;
                const bidFocus = context?.topBidFocus || context?.bidFocus || context?.topBidCandidate || null;
                return {
                    proposal: {
                        actionType: readySettlement
                            ? "settle_auction"
                            : bidFocus?.eligible
                                ? "bid"
                                : "hold",
                        actionArgs: readySettlement
                            ? { auctionId: Number(readySettlement.auctionId) }
                            : bidFocus?.eligible
                            ? {
                                auctionId: Number(bidFocus.auctionId),
                                amount: String(bidFocus.nextBidDisplay || bidFocus.nextBidAmountDisplay || ""),
                            }
                            : {},
                        thesis: readySettlement
                            ? `Settle closed auction #${Number(readySettlement.auctionId)}.`
                            : bidFocus?.eligible
                            ? `Bid on shortlisted auction #${Number(bidFocus.auctionId)}.`
                            : "No shortlisted auction clears the mandate yet.",
                        rationale: readySettlement
                            ? "Closed shortlisted auction is ready for settlement."
                            : bidFocus?.eligible
                            ? `Priority signal: ${(bidFocus.prioritySource || []).join(" + ")}`
                            : "No shortlisted auction clears the mandate yet.",
                        confidence: 79,
                        blockedBy: readySettlement || bidFocus?.eligible ? "" : "No shortlisted auction clears the mandate yet.",
                        requiresHuman: false,
                        wakeReason,
                    },
                    degradedMode: false,
                    degradedReason: "",
                    provider: "stub",
                    model: "test-planner",
                };
            },
            async chat() {
                return {
                    reply: "Shortlist auction planner test stub.",
                    objectivePatch: null,
                    wakeReason: "chat_message",
                };
            },
            async summarize({ objective }) {
                return `Goal: ${objective?.goal || "test objective"}`;
            },
        });

        await store.upsertAsset({
            tokenId: 8,
            assetType: 1,
            currentOwner: competitorAgentKeypair.publicKey(),
            issuer: issuerKeypair.publicKey(),
            verificationStatusLabel: "verified",
            claimableYield: "1500000",
            totalYieldDeposited: "10000000",
            rentalReady: true,
            publicMetadataURI: "ipfs://land-beta",
            stream: {
                flowRate: "5000",
            },
            assetPolicy: {
                frozen: false,
                disputed: false,
                revoked: false,
            },
        });
        externalAuctionState = {
            auctionId: 9,
            assetId: 8,
            seller: competitorAgentKeypair.publicKey(),
            sellerOwnerPublicKey: competitorOwnerKeypair.publicKey(),
            reservePrice: "1200000000",
            reservePriceDisplay: "120.0000000",
            currency: "USDC",
            startTime: Math.floor(Date.now() / 1000) - 60,
            endTime: Math.floor(Date.now() / 1000) + 3600,
            status: "active",
            bids: [],
            highestBid: null,
            highestBidDisplay: null,
            reserveMet: false,
            assetType: "land",
            title: "Lekki Parcel Beta",
        };
        await store.upsertAsset({
            tokenId: 9,
            assetType: 1,
            currentOwner: competitorAgentKeypair.publicKey(),
            issuer: issuerKeypair.publicKey(),
            verificationStatusLabel: "verified",
            claimableYield: "6000000",
            totalYieldDeposited: "10000000",
            rentalReady: true,
            publicMetadataURI: "ipfs://estate-gamma",
            stream: {
                flowRate: "9000",
            },
            assetPolicy: {
                frozen: false,
                disputed: false,
                revoked: false,
            },
        });
        secondaryAuctionState = {
            auctionId: 10,
            assetId: 9,
            seller: competitorAgentKeypair.publicKey(),
            sellerOwnerPublicKey: competitorOwnerKeypair.publicKey(),
            reservePrice: "1000000000",
            reservePriceDisplay: "100.0000000",
            currency: "USDC",
            startTime: Math.floor(Date.now() / 1000) - 60,
            endTime: Math.floor(Date.now() / 1000) + 3600,
            status: "active",
            bids: [],
            highestBid: null,
            highestBidDisplay: null,
            reserveMet: false,
            assetType: "real_estate",
            title: "Estate Gamma",
        };

        await request(app)
            .post(`/api/agents/${agentId}/screens`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Land shortlist",
                filters: {
                    search: "land",
                    type: "land",
                    minYield: 10,
                    maxRisk: 40,
                    verifiedOnly: true,
                    hasAuction: true,
                },
                summary: {
                    totalProductiveTwins: 2,
                    activeFilterCount: 6,
                },
            })
            .expect(201);

        await request(app)
            .post(`/api/agents/${agentId}/watchlist`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                tokenId: 8,
                name: "Lekki Parcel Beta",
                assetType: "land",
                verificationStatus: "verified",
                yieldRate: 15,
                riskScore: 30,
            })
            .expect(201);

        const startResponse = await request(app)
            .post(`/api/agents/${agentId}/runtime/start`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                executeTreasury: false,
                executeClaims: false,
            })
            .expect(200);

        expect(startResponse.body.runtime.lastSummary.autoBids).to.equal(1);
        expect(startResponse.body.runtime.lastSummary.bidFocus.assetId).to.equal(8);
        expect(startResponse.body.runtime.lastSummary.bidFocus.prioritySource).to.deep.equal(["watchlist", "saved_screen"]);
        expect(externalAuctionState.highestBid).to.not.equal(null);
        expect(externalAuctionState.highestBid.bidder).to.equal(agentKeypair.publicKey());
        expect(secondaryAuctionState.highestBid).to.equal(null);

        externalAuctionState = {
            ...externalAuctionState,
            endTime: Math.floor(Date.now() / 1000) - 1,
        };

        const tickResponse = await request(app)
            .post(`/api/agents/${agentId}/runtime/tick`)
            .set("Authorization", `Bearer ${token}`)
            .send({})
            .expect(200);

        expect(tickResponse.body.runtime.lastSummary.settledAuctions).to.equal(1);
        expect(externalAuctionState.status).to.equal("settled");

        const stateResponse = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(stateResponse.body.state.performance.auctionWins).to.equal(1);
        expect(stateResponse.body.state.performance.attribution.auctionWins).to.equal(1);
        expect(stateResponse.body.state.performance.attribution.winRatePct).to.equal(100);
        expect(stateResponse.body.state.performance.recentEvents.some((event) => event.category === "auction")).to.equal(true);
        expect(stateResponse.body.state.performance.paidActionFees).to.equal("500000");
        expect(stateResponse.body.state.reservations).to.have.length(0);
        expect(stateResponse.body.state.positions.assets.map((asset) => Number(asset.tokenId))).to.include(8);
        expect(stateResponse.body.state.decisionLog.some((entry) => entry.detail?.includes("focus watchlist + saved_screen"))).to.equal(true);
    });

    it("persists mandate updates server-side", async () => {
        await request(app)
            .post(`/api/agents/${agentId}/mandate`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                approvalThreshold: "400",
                liquidityFloorPct: 18,
                rebalanceCadenceMinutes: 30,
            })
            .expect(200);

        const response = await request(app)
            .get(`/api/agents/${agentId}/mandate`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body.mandate.approvalThreshold).to.equal("400");
        expect(response.body.mandate.liquidityFloorPct).to.equal(18);
        expect(response.body.mandate.rebalanceCadenceMinutes).to.equal(30);
    });

    it("places a paid auction bid and records the platform fee", async () => {
        const bidResponse = await request(app)
            .post("/api/market/auctions/3/bids")
            .set("Authorization", `Bearer ${token}`)
            .set("X-Stream-Stream-Id", "77")
            .send({
                amount: "275.0000000",
            })
            .expect(201);

        expect(bidResponse.body.code).to.equal("auction_bid_placed");
        expect(bidResponse.body.bid.amountDisplay).to.equal("275.0000000");

        const stateResponse = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(stateResponse.body.state.performance.paidActionFees).to.equal("500000");
        expect(stateResponse.body.state.performance.attribution.feeDrag).to.equal("500000");
        expect(stateResponse.body.state.performance.recentEvents.some((event) => event.category === "fee")).to.equal(true);
        expect(stateResponse.body.state.reservations).to.have.length(1);
        expect(stateResponse.body.state.reservations[0].reservedAmount).to.equal("2750000000");
    });

    it("returns auction depth and recent bid flow in market asset details", async () => {
        await request(app)
            .post("/api/market/auctions/3/bids")
            .set("Authorization", `Bearer ${token}`)
            .set("X-Stream-Stream-Id", "77")
            .send({
                amount: "275.0000000",
            })
            .expect(201);

        const response = await request(app)
            .get("/api/market/assets/7")
            .expect(200);

        expect(response.body.code).to.equal("market_asset_loaded");
        expect(response.body.auctions).to.have.length(1);
        expect(response.body.auctions[0].bidCount).to.equal(1);
        expect(response.body.auctions[0].uniqueBidderCount).to.equal(1);
        expect(response.body.auctions[0].minimumNextBidDisplay).to.equal("276");
        expect(response.body.auctions[0].marketDepth.minimumNextBid).to.equal("276");
        expect(response.body.auctions[0].bidLadder).to.have.length(1);
        expect(response.body.auctions[0].recentBids).to.have.length(1);
        expect(response.body.auctions[0].bidLadder[0].amountDisplay).to.equal("275.0000000");
    });
});
