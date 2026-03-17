# Payment Streams

Payment streams are the settlement primitive behind Stream Engine.

## What They Solve

Without streaming, a naive x402 integration can still require a fresh onchain payment for every request.

With streaming:

- one open-stream transaction can cover many requests
- repeated requests reference an existing stream
- unused balance is refunded on cancel

## Lifecycle

1. sender approves Circle USDC to `FlowPayStream`
2. sender creates a stream with recipient, amount, duration, and metadata
3. recipient withdraws accrued funds over time
4. either party can cancel and settle remaining balances

## Formula

```text
flowRate = totalAmount / duration
claimable = (flowRate * secondsElapsed) - amountWithdrawn
remaining = totalAmount - streamedAmount
```

## Why Agents Benefit

- lower transaction count
- lower latency after the first payment action
- predictable budget envelopes
- clean reuse of payment state across repeated requests
