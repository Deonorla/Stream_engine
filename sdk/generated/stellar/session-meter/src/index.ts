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




export type DataKey = {tag: "Admin", values: void} | {tag: "NextSessionId", values: void} | {tag: "Session", values: readonly [u64]} | {tag: "PayerSessions", values: readonly [string]} | {tag: "RecipientSessions", values: readonly [string]};


export interface SessionRecord {
  asset_code: string;
  asset_issuer: string;
  canceled_at: u64;
  claimed_amount: i128;
  frozen: boolean;
  metadata_hash: Buffer;
  payer: string;
  recipient: string;
  session_id: u64;
  start_time: u64;
  status: u32;
  stop_time: u64;
  token: string;
  total_amount: i128;
}


export interface SessionSettlement {
  claimable_amount: i128;
  refundable_amount: i128;
}

export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim: ({recipient, session_id}: {recipient: string, session_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel: ({payer, session_id}: {payer: string, session_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<SessionSettlement>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_session transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_session: ({session_id}: {session_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<SessionRecord>>

  /**
   * Construct and simulate a open_session transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  open_session: ({payer, recipient, token, asset_code, asset_issuer, total_amount, start_time, stop_time, metadata_hash}: {payer: string, recipient: string, token: string, asset_code: string, asset_issuer: string, total_amount: i128, start_time: u64, stop_time: u64, metadata_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a freeze_session transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  freeze_session: ({admin, session_id, frozen}: {admin: string, session_id: u64, frozen: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_session_active transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_session_active: ({session_id}: {session_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a list_payer_sessions transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_payer_sessions: ({payer}: {payer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a list_recipient_sessions transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_recipient_sessions: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

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
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAANTmV4dFNlc3Npb25JZAAAAAAAAAEAAAAAAAAAB1Nlc3Npb24AAAAAAQAAAAYAAAABAAAAAAAAAA1QYXllclNlc3Npb25zAAAAAAAAAQAAABMAAAABAAAAAAAAABFSZWNpcGllbnRTZXNzaW9ucwAAAAAAAAEAAAAT",
        "AAAAAQAAAAAAAAAAAAAADVNlc3Npb25SZWNvcmQAAAAAAAAOAAAAAAAAAAphc3NldF9jb2RlAAAAAAAQAAAAAAAAAAxhc3NldF9pc3N1ZXIAAAAQAAAAAAAAAAtjYW5jZWxlZF9hdAAAAAAGAAAAAAAAAA5jbGFpbWVkX2Ftb3VudAAAAAAACwAAAAAAAAAGZnJvemVuAAAAAAABAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABgAAAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAAAAAAAGc3RhdHVzAAAAAAAEAAAAAAAAAAlzdG9wX3RpbWUAAAAAAAAGAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAADHRvdGFsX2Ftb3VudAAAAAs=",
        "AAAAAQAAAAAAAAAAAAAAEVNlc3Npb25TZXR0bGVtZW50AAAAAAAAAgAAAAAAAAAQY2xhaW1hYmxlX2Ftb3VudAAAAAsAAAAAAAAAEXJlZnVuZGFibGVfYW1vdW50AAAAAAAACw==",
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAGAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAACAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAACnNlc3Npb25faWQAAAAAAAYAAAABAAAH0AAAABFTZXNzaW9uU2V0dGxlbWVudAAAAA==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAALZ2V0X3Nlc3Npb24AAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABgAAAAEAAAfQAAAADVNlc3Npb25SZWNvcmQAAAA=",
        "AAAAAAAAAAAAAAAMb3Blbl9zZXNzaW9uAAAACQAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACmFzc2V0X2NvZGUAAAAAABAAAAAAAAAADGFzc2V0X2lzc3VlcgAAABAAAAAAAAAADHRvdGFsX2Ftb3VudAAAAAsAAAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAAAAAACXN0b3BfdGltZQAAAAAAAAYAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAG",
        "AAAAAAAAAAAAAAAOZnJlZXplX3Nlc3Npb24AAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABgAAAAAAAAAGZnJvemVuAAAAAAABAAAAAA==",
        "AAAAAAAAAAAAAAARaXNfc2Vzc2lvbl9hY3RpdmUAAAAAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAGAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAATbGlzdF9wYXllcl9zZXNzaW9ucwAAAAABAAAAAAAAAAVwYXllcgAAAAAAABMAAAABAAAD6gAAAAY=",
        "AAAAAAAAAAAAAAAXbGlzdF9yZWNpcGllbnRfc2Vzc2lvbnMAAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAEAAAPqAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<i128>,
        cancel: this.txFromJSON<SessionSettlement>,
        initialize: this.txFromJSON<null>,
        get_session: this.txFromJSON<SessionRecord>,
        open_session: this.txFromJSON<u64>,
        freeze_session: this.txFromJSON<null>,
        is_session_active: this.txFromJSON<boolean>,
        list_payer_sessions: this.txFromJSON<Array<u64>>,
        list_recipient_sessions: this.txFromJSON<Array<u64>>
  }
}