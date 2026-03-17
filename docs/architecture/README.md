# Architecture Overview

Stream Engine combines:

1. `x402` payment negotiation at the HTTP layer
2. stream-based settlement on Westend Asset Hub
3. a rental RWA lane built on the same payment and verification model

## Core System

```text
Agent / Wallet
  -> x402-aware provider
  -> Stream Engine SDK/runtime
  -> FlowPayStream + RWA contracts
  -> Westend Asset Hub + Circle USDC
```

## Key Components

| Component | Role |
|----------|------|
| Provider middleware | emits 402 responses and verifies payment proof |
| SDK | interprets payment requirements and executes settlement |
| FlowPayStream | reusable payment stream contract |
| RWA Hub + Registry | minting, verification, compliance, yield orchestration |
| Indexer | provenance and activity transparency |

## Why This Shape

- `x402` standardizes how agents discover that payment is required
- streaming makes repeated paid usage economically viable
- the same pattern also works for rental RWAs where access is metered but ownership stays with the issuer
