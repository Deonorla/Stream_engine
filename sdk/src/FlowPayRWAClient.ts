import { ethers, Contract, Signer, Provider } from "ethers";
import { FlowPayTransactionAdapter } from "./transactionAdapter";

export interface RWAClientConfig {
    apiBaseUrl: string;
    hubAddress?: string;
    streamAddress?: string;
    tokenAddress?: string;
    tokenDecimals?: number;
    tokenSymbol?: string;
    adapter?: FlowPayTransactionAdapter;
}

export interface MintAssetParams {
    issuer: string;
    assetType: number;
    metadata?: Record<string, unknown>;
    metadataURI?: string;
    tag?: string;
    tagHash?: string;
}

export class FlowPayRWAClient {
    private TOKEN_APPROVAL_GAS_LIMIT = 500000n;
    private ASSET_STREAM_CREATION_GAS_LIMIT = 1500000n;
    private apiBaseUrl: string;
    private hubAddress?: string;
    private streamAddress?: string;
    private tokenAddress?: string;
    private tokenDecimals: number;
    private tokenSymbol: string;
    private adapter?: FlowPayTransactionAdapter;

    private HUB_ABI = [
        "function createAssetYieldStream(uint256 tokenId, uint256 totalAmount, uint256 duration) external returns (uint256)",
        "function claimYield(uint256 tokenId) external returns (uint256)",
        "function flashAdvance(uint256 tokenId, uint256 amount) external",
        "function claimableYield(uint256 tokenId) external view returns (uint256)",
    ];

    private ERC20_ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
    ];

    constructor(config: RWAClientConfig) {
        this.apiBaseUrl = config.apiBaseUrl.replace(/\/$/, "");
        this.hubAddress = config.hubAddress;
        this.streamAddress = config.streamAddress;
        this.tokenAddress = config.tokenAddress;
        this.tokenDecimals = Number.isFinite(Number(config.tokenDecimals)) ? Number(config.tokenDecimals) : 6;
        this.tokenSymbol = config.tokenSymbol || "USDC";
        this.adapter = config.adapter;
    }

    async pinMetadata(metadata: Record<string, unknown>) {
        return this.request("/api/rwa/ipfs/metadata", {
            method: "POST",
            body: JSON.stringify({ metadata }),
        });
    }

    async mintAsset(params: MintAssetParams) {
        return this.request("/api/rwa/assets", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }

    async listAssets(owner?: string) {
        const suffix = owner ? `?owner=${encodeURIComponent(owner)}` : "";
        const response = await this.request(`/api/rwa/assets${suffix}`);
        return response.assets || [];
    }

    async getAsset(tokenId: number) {
        const response = await this.request(`/api/rwa/assets/${tokenId}`);
        return response.asset;
    }

    async getActivity(tokenId: number) {
        const response = await this.request(`/api/rwa/assets/${tokenId}/activity`);
        return response.activity || [];
    }

    async verifyAsset(body: Record<string, unknown>) {
        return this.request("/api/rwa/verify", {
            method: "POST",
            body: JSON.stringify(body),
        });
    }

    async approveAndCreateAssetStream(
        signer: Signer,
        tokenId: number,
        totalAmount: bigint,
        duration: number
    ) {
        if (!this.hubAddress || !this.streamAddress || !this.tokenAddress) {
            throw new Error("FlowPayRWAClient is missing contract addresses");
        }

        if (this.adapter) {
            await this.adapter.approveToken(this.tokenAddress, this.streamAddress, totalAmount);
            return this.adapter.callContract(
                this.hubAddress,
                this.HUB_ABI,
                "createAssetYieldStream",
                [tokenId, totalAmount, duration]
            );
        }

        const ownerAddress = await signer.getAddress();
        const token = new Contract(this.tokenAddress, this.ERC20_ABI, signer);
        let shouldApprove = true;
        try {
            const allowance: bigint = await token.allowance(ownerAddress, this.streamAddress);
            shouldApprove = allowance < totalAmount;
        } catch (error: any) {
            console.warn("[FlowPayRWAClient] Unable to read token allowance. Falling back to direct approval.");
            console.warn(`[FlowPayRWAClient] Allowance read error: ${error?.shortMessage || error?.message || error}`);
        }

        if (shouldApprove) {
            const approveTx = await token.approve(this.streamAddress, totalAmount, {
                gasLimit: this.TOKEN_APPROVAL_GAS_LIMIT,
            });
            await approveTx.wait();
        }

        const hub = new Contract(this.hubAddress, this.HUB_ABI, signer);
        const tx = await hub.createAssetYieldStream(tokenId, totalAmount, duration, {
            gasLimit: this.ASSET_STREAM_CREATION_GAS_LIMIT,
        });
        return tx.wait();
    }

    async claimYield(signer: Signer, tokenId: number) {
        if (!this.hubAddress) {
            throw new Error("FlowPayRWAClient is missing hub address");
        }

        if (this.adapter) {
            return this.adapter.callContract(this.hubAddress, this.HUB_ABI, "claimYield", [tokenId]);
        }

        const hub = new Contract(this.hubAddress, this.HUB_ABI, signer);
        const tx = await hub.claimYield(tokenId);
        return tx.wait();
    }

    async flashAdvance(signer: Signer, tokenId: number, amount: bigint) {
        if (!this.hubAddress) {
            throw new Error("FlowPayRWAClient is missing hub address");
        }

        if (this.adapter) {
            return this.adapter.callContract(this.hubAddress, this.HUB_ABI, "flashAdvance", [tokenId, amount]);
        }

        const hub = new Contract(this.hubAddress, this.HUB_ABI, signer);
        const tx = await hub.flashAdvance(tokenId, amount);
        return tx.wait();
    }

    async getClaimableYield(provider: Provider, tokenId: number) {
        if (!this.hubAddress) {
            return 0n;
        }

        if (this.adapter?.readContract) {
            return this.adapter.readContract<bigint>(this.hubAddress, this.HUB_ABI, "claimableYield", [tokenId]);
        }

        const hub = new Contract(this.hubAddress, this.HUB_ABI, provider);
        return hub.claimableYield(tokenId) as Promise<bigint>;
    }

    private async request(path: string, init: RequestInit = {}) {
        const response = await fetch(`${this.apiBaseUrl}${path}`, {
            headers: {
                "Content-Type": "application/json",
                ...(init.headers || {}),
            },
            ...init,
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "FlowPayRWAClient request failed");
        }
        return data;
    }

    static hashTag(tag: string) {
        return ethers.keccak256(ethers.toUtf8Bytes(tag));
    }

    formatAmount(value: bigint) {
        return ethers.formatUnits(value, this.tokenDecimals);
    }
}
