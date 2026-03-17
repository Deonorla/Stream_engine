# FlowPayStream Contract

`FlowPayStream` is the stream settlement contract used behind Stream Engine’s x402 flow.

## Deployment

**Westend Asset Hub**: `0x75edbf3d9857521f5fb2f581c896779f5110a8a0`

## Role

The contract holds deposited Circle USDC and releases it to the recipient over time.

## Core Functions

| Function | Description |
|----------|-------------|
| `createStream(recipient, duration, amount, metadata)` | lock USDC and start a stream |
| `withdrawFromStream(streamId)` | recipient withdraws accrued balance |
| `cancelStream(streamId)` | stop the stream and refund unused balance |
| `getClaimableBalance(streamId)` | read accrued claimable amount |
| `isStreamActive(streamId)` | check whether the stream is active |

## Calculation

```text
flowRate = totalAmount / duration
elapsed = min(now, stopTime) - startTime
claimable = (elapsed * flowRate) - amountWithdrawn
```

## Notes

- amounts are denominated in USDC base units with `6` decimals
- the contract exposes `paymentToken()` as the canonical token getter
- Stream Engine uses metadata to tag agent actions, route purpose, and RWA rental context
