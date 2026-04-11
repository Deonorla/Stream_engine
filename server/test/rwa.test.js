const request = require("supertest");
const { expect } = require("chai");
const { Keypair } = require("@stellar/stellar-sdk");
const createApp = require("../index");
const {
    buildAttestationAuthorizationMessage,
    buildAttestationRevocationAuthorizationMessage,
} = require("../services/issuerAuthorization");
const { parseVerificationPayload } = require("../services/verificationPayload");
const { EvidenceVaultService } = require("../services/evidenceVault");
const { hashJson, hashText } = require("../services/rwaModel");

describe("RWA API Integration", function () {
    let app;
    let store;
    let issuerWallet;
    let backendSigner;
    let managedAgentPublicKey;
    let ipfsPins;

    function createMockStellarSigner() {
        const keypair = Keypair.random();
        return {
            address: keypair.publicKey(),
            publicKey: keypair.publicKey(),
            async signMessage(message) {
                return Buffer.from(keypair.sign(Buffer.from(message))).toString("base64");
            },
        };
    }

    const basePublicMetadata = {
        name: "Lagos Rental Asset",
        description: "Verified productive rental twin",
        image: "https://example.com/asset.jpg",
        rightsModel: "verified_rental_asset",
    };

    const baseEvidenceBundle = {
        documents: {
            deed: { hash: "0xdeed", issuedAt: "2026-03-01T00:00:00Z" },
            survey: { hash: "0xsurvey", issuedAt: "2026-03-02T00:00:00Z" },
            valuation: { hash: "0xvaluation", issuedAt: "2026-03-03T00:00:00Z", expiresAt: "2026-12-31T00:00:00Z" },
            inspection: { hash: "0xinspection", issuedAt: "2026-03-04T00:00:00Z", expiresAt: "2026-12-31T00:00:00Z" },
            insurance: { hash: "0xinsurance", issuedAt: "2026-03-05T00:00:00Z", expiresAt: "2026-12-31T00:00:00Z" },
            tax: { hash: "0xtax", issuedAt: "2026-03-06T00:00:00Z", expiresAt: "2026-12-31T00:00:00Z" },
        },
    };

    async function buildAttestationAuthorization({
        tokenId = 7,
        role = "lawyer",
        attestor = issuerWallet.address,
        evidenceHash = "0xdeed",
        statementType = "title_review_complete",
        expiry = 0,
        signer = issuerWallet,
    } = {}) {
        const message = buildAttestationAuthorizationMessage({
            tokenId,
            role,
            attestor,
            evidenceHash,
            statementType,
            expiry,
            issuedAt: "2026-03-18T00:00:00Z",
            nonce: "attest-7",
        });

        return {
            issuedAt: "2026-03-18T00:00:00Z",
            nonce: "attest-7",
            signerAddress: attestor,
            signatureType: "stellar",
            signature: await signer.signMessage(message),
        };
    }

    async function buildAttestationRevocationAuthorization({
        attestationId = 1,
        attestor = issuerWallet.address,
        reason = "title opinion superseded",
        signer = issuerWallet,
    } = {}) {
        const message = buildAttestationRevocationAuthorizationMessage({
            attestationId,
            attestor,
            reason,
            issuedAt: "2026-03-18T00:00:00Z",
            nonce: "revoke-7",
        });

        return {
            issuedAt: "2026-03-18T00:00:00Z",
            nonce: "revoke-7",
            signerAddress: attestor,
            signatureType: "stellar",
            signature: await signer.signMessage(message),
        };
    }

    beforeEach(() => {
        issuerWallet = createMockStellarSigner();
        backendSigner = createMockStellarSigner();
        managedAgentPublicKey = Keypair.random().publicKey();
        ipfsPins = new Map();

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

        store = {
            asset: null,
            session: null,
            async listAssets({ owner } = {}) {
                if (!this.asset) {
                    return [];
                }
                if (!owner) {
                    return [this.asset];
                }
                const normalizedOwner = String(owner || "").toUpperCase();
                return (
                    normalizedOwner === String(this.asset.currentOwner || "").toUpperCase()
                    || normalizedOwner === String(this.asset.issuer || "").toUpperCase()
                )
                    ? [this.asset]
                    : [];
            },
            async getAsset(tokenId) {
                return Number(tokenId) === 7 ? this.asset : null;
            },
            async upsertAsset(asset) {
                this.asset = asset;
            },
            async getSession(sessionId) {
                return Number(sessionId) === Number(this.session?.id) ? this.session : null;
            },
            async upsertSession(session) {
                this.session = session;
            },
            async listSessions() {
                return this.session ? [this.session] : [];
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
            recipientAddress: "GSERVICERECIPIENT11111111111111111111111111111111111111",
            paymentTokenAddress: "stellar:usdc-sac",
            tokenSymbol: "USDC",
            tokenDecimals: 7,
            chainId: 0,
            streamEngineContractAddress: "stellar:session-meter",
            routes: {},
            services: {
                ipfsService: {
                    async pinJSON(metadata) {
                        const cid = "bafytestcid";
                        const uri = `ipfs://${cid}`;
                        ipfsPins.set(cid, metadata);
                        return {
                            cid,
                            uri,
                            metadata,
                            pinned: false,
                        };
                    },
                    async fetchJSON(uriOrCid) {
                        const cid = String(uriOrCid).replace("ipfs://", "");
                        return {
                            cid,
                            uri: `ipfs://${cid}`,
                            metadata: ipfsPins.get(cid) || basePublicMetadata,
                        };
                    },
                },
                evidenceVault: new EvidenceVaultService(),
                chainService: {
                    signer: backendSigner,
                    provider: {
                        async getNetwork() {
                            return { chainId: 0n };
                        },
                    },
                    assetNFTAddress: "stellar:rwa-nft",
                    isConfigured() {
                        return false;
                    },
                    canOperatorAuthorize(address) {
                        return String(address || "").toUpperCase() === String(backendSigner.address || "").toUpperCase();
                    },
                    async mintAsset(payload) {
                        store.asset = {
                            tokenId: 7,
                            schemaVersion: 2,
                            assetType: payload.assetType,
                            rightsModel: payload.rightsModel,
                            rightsModelLabel: "verified_rental_asset",
                            verificationStatus: 1,
                            verificationStatusLabel: "pending_attestation",
                            cidHash: payload.cidHash,
                            tagHash: payload.tagHash,
                            issuer: payload.issuer,
                            activeStreamId: 0,
                            propertyRefHash: payload.propertyRefHash,
                            publicMetadataHash: payload.publicMetadataHash,
                            evidenceRoot: payload.evidenceRoot,
                            evidenceManifestHash: payload.evidenceManifestHash,
                            publicMetadataURI: payload.publicMetadataURI,
                            metadataURI: payload.publicMetadataURI,
                            tokenURI: payload.publicMetadataURI,
                            jurisdiction: payload.jurisdiction,
                            statusReason: payload.statusReason,
                            createdAt: 1710720000,
                            updatedAt: 1710720000,
                            verificationUpdatedAt: 1710720000,
                            exists: true,
                            currentOwner: payload.issuer,
                            claimableYield: "0",
                            stream: {
                                streamId: 0,
                                sender: payload.issuer,
                                assetType: payload.assetType,
                                totalAmount: "0",
                                flowRate: "0",
                                startTime: 0,
                                stopTime: 0,
                                amountWithdrawn: "0",
                                isActive: false,
                                isFrozen: false,
                            },
                            compliance: {
                                approved: true,
                                expiry: 1710806400,
                                jurisdiction: payload.jurisdiction,
                                currentlyValid: true,
                            },
                            assetPolicy: {
                                frozen: false,
                                disputed: false,
                                revoked: false,
                                updatedAt: 1710720000,
                                updatedBy: backendSigner.address,
                                reason: "",
                            },
                            rentalReady: true,
                            rentalReadiness: {
                                ready: true,
                                code: "ready_pending_attestation",
                                label: "Stellar Rental Ready",
                                reason: "The asset can open rental sessions while attestation review is still pending.",
                                severity: "info",
                            },
                            readinessCode: "ready_pending_attestation",
                            readinessLabel: "Stellar Rental Ready",
                            readinessReason: "The asset can open rental sessions while attestation review is still pending.",
                            attestationPolicies: [
                                { role: 2, roleLabel: "lawyer", required: true, maxAge: 86400 },
                                { role: 4, roleLabel: "inspector", required: true, maxAge: 86400 },
                            ],
                            attestations: [
                                {
                                    attestationId: 1,
                                    tokenId: 7,
                                    role: 2,
                                    roleLabel: "lawyer",
                                    attestor: backendSigner.address,
                                    evidenceHash: "0xdeed",
                                    statementType: "title_review_complete",
                                    issuedAt: Math.floor(Date.now() / 1000),
                                    expiry: 0,
                                    revoked: false,
                                    revocationReason: "",
                                },
                                {
                                    attestationId: 2,
                                    tokenId: 7,
                                    role: 4,
                                    roleLabel: "inspector",
                                    attestor: backendSigner.address,
                                    evidenceHash: "0xinspection",
                                    statementType: "inspection_current",
                                    issuedAt: Math.floor(Date.now() / 1000),
                                    expiry: 0,
                                    revoked: false,
                                    revocationReason: "",
                                },
                            ],
                        };
                        return { tokenId: 7, txHash: "0xtest" };
                    },
                    async registerAttestation({ tokenId, role, attestor, evidenceHash, statementType, expiry }) {
                        store.asset.attestations.push({
                            attestationId: 3,
                            tokenId,
                            role,
                            roleLabel: role === 2 ? "lawyer" : "inspector",
                            attestor,
                            evidenceHash,
                            statementType,
                            issuedAt: Math.floor(Date.now() / 1000),
                            expiry,
                            revoked: false,
                            revocationReason: "",
                        });
                        return { attestationId: 3, txHash: "0xattest" };
                    },
                    async revokeAttestation() {
                        store.asset.attestations[0].revoked = true;
                        return { txHash: "0xrevoke" };
                    },
                    async getAttestationRecord(attestationId) {
                        return store.asset?.attestations?.find(
                            (item) => Number(item.attestationId) === Number(attestationId)
                        ) || null;
                    },
                    async getAssetSnapshot() {
                        return store.asset;
                    },
                    async updateAssetMetadata({ tokenId, metadataURI, publicMetadataHash }) {
                        if (!store.asset || Number(store.asset.tokenId) !== Number(tokenId)) {
                            const error = new Error(`Asset ${tokenId} was not found.`);
                            error.code = "asset_not_found";
                            throw error;
                        }
                        if (!this.canOperatorAuthorize(store.asset.currentOwner)) {
                            const error = new Error(
                                "Stellar metadata update must be signed by the acting wallet directly. Backend relay fallbacks are disabled for scalable owner-auth writes."
                            );
                            error.code = "direct_wallet_required";
                            error.details = {
                                owner: store.asset.currentOwner,
                                tokenId: Number(tokenId),
                                operator: backendSigner.address,
                                authPath: "wallet_native",
                            };
                            throw error;
                        }
                        store.asset.publicMetadataURI = metadataURI;
                        store.asset.metadataURI = metadataURI;
                        store.asset.publicMetadataHash = publicMetadataHash || store.asset.publicMetadataHash;
                        return { txHash: "0xmetadata" };
                    },
                    async syncSessionMetadata({
                        sessionId,
                        metadata,
                        sender,
                        recipient,
                        assetCode,
                        assetIssuer,
                        txHash,
                        fundingTxHash,
                    }) {
                        store.session = {
                            id: Number(sessionId),
                            sender,
                            recipient,
                            totalAmount: "10000000",
                            flowRate: "1000",
                            durationSeconds: 3600,
                            startTime: Math.floor(Date.now() / 1000) - 60,
                            stopTime: Math.floor(Date.now() / 1000) + 3540,
                            amountWithdrawn: "0",
                            isActive: true,
                            isFrozen: false,
                            metadata,
                            txHash,
                            fundingTxHash,
                            assetCode,
                            assetIssuer,
                            refundableAmount: "0",
                        };
                        return {
                            ...store.session,
                            sessionStatus: "active",
                            sessionStatusLabel: "Active",
                            claimableInitial: "60000",
                            claimableAmount: "60000",
                            refundableAmount: "9940000",
                            consumedAmount: "60000",
                            linkedAssetTokenId: 7,
                            linkedAssetName: "Lagos Rental Asset",
                            linkedAssetType: "real_estate",
                        };
                    },
                },
                agentWallet: {
                    async getWallet(ownerPublicKey) {
                        if (String(ownerPublicKey || "").toUpperCase() !== String(issuerWallet.address || "").toUpperCase()) {
                            return null;
                        }
                        return { publicKey: managedAgentPublicKey };
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

    it("pins public metadata and returns a canonical IPFS URI", async function () {
        const response = await request(app)
            .post("/api/rwa/ipfs/metadata")
            .send({
                metadata: {
                    name: "Asset #1",
                    description: "Stream Engine rental asset",
                },
            });

        expect(response.status).to.equal(201);
        expect(response.body.cid).to.equal("bafytestcid");
        expect(response.body.uri).to.equal("ipfs://bafytestcid");
    });

    it("stores private evidence and returns deterministic roots", async function () {
        const first = await request(app)
            .post("/api/rwa/evidence")
            .send({
                rightsModel: "verified_rental_asset",
                propertyRef: "plot-42-block-7",
                jurisdiction: "NG-LA",
                evidenceBundle: baseEvidenceBundle,
            });
        const second = await request(app)
            .post("/api/rwa/evidence")
            .send({
                rightsModel: "verified_rental_asset",
                propertyRef: "plot-42-block-7",
                jurisdiction: "NG-LA",
                evidenceBundle: baseEvidenceBundle,
            });

        expect(first.status).to.equal(201);
        expect(second.status).to.equal(201);
        expect(first.body.evidenceRoot).to.equal(second.body.evidenceRoot);
        expect(first.body.evidenceManifestHash).to.equal(second.body.evidenceManifestHash);
        expect(first.body.evidenceSummary.missingRequiredDocuments).to.deep.equal([]);
    });

    it("mints a v2 asset for any issuer through the scalable Stellar backend path", async function () {
        const evidenceResponse = await request(app)
            .post("/api/rwa/evidence")
            .send({
                rightsModel: "verified_rental_asset",
                propertyRef: "plot-42-block-7",
                jurisdiction: "NG-LA",
                evidenceBundle: baseEvidenceBundle,
            });

        const response = await request(app)
            .post("/api/rwa/assets")
            .send({
                issuer: issuerWallet.address,
                assetType: 1,
                rightsModel: "verified_rental_asset",
                jurisdiction: "NG-LA",
                propertyRef: "plot-42-block-7",
                publicMetadata: basePublicMetadata,
                evidenceRoot: evidenceResponse.body.evidenceRoot,
                evidenceManifestHash: evidenceResponse.body.evidenceManifestHash,
            });

        expect(response.status).to.equal(201);
        expect(response.body.tokenId).to.equal(7);
        expect(response.body.asset.issuer).to.equal(issuerWallet.address);
        expect(response.body.asset.currentOwner).to.equal(issuerWallet.address);
        expect(response.body.details.authMode).to.equal("platform_operator");
    });

    it("lists owner portfolio assets even after managed custody takes over", async function () {
        store.asset = {
            tokenId: 7,
            schemaVersion: 2,
            assetType: 1,
            rightsModel: 1,
            rightsModelLabel: "verified_rental_asset",
            verificationStatus: 1,
            verificationStatusLabel: "pending_attestation",
            issuer: issuerWallet.address,
            currentOwner: managedAgentPublicKey,
            activeStreamId: 0,
            publicMetadataURI: "ipfs://bafytestcid",
            metadataURI: "ipfs://bafytestcid",
            tokenURI: "ipfs://bafytestcid",
            propertyRefHash: "0xproperty",
            publicMetadataHash: "0xmeta",
            evidenceRoot: "0xevidence",
            evidenceManifestHash: "0xmanifest",
            statusReason: "Awaiting attestation review",
            claimableYield: "0",
            totalYieldDeposited: "0",
            flashAdvanceOutstanding: "0",
            stream: null,
            compliance: {
                approved: true,
                expiry: 1710806400,
                jurisdiction: "NG-LA",
                currentlyValid: true,
            },
            assetPolicy: {
                frozen: false,
                disputed: false,
                revoked: false,
                updatedAt: 1710720000,
                updatedBy: backendSigner.address,
                reason: "",
            },
            rentalReady: true,
            rentalReadiness: {
                ready: true,
                code: "ready_pending_attestation",
                label: "Stellar Rental Ready",
                reason: "The asset can open rental sessions while attestation review is still pending.",
                severity: "info",
            },
            attestationPolicies: [],
            attestations: [],
        };

        const response = await request(app)
            .get("/api/rwa/assets")
            .query({ owner: issuerWallet.address });

        expect(response.status).to.equal(200);
        expect(response.body.code).to.equal("assets_listed");
        expect(response.body.assets).to.have.length(1);
        expect(response.body.assets[0].issuer).to.equal(issuerWallet.address);
        expect(response.body.assets[0].currentOwner).to.equal(managedAgentPublicKey);
    });

    it("keeps rich metadata when refresh uses lightweight snapshots and IPFS hydration fails", async function () {
        store.asset = {
            tokenId: 7,
            schemaVersion: 2,
            assetType: 1,
            rightsModel: 1,
            rightsModelLabel: "verified_rental_asset",
            verificationStatus: 1,
            verificationStatusLabel: "pending_attestation",
            issuer: issuerWallet.address,
            currentOwner: issuerWallet.address,
            activeStreamId: 0,
            publicMetadataURI: "ipfs://bafytestcid",
            metadataURI: "ipfs://bafytestcid",
            tokenURI: "ipfs://bafytestcid",
            propertyRefHash: "0xproperty",
            publicMetadataHash: hashJson(basePublicMetadata),
            evidenceRoot: "0xevidence",
            evidenceManifestHash: "0xmanifest",
            statusReason: "Awaiting attestation review",
            claimableYield: "0",
            totalYieldDeposited: "0",
            flashAdvanceOutstanding: "0",
            publicMetadata: {
                ...basePublicMetadata,
                location: "Ikeja, Lagos",
                monthlyYieldTarget: 1250,
                pricePerHour: 1.736111,
            },
            metadata: {
                ...basePublicMetadata,
                location: "Ikeja, Lagos",
                monthlyYieldTarget: 1250,
                pricePerHour: 1.736111,
            },
            stream: null,
            attestationPolicies: [],
            attestations: [],
        };

        const services = await app.locals.ready;
        services.chainService.isConfigured = () => true;
        services.chainService.listAssetSnapshots = async () => [
            {
                tokenId: 7,
                assetType: 1,
                issuer: issuerWallet.address,
                currentOwner: issuerWallet.address,
                verificationStatusLabel: "pending_attestation",
                publicMetadataURI: "ipfs://bafytestcid",
                metadataURI: "ipfs://bafytestcid",
                tokenURI: "ipfs://bafytestcid",
                publicMetadata: {},
                metadata: {},
            },
        ];
        services.ipfsService.fetchJSON = async () => {
            throw new Error("ipfs timeout");
        };

        const response = await request(app)
            .get("/api/rwa/assets")
            .query({ refresh: 1 })
            .expect(200);

        expect(response.body.code).to.equal("assets_listed");
        expect(response.body.assets).to.have.length(1);
        expect(response.body.assets[0].publicMetadata.name).to.equal("Lagos Rental Asset");
        expect(response.body.assets[0].publicMetadata.location).to.equal("Ikeja, Lagos");
        expect(response.body.assets[0].metadata.monthlyYieldTarget).to.equal(1250);
    });

    it("mints a v2 asset through the managed operator path and returns structured verification payloads", async function () {
        const evidenceResponse = await request(app)
            .post("/api/rwa/evidence")
            .send({
                rightsModel: "verified_rental_asset",
                propertyRef: "plot-42-block-7",
                jurisdiction: "NG-LA",
                evidenceBundle: baseEvidenceBundle,
            });

        const response = await request(app)
            .post("/api/rwa/assets")
            .send({
                issuer: backendSigner.address,
                assetType: 1,
                rightsModel: "verified_rental_asset",
                jurisdiction: "NG-LA",
                propertyRef: "plot-42-block-7",
                publicMetadata: basePublicMetadata,
                evidenceRoot: evidenceResponse.body.evidenceRoot,
                evidenceManifestHash: evidenceResponse.body.evidenceManifestHash,
            });

        expect(response.status).to.equal(201);
        expect(response.body.tokenId).to.equal(7);
        expect(response.body.publicMetadataURI).to.equal("ipfs://bafytestcid");
        expect(response.body.verificationStatus).to.equal("pending_attestation");
        expect(response.body.details.authMode).to.equal("platform_operator");
        expect(response.body.verificationPayload).to.be.a("string");
        expect(parseVerificationPayload(response.body.verificationPayload).verificationStatus)
            .to.equal("pending_attestation");
        expect(response.body.evidenceSummary.missingRequiredDocuments).to.deep.equal([]);
        expect(response.body.attestationRequirements).to.have.length(2);
        expect(response.body.asset.tokenId).to.equal(7);
        expect(response.body.asset.rentalReady).to.equal(true);
        expect(response.body.asset.rentalReadiness.label).to.equal("Stellar Rental Ready");
    });

    it("returns structured verification states for v2 and legacy assets", async function () {
        const services = await app.locals.ready;
        const evidenceRecord = await services.evidenceVault.storeBundle(baseEvidenceBundle, {
            rightsModel: "verified_rental_asset",
            propertyRef: "plot-42-block-7",
            jurisdiction: "NG-LA",
        });
        ipfsPins.set("bafytestcid", basePublicMetadata);

        store.asset = {
            tokenId: 7,
            schemaVersion: 2,
            assetType: 1,
            rightsModel: 1,
            rightsModelLabel: "verified_rental_asset",
            verificationStatus: 2,
            verificationStatusLabel: "verified",
            cidHash: hashText("ipfs://bafytestcid"),
            tagHash: hashText("tag-7"),
            issuer: issuerWallet.address,
            activeStreamId: 0,
            propertyRefHash: hashText("plot-42-block-7"),
            publicMetadataHash: hashJson(basePublicMetadata),
            evidenceRoot: evidenceRecord.evidenceRoot,
            evidenceManifestHash: evidenceRecord.evidenceManifestHash,
            publicMetadataURI: "ipfs://bafytestcid",
            metadataURI: "ipfs://bafytestcid",
            tokenURI: "ipfs://bafytestcid",
            jurisdiction: "NG-LA",
            statusReason: "verified and rentable",
            createdAt: 1710720000,
            updatedAt: 1710720000,
            verificationUpdatedAt: 1710720000,
            exists: true,
            currentOwner: issuerWallet.address,
            claimableYield: "0",
            stream: {
                streamId: 0,
                sender: issuerWallet.address,
                assetType: 1,
                totalAmount: "0",
                flowRate: "0",
                startTime: 0,
                stopTime: 0,
                amountWithdrawn: "0",
                isActive: false,
                isFrozen: false,
            },
            compliance: {
                approved: true,
                expiry: 1710806400,
                jurisdiction: "NG-LA",
                currentlyValid: true,
            },
            assetPolicy: {
                frozen: false,
                disputed: false,
                revoked: false,
                updatedAt: 1710720000,
                updatedBy: backendSigner.address,
                reason: "",
            },
            attestationPolicies: [
                { role: 2, roleLabel: "lawyer", required: true, maxAge: 86400 },
                { role: 4, roleLabel: "inspector", required: true, maxAge: 86400 },
            ],
            attestations: [
                {
                    attestationId: 1,
                    tokenId: 7,
                    role: 2,
                    roleLabel: "lawyer",
                    attestor: backendSigner.address,
                    evidenceHash: "0xdeed",
                    statementType: "title_review_complete",
                    issuedAt: Math.floor(Date.now() / 1000),
                    expiry: 0,
                    revoked: false,
                    revocationReason: "",
                },
                {
                    attestationId: 2,
                    tokenId: 7,
                    role: 4,
                    roleLabel: "inspector",
                    attestor: backendSigner.address,
                    evidenceHash: "0xinspection",
                    statementType: "inspection_current",
                    issuedAt: Math.floor(Date.now() / 1000),
                    expiry: 0,
                    revoked: false,
                    revocationReason: "",
                },
            ],
        };

        const verifiedResponse = await request(app)
            .post("/api/rwa/verify")
            .send({
                tokenId: 7,
                publicMetadataURI: "ipfs://bafytestcid",
                propertyRef: "plot-42-block-7",
            });

        expect(verifiedResponse.status).to.equal(200);
        expect(verifiedResponse.body.status).to.equal("verified");
        expect(verifiedResponse.body.failures).to.deep.equal([]);

        store.asset = {
            ...store.asset,
            verificationStatusLabel: "frozen",
            assetPolicy: {
                ...store.asset.assetPolicy,
                frozen: true,
                reason: "tenant dispute hold",
            },
        };

        const frozenResponse = await request(app)
            .post("/api/rwa/verify")
            .send({
                tokenId: 7,
                publicMetadataURI: "ipfs://bafytestcid",
                propertyRef: "plot-42-block-7",
            });

        expect(frozenResponse.status).to.equal(200);
        expect(frozenResponse.body.status).to.equal("frozen");

        store.asset = {
            tokenId: 7,
            schemaVersion: 1,
            assetType: 1,
            cidHash: hashText("ipfs://bafytestcid"),
            tagHash: hashText("tag-7"),
            issuer: issuerWallet.address,
            activeStreamId: 0,
            metadataURI: "ipfs://bafytestcid",
            tokenURI: "ipfs://bafytestcid",
            currentOwner: issuerWallet.address,
            exists: true,
        };

        const legacyResponse = await request(app)
            .post("/api/rwa/verify")
            .send({
                tokenId: 7,
                uri: "ipfs://bafytestcid",
                tagHash: hashText("tag-7"),
            });

        expect(legacyResponse.status).to.equal(200);
        expect(legacyResponse.body.status).to.equal("legacy_verified");
        expect(legacyResponse.body.warnings[0]).to.match(/Legacy v1 asset/i);
    });

    it("returns stale, incomplete, revoked, and mismatch states for v2 assets", async function () {
        const services = await app.locals.ready;
        const evidenceRecord = await services.evidenceVault.storeBundle(baseEvidenceBundle, {
            rightsModel: "verified_rental_asset",
            propertyRef: "plot-42-block-7",
            jurisdiction: "NG-LA",
        });
        ipfsPins.set("bafytestcid", basePublicMetadata);

        const baseAsset = {
            tokenId: 7,
            schemaVersion: 2,
            assetType: 1,
            rightsModel: 1,
            rightsModelLabel: "verified_rental_asset",
            verificationStatus: 2,
            verificationStatusLabel: "verified",
            cidHash: hashText("ipfs://bafytestcid"),
            tagHash: hashText("tag-7"),
            issuer: issuerWallet.address,
            activeStreamId: 0,
            propertyRefHash: hashText("plot-42-block-7"),
            publicMetadataHash: hashJson(basePublicMetadata),
            evidenceRoot: evidenceRecord.evidenceRoot,
            evidenceManifestHash: evidenceRecord.evidenceManifestHash,
            publicMetadataURI: "ipfs://bafytestcid",
            metadataURI: "ipfs://bafytestcid",
            tokenURI: "ipfs://bafytestcid",
            jurisdiction: "NG-LA",
            statusReason: "verified and rentable",
            createdAt: 1710720000,
            updatedAt: 1710720000,
            verificationUpdatedAt: 1710720000,
            exists: true,
            currentOwner: issuerWallet.address,
            claimableYield: "0",
            stream: {
                streamId: 0,
                sender: issuerWallet.address,
                assetType: 1,
                totalAmount: "0",
                flowRate: "0",
                startTime: 0,
                stopTime: 0,
                amountWithdrawn: "0",
                isActive: false,
                isFrozen: false,
            },
            compliance: {
                approved: true,
                expiry: 1710806400,
                jurisdiction: "NG-LA",
                currentlyValid: true,
            },
            assetPolicy: {
                frozen: false,
                disputed: false,
                revoked: false,
                updatedAt: 1710720000,
                updatedBy: backendSigner.address,
                reason: "",
            },
            attestationPolicies: [
                { role: 2, roleLabel: "lawyer", required: true, maxAge: 86400 },
                { role: 4, roleLabel: "inspector", required: true, maxAge: 86400 },
            ],
            attestations: [
                {
                    attestationId: 1,
                    tokenId: 7,
                    role: 2,
                    roleLabel: "lawyer",
                    attestor: backendSigner.address,
                    evidenceHash: "0xdeed",
                    statementType: "title_review_complete",
                    issuedAt: Math.floor(Date.now() / 1000),
                    expiry: 0,
                    revoked: false,
                    revocationReason: "",
                },
                {
                    attestationId: 2,
                    tokenId: 7,
                    role: 4,
                    roleLabel: "inspector",
                    attestor: backendSigner.address,
                    evidenceHash: "0xinspection",
                    statementType: "inspection_current",
                    issuedAt: Math.floor(Date.now() / 1000),
                    expiry: 0,
                    revoked: false,
                    revocationReason: "",
                },
            ],
        };

        store.asset = {
            ...baseAsset,
            attestations: [
                {
                    ...baseAsset.attestations[0],
                    issuedAt: Math.floor(Date.now() / 1000) - (3 * 86400),
                },
                baseAsset.attestations[1],
            ],
        };

        const staleResponse = await request(app)
            .post("/api/rwa/verify")
            .send({
                tokenId: 7,
                publicMetadataURI: "ipfs://bafytestcid",
                propertyRef: "plot-42-block-7",
            });
        expect(staleResponse.status).to.equal(200);
        expect(staleResponse.body.status).to.equal("stale");

        store.asset = {
            ...baseAsset,
            attestations: [baseAsset.attestations[0]],
        };

        const incompleteResponse = await request(app)
            .post("/api/rwa/verify")
            .send({
                tokenId: 7,
                publicMetadataURI: "ipfs://bafytestcid",
                propertyRef: "plot-42-block-7",
            });
        expect(incompleteResponse.status).to.equal(200);
        expect(incompleteResponse.body.status).to.equal("incomplete");

        store.asset = {
            ...baseAsset,
            verificationStatusLabel: "revoked",
            assetPolicy: {
                ...baseAsset.assetPolicy,
                revoked: true,
                reason: "title withdrawn",
            },
        };

        const revokedResponse = await request(app)
            .post("/api/rwa/verify")
            .send({
                tokenId: 7,
                publicMetadataURI: "ipfs://bafytestcid",
                propertyRef: "plot-42-block-7",
            });
        expect(revokedResponse.status).to.equal(200);
        expect(revokedResponse.body.status).to.equal("revoked");

        store.asset = baseAsset;
        const mismatchResponse = await request(app)
            .post("/api/rwa/verify")
            .send({
                tokenId: 7,
                publicMetadataURI: "ipfs://bafytestcid",
                propertyRef: "wrong-property-ref",
            });
        expect(mismatchResponse.status).to.equal(200);
        expect(mismatchResponse.body.status).to.equal("mismatch");
    });

    it("rejects backend attestation relay for external attestors on Stellar", async function () {
        store.asset = {
            ...(store.asset || {}),
            tokenId: 7,
            schemaVersion: 2,
            attestationPolicies: [],
            attestations: [],
        };

        const authorization = await buildAttestationAuthorization();
        const response = await request(app)
            .post("/api/rwa/attestations")
            .send({
                tokenId: 7,
                role: "lawyer",
                attestor: issuerWallet.address,
                evidenceHash: "0xdeed",
                statementType: "title_review_complete",
                attestationAuthorization: authorization,
            });

        expect(response.status).to.equal(409);
        expect(response.body.code).to.equal("direct_wallet_required");
        expect(response.body.action).to.equal("registerAttestation");
    });

    it("registers operator-backed attestations when the backend operator signs the request", async function () {
        store.asset = {
            ...(store.asset || {}),
            tokenId: 7,
            schemaVersion: 2,
            attestationPolicies: [],
            attestations: [],
        };

        const authorization = await buildAttestationAuthorization({
            attestor: backendSigner.address,
            signer: backendSigner,
        });
        const response = await request(app)
            .post("/api/rwa/attestations")
            .send({
                tokenId: 7,
                role: "lawyer",
                attestor: backendSigner.address,
                evidenceHash: "0xdeed",
                statementType: "title_review_complete",
                attestationAuthorization: authorization,
            });

        expect(response.status).to.equal(201);
        expect(response.body.action).to.equal("register");
        expect(response.body.role).to.equal("lawyer");
        expect(response.body.attestationId).to.equal(3);
    });

    it("rejects backend attestation revocation relay for external attestors on Stellar", async function () {
        store.asset = {
            ...(store.asset || {}),
            tokenId: 7,
            schemaVersion: 2,
            attestationPolicies: [],
            attestations: [
                {
                    attestationId: 1,
                    tokenId: 7,
                    role: 2,
                    roleLabel: "lawyer",
                    attestor: issuerWallet.address,
                    evidenceHash: "0xdeed",
                    statementType: "title_review_complete",
                    issuedAt: Math.floor(Date.now() / 1000),
                    expiry: 0,
                    revoked: false,
                    revocationReason: "",
                },
            ],
        };

        const authorization = await buildAttestationRevocationAuthorization();
        const response = await request(app)
            .post("/api/rwa/attestations")
            .send({
                action: "revoke",
                attestationId: 1,
                reason: "title opinion superseded",
                revocationAuthorization: authorization,
            });

        expect(response.status).to.equal(409);
        expect(response.body.code).to.equal("direct_wallet_required");
        expect(response.body.action).to.equal("revokeAttestation");
    });

    it("revokes operator-backed attestations when the backend operator signs the request", async function () {
        store.asset = {
            ...(store.asset || {}),
            tokenId: 7,
            schemaVersion: 2,
            attestationPolicies: [],
            attestations: [
                {
                    attestationId: 1,
                    tokenId: 7,
                    role: 2,
                    roleLabel: "lawyer",
                    attestor: backendSigner.address,
                    evidenceHash: "0xdeed",
                    statementType: "title_review_complete",
                    issuedAt: Math.floor(Date.now() / 1000),
                    expiry: 0,
                    revoked: false,
                    revocationReason: "",
                },
            ],
        };

        const authorization = await buildAttestationRevocationAuthorization({
            attestor: backendSigner.address,
            signer: backendSigner,
        });
        const response = await request(app)
            .post("/api/rwa/attestations")
            .send({
                action: "revoke",
                attestationId: 1,
                reason: "title opinion superseded",
                revocationAuthorization: authorization,
            });

        expect(response.status).to.equal(200);
        expect(response.body.action).to.equal("revoke");
        expect(response.body.attestationId).to.equal(1);
        expect(store.asset.attestations[0].revoked).to.equal(true);
    });

    it("rejects backend relay metadata updates for external Stellar owners", async function () {
        store.asset = {
            ...(store.asset || {}),
            tokenId: 7,
            currentOwner: issuerWallet.address,
            publicMetadataURI: "ipfs://bafytestcid",
            metadataURI: "ipfs://bafytestcid",
            publicMetadataHash: hashJson(basePublicMetadata),
        };

        const response = await request(app)
            .post("/api/rwa/relay")
            .send({
                action: "updateAssetMetadata",
                tokenId: 7,
                metadataURI: "ipfs://bafyupdatedcid",
            });

        expect(response.status).to.equal(409);
        expect(response.body.code).to.equal("direct_wallet_required");
        expect(response.body.action).to.equal("updateAssetMetadata");
    });

    it("syncs live session metadata and returns renter-facing session state", async function () {
        const response = await request(app)
            .post("/api/sessions/11/metadata")
            .send({
                metadata: JSON.stringify({
                    assetTokenId: 7,
                    assetName: "Lagos Rental Asset",
                    assetType: "real_estate",
                }),
                txHash: "stellar-tx-11",
                fundingTxHash: "stellar-tx-11",
                sender: issuerWallet.address,
                recipient: backendSigner.address,
                assetCode: "USDC",
                assetIssuer: "GISSUER111111111111111111111111111111111111111111111111",
            });

        expect(response.status).to.equal(200);
        expect(response.body.code).to.equal("session_metadata_synced");
        expect(response.body.session.sessionStatus).to.equal("active");
        expect(response.body.session.linkedAssetTokenId).to.equal(7);
        expect(response.body.session.refundableAmount).to.equal("9940000");
        expect(response.body.session.consumedAmount).to.equal("60000");
    });
});
