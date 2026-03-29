# Payment Sessions And Streams

Reusable payment state is the settlement primitive behind Stream Engine.

## What They Solve

Without streaming, a naive x402 integration can still require a fresh onchain payment for every request.

With reusable sessions or streams:

- one funding action can cover many requests
- repeated requests reference existing payment state
- unused balance is refunded on cancel

## Lifecycle

1. sender funds a reusable payment session or stream rail
2. sender creates payment state with recipient, amount, duration, and metadata
3. recipient claims or settles accrued funds over time
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
