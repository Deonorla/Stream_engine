# Creating Streams

## Website Flow

1. Connect an EVM or Substrate-compatible wallet
2. Choose the recipient and amount
3. Approve Circle USDC
4. Create the stream
5. Reuse the stream for repeated paid actions

## Agent Flow

1. Call a paid route
2. Parse the x402 response
3. Create or reuse a stream
4. Retry with stream proof

## Why Streams Matter

Streams reduce repeated per-request settlement overhead and make agentic workloads economically viable.
