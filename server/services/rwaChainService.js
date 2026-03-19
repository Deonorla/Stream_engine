const { ethers } = require("ethers");
const { createFlowPayRuntimeConfig } = require("../../utils/polkadot");
const {
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    reviveCall,
    reviveRead,
} = require("../../utils/substrate");
const {
    ATTESTATION_ROLE_CODES,
    codeToAttestationRole,
    codeToRightsModel,
    codeToVerificationStatus,
} = require("./rwaModel");

function toNumber(value) {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (value == null) {
        return 0;
    }
    return Number(value.toString());
}

class RWAChainService {
    constructor(config = {}) {
        const runtimeConfig = createFlowPayRuntimeConfig(config);
        this.rpcUrl = config.rpcUrl || process.env.POLKADOT_RPC_URL || process.env.FLOWPAY_RPC_URL || runtimeConfig.rpcUrl || "";
        this.hubAddress = config.hubAddress || process.env.FLOWPAY_RWA_HUB_ADDRESS || "";
        this.assetNFTAddress = config.assetNFTAddress || process.env.FLOWPAY_RWA_ASSET_NFT_ADDRESS || "";
        this.assetRegistryAddress =
            config.assetRegistryAddress || process.env.FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS || "";
        this.attestationRegistryAddress =
            config.attestationRegistryAddress || process.env.FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS || "";
        this.assetStreamAddress =
            config.assetStreamAddress || process.env.FLOWPAY_RWA_ASSET_STREAM_ADDRESS || "";
        this.complianceGuardAddress =
            config.complianceGuardAddress || process.env.FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS || "";
        this.chainId = BigInt(config.chainId || runtimeConfig.chainId);
        this.useSubstrateWrites = Boolean(
            config.useSubstrateWrites
            ?? (process.env.FLOWPAY_USE_SUBSTRATE_WRITES === "true")
        );
        this.useSubstrateReads = Boolean(
            config.useSubstrateReads
            ?? (process.env.FLOWPAY_USE_SUBSTRATE_READS === "true")
            ?? (process.env.FLOWPAY_USE_SUBSTRATE_WRITES === "true")
        );

        this.provider = config.provider || (this.rpcUrl ? new ethers.JsonRpcProvider(this.rpcUrl) : null);
        if (config.signer) {
            this.signer = config.signer;
        } else if ((config.privateKey || process.env.PRIVATE_KEY) && this.provider) {
            this.signer = new ethers.Wallet(config.privateKey || process.env.PRIVATE_KEY, this.provider);
        } else {
            this.signer = null;
        }

        this.substrateApi = config.substrateApi || null;
        this.substratePair = config.substratePair || null;
        this.substrateEvmAddress = config.substrateEvmAddress || "";
        this.substrateConfig = config.substrateConfig || null;

        this.hubAbi = [
            "function owner() external view returns (address)",
            "function operators(address) external view returns (bool)",
            "function mintAsset(string publicMetadataURI, uint8 assetType, uint8 rightsModel, bytes32 publicMetadataHash, bytes32 evidenceRoot, bytes32 evidenceManifestHash, bytes32 propertyRefHash, string jurisdiction, bytes32 cidHash, bytes32 tagHash, address issuer, string statusReason) external returns (uint256 tokenId)",
            "function setIssuerApproval(address issuer, bool approved, string note) external",
            "function registerAttestation(uint256 tokenId, uint8 role, address attestor, bytes32 evidenceHash, string statementType, uint64 expiry) external returns (uint256 attestationId)",
            "function revokeAttestation(uint256 attestationId, string reason) external",
            "function setVerificationStatus(uint256 tokenId, uint8 status, string reason) external",
            "function getAsset(uint256 tokenId) external view returns ((uint8 assetType, uint8 rightsModel, uint8 verificationStatus, bytes32 cidHash, bytes32 tagHash, bytes32 propertyRefHash, bytes32 publicMetadataHash, bytes32 evidenceRoot, bytes32 evidenceManifestHash, address issuer, uint256 activeStreamId, string jurisdiction, string publicMetadataURI, string statusReason, uint64 createdAt, uint64 updatedAt, uint64 verificationUpdatedAt, bool exists, address currentOwner) asset)",
            "function getAssetStream(uint256 tokenId) external view returns (uint256 streamId, address sender, uint8 assetType, uint256 totalAmount, uint256 flowRate, uint256 startTime, uint256 stopTime, uint256 amountWithdrawn, bool isActive, bool isFrozen)",
            "function claimableYield(uint256 tokenId) external view returns (uint256)",
            "function getVerificationStatus(uint256 tokenId, bytes32 cidHash, bytes32 tagHash) external view returns (bool assetExists, bool cidMatches, bool tagMatches, uint256 activeStreamId)",
            "function getAttestationIds(uint256 tokenId) external view returns (uint256[])",
            "function getAttestation(uint256 attestationId) external view returns (uint256 tokenId, uint8 role, address attestor, bytes32 evidenceHash, string statementType, uint64 issuedAt, uint64 expiry, bool revoked, string revocationReason)",
            "event AssetMinted(uint256 indexed tokenId, address indexed issuer, uint8 indexed assetType, uint8 rightsModel, string publicMetadataURI, bytes32 publicMetadataHash, bytes32 evidenceRoot, bytes32 propertyRefHash)",
            "event AssetVerificationStateUpdated(uint256 indexed tokenId, uint8 indexed status, string reason)",
            "event AssetEvidenceUpdated(uint256 indexed tokenId, bytes32 evidenceRoot, bytes32 evidenceManifestHash)",
            "event AttestationRecorded(uint256 indexed tokenId, uint256 indexed attestationId, uint8 indexed role, address attestor, bytes32 evidenceHash, string statementType)",
            "event AttestationRevoked(uint256 indexed tokenId, uint256 indexed attestationId, string reason)"
        ];

        this.assetNftAbi = [
            "function nextTokenId() external view returns (uint256)",
            "function tokenURI(uint256 tokenId) external view returns (string)",
            "function ownerOf(uint256 tokenId) external view returns (address)",
            "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
        ];

        this.registryAbi = [
            "event AssetRegistered(uint256 indexed tokenId, address indexed issuer, uint8 indexed assetType, uint8 rightsModel, string publicMetadataURI, string jurisdiction, bytes32 propertyRefHash, bytes32 publicMetadataHash, bytes32 evidenceRoot, bytes32 evidenceManifestHash, bytes32 cidHash, bytes32 tagHash, uint8 verificationStatus, string statusReason)",
            "event AssetStreamLinked(uint256 indexed tokenId, uint256 indexed streamId)",
            "event AssetMetadataUpdated(uint256 indexed tokenId, string publicMetadataURI, bytes32 publicMetadataHash, bytes32 cidHash)",
            "event AssetEvidenceUpdated(uint256 indexed tokenId, bytes32 evidenceRoot, bytes32 evidenceManifestHash)",
            "event VerificationTagUpdated(uint256 indexed tokenId, bytes32 previousTagHash, bytes32 newTagHash)",
            "event VerificationStatusUpdated(uint256 indexed tokenId, uint8 previousStatus, uint8 newStatus, string reason, uint64 updatedAt)"
        ];

        this.streamAbi = [
            "event AssetYieldStreamCreated(uint256 indexed streamId, uint256 indexed tokenId, address indexed sender, uint256 totalAmount, uint256 flowRate, uint256 startTime, uint256 stopTime, uint8 assetType)",
            "event AssetOwnerResolved(uint256 indexed streamId, uint256 indexed tokenId, address indexed owner, string action)",
            "event YieldClaimed(uint256 indexed streamId, uint256 indexed tokenId, address indexed recipient, uint256 amount)",
            "event FlashAdvanceExecuted(uint256 indexed streamId, uint256 indexed tokenId, address indexed recipient, uint256 amount)",
            "event StreamDepleted(uint256 indexed streamId, uint256 indexed tokenId)"
        ];

        this.guardAbi = [
            "function getCompliance(address user, uint8 assetType) external view returns (bool approved, uint64 expiry, string jurisdiction, bool currentlyValid)",
            "function getAssetPolicy(uint256 tokenId) external view returns (bool frozen, bool disputed, bool revoked, uint64 updatedAt, address updatedBy, string reason)",
            "function getAttestationPolicy(uint8 assetType, uint8 role) external view returns (bool required, uint64 maxAge)",
            "function getIssuerApproval(address issuer) external view returns (bool approved, uint64 updatedAt, address updatedBy, string note)",
            "event ComplianceUpdated(address indexed user, uint8 indexed assetType, bool approved, uint64 expiry, string jurisdiction)",
            "event StreamFreezeUpdated(uint256 indexed streamId, bool frozen, string reason, address indexed updatedBy)",
            "event IssuerApprovalUpdated(address indexed issuer, bool approved, string note, address indexed updatedBy)",
            "event AssetPolicyUpdated(uint256 indexed tokenId, bool frozen, bool disputed, bool revoked, string reason, address indexed updatedBy)",
            "event AttestationPolicyUpdated(uint8 indexed assetType, uint8 indexed role, bool required, uint64 maxAge)"
        ];

        this.attestationAbi = [
            "event AttestationRegistered(uint256 indexed attestationId, uint256 indexed tokenId, uint8 indexed role, address attestor, bytes32 evidenceHash, string statementType, uint64 issuedAt, uint64 expiry)",
            "event AttestationRevoked(uint256 indexed attestationId, uint256 indexed tokenId, string reason)"
        ];
    }

