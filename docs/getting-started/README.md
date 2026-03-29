# Getting Started

Welcome to **Stream Engine**.

This section is the quickest way to understand how the system fits together:

1. `x402` tells the agent that payment is required
2. the Stream Engine runtime decides how to satisfy that payment
3. the settlement layer uses direct payment or reusable sessions/stream compatibility
4. middleware verifies payment state and unlocks the API response

## What You'll Learn

1. **Installation** - set up the app and SDK
2. **Quick Start** - run the local stack and make your first paid request flow
3. **Configuration** - point the runtime at the right chain, token, and contracts

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
  -> Stream Engine runtime
  -> Stellar session-backed settlement
```

## Notes

- the product name is **Stream Engine**
- some code-level identifiers still keep earlier `FlowPay*` names for compatibility
- legacy Westend docs remain in the repo for reference, but the active hackathon path is Stellar

## Next Steps

- [Installation Guide](installation.md)
- [Quick Start Tutorial](quick-start.md)
- [Configuration Options](configuration.md)
