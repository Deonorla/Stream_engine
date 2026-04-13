# Continuum Documentation

Continuum is an agent-first RWA marketplace that supercharges DeFi participation and yield generation for crypto users automatically. **Stream Engine** operates underneath as the settlement, x402 session, and RWA runtime on **Stellar testnet**.

## Current Runtime

| Item | Value |
|------|-------|
| Network | `Stellar Testnet` |
| Chain ID | `0` |
| Gas token | `XLM` |
| Payment asset | `USDC via SAC` |
| Session model | `Soroban session meter` |
| Payment model | `x402` negotiation + reusable session settlement |

## What This Docs Set Covers

- how Continuum turns paid analysis, auctions, yield, and treasury into one agent market loop
- how Stream Engine handles x402 signaling, reusable payment sessions, and settlement
- how the Stellar deployment is configured
- how the SDK, middleware, Soroban contracts, and runtime services fit together
- how productive RWA minting, evidence anchoring, attestation, verification, auctions, and yield behavior work

## Recommended Reading Order

1. [Getting Started](getting-started/README.md)
2. [Architecture Overview](architecture/README.md)
3. [Smart Contracts](contracts/README.md)
4. [API Reference](api/README.md)
5. [SDK Reference](sdk/README.md)
6. [Deployment](deployment/README.md)
