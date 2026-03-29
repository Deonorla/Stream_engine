# Creating Streams

## Website Flow

1. Connect a compatible wallet
2. Choose the recipient and amount
3. Fund the reusable payment session
4. Create the payment session
5. Reuse the session for repeated paid actions

## Agent Flow

1. Call a paid route
2. Parse the x402 response
3. Create or reuse a payment session
4. Retry with session proof

## Why Streams Matter

Reusable payment sessions reduce repeated per-request settlement overhead and make agentic workloads economically viable.
