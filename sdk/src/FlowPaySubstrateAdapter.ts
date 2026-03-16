import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import { ethers, Interface, InterfaceAbi } from "ethers";
import { FlowPayTransactionAdapter, StreamCreationResult } from "./transactionAdapter";

export interface FlowPaySubstrateAdapterConfig {
    rpcUrl?: string;
    substrateRpcUrl: string;
    suri?: string;
    accountJson?: string | Record<string, unknown>;
    password?: string;
    keyType?: "sr25519" | "ed25519" | "ecdsa";
    weightLimit?: {
        refTime: string;
        proofSize: string;
    };
    storageDepositLimit?: string;
}

const DEFAULT_WEIGHT_LIMIT = {
    refTime: "900000000000",
    proofSize: "5242880",
};

const DEFAULT_STORAGE_DEPOSIT_LIMIT = "5000000000000000000";

function resolveAccountIdHex(addressOrBytes: string | Uint8Array) {
    if (typeof addressOrBytes === "string") {
        if (addressOrBytes.startsWith("0x") && addressOrBytes.length === 66) {
            return addressOrBytes.toLowerCase();
        }
        return u8aToHex(decodeAddress(addressOrBytes)).toLowerCase();
    }

    return u8aToHex(addressOrBytes).toLowerCase();
}

function accountIdToEvmAddress(addressOrBytes: string | Uint8Array) {
    const accountIdHex = resolveAccountIdHex(addressOrBytes);
    const body = accountIdHex.slice(2);

    if (body.endsWith("ee".repeat(12))) {
        return ethers.getAddress(`0x${body.slice(0, 40)}`);
    }

    const digest = ethers.keccak256(accountIdHex);
    return ethers.getAddress(`0x${digest.slice(-40)}`);
}

export class FlowPaySubstrateAdapter implements FlowPayTransactionAdapter {
    private config: FlowPaySubstrateAdapterConfig;
    private apiPromise: Promise<ApiPromise> | null = null;
    private pair: any = null;
    private evmAddress: string | null = null;

