# SDK Reference

The SDK is the agent runtime for Stream Engine.

Its core job is not just "send tokens." Its job is to turn `x402` payment requirements into usable agent behavior.

## Mental Model

- `x402` provides payment negotiation
- the SDK parses those requirements
- the SDK chooses direct settlement or streaming
- Stream Engine contracts execute the chosen payment path

That means the SDK is the decision and execution bridge between HTTP paywalls and onchain settlement.

## Installation

```bash
cd sdk
npm install
```

## Quick Start

```typescript
import { FlowPaySDK } from './FlowPaySDK';

const sdk = new FlowPaySDK({
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: 'https://westend-asset-hub-eth-rpc.polkadot.io',
  contractAddress: process.env.FLOWPAY_CONTRACT_ADDRESS,
  mneeAddress: '0x00007a6900000000000000000000000001200000'
});

// The SDK makes the request, parses the 402 response,
// decides how to pay, then retries automatically.
const response = await sdk.request('https://api.provider.com/premium');
```

## Components

| Component | Description |
|-----------|-------------|
| [FlowPaySDK](flowpay-sdk.md) | Main agent payment runtime |
| [GeminiPaymentBrain](gemini-payment-brain.md) | Payment strategy and optimization layer |
| [SpendingMonitor](spending-monitor.md) | Safety controls and limits |
| [FlowPayProxy](flowpay-proxy.md) | Multi-agent support |

## Architecture

```text
Agent Request
  -> SDK request layer
  -> x402 parser
  -> payment strategy decision
  -> stream or direct settlement
  -> request retry
```

## What the SDK Handles

- automatic `x402` negotiation
- route-aware direct vs streaming decisions
- stream creation and cancellation
- budget and spending guardrails
- compatibility with both EVM and Substrate-oriented transaction flows

## Why This Matters

Without this runtime, every paid provider would force agents to learn custom payment logic.

With this runtime:

- an agent can hit a paid route
- parse a standard 402 response
- satisfy payment automatically
- continue working without human checkout flow friction

## Compatibility Note

The product is now **Stream Engine**, but some exported classes still keep earlier FlowPay names for compatibility with the existing codebase.

## Next Steps

- [FlowPaySDK Reference](flowpay-sdk.md)
- [Building AI Agents](../guides/building-ai-agents.md)
