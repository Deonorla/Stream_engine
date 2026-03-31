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




export type DataKey = {tag: "Admin", values: void} | {tag: "NextAttestationId", values: void} | {tag: "Attestation", values: readonly [u64]} | {tag: "TokenAttestations", values: readonly [u64]} | {tag: "Policy", values: readonly [u32, u32]} | {tag: "PolicyRoles", values: readonly [u32]};


export interface AttestationPolicy {
  asset_type: u32;
  max_age: u64;
  required: boolean;
  role: u32;
}


export interface AttestationRecord {
  attestation_id: u64;
  attestor: string;
  evidence_hash: string;
  expiry: u64;
  issued_at: u64;
  revocation_reason: string;
  revoked: boolean;
  role: u32;
  statement_type: string;
  token_id: u64;
}

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_policy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_policy: ({admin, asset_type, role, required, max_age}: {admin: string, asset_type: u32, role: u32, required: boolean, max_age: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_policies transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_policies: ({asset_type}: {asset_type: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<AttestationPolicy>>>

  /**
   * Construct and simulate a list_for_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_for_token: ({token_id}: {token_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<AttestationRecord>>>

  /**
   * Construct and simulate a get_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_attestation: ({attestation_id}: {attestation_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<AttestationRecord>>

  /**
   * Construct and simulate a revoke_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke_attestation: ({attestor, attestation_id, reason}: {attestor: string, attestation_id: u64, reason: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a register_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register_attestation: ({attestor, token_id, role, evidence_hash, statement_type, expiry}: {attestor: string, token_id: u64, role: u32, evidence_hash: string, statement_type: string, expiry: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a has_required_policies transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_required_policies: ({asset_type}: {asset_type: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

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
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAARTmV4dEF0dGVzdGF0aW9uSWQAAAAAAAABAAAAAAAAAAtBdHRlc3RhdGlvbgAAAAABAAAABgAAAAEAAAAAAAAAEVRva2VuQXR0ZXN0YXRpb25zAAAAAAAAAQAAAAYAAAABAAAAAAAAAAZQb2xpY3kAAAAAAAIAAAAEAAAABAAAAAEAAAAAAAAAC1BvbGljeVJvbGVzAAAAAAEAAAAE",
        "AAAAAQAAAAAAAAAAAAAAEUF0dGVzdGF0aW9uUG9saWN5AAAAAAAABAAAAAAAAAAKYXNzZXRfdHlwZQAAAAAABAAAAAAAAAAHbWF4X2FnZQAAAAAGAAAAAAAAAAhyZXF1aXJlZAAAAAEAAAAAAAAABHJvbGUAAAAE",
        "AAAAAQAAAAAAAAAAAAAAEUF0dGVzdGF0aW9uUmVjb3JkAAAAAAAACgAAAAAAAAAOYXR0ZXN0YXRpb25faWQAAAAAAAYAAAAAAAAACGF0dGVzdG9yAAAAEwAAAAAAAAANZXZpZGVuY2VfaGFzaAAAAAAAABAAAAAAAAAABmV4cGlyeQAAAAAABgAAAAAAAAAJaXNzdWVkX2F0AAAAAAAABgAAAAAAAAARcmV2b2NhdGlvbl9yZWFzb24AAAAAAAAQAAAAAAAAAAdyZXZva2VkAAAAAAEAAAAAAAAABHJvbGUAAAAEAAAAAAAAAA5zdGF0ZW1lbnRfdHlwZQAAAAAAEAAAAAAAAAAIdG9rZW5faWQAAAAG",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAKc2V0X3BvbGljeQAAAAAABQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAphc3NldF90eXBlAAAAAAAEAAAAAAAAAARyb2xlAAAABAAAAAAAAAAIcmVxdWlyZWQAAAABAAAAAAAAAAdtYXhfYWdlAAAAAAYAAAAA",
        "AAAAAAAAAAAAAAAMZ2V0X3BvbGljaWVzAAAAAQAAAAAAAAAKYXNzZXRfdHlwZQAAAAAABAAAAAEAAAPqAAAH0AAAABFBdHRlc3RhdGlvblBvbGljeQAAAA==",
        "AAAAAAAAAAAAAAAObGlzdF9mb3JfdG9rZW4AAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABgAAAAEAAAPqAAAH0AAAABFBdHRlc3RhdGlvblJlY29yZAAAAA==",
        "AAAAAAAAAAAAAAAPZ2V0X2F0dGVzdGF0aW9uAAAAAAEAAAAAAAAADmF0dGVzdGF0aW9uX2lkAAAAAAAGAAAAAQAAB9AAAAARQXR0ZXN0YXRpb25SZWNvcmQAAAA=",
        "AAAAAAAAAAAAAAAScmV2b2tlX2F0dGVzdGF0aW9uAAAAAAADAAAAAAAAAAhhdHRlc3RvcgAAABMAAAAAAAAADmF0dGVzdGF0aW9uX2lkAAAAAAAGAAAAAAAAAAZyZWFzb24AAAAAABAAAAAA",
        "AAAAAAAAAAAAAAAUcmVnaXN0ZXJfYXR0ZXN0YXRpb24AAAAGAAAAAAAAAAhhdHRlc3RvcgAAABMAAAAAAAAACHRva2VuX2lkAAAABgAAAAAAAAAEcm9sZQAAAAQAAAAAAAAADWV2aWRlbmNlX2hhc2gAAAAAAAAQAAAAAAAAAA5zdGF0ZW1lbnRfdHlwZQAAAAAAEAAAAAAAAAAGZXhwaXJ5AAAAAAAGAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAAVaGFzX3JlcXVpcmVkX3BvbGljaWVzAAAAAAAAAQAAAAAAAAAKYXNzZXRfdHlwZQAAAAAABAAAAAEAAAAB" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<null>,
        set_policy: this.txFromJSON<null>,
        get_policies: this.txFromJSON<Array<AttestationPolicy>>,
        list_for_token: this.txFromJSON<Array<AttestationRecord>>,
        get_attestation: this.txFromJSON<AttestationRecord>,
        revoke_attestation: this.txFromJSON<null>,
        register_attestation: this.txFromJSON<u64>,
        has_required_policies: this.txFromJSON<boolean>
  }
}