# Runtime Surfaces

Stella's Stream Engine is now a Stellar-first system. The active runtime is built around backend-managed session metering and RWA registry services.

## Payment Surface

| Surface | Purpose |
|---------|---------|
| `SessionMeter` | reusable payment sessions for x402-protected routes |
| Stellar USDC SAC | settlement asset used for session pricing and API access |
| x402 middleware | bridges HTTP 402 negotiation to active Stellar session state |

## RWA Surface

| Surface | Purpose |
|---------|---------|
| `RwaRegistry` | stores rental-twin identity, public metadata hash, evidence root, and verification status |
| `AttestationRegistry` | stores role-based attestations, revocations, and expiry information |
| `YieldVault` | tracks asset-linked rental yield, claims, and flash advances |
| Policy/admin layer | issuer onboarding, compliance decisions, verification status, and asset freeze/dispute state |

## Verification Model

The active RWA stack verifies **productive rental twins**, not direct legal title transfer.

Verification combines:

- public metadata binding
- property reference hashing
- private evidence root anchoring
- attestation coverage
- document freshness
- policy state
- ownership and yield linkage

Private evidence such as deeds, tax records, inspections, and insurance documents remains offchain in the evidence vault.
