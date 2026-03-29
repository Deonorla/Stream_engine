# Smart Contracts

> Legacy note: this contract section documents the archived Westend deployment. The active hackathon integration path is Stellar-backed and relay/session-driven.

This section is a **legacy reference** for the older Solidity contracts deployed on **Westend Asset Hub**.

## Payment Rail

| Contract | Purpose |
|----------|---------|
| `FlowPayStream` | reusable payment streams for x402-protected services |

## RWA Suite

| Contract | Purpose |
|----------|---------|
| `FlowPayAssetNFT` | rental asset NFT |
| `FlowPayAssetRegistry` | property identity, metadata hash, evidence root, and verification state |
| `FlowPayAssetAttestationRegistry` | role-based attestation and revocation records |
| `FlowPayComplianceGuard` | issuer approval, compliance policy, attestation policy, freeze / dispute state |
| `FlowPayAssetStream` | asset-bound yield streams |
| `FlowPayRWAHub` | orchestration layer and operator-driven issuer onboarding |

## Legacy Payment Asset

The archived contracts use **Circle USDC** on Westend Asset Hub:

- asset id: `31337`
- decimals: `6`
- precompile: `0x00007a6900000000000000000000000001200000`

## Verification Notes

The v2 RWA suite is designed for **verified productive rental assets**, not direct deed-title transfer claims.

Onchain state anchors:

- public metadata hash
- property reference hash
- private evidence root
- evidence manifest hash
- verification status
- attestation records
- asset policy state

Private evidence such as deeds, tax records, inspections, and insurance documents stays offchain in the server-managed evidence vault.

## Next Steps

- [FlowPayStream Details](flowpaystream.md)
- [Circle USDC Integration](circle-usdc.md)
- [Events & Errors](events-errors.md)
