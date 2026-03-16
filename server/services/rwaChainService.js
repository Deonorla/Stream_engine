const { ethers } = require("ethers");
const { createFlowPayRuntimeConfig } = require("../../utils/polkadot");
const {
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    reviveCall,
    reviveRead,
} = require("../../utils/substrate");

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
        this.substrateConfig = config.substrateConfig || null;

        this.hubAbi = [
            "function mintAsset(string metadataURI, uint8 assetType, bytes32 cidHash, bytes32 tagHash, address issuer) external returns (uint256 tokenId)",
            "function getAsset(uint256 tokenId) external view returns (uint8 assetType, bytes32 cidHash, bytes32 tagHash, address issuer, uint256 activeStreamId, string metadataURI, uint64 createdAt, uint64 updatedAt, bool exists, address currentOwner)",
            "function getAssetStream(uint256 tokenId) external view returns (uint256 streamId, address sender, uint8 assetType, uint256 totalAmount, uint256 flowRate, uint256 startTime, uint256 stopTime, uint256 amountWithdrawn, bool isActive, bool isFrozen)",
            "function claimableYield(uint256 tokenId) external view returns (uint256)",
            "function getVerificationStatus(uint256 tokenId, bytes32 cidHash, bytes32 tagHash) external view returns (bool assetExists, bool cidMatches, bool tagMatches, uint256 activeStreamId)",
            "event AssetMinted(uint256 indexed tokenId, address indexed issuer, uint8 indexed assetType, string metadataURI)"
        ];

        this.assetNftAbi = [
            "function tokenURI(uint256 tokenId) external view returns (string)",
            "function ownerOf(uint256 tokenId) external view returns (address)",
            "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
        ];

        this.registryAbi = [
            "event AssetRegistered(uint256 indexed tokenId, address indexed issuer, uint8 indexed assetType, string metadataURI, bytes32 cidHash, bytes32 tagHash)",
            "event AssetStreamLinked(uint256 indexed tokenId, uint256 indexed streamId)",
            "event AssetMetadataUpdated(uint256 indexed tokenId, string metadataURI, bytes32 cidHash)",
            "event VerificationTagUpdated(uint256 indexed tokenId, bytes32 previousTagHash, bytes32 newTagHash)"
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
            "event ComplianceUpdated(address indexed user, uint8 indexed assetType, bool approved, uint64 expiry, string jurisdiction)",
            "event StreamFreezeUpdated(uint256 indexed streamId, bool frozen, string reason, address indexed updatedBy)"
        ];
    }

    isConfigured() {
        return Boolean(this.provider && this.hubAddress && this.assetNFTAddress);
    }

    async init() {
        if ((!this.useSubstrateWrites && !this.useSubstrateReads) || this.substrateApi) {
            return;
        }

        const { api, config } = await createSubstrateApi();
        const { pair, evmAddress } = await loadSubstrateSigner();
        await ensureMapped(api, pair, evmAddress);

        this.substrateApi = api;
        this.substratePair = pair;
        this.substrateConfig = config;
    }

    getContract(address, abi, withSigner = false) {
        if (!address || !this.provider) {
            return null;
        }
        return new ethers.Contract(address, abi, withSigner ? this.signer : this.provider);
    }

    getInterfaces() {
        return {
            hub: new ethers.Interface(this.hubAbi),
            nft: new ethers.Interface(this.assetNftAbi),
            registry: new ethers.Interface(this.registryAbi),
            stream: new ethers.Interface(this.streamAbi),
            guard: new ethers.Interface(this.guardAbi),
        };
    }

    getEventSources() {
        return [
            { name: "hub", address: this.hubAddress, interface: new ethers.Interface(this.hubAbi) },
            { name: "nft", address: this.assetNFTAddress, interface: new ethers.Interface(this.assetNftAbi) },
            { name: "registry", address: this.assetRegistryAddress, interface: new ethers.Interface(this.registryAbi) },
            { name: "stream", address: this.assetStreamAddress, interface: new ethers.Interface(this.streamAbi) },
            { name: "guard", address: this.complianceGuardAddress, interface: new ethers.Interface(this.guardAbi) },
        ].filter((source) => Boolean(source.address));
    }

    async submitSubstrateWrite(address, iface, functionName, args = []) {
        if (!this.useSubstrateWrites) {
            throw new Error("RWAChainService: substrate writes are not enabled");
        }

        await this.init();

        return reviveCall(this.substrateApi, this.substratePair, {
            dest: address,
            data: iface.encodeFunctionData(functionName, args),
            weightLimit: this.substrateConfig.weightLimit,
            storageDepositLimit: this.substrateConfig.storageDepositLimit,
        });
    }

    async readContract(address, abi, functionName, args = []) {
        if (this.useSubstrateReads) {
            await this.init();
            const iface = abi instanceof ethers.Interface ? abi : new ethers.Interface(abi);
            const result = await reviveRead(this.substrateApi, this.substratePair.address, {
                dest: address,
                data: iface.encodeFunctionData(functionName, args),
                weightLimit: this.substrateConfig.weightLimit,
                storageDepositLimit: this.substrateConfig.storageDepositLimit,
            });
            const decoded = iface.decodeFunctionResult(functionName, result.data);
            return decoded.length === 1 ? decoded[0] : decoded;
        }

        const contract = this.getContract(address, abi);
        return contract[functionName](...args);
    }

    async mintAsset({ metadataURI, assetType, cidHash, tagHash, issuer }) {
        if (!this.hubAddress) {
            throw new Error("RWAChainService: hub contract missing");
        }

        const hub = this.getContract(this.hubAddress, this.hubAbi, !this.useSubstrateWrites);

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
                [metadataURI, assetType, cidHash, tagHash, issuer]
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

        const tx = await hub.mintAsset(metadataURI, assetType, cidHash, tagHash, issuer);
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
        if (this.complianceGuardAddress) {
            try {
                const complianceResult = await this.readContract(
                    this.complianceGuardAddress,
                    this.guardAbi,
                    "getCompliance",
                    [asset.currentOwner, asset.assetType]
                );
                compliance = {
                    approved: complianceResult.approved,
                    expiry: toNumber(complianceResult.expiry),
                    jurisdiction: complianceResult.jurisdiction,
                    currentlyValid: complianceResult.currentlyValid,
                };
            } catch (error) {
                compliance = null;
            }
        }

        return {
            tokenId: toNumber(tokenId),
            assetType: Number(asset.assetType),
            cidHash: asset.cidHash,
            tagHash: asset.tagHash,
            issuer: asset.issuer,
            activeStreamId: toNumber(asset.activeStreamId),
            metadataURI: asset.metadataURI,
            tokenURI,
            createdAt: toNumber(asset.createdAt),
            updatedAt: toNumber(asset.updatedAt),
            exists: asset.exists,
            currentOwner: asset.currentOwner,
            claimableYield: claimableYield.toString(),
            stream: {
                streamId: toNumber(stream.streamId),
                sender: stream.sender,
                assetType: Number(stream.assetType),
                totalAmount: stream.totalAmount.toString(),
                flowRate: stream.flowRate.toString(),
                startTime: toNumber(stream.startTime),
                stopTime: toNumber(stream.stopTime),
                amountWithdrawn: stream.amountWithdrawn.toString(),
                isActive: stream.isActive,
                isFrozen: stream.isFrozen,
            },
            compliance,
        };
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