    private ERC20_ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address recipient, uint256 amount) external returns (bool)",
    ];

    constructor(config: FlowPaySubstrateAdapterConfig) {
        this.config = config;
    }

    async approveToken(tokenAddress: string, spender: string, amount: bigint) {
        return this.callContract(tokenAddress, this.ERC20_ABI, "approve", [spender, amount]);
    }

    async transferToken(tokenAddress: string, recipient: string, amount: bigint) {
        const result = await this.callContract(tokenAddress, this.ERC20_ABI, "transfer", [recipient, amount]);
        return {
            hash: (result as { txHash?: string }).txHash,
        };
    }

    async createStream(
        contractAddress: string,
        recipient: string,
        duration: number,
        amount: bigint,
        metadata: string,
        abi: InterfaceAbi
    ): Promise<StreamCreationResult> {
        const iface = new Interface(abi);
        const previousLatestStreamId = await this.findLatestStreamId(contractAddress, iface);
        await this.callContract(contractAddress, abi, "createStream", [recipient, duration, amount, metadata]);
        const streamId = previousLatestStreamId + 1;
        const stream = await this.readContract<any>(contractAddress, abi, "streams", [streamId]);

        return {
            streamId: String(streamId),
            startTime: BigInt(stream.startTime.toString()),
        };
    }

    async callContract(
        contractAddress: string,
        abi: InterfaceAbi,
        functionName: string,
        args: unknown[]
    ) {
        await this.init();
        const api = await this.getApi();
        const iface = new Interface(abi);
        const tx = api.tx.revive.call(
            contractAddress,
            "0",
            this.createWeight(api),
            this.config.storageDepositLimit || DEFAULT_STORAGE_DEPOSIT_LIMIT,
            iface.encodeFunctionData(functionName, args)
        );

        return this.signAndSend(tx);
    }

    async readContract<T = unknown>(
        contractAddress: string,
        abi: InterfaceAbi,
        functionName: string,
        args: unknown[]
    ): Promise<T> {
        await this.init();
        const api = await this.getApi();
        const iface = new Interface(abi);
        const result: any = await api.call.reviveApi.call(
            this.pair.address,
            contractAddress,
            "0",
            this.createWeight(api),
            this.config.storageDepositLimit || DEFAULT_STORAGE_DEPOSIT_LIMIT,
            iface.encodeFunctionData(functionName, args)
        );

        if (result.result.isErr) {
            throw new Error(this.decodeDispatchError(api, result.result.asErr));
        }

        const execution = result.result.asOk;
        const flags = execution.flags?.bits?.toString?.() || "0";
        if (flags !== "0") {
            throw new Error(`Contract reverted with flags=${flags} data=${execution.data.toHex()}`);
        }

        const decoded = iface.decodeFunctionResult(functionName, execution.data.toHex());
        return (decoded.length === 1 ? decoded[0] : decoded) as T;
    }

    async getEvmAddress() {
        await this.init();
        return this.evmAddress as string;
    }

    private async init() {
        if (this.pair && this.evmAddress) {
            return;
        }

        await cryptoWaitReady();

        const keyring = new Keyring({ type: this.config.keyType || "sr25519" });
        if (this.config.suri) {
            this.pair = keyring.addFromUri(this.config.suri);
        } else if (this.config.accountJson) {
            const json = typeof this.config.accountJson === "string"
                ? JSON.parse(this.config.accountJson)
                : this.config.accountJson;
            this.pair = keyring.addFromJson(json);
            this.pair.decodePkcs8(this.config.password || "");
        } else {
            throw new Error("FlowPaySubstrateAdapter requires either `suri` or `accountJson`.");
        }

        this.evmAddress = accountIdToEvmAddress(this.pair.address);
        await this.ensureMapped();
    }

    private async getApi() {
        if (!this.apiPromise) {
            this.apiPromise = ApiPromise.create({
                provider: new WsProvider(this.config.substrateRpcUrl),
            });
        }

        return this.apiPromise;
    }

    private createWeight(api: ApiPromise) {
        const weightLimit = this.config.weightLimit || DEFAULT_WEIGHT_LIMIT;
        return api.registry.createType("WeightV2", {
            refTime: weightLimit.refTime.toString(),
            proofSize: weightLimit.proofSize.toString(),
        });
    }

    private decodeDispatchError(api: ApiPromise, dispatchError: any) {
        if (!dispatchError) {
            return "";
        }

        if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            return `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`;
        }

        return dispatchError.toString();
    }

    private async ensureMapped() {
        const api = await this.getApi();
        if (!api.query.revive?.originalAccount || !api.tx.revive?.mapAccount) {
            return;
        }

        const existing: any = await api.query.revive.originalAccount(this.evmAddress as string);
        if (existing.isSome) {
            return;
        }

        await this.signAndSend(api.tx.revive.mapAccount());
    }

    private async signAndSend(tx: any) {
        const api = await this.getApi();

        return new Promise<{ txHash: string; blockHash: string; events: any[] }>((resolve, reject) => {
            let unsub: (() => void) | null = null;

            tx.signAndSend(this.pair, (result: any) => {
                if (result.dispatchError) {
                    if (unsub) {
                        unsub();
                    }
                    reject(new Error(this.decodeDispatchError(api, result.dispatchError)));
                    return;
                }

                const failedEvent = result.events.find(
                    ({ event }: any) => event.section === "system" && event.method === "ExtrinsicFailed"
                );
                if (failedEvent) {
                    if (unsub) {
                        unsub();
                    }
                    reject(new Error(this.decodeDispatchError(api, failedEvent.event.data[0])));
                    return;
                }

                if (result.status.isInBlock || result.status.isFinalized) {
                    if (unsub) {
                        unsub();
                    }
                    resolve({
                        txHash: tx.hash.toHex(),
                        blockHash: result.status.isFinalized
                            ? result.status.asFinalized.toString()
                            : result.status.asInBlock.toString(),
                        events: result.events,
                    });
                }
            })
                .then((nextUnsub: () => void) => {
                    unsub = nextUnsub;
                })
                .catch(reject);
        });
    }

    private async findLatestStreamId(contractAddress: string, iface: Interface, scanLimit = 128) {
        let latestStreamId = 0;

        for (let streamId = 1; streamId <= scanLimit; streamId += 1) {
            const stream = await this.readContract<any>(contractAddress, iface.fragments, "streams", [streamId]);
            if (!stream.sender || stream.sender === ethers.ZeroAddress) {
                break;
            }
            latestStreamId = streamId;
        }

        return latestStreamId;
    }
}
