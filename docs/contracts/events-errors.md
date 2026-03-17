# Events & Errors

Reference for the payment stream contract event surface.

## Core Events

### `StreamCreated`

Emitted when a sender opens a new stream.

Key fields:

- `streamId`
- `sender`
- `recipient`
- `totalAmount`
- `startTime`
- `stopTime`
- `metadata`

### `Withdrawn`

Emitted when the recipient withdraws accrued USDC from a stream.

### `StreamCancelled`

Emitted when a stream is cancelled and balances are split between sender and recipient.

## Typical Errors

| Error | Meaning |
|------|---------|
| `Total amount must be greater than 0` | stream budget is zero |
| `Recipient cannot be the zero address` | invalid recipient |
| `Duration must be greater than 0` | invalid duration |
| `flowRate would be zero` | amount too small for duration at 6 decimals |
| `Transfer failed. check allowance` | token approval missing |
| `Caller is not the recipient` | wrong wallet is trying to withdraw |
| `Caller cannot cancel this stream` | only sender or recipient may cancel |

## Listener Example

```javascript
contract.on('StreamCreated', (streamId, sender, recipient, amount) => {
  console.log(`Stream #${streamId} opened with ${amount} base units`);
});
```
