import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export type DataKey = {tag: "Admin", values: void} | {tag: "Registry", values: void} | {tag: "NextStreamId", values: void} | {tag: "Stream", values: readonly [u64]} | {tag: "AssetStreams", values: readonly [u64]};


export interface YieldStream {
  flash_advance_outstanding: i128;
  sender: string;
  start_time: u64;
  status: u32;
  stop_time: u64;
  stream_id: u64;
  token: string;
  token_id: u64;
  total_amount: i128;
  withdrawn_amount: i128;
}

export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim: ({owner, token_id}: {owner: string, token_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_stream: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<YieldStream>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, registry}: {admin: string, registry: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a open_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  open_stream: ({sender, token_id, token, total_amount, start_time, stop_time}: {sender: string, token_id: u64, token: string, total_amount: i128, start_time: u64, stop_time: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_registry: ({admin, registry}: {admin: string, registry: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a flash_advance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  flash_advance: ({owner, token_id, amount}: {owner: string, token_id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a latest_stream_for_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  latest_stream_for_asset: ({token_id}: {token_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAIUmVnaXN0cnkAAAAAAAAAAAAAAAxOZXh0U3RyZWFtSWQAAAABAAAAAAAAAAZTdHJlYW0AAAAAAAEAAAAGAAAAAQAAAAAAAAAMQXNzZXRTdHJlYW1zAAAAAQAAAAY=",
        "AAAAAQAAAAAAAAAAAAAAC1lpZWxkU3RyZWFtAAAAAAoAAAAAAAAAGWZsYXNoX2FkdmFuY2Vfb3V0c3RhbmRpbmcAAAAAAAALAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAAAAAABnN0YXR1cwAAAAAABAAAAAAAAAAJc3RvcF90aW1lAAAAAAAABgAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAYAAAAAAAAADHRvdGFsX2Ftb3VudAAAAAsAAAAAAAAAEHdpdGhkcmF3bl9hbW91bnQAAAAL",
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAACAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACHRva2VuX2lkAAAABgAAAAEAAAAL",
        "AAAAAAAAAAAAAAAKZ2V0X3N0cmVhbQAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAfQAAAAC1lpZWxkU3RyZWFtAA==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhyZWdpc3RyeQAAABMAAAAA",
        "AAAAAAAAAAAAAAALb3Blbl9zdHJlYW0AAAAABgAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAMdG90YWxfYW1vdW50AAAACwAAAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAAAAAAAJc3RvcF90aW1lAAAAAAAABgAAAAEAAAAG",
        "AAAAAAAAAAAAAAAMZ2V0X3JlZ2lzdHJ5AAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAMc2V0X3JlZ2lzdHJ5AAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhyZWdpc3RyeQAAABMAAAAA",
        "AAAAAAAAAAAAAAANZmxhc2hfYWR2YW5jZQAAAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAAAAAAAXbGF0ZXN0X3N0cmVhbV9mb3JfYXNzZXQAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAGAAAAAQAAAAY=" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<i128>,
        get_stream: this.txFromJSON<YieldStream>,
        initialize: this.txFromJSON<null>,
        open_stream: this.txFromJSON<u64>,
        get_registry: this.txFromJSON<string>,
        set_registry: this.txFromJSON<null>,
        flash_advance: this.txFromJSON<i128>,
        latest_stream_for_asset: this.txFromJSON<u64>
  }
}