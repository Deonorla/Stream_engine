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




export type DataKey = {tag: "Admin", values: void} | {tag: "NextTokenId", values: void} | {tag: "Issuer", values: readonly [string]} | {tag: "Compliance", values: readonly [string, u32]} | {tag: "Asset", values: readonly [u64]} | {tag: "OwnerAssets", values: readonly [string]} | {tag: "AssetTypePolicy", values: readonly [u32]};


export interface AssetPolicy {
  disputed: boolean;
  frozen: boolean;
  reason: string;
  revoked: boolean;
  updated_at: u64;
}


export interface AssetRecord {
  active_stream_id: u64;
  asset_type: u32;
  cid_hash: string;
  created_at: u64;
  current_owner: string;
  evidence_manifest_hash: string;
  evidence_root: string;
  issuer: string;
  jurisdiction: string;
  property_ref_hash: string;
  public_metadata_hash: string;
  public_metadata_uri: string;
  rights_model: u32;
  schema_version: u32;
  status_reason: string;
  tag_hash: string;
  token_id: u64;
  updated_at: u64;
  verification_status: u32;
  verification_updated_at: u64;
}


export interface IssuerApproval {
  approved: boolean;
  note: string;
  updated_at: u64;
}


export interface AssetTypePolicy {
  requires_attestation: boolean;
  updated_at: u64;
}


export interface ComplianceRecord {
  approved: boolean;
  expiry: u64;
  jurisdiction: string;
  updated_at: u64;
}

