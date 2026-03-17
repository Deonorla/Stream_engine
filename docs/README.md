# Stream Engine Documentation

Stream Engine is an x402-compatible payment and settlement stack for AI agents and rental RWAs on **Westend Asset Hub**.

## Current Runtime

| Item | Value |
|------|-------|
| Network | `Westend Asset Hub` |
| Chain ID | `420420421` |
| Gas token | `WND` |
| Payment asset | `Circle USDC` |
| Asset ID | `31337` |
| Payment model | `x402` negotiation + reusable streaming settlement |

## What This Docs Set Covers

- how x402 signaling works in Stream Engine
- how reusable payment streams reduce agent payment overhead
- how the Westend deployment is configured
- how the SDK, middleware, and contracts fit together
- how rental RWA minting, verification, and yield streaming work

## Recommended Reading Order

1. [Getting Started](getting-started/README.md)
2. [Architecture Overview](architecture/README.md)
3. [Smart Contracts](contracts/README.md)
4. [SDK Reference](sdk/README.md)
5. [Deployment](deployment/README.md)