    isConfigured() {
        return Boolean(this.provider && this.hubAddress && this.assetNFTAddress);
    }

    async init() {
        if (!this.useSubstrateWrites && !this.useSubstrateReads) {
            return;
        }

        // Reconnect if the WS connection has dropped
        if (this.substrateApi && !this.substrateApi.isConnected) {
            console.warn("[RWAChainService] Substrate WS disconnected — reconnecting...");
            try {
                await this.substrateApi.disconnect();
            } catch (_) { /* ignore */ }
            this.substrateApi = null;
        }

        if (this.substrateApi) {
            return;
        }

        const { api, config } = await createSubstrateApi();
        const { pair, evmAddress } = await loadSubstrateSigner();
        await ensureMapped(api, pair, evmAddress);

        this.substrateApi = api;
        this.substratePair = pair;
        this.substrateEvmAddress = evmAddress;
        this.substrateConfig = config;
    }

    getContract(address, abi, withSigner = false) {
        if (!address || !this.provider) {
            return null;
        }
        return new ethers.Contract(address, abi, withSigner ? this.signer : this.provider);
    }

    getEventSources() {
        return [
            { name: "hub", address: this.hubAddress, interface: new ethers.Interface(this.hubAbi) },
            { name: "nft", address: this.assetNFTAddress, interface: new ethers.Interface(this.assetNftAbi) },
            { name: "registry", address: this.assetRegistryAddress, interface: new ethers.Interface(this.registryAbi) },
            { name: "attestation", address: this.attestationRegistryAddress, interface: new ethers.Interface(this.attestationAbi) },
            { name: "stream", address: this.assetStreamAddress, interface: new ethers.Interface(this.streamAbi) },
            { name: "guard", address: this.complianceGuardAddress, interface: new ethers.Interface(this.guardAbi) },
        ].filter((source) => Boolean(source.address));
    }

    async submitSubstrateWrite(address, iface, functionName, args = []) {
        if (!this.useSubstrateWrites) {
            throw new Error("RWAChainService: substrate writes are not enabled");
        }

        await this.init();

        try {
            return await reviveCall(this.substrateApi, this.substratePair, {
                dest: address,
                data: iface.encodeFunctionData(functionName, args),
                weightLimit: this.substrateConfig.weightLimit,
                storageDepositLimit: this.substrateConfig.storageDepositLimit,
            });
        } catch (error) {
            const isWsError = error.message && (
                error.message.includes("WebSocket is not connected") ||
                error.message.includes("disconnected") ||
                error.message.includes("Failed WS Request")
            );
            if (!isWsError) {
                throw error;
            }
            // WS dropped mid-call — force reconnect and retry once
            console.warn("[RWAChainService] WS error during write, reconnecting and retrying...");
            this.substrateApi = null;
            await this.init();
            return reviveCall(this.substrateApi, this.substratePair, {
                dest: address,
                data: iface.encodeFunctionData(functionName, args),
                weightLimit: this.substrateConfig.weightLimit,
                storageDepositLimit: this.substrateConfig.storageDepositLimit,
            });
        }
    }

    async readContract(address, abi, functionName, args = []) {
        if (this.useSubstrateReads) {
            await this.init();
            const iface = abi instanceof ethers.Interface ? abi : new ethers.Interface(abi);
            try {
                const result = await reviveRead(this.substrateApi, this.substratePair.address, {
                    dest: address,
                    data: iface.encodeFunctionData(functionName, args),
                    weightLimit: this.substrateConfig.weightLimit,
                    storageDepositLimit: this.substrateConfig.storageDepositLimit,
                });
                const decoded = iface.decodeFunctionResult(functionName, result.data);
                return decoded.length === 1 ? decoded[0] : decoded;
            } catch (error) {
                const isWsError = error.message && (
                    error.message.includes("WebSocket is not connected") ||
                    error.message.includes("disconnected") ||
                    error.message.includes("Failed WS Request")
                );
                if (!isWsError) {
                    throw error;
                }
                // WS dropped — force reconnect and retry once
                console.warn("[RWAChainService] WS error during read, reconnecting and retrying...");
                this.substrateApi = null;
                await this.init();
                const result = await reviveRead(this.substrateApi, this.substratePair.address, {
                    dest: address,
                    data: iface.encodeFunctionData(functionName, args),
                    weightLimit: this.substrateConfig.weightLimit,
                    storageDepositLimit: this.substrateConfig.storageDepositLimit,
                });
                const decoded = iface.decodeFunctionResult(functionName, result.data);
                return decoded.length === 1 ? decoded[0] : decoded;
            }
        }

        const contract = this.getContract(address, abi);
        return contract[functionName](...args);
    }

    async mintAsset({
        publicMetadataURI,
        assetType,
        rightsModel,
        publicMetadataHash,
        evidenceRoot,
        evidenceManifestHash,
        propertyRefHash,
        jurisdiction,
        cidHash,
        tagHash,
        issuer,
        statusReason,
    }) {
        if (!this.hubAddress) {
            throw new Error("RWAChainService: hub contract missing");
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, !this.useSubstrateWrites);
        const args = [
            publicMetadataURI,
            assetType,
            rightsModel,
            publicMetadataHash,
            evidenceRoot,
            evidenceManifestHash,
            propertyRefHash,
            jurisdiction,
            cidHash,
            tagHash,
            issuer,
            statusReason,
        ];

        if (this.useSubstrateWrites) {
            const nextTokenId = await this.readContract(
                this.assetNFTAddress,
                this.assetNftAbi,
                "nextTokenId",
                []
            );
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "mintAsset",
                args
            );

            return {
                tokenId: toNumber(nextTokenId),
                txHash: result.txHash,
                receipt: result,
            };
        }

        if (!this.signer) {
            throw new Error("RWAChainService: signer missing");
        }

        const tx = await hub.mintAsset(...args);
        const receipt = await tx.wait();

        let tokenId = null;
        for (const log of receipt.logs || []) {
            try {
                const parsed = hub.interface.parseLog(log);
                if (parsed?.name === "AssetMinted") {
                    tokenId = toNumber(parsed.args.tokenId);
                    break;
                }
            } catch (error) {
                // Ignore unrelated logs.
            }
        }

        return {
            tokenId,
            txHash: tx.hash,
            receipt,
        };
    }

    async ensureIssuerApproved(issuer, note = "Auto-approved by Stream Engine guided mint") {
        if (!issuer) {
            throw new Error("RWAChainService: issuer is required");
        }
        if (!this.hubAddress || !this.complianceGuardAddress) {
            throw new Error("RWAChainService: approval contracts missing");
        }

        let currentApproval = null;
        try {
            currentApproval = await this.readContract(
                this.complianceGuardAddress,
                this.guardAbi,
                "getIssuerApproval",
                [issuer]
            );
        } catch (error) {
            currentApproval = null;
        }

        const alreadyApproved = Array.isArray(currentApproval)
            ? Boolean(currentApproval[0])
            : Boolean(currentApproval?.approved);

        if (alreadyApproved) {
            return { approved: true, alreadyApproved: true };
        }

        const signerAddress = String(
            this.useSubstrateWrites
                ? this.substrateEvmAddress || ""
                : this.signer?.address || ""
        ).toLowerCase();

        if (!signerAddress) {
            throw new Error("RWAChainService: signer missing for issuer approval");
        }

        let hubOwner = "";
        try {
            hubOwner = String(
                await this.readContract(this.hubAddress, this.hubAbi, "owner", [])
            ).toLowerCase();
        } catch (error) {
            hubOwner = "";
        }

        let signerIsOperator = false;
        try {
            signerIsOperator = Boolean(
                await this.readContract(this.hubAddress, this.hubAbi, "operators", [signerAddress])
            );
        } catch (error) {
            signerIsOperator = false;
        }

        if (hubOwner && hubOwner !== signerAddress && !signerIsOperator) {
            throw new Error(
                `issuer ${issuer} is not approved onchain, and backend signer ${signerAddress} is neither the RWA hub owner ${hubOwner} nor an approved hub operator. Configure the backend signer as a hub operator with setOperator(address,true) or use the owner signer.`
            );
        }

        const legacyOwnerOnlyRisk = Boolean(hubOwner && hubOwner !== signerAddress && signerIsOperator);

        const args = [issuer, true, note];

        if (this.useSubstrateWrites) {
            try {
                const result = await this.submitSubstrateWrite(
                    this.hubAddress,
                    new ethers.Interface(this.hubAbi),
                    "setIssuerApproval",
                    args
                );

                return {
                    approved: true,
                    alreadyApproved: false,
                    txHash: result.txHash,
                    receipt: result,
                };
            } catch (error) {
                if (legacyOwnerOnlyRisk) {
                    throw new Error(
                        "issuer approval reverted onchain. This RWA hub likely still uses the older owner-only issuer approval model. Use the hub owner as the backend signer or redeploy the updated hub so platform operators can auto-onboard issuers."
                    );
                }
                throw error;
            }
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        let tx;
        try {
            tx = await hub.setIssuerApproval(...args);
        } catch (error) {
            if (legacyOwnerOnlyRisk) {
                throw new Error(
                    "issuer approval reverted onchain. This RWA hub likely still uses the older owner-only issuer approval model. Use the hub owner as the backend signer or redeploy the updated hub so platform operators can auto-onboard issuers."
                );
            }
            throw error;
        }
        const receipt = await tx.wait();

        return {
            approved: true,
            alreadyApproved: false,
            txHash: tx.hash,
            receipt,
        };
    }

    async registerAttestation({ tokenId, role, attestor, evidenceHash, statementType, expiry }) {
        const args = [tokenId, role, attestor, evidenceHash, statementType, expiry];

        if (this.useSubstrateWrites) {
            const attestationIdsBefore = await this.readContract(this.hubAddress, this.hubAbi, "getAttestationIds", [tokenId]);
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "registerAttestation",
                args
            );
            const attestationIdsAfter = await this.readContract(this.hubAddress, this.hubAbi, "getAttestationIds", [tokenId]);
            const nextId = attestationIdsAfter.find(
                (attestationId) => !(attestationIdsBefore || []).some((existing) => String(existing) === String(attestationId))
            );
            return {
                attestationId: toNumber(nextId || 0),
                txHash: result.txHash,
                receipt: result,
            };
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        const tx = await hub.registerAttestation(...args);
        const receipt = await tx.wait();

        let attestationId = null;
        for (const log of receipt.logs || []) {
            try {
                const parsed = hub.interface.parseLog(log);
                if (parsed?.name === "AttestationRecorded") {
                    attestationId = toNumber(parsed.args.attestationId);
                    break;
                }
            } catch (error) {
                // Ignore unrelated logs.
            }
        }

        return {
            attestationId,
            txHash: tx.hash,
            receipt,
        };
    }

    async revokeAttestation({ attestationId, reason }) {
        const args = [attestationId, reason];

        if (this.useSubstrateWrites) {
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "revokeAttestation",
                args
            );
            return {
                txHash: result.txHash,
                receipt: result,
            };
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        const tx = await hub.revokeAttestation(...args);
        const receipt = await tx.wait();
        return {
            txHash: tx.hash,
            receipt,
        };
    }

    async setCompliance({ user, assetType, approved, expiry, jurisdiction }) {
        const args = [user, assetType, approved, expiry, jurisdiction];

        if (this.useSubstrateWrites) {
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "setCompliance",
                args
            );
            return { txHash: result.txHash, receipt: result };
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        const tx = await hub.setCompliance(...args);
        const receipt = await tx.wait();
        return { txHash: tx.hash, receipt };
    }

    async setAssetPolicy({ tokenId, frozen, disputed, revoked, reason }) {
        const args = [tokenId, frozen, disputed, revoked, reason];

        if (this.useSubstrateWrites) {
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "setAssetPolicy",
                args
            );
            return { txHash: result.txHash, receipt: result };
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        const tx = await hub.setAssetPolicy(...args);
        const receipt = await tx.wait();
        return { txHash: tx.hash, receipt };
    }

    async setAttestationPolicy({ assetType, role, required, maxAge }) {
        const args = [assetType, role, required, maxAge];

        if (this.useSubstrateWrites) {
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "setAttestationPolicy",
                args
            );
            return { txHash: result.txHash, receipt: result };
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        const tx = await hub.setAttestationPolicy(...args);
        const receipt = await tx.wait();
        return { txHash: tx.hash, receipt };
    }

    async freezeStream({ streamId, frozen, reason }) {
        const args = [streamId, frozen, reason];

        if (this.useSubstrateWrites) {
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "freezeStream",
                args
            );
            return { txHash: result.txHash, receipt: result };
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        const tx = await hub.freezeStream(...args);
        const receipt = await tx.wait();
        return { txHash: tx.hash, receipt };
    }

    async setVerificationStatus({ tokenId, status, reason }) {
        const args = [tokenId, status, reason];

        if (this.useSubstrateWrites) {
            const result = await this.submitSubstrateWrite(
                this.hubAddress,
                new ethers.Interface(this.hubAbi),
                "setVerificationStatus",
                args
            );
            return {
                txHash: result.txHash,
                receipt: result,
            };
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, true);
        const tx = await hub.setVerificationStatus(...args);
        const receipt = await tx.wait();
        return {
            txHash: tx.hash,
            receipt,
        };
    }

    async getAttestationPolicies(assetType) {
        if (!this.complianceGuardAddress) {
            return [];
        }

        const policies = [];
        for (const role of Object.values(ATTESTATION_ROLE_CODES)) {
            const policy = await this.readContract(
                this.complianceGuardAddress,
                this.guardAbi,
                "getAttestationPolicy",
                [assetType, role]
            );
            if (!policy.required && toNumber(policy.maxAge) === 0) {
                continue;
            }
            policies.push({
                role,
                roleLabel: codeToAttestationRole(role),
                required: Boolean(policy.required),
                maxAge: toNumber(policy.maxAge),
            });
        }

        return policies;
    }

    async getAttestations(tokenId) {
        if (!this.hubAddress) {
            return [];
        }

        const attestationIds = await this.readContract(this.hubAddress, this.hubAbi, "getAttestationIds", [tokenId]);
        const items = [];

        for (const attestationId of attestationIds || []) {
            const attestation = await this.readContract(
                this.hubAddress,
                this.hubAbi,
                "getAttestation",
                [attestationId]
            );
            items.push({
                attestationId: toNumber(attestationId),
                tokenId: toNumber(attestation.tokenId),
                role: toNumber(attestation.role),
                roleLabel: codeToAttestationRole(attestation.role),
                attestor: attestation.attestor,
                evidenceHash: attestation.evidenceHash,
                statementType: attestation.statementType,
                issuedAt: toNumber(attestation.issuedAt),
                expiry: toNumber(attestation.expiry),
                revoked: Boolean(attestation.revoked),
                revocationReason: attestation.revocationReason,
            });
        }

        return items;
    }

    async getAttestationRecord(attestationId) {
        if (!this.hubAddress) {
            return null;
        }

        let attestation;
        try {
            attestation = await this.readContract(
                this.hubAddress,
                this.hubAbi,
                "getAttestation",
                [attestationId]
            );
        } catch (error) {
            return null;
        }
        if (!toNumber(attestation.tokenId)) {
            return null;
        }

        return {
            attestationId: toNumber(attestationId),
            tokenId: toNumber(attestation.tokenId),
            role: toNumber(attestation.role),
            roleLabel: codeToAttestationRole(attestation.role),
            attestor: attestation.attestor,
            evidenceHash: attestation.evidenceHash,
            statementType: attestation.statementType,
            issuedAt: toNumber(attestation.issuedAt),
            expiry: toNumber(attestation.expiry),
            revoked: Boolean(attestation.revoked),
            revocationReason: attestation.revocationReason,
        };
    }

    async getAssetSnapshot(tokenId) {
        if (!this.isConfigured()) {
            throw new Error("RWAChainService: contracts are not configured");
        }

        const asset = await this.readContract(this.hubAddress, this.hubAbi, "getAsset", [tokenId]);
        if (!asset.exists) {
            return null;
        }

        const stream = await this.readContract(this.hubAddress, this.hubAbi, "getAssetStream", [tokenId]);
        const claimableYield = await this.readContract(this.hubAddress, this.hubAbi, "claimableYield", [tokenId]);
        const tokenURI = await this.readContract(this.assetNFTAddress, this.assetNftAbi, "tokenURI", [tokenId]);

        let compliance = null;
        let assetPolicy = null;
        if (this.complianceGuardAddress) {
            try {
                const [complianceResult, assetPolicyResult] = await Promise.all([
                    this.readContract(
                        this.complianceGuardAddress,
                        this.guardAbi,
                        "getCompliance",
                        [asset.currentOwner, asset.assetType]
                    ),
                    this.readContract(
                        this.complianceGuardAddress,
                        this.guardAbi,
                        "getAssetPolicy",
                        [tokenId]
                    ),
                ]);
                compliance = {
                    approved: complianceResult.approved,
                    expiry: toNumber(complianceResult.expiry),
                    jurisdiction: complianceResult.jurisdiction,
                    currentlyValid: complianceResult.currentlyValid,
                };
                assetPolicy = {
                    frozen: assetPolicyResult.frozen,
                    disputed: assetPolicyResult.disputed,
                    revoked: assetPolicyResult.revoked,
                    updatedAt: toNumber(assetPolicyResult.updatedAt),
                    updatedBy: assetPolicyResult.updatedBy,
                    reason: assetPolicyResult.reason,
                };
            } catch (error) {
                compliance = null;
                assetPolicy = null;
            }
        }

        const [attestations, attestationPolicies] = await Promise.all([
            this.getAttestations(tokenId),
            this.getAttestationPolicies(toNumber(asset.assetType)),
        ]);

        return {
            tokenId: toNumber(tokenId),
            assetType: toNumber(asset.assetType),
            rightsModel: toNumber(asset.rightsModel),
            rightsModelLabel: codeToRightsModel(asset.rightsModel),
            verificationStatus: toNumber(asset.verificationStatus),
            verificationStatusLabel: codeToVerificationStatus(asset.verificationStatus),
            cidHash: asset.cidHash,
            tagHash: asset.tagHash,
            propertyRefHash: asset.propertyRefHash,
            publicMetadataHash: asset.publicMetadataHash,
            evidenceRoot: asset.evidenceRoot,
            evidenceManifestHash: asset.evidenceManifestHash,
            issuer: asset.issuer,
            activeStreamId: toNumber(asset.activeStreamId),
            jurisdiction: asset.jurisdiction,
            publicMetadataURI: asset.publicMetadataURI,
            metadataURI: asset.publicMetadataURI,
            tokenURI,
            statusReason: asset.statusReason,
            createdAt: toNumber(asset.createdAt),
            updatedAt: toNumber(asset.updatedAt),
            verificationUpdatedAt: toNumber(asset.verificationUpdatedAt),
            exists: asset.exists,
            currentOwner: asset.currentOwner,
            schemaVersion: asset.publicMetadataHash && asset.evidenceRoot ? 2 : 1,
            claimableYield: claimableYield.toString(),
            stream: {
                streamId: toNumber(stream.streamId),
                sender: stream.sender,
                assetType: toNumber(stream.assetType),
                totalAmount: stream.totalAmount.toString(),
                flowRate: stream.flowRate.toString(),
                startTime: toNumber(stream.startTime),
                stopTime: toNumber(stream.stopTime),
                amountWithdrawn: stream.amountWithdrawn.toString(),
                isActive: stream.isActive,
                isFrozen: stream.isFrozen,
            },
            compliance,
            assetPolicy,
            attestationPolicies,
            attestations,
        };
    }

    async listAssetSnapshots({ owner, limit = 200 } = {}) {
        if (!this.isConfigured()) {
            return [];
        }

        const nextTokenIdRaw = await this.readContract(
            this.assetNFTAddress,
            this.assetNftAbi,
            "nextTokenId",
            []
        );
        const nextTokenId = toNumber(nextTokenIdRaw);
        if (!Number.isFinite(nextTokenId) || nextTokenId <= 1) {
            return [];
        }

        const firstTokenId = Math.max(1, nextTokenId - Math.max(1, Number(limit || 200)));
        const assets = [];

        for (let tokenId = firstTokenId; tokenId < nextTokenId; tokenId += 1) {
            try {
                const snapshot = await this.getAssetSnapshot(tokenId);
                if (!snapshot) {
                    continue;
                }

                if (
                    owner
                    && snapshot.currentOwner?.toLowerCase() !== owner.toLowerCase()
                ) {
                    continue;
                }

                assets.push(snapshot);
            } catch (error) {
                // Skip missing or unreadable token ids so one bad read does not block the list.
            }
        }

        return assets.sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
    }

    async getVerificationStatus(tokenId, cidHash, tagHash) {
        return this.readContract(
            this.hubAddress,
            this.hubAbi,
            "getVerificationStatus",
            [tokenId, cidHash, tagHash]
        );
    }

    async getCurrentBlockNumber() {
        if (this.useSubstrateReads || this.useSubstrateWrites) {
            await this.init();
            const header = await this.substrateApi.rpc.chain.getHeader();
            return Number(header.number.toString());
        }

        if (!this.provider) {
            return 0;
        }
        return this.provider.getBlockNumber();
    }

    async getBlockTimestamp(blockNumber) {
        if (this.useSubstrateReads || this.useSubstrateWrites) {
            await this.init();
            const blockHash = await this.substrateApi.rpc.chain.getBlockHash(blockNumber);
            const timestamp = await this.substrateApi.query.timestamp.now.at(blockHash);
            const value = Number(timestamp.toString());
            return value > 1e12 ? Math.floor(value / 1000) : value;
        }

        const block = await this.provider.getBlock(blockNumber);
        return block?.timestamp || 0;
    }
}

module.exports = {
    RWAChainService,
};