export interface Client {
  /**
   * Construct and simulate a owner_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  owner_of: ({token_id}: {token_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_asset: ({token_id}: {token_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<AssetRecord>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a mint_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mint_asset: ({issuer, asset_type, rights_model, public_metadata_uri, public_metadata_hash, evidence_root, evidence_manifest_hash, property_ref_hash, jurisdiction, cid_hash, tag_hash, status_reason}: {issuer: string, asset_type: u32, rights_model: u32, public_metadata_uri: string, public_metadata_hash: string, evidence_root: string, evidence_manifest_hash: string, property_ref_hash: string, jurisdiction: string, cid_hash: string, tag_hash: string, status_reason: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_compliance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_compliance: ({user, asset_type}: {user: string, asset_type: u32}, options?: MethodOptions) => Promise<AssembledTransaction<ComplianceRecord>>

  /**
   * Construct and simulate a set_compliance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_compliance: ({admin, user, asset_type, approved, expiry, jurisdiction}: {admin: string, user: string, asset_type: u32, approved: boolean, expiry: u64, jurisdiction: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_asset: ({owner, token_id, to}: {owner: string, token_id: u64, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_asset_policy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_asset_policy: ({admin, token_id, frozen, disputed, revoked, reason}: {admin: string, token_id: u64, frozen: boolean, disputed: boolean, revoked: boolean, reason: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a list_owned_assets transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_owned_assets: ({owner}: {owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a bind_active_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  bind_active_stream: ({admin, token_id, stream_id}: {admin: string, token_id: u64, stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_issuer_approval transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_issuer_approval: ({issuer}: {issuer: string}, options?: MethodOptions) => Promise<AssembledTransaction<IssuerApproval>>

  /**
   * Construct and simulate a set_issuer_approval transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_issuer_approval: ({admin, issuer, approved, note}: {admin: string, issuer: string, approved: boolean, note: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_asset_type_policy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_asset_type_policy: ({asset_type}: {asset_type: u32}, options?: MethodOptions) => Promise<AssembledTransaction<AssetTypePolicy>>

  /**
   * Construct and simulate a set_asset_type_policy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_asset_type_policy: ({admin, asset_type, requires_attestation}: {admin: string, asset_type: u32, requires_attestation: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_asset_evidence transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_asset_evidence: ({owner, token_id, evidence_root, evidence_manifest_hash}: {owner: string, token_id: u64, evidence_root: string, evidence_manifest_hash: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_asset_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_asset_metadata: ({owner, token_id, metadata_uri, cid_hash, public_metadata_hash}: {owner: string, token_id: u64, metadata_uri: string, cid_hash: string, public_metadata_hash: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_asset_claim_blocked transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_asset_claim_blocked: ({token_id}: {token_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_verification_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_verification_status: ({admin, token_id, status, reason}: {admin: string, token_id: u64, status: u32, reason: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_verification_tag transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_verification_tag: ({owner, token_id, tag_hash}: {owner: string, token_id: u64, tag_hash: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "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",
        "AAAAAAAAAAAAAAAOZ2V0X2NvbXBsaWFuY2UAAAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAAphc3NldF90eXBlAAAAAAAEAAAAAQAAB9AAAAAQQ29tcGxpYW5jZVJlY29yZA==",
        "AAAAAAAAAAAAAAAOc2V0X2NvbXBsaWFuY2UAAAAAAAYAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEdXNlcgAAABMAAAAAAAAACmFzc2V0X3R5cGUAAAAAAAQAAAAAAAAACGFwcHJvdmVkAAAAAQAAAAAAAAAGZXhwaXJ5AAAAAAAGAAAAAAAAAAxqdXJpc2RpY3Rpb24AAAAQAAAAAA==",
        "AAAAAAAAAAAAAAAOdHJhbnNmZXJfYXNzZXQAAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAGAAAAAAAAAAJ0bwAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAQc2V0X2Fzc2V0X3BvbGljeQAAAAYAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAGAAAAAAAAAAZmcm96ZW4AAAAAAAEAAAAAAAAACGRpc3B1dGVkAAAAAQAAAAAAAAAHcmV2b2tlZAAAAAABAAAAAAAAAAZyZWFzb24AAAAAABAAAAAA",
        "AAAAAAAAAAAAAAARbGlzdF9vd25lZF9hc3NldHMAAAAAAAABAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAD6gAAAAY=",
        "AAAAAAAAAAAAAAASYmluZF9hY3RpdmVfc3RyZWFtAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHRva2VuX2lkAAAABgAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAA=",
        "AAAAAAAAAAAAAAATZ2V0X2lzc3Vlcl9hcHByb3ZhbAAAAAABAAAAAAAAAAZpc3N1ZXIAAAAAABMAAAABAAAH0AAAAA5Jc3N1ZXJBcHByb3ZhbAAA",
        "AAAAAAAAAAAAAAATc2V0X2lzc3Vlcl9hcHByb3ZhbAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABmlzc3VlcgAAAAAAEwAAAAAAAAAIYXBwcm92ZWQAAAABAAAAAAAAAARub3RlAAAAEAAAAAA=",
        "AAAAAAAAAAAAAAAVZ2V0X2Fzc2V0X3R5cGVfcG9saWN5AAAAAAAAAQAAAAAAAAAKYXNzZXRfdHlwZQAAAAAABAAAAAEAAAfQAAAAD0Fzc2V0VHlwZVBvbGljeQA=",
        "AAAAAAAAAAAAAAAVc2V0X2Fzc2V0X3R5cGVfcG9saWN5AAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAphc3NldF90eXBlAAAAAAAEAAAAAAAAABRyZXF1aXJlc19hdHRlc3RhdGlvbgAAAAEAAAAA",
        "AAAAAAAAAAAAAAAVdXBkYXRlX2Fzc2V0X2V2aWRlbmNlAAAAAAAABAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAYAAAAAAAAADWV2aWRlbmNlX3Jvb3QAAAAAAAAQAAAAAAAAABZldmlkZW5jZV9tYW5pZmVzdF9oYXNoAAAAAAAQAAAAAA==",
        "AAAAAAAAAAAAAAAVdXBkYXRlX2Fzc2V0X21ldGFkYXRhAAAAAAAABQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAYAAAAAAAAADG1ldGFkYXRhX3VyaQAAABAAAAAAAAAACGNpZF9oYXNoAAAAEAAAAAAAAAAUcHVibGljX21ldGFkYXRhX2hhc2gAAAAQAAAAAA==",
        "AAAAAAAAAAAAAAAWaXNfYXNzZXRfY2xhaW1fYmxvY2tlZAAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAGAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAXc2V0X3ZlcmlmaWNhdGlvbl9zdGF0dXMAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAYAAAAAAAAABnN0YXR1cwAAAAAABAAAAAAAAAAGcmVhc29uAAAAAAAQAAAAAA==",
        "AAAAAAAAAAAAAAAXdXBkYXRlX3ZlcmlmaWNhdGlvbl90YWcAAAAAAwAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAYAAAAAAAAACHRhZ19oYXNoAAAAEAAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    owner_of: this.txFromJSON<string>,
        get_asset: this.txFromJSON<AssetRecord>,
        initialize: this.txFromJSON<null>,
        mint_asset: this.txFromJSON<u64>,
        get_compliance: this.txFromJSON<ComplianceRecord>,
        set_compliance: this.txFromJSON<null>,
        transfer_asset: this.txFromJSON<null>,
        set_asset_policy: this.txFromJSON<null>,
        list_owned_assets: this.txFromJSON<Array<u64>>,
        bind_active_stream: this.txFromJSON<null>,
        get_issuer_approval: this.txFromJSON<IssuerApproval>,
        set_issuer_approval: this.txFromJSON<null>,
        get_asset_type_policy: this.txFromJSON<AssetTypePolicy>,
        set_asset_type_policy: this.txFromJSON<null>,
        update_asset_evidence: this.txFromJSON<null>,
        update_asset_metadata: this.txFromJSON<null>,
        is_asset_claim_blocked: this.txFromJSON<boolean>,
        set_verification_status: this.txFromJSON<null>,
        update_verification_tag: this.txFromJSON<null>
  }
}