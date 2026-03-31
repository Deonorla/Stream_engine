import { InterfaceAbi } from "ethers";

export interface StreamCreationResult {
    streamId: string;
    startTime: bigint;
}

export interface StreamEngineTransactionAdapter {
    approveToken(tokenAddress: string, spender: string, amount: bigint): Promise<unknown>;
    transferToken(tokenAddress: string, recipient: string, amount: bigint): Promise<{ hash?: string } | unknown>;
    createStream(
        contractAddress: string,
        recipient: string,
        duration: number,
        amount: bigint,
        metadata: string,
        abi: InterfaceAbi
    ): Promise<StreamCreationResult>;
    callContract(
        contractAddress: string,
        abi: InterfaceAbi,
        functionName: string,
        args: unknown[]
    ): Promise<unknown>;
    readContract?<T = unknown>(
        contractAddress: string,
        abi: InterfaceAbi,
        functionName: string,
        args: unknown[]
    ): Promise<T>;
}
