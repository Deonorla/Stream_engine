# Architecture Overview

Continuum has two linked rails powered by the underlying Stream Engine runtime:

1. an **x402-compatible payment rail** for continuous AI agent interactions and paid APIs
2. a **productive RWA rail** for verified rental twins and ownership-linked yield streams

The important design choice in v2 is that RWA NFTs are **not presented as direct legal title transfer instruments**. They are verified digital twins backed by:

- public metadata
- private evidence bundles
- attestation records
- compliance / policy state
- yield streams that follow NFT ownership

## System Shape

```text
agent / user / renter
  -> frontend or sdk
  -> x402 middleware + RWA API
  -> Stella's Stream Engine runtime services on Stellar testnet
  -> private evidence vault + IPFS + indexer
  -> productive real-world asset
```

## Payment Rail

| Component | Role |
|----------|------|
| Provider middleware | emits HTTP 402 responses and verifies payment proof |
| SDK/runtime | parses x402 payment terms and chooses direct payment vs reusable sessions |
| Session meter runtime | reusable paid-session rail for repeated paid requests |
| Stellar USDC SAC | settlement asset on Stellar testnet |

## Productive RWA Rail

| Component | Role |
|----------|------|
| `StreamEngineAssetNFT` | the onchain rental twin / digital twin NFT |
| `StreamEngineAssetRegistry` | stores identity, metadata hash, evidence root, and verification state |
| `StreamEngineAssetAttestationRegistry` | stores role-based attestations and revocations |
| `StreamEngineComplianceGuard` | compliance checks, asset policy, attestation policy, and legacy issuer-admin controls that are no longer on the active Stellar mint path |
| `StreamEngineAssetStream` | binds rental yield to NFT ownership |
| `StreamEngineRWAHub` | orchestration layer for policy/admin actions and legacy backend-assisted flows; the active Stellar mint path is now low-friction and backend-submitted |
| Private evidence vault | stores deed/tax/inspection/insurance evidence offchain |
| IPFS | stores sanitized public metadata only |
| Indexer | exposes activity history and hydrated asset snapshots |

## Why The RWA Rail Looks Like This

The v2 design is built for **productive** assets such as:

- houses and rental apartments
- cars and fleet vehicles
- heavy equipment and machinery

These assets can generate rental revenue. That makes streaming useful:

- renters can stream usage payments
- unused value can be refunded when usage ends early
- future unclaimed yield follows current NFT ownership

The system intentionally does **not** treat raw onchain metadata as enough proof for a deed-grade claim. Instead, it separates:

- **public metadata**: safe to expose publicly
- **private evidence**: deed, survey, tax, valuation, inspection, insurance, tenancy records
- **attestations**: lawyer, registrar, inspector, valuer, insurer, compliance
- **policy state**: verified, stale, frozen, revoked, disputed

## Verification Model

RWA verification in v2 is no longer just “CID matched”.

The verifier now checks:

- property identity and public metadata binding
- evidence-root availability in the private vault
- missing or expired evidence documents
- required role attestations
- stale or revoked attestations
- freeze / dispute / revoke status
- current owner, stream linkage, and indexed activity

The result is a structured trust state such as:

- `verified`
- `verified_with_warnings`
- `stale`
- `incomplete`
- `frozen`
- `revoked`
- `disputed`
- `mismatch`

## Deployed Runtime

The active Stellar-backed runtime is documented in [deployment/README.md](../deployment/README.md).
