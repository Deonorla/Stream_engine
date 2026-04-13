# Getting Started

Welcome to **Continuum**.

This section is the quickest way to understand how the system supercharges DeFi participation automatically:

1. `x402` tells the autonomous AI agent that payment is required for premium actions
2. the underlying Stream Engine runtime decides how to satisfy that payment
3. the settlement layer uses direct payment or reusable sessions
4. middleware verifies payment state and unlocks the API response so the agent can continually optimize yield

## What You'll Learn

1. **Installation** - set up the app and SDK
2. **Quick Start** - run the local stack and make your first paid request flow
3. **Configuration** - point the runtime at the right Stellar network, asset, and backend services

## Prerequisites

- Node.js v18 or higher
- npm or yarn
- a Stellar-compatible wallet such as Freighter
- XLM for testnet fees
- Stellar testnet USDC

## Architecture Overview

```text
AI Agent
  -> x402-aware API
  -> Stella's Stream Engine runtime
  -> Stellar session-backed settlement
```

## Notes

- the product name is **Stella's Stream Engine**
- the active runtime is Stellar-first
- frontend and SDK flows share the same backend session semantics

## Next Steps

- [Installation Guide](installation.md)
- [Quick Start Tutorial](quick-start.md)
- [Configuration Options](configuration.md)
