const request = require("supertest");
const { expect } = require("chai");
const { Keypair } = require("@stellar/stellar-sdk");

const createApp = require("../index");
const { MemoryIndexerStore } = require("../services/indexerStore");
const { AgentStateService } = require("../services/agentStateService");

describe("Continuum API Integration", function () {
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
    let ownerWallets;

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

    beforeEach(async () => {
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

        services = {
            store,
            ipfsService: {
                async fetchJSON(uri) {
                    return {
                        uri,
                        metadata: {
                            name: String(uri).includes("vehicle") ? "Truck Beta" : "Warehouse Alpha",
                            description: String(uri).includes("vehicle") ? "Fleet vehicle" : "Lagos logistics facility",
                            category: String(uri).includes("vehicle") ? "vehicle" : "real_estate",
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
                    if (String(sessionId) !== "77") {
                        return null;
                    }
                    return {
                        id: 77,
                        isActive: true,
                        isFrozen: false,
                        sender: agentKeypair.publicKey(),
                        recipient: serviceRecipientKeypair.publicKey(),
                    };
                },
                async getAssetSnapshot(tokenId) {
                    return store.getAsset(Number(tokenId));
                },
                async listAssetSnapshots({ owner } = {}) {
                    return store.listAssets({ owner });
                },
                async listSessions({ owner } = {}) {
                    if (owner && String(owner).toUpperCase() !== agentKeypair.publicKey().toUpperCase()) {
                        return [];
                    }
                    return [{
                        id: 77,
                        sender: agentKeypair.publicKey(),
                        recipient: serviceRecipientKeypair.publicKey(),
                        isActive: true,
                        sessionStatus: "active",
                        refundableAmount: "1500000",
                        consumedAmount: "500000",
                    }];
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
                    };
                    await agentState.setTreasury(currentAgentId, treasury);
                    return treasury;
                },
            },
        };

        services.auctionEngine = {
            async listAuctions({ status, tokenId } = {}) {
                return [auctionState, externalAuctionState]
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
                    bidId: 11,
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
                } else {
                    externalAuctionState = nextAuction;
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
                        const performance = await agentState.getPerformance(winnerProfile.agentId);
                        await agentState.updatePerformance(winnerProfile.agentId, {
                            auctionWins: Number(performance.auctionWins || 0) + 1,
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
                } else {
                    externalAuctionState = nextAuction;
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
    });

    it("lists productive market assets with active auction state", async () => {
        const response = await request(app)
            .get("/api/market/assets")
            .expect(200);

        expect(response.body.code).to.equal("market_assets_listed");
        expect(response.body.assets).to.have.length(1);
        expect(response.body.assets[0].publicMetadata.name).to.equal("Warehouse Alpha");
        expect(response.body.assets[0].market.hasActiveAuction).to.equal(true);
    });

    it("returns 402 for premium analysis without a payment session", async () => {
        const response = await request(app)
            .get("/api/market/assets/7/analytics")
            .expect(402);

        expect(response.body.message).to.equal("Payment Required");
        expect(response.headers["x-stream-mode"]).to.equal("per-request");
        expect(response.headers["x-payment-currency"]).to.equal("USDC");
    });

    it("creates a managed agent and exposes its state", async () => {
        const response = await request(app)
            .get(`/api/agents/${agentId}/state`)
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body.code).to.equal("agent_state_loaded");
        expect(response.body.agentId).to.equal(agentId);
        expect(response.body.state.wallet.publicKey).to.equal(agentKeypair.publicKey());
        expect(response.body.state.positions.assets).to.have.length(1);
        expect(response.body.state.runtime.status).to.equal("idle");
    });

    it("runs the managed backend runtime and exposes live runtime state", async () => {
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
        expect(stateResponse.body.state.performance.realizedYield).to.equal("7000000");
        expect(stateResponse.body.state.treasury.positions).to.have.length(1);

        const pauseResponse = await request(app)
            .post(`/api/agents/${agentId}/runtime/pause`)
            .set("Authorization", `Bearer ${token}`)
            .send({})
            .expect(200);

        expect(pauseResponse.body.code).to.equal("agent_runtime_paused");
        expect(pauseResponse.body.runtime.running).to.equal(false);
        expect(pauseResponse.body.runtime.status).to.equal("paused");
    });

    it("lets the managed runtime bid into and settle an external auction", async () => {
        await store.upsertAsset({
            tokenId: 8,
            assetType: 2,
            currentOwner: competitorAgentKeypair.publicKey(),
            issuer: issuerKeypair.publicKey(),
            verificationStatusLabel: "verified",
            claimableYield: "1500000",
            totalYieldDeposited: "10000000",
            rentalReady: true,
            publicMetadataURI: "ipfs://vehicle-beta",
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
            assetType: "vehicle",
            title: "Truck Beta",
        };

        const startResponse = await request(app)
            .post(`/api/agents/${agentId}/runtime/start`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                executeTreasury: false,
                executeClaims: false,
            })
            .expect(200);

        expect(startResponse.body.runtime.lastSummary.autoBids).to.equal(1);
        expect(externalAuctionState.highestBid).to.not.equal(null);
        expect(externalAuctionState.highestBid.bidder).to.equal(agentKeypair.publicKey());

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
        expect(stateResponse.body.state.performance.paidActionFees).to.equal("500000");
        expect(stateResponse.body.state.reservations).to.have.length(0);
        expect(stateResponse.body.state.positions.assets.map((asset) => Number(asset.tokenId))).to.include(8);
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
        expect(stateResponse.body.state.reservations).to.have.length(1);
        expect(stateResponse.body.state.reservations[0].reservedAmount).to.equal("2750000000");
    });
});
