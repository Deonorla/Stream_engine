const request = require("supertest");
const { expect } = require("chai");
const { Keypair } = require("@stellar/stellar-sdk");

const createApp = require("../index");
const { MemoryIndexerStore } = require("../services/indexerStore");
const { AgentStateService } = require("../services/agentStateService");

describe("Continuum API Integration", function () {
    let app;
    let store;
    let agentState;
    let ownerKeypair;
    let agentKeypair;
    let issuerKeypair;
    let serviceRecipientKeypair;
    let usdcIssuerKeypair;
    let token;
    let agentId;
    let auctionState;
    let ownerWallets;

    function createManagedWallet(ownerPublicKey) {
        const normalizedOwner = String(ownerPublicKey || "").toUpperCase();
        if (!ownerWallets.has(normalizedOwner)) {
            ownerWallets.set(normalizedOwner, {
                ownerPublicKey: normalizedOwner,
                publicKey: ownerKeypair.publicKey() === normalizedOwner
                    ? agentKeypair.publicKey()
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

        const services = {
            store,
            ipfsService: {
                async fetchJSON(uri) {
                    return {
                        uri,
                        metadata: {
                            name: "Warehouse Alpha",
                            description: "Lagos logistics facility",
                            category: "real_estate",
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
                if (tokenId && Number(tokenId) !== Number(auctionState.assetId)) {
                    return [];
                }
                if (status && status !== auctionState.status) {
                    return [];
                }
                return [{ ...auctionState }];
            },
            async getAuction(auctionId) {
                if (Number(auctionId) !== Number(auctionState.auctionId)) {
                    return null;
                }
                return { ...auctionState };
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
                if (Number(auctionId) !== Number(auctionState.auctionId)) {
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
                    assetId: Number(auctionState.assetId),
                    bidder: bidderWallet.publicKey,
                    amountDisplay: String(amount),
                    amountStroops: "2750000000",
                    placedAt: Math.floor(Date.now() / 1000),
                    status: "active",
                };
                await agentState.upsertReservation(bidderProfile.agentId, {
                    bidId: bid.bidId,
                    auctionId: Number(auctionId),
                    assetId: Number(auctionState.assetId),
                    issuer: issuerKeypair.publicKey(),
                    reservedAmount: bid.amountStroops,
                    status: "reserved",
                });
                await agentState.appendDecision(bidderProfile.agentId, {
                    type: "action",
                    message: `Bid placed on auction #${auctionId}`,
                    detail: `${amount} USDC reserved for Warehouse Alpha.`,
                    amount: `-${amount}`,
                });
                auctionState = {
                    ...auctionState,
                    bids: [bid],
                    highestBid: bid,
                    highestBidDisplay: String(amount),
                    reserveMet: true,
                };
                return {
                    bid,
                    auction: { ...auctionState },
                };
            },
            async settleAuction({ auctionId }) {
                if (Number(auctionId) !== Number(auctionState.auctionId)) {
                    throw Object.assign(new Error("Auction not found"), {
                        status: 404,
                        code: "auction_not_found",
                    });
                }
                auctionState = {
                    ...auctionState,
                    status: "settled",
                    winningBidId: 11,
                };
                return {
                    auction: { ...auctionState },
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
