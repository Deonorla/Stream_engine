# Stella's Stream Engine Documentation

Stella's Stream Engine is an x402-compatible payment and settlement stack for AI agents and rental RWAs on **Stellar testnet**.

## Current Runtime

| Item | Value |
|------|-------|
| Network | `Stellar Testnet` |
| Chain ID | `0` |
| Gas token | `XLM` |
| Payment asset | `USDC via SAC` |
| Session model | `backend session meter` |
| Payment model | `x402` negotiation + reusable session settlement |

## What This Docs Set Covers

- how x402 signaling works in Stella's Stream Engine
- how reusable payment sessions reduce agent payment overhead
- how the Stellar deployment is configured
- how the SDK, middleware, relay layer, and runtime services fit together
- how rental RWA minting, evidence anchoring, attestation, verification, and yield behavior work

## Recommended Reading Order

1. [Getting Started](getting-started/README.md)
2. [Architecture Overview](architecture/README.md)
3. [Smart Contracts](contracts/README.md)
4. [API Reference](api/README.md)
5. [SDK Reference](sdk/README.md)
6. [Deployment](deployment/README.md)
