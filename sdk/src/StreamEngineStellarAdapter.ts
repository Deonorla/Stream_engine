import axios from "axios";
import { InterfaceAbi } from "ethers";
import { StreamEngineTransactionAdapter, StreamCreationResult } from "./transactionAdapter";

export interface StreamEngineStellarAdapterConfig {
    apiBaseUrl: string;
    senderAddress: string;
}

export class StreamEngineStellarAdapter implements StreamEngineTransactionAdapter {
    private apiBaseUrl: string;
    private senderAddress: string;

    constructor(config: StreamEngineStellarAdapterConfig) {
        this.apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
        this.senderAddress = String(config.senderAddress || "").trim();

        if (!this.apiBaseUrl) {
            throw new Error("StreamEngineStellarAdapter requires apiBaseUrl");
        }
        if (!this.senderAddress) {
            throw new Error("StreamEngineStellarAdapter requires senderAddress");
        }
    }

    async approveToken(_tokenAddress: string, _spender: string, _amount: bigint): Promise<unknown> {
        return { noop: true, settlement: "soroban-sac" };
    }

    async transferToken(_tokenAddress: string, _recipient: string, _amount: bigint): Promise<{ hash?: string }> {
        throw new Error("Direct token transfers are not enabled in the Stellar adapter. Use streaming/session settlement.");
    }

    async createStream(
        _contractAddress: string,
        recipient: string,
        duration: number,
        amount: bigint,
        metadata: string,
        _abi: InterfaceAbi,
    ): Promise<StreamCreationResult> {
        const response = await axios.post(`${this.apiBaseUrl}/api/sessions`, {
            sender: this.senderAddress,
            recipient,
            duration,
            amount: String(amount),
            metadata,
        });

        const streamId = String(response.data?.streamId || response.data?.session?.id || "");
        const startTime = BigInt(response.data?.session?.startTime || response.data?.startTime || Math.floor(Date.now() / 1000));

        if (!streamId) {
            throw new Error("Session open response did not include a stream/session id.");
        }

        return { streamId, startTime };
    }

    async callContract(
        _contractAddress: string,
        _abi: InterfaceAbi,
        functionName: string,
        args: unknown[]
    ): Promise<unknown> {
        throw new Error(`StreamEngineStellarAdapter does not support direct contract call passthrough (${functionName}). Use the RWA client relay APIs instead.`);
    }

    async readContract<T = unknown>(
        _contractAddress: string,
        _abi: InterfaceAbi,
        functionName: string,
        args: unknown[]
    ): Promise<T> {
        if (functionName === "paymentToken") {
            const response = await axios.get(`${this.apiBaseUrl}/api/engine/catalog`);
            return response.data?.payments?.tokenAddress as T;
        }

        if (functionName === "streams" && args.length > 0) {
            const response = await axios.get(`${this.apiBaseUrl}/api/sessions/${encodeURIComponent(String(args[0]))}`);
            return response.data?.session as T;
        }

        throw new Error(`StreamEngineStellarAdapter does not support readContract(${functionName})`);
    }
}
