# Building AI Agents

Stream Engine is built for agents that need:

- machine-readable payment discovery
- automatic authorization
- repeated paid access without per-call friction
- spending controls

## Recommended Flow

1. Read `/api/engine/catalog`
2. Call the route you need
3. Handle `402 Payment Required`
4. Use the SDK to choose direct payment or streaming
5. Retry with proof

## Why x402 + Streaming

x402 standardizes the paywall conversation.
Streaming makes fulfilling that payment requirement efficient at high frequency.
