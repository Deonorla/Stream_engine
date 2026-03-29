# Production Checklist

This repo currently targets **Stellar testnet** for active testing. Before any production-like deployment, confirm:

## Payment

- x402 middleware routes are configured
- Stellar USDC SAC address, asset code, issuer, and decimals are correct
- session rail identifier and recipient addresses are set

## RWA v2

- attestation registry/runtime surface is configured
- backend operator key is configured for relay/admin actions
- issuer onboarding policy is active and explicit before minting
- attestation policy is defined per asset type
- private evidence vault storage is configured
- public metadata pinning is configured
- indexer persistence is configured

## Product Claims

Do not market the RWA NFT as direct legal deed transfer unless you add jurisdiction-specific legal integration. The current model is:

- verified rental twin
- evidence-backed verification
- ownership-linked rental yield
