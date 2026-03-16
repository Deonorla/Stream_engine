const request = require("supertest");
const { expect } = require("chai");
const { ethers } = require("ethers");
const createApp = require("../index");

describe("RWA API Integration", function () {
    let app;
    let store;
    let tagHash;

    beforeEach(() => {
        const activities = [
            {
                tokenId: 7,
                eventName: "AssetRegistered",
                txHash: "0xabc",
                blockNumber: 1,
                logIndex: 0,
                metadata: {},
            },
        ];

        const cidHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://bafytestcid"));
        tagHash = ethers.keccak256(ethers.toUtf8Bytes("tag-7"));

        store = {
            asset: {
                tokenId: 7,
                assetType: 1,
                cidHash,
                tagHash,
                issuer: "0xissuer",
                activeStreamId: 0,
                metadataURI: "ipfs://bafytestcid",
                tokenURI: "ipfs://bafytestcid",
                currentOwner: "0xowner",
            },
            async listAssets() {
                return [this.asset];
            },
            async getAsset(tokenId) {
                return Number(tokenId) === 7 ? this.asset : null;
            },
            async upsertAsset(asset) {
                this.asset = asset;
            },
            async getActivities(tokenId) {
                return Number(tokenId) === 7 ? activities : [];
            },
            async findAssetByStreamId() {
                return null;
            },
            async getLastProcessedBlock() {
                return 0;
            },
            async setLastProcessedBlock() {},
            async recordActivity() {},
        };

        app = createApp({
            recipientAddress: "0xRecipientMock",
            paymentTokenAddress: "0xUsdcMock",
            tokenSymbol: "USDC",
            tokenDecimals: 6,
            chainId: 420420417,
            flowPayContractAddress: "0xMock",
            routes: {},
            services: {
                ipfsService: {
                    async pinJSON(metadata) {
                        return {
                            cid: "bafytestcid",
                            uri: "ipfs://bafytestcid",
                            metadata,
                            pinned: false,
                        };
                    },
                    async fetchJSON() {
                        return {
                            cid: "bafytestcid",
                            uri: "ipfs://bafytestcid",
                            metadata: {
                                name: "Lagos Rental Asset",
                                description: "Rental metadata",
                            },
                        };
                    },
                },
                chainService: {
                    signer: { address: "0xsigner" },
                    provider: {
                        async getNetwork() {
                            return { chainId: 420420417n };
                        },
                    },
                    assetNFTAddress: "0xAssetNft",
                    isConfigured() {
                        return false;
                    },
                    async mintAsset() {
                        return { tokenId: 7, txHash: "0xtest" };
                    },
                    async getAssetSnapshot() {
                        return store.asset;
                    },
                },
                store,
                indexer: {
                    async sync() {
                        return { indexed: 0 };
                    },
                },
            },
        });
    });

    it("pins metadata and returns a canonical IPFS URI", async function () {
        const response = await request(app)
            .post("/api/rwa/ipfs/metadata")
            .send({
                metadata: {
                    name: "Asset #1",
                    description: "FlowPay rental asset",
                },
            });

        expect(response.status).to.equal(201);
        expect(response.body.cid).to.equal("bafytestcid");
        expect(response.body.uri).to.equal("ipfs://bafytestcid");
    });

    it("mints an asset and returns a verification payload", async function () {
        const response = await request(app)
            .post("/api/rwa/assets")
            .send({
                issuer: "0xowner",
                assetType: 1,
                metadata: {
                    name: "Asset #7",
                    description: "Backed by rental flow",
                },
                tagHash,
            });

        expect(response.status).to.equal(201);
        expect(response.body.tokenId).to.equal(7);
        expect(response.body.metadataURI).to.equal("ipfs://bafytestcid");
        expect(response.body.verificationPayload).to.be.a("string");
        expect(response.body.asset.tokenId).to.equal(7);
    });

    it("verifies an asset using the payload and returns immutable activity", async function () {
        const mintResponse = await request(app)
            .post("/api/rwa/assets")
            .send({
                issuer: "0xowner",
                assetType: 1,
                metadata: {
                    name: "Asset #7",
                },
                tagHash,
            });

        const response = await request(app)
            .post("/api/rwa/verify")
            .send({
                payload: mintResponse.body.verificationPayload,
            });

        expect(response.status).to.equal(200);
        expect(response.body.authentic).to.equal(true);
        expect(response.body.asset.tokenId).to.equal(7);
        expect(response.body.metadata.name).to.equal("Lagos Rental Asset");
        expect(response.body.activity).to.have.length(1);
    });
});
