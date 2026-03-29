# x402 Headers

The middleware still uses legacy `X-FlowPay-*` header names on the wire for compatibility, even though the product name is Stream Engine.

## Common Headers

| Header | Meaning |
|--------|---------|
| `X-FlowPay-Mode` | `free`, `per-request`, or `streaming` |
| `X-FlowPay-Rate` | quoted payment amount |
| `X-FlowPay-Token` | accepted token or settlement asset address |
| `X-FlowPay-Token-Decimals` | token decimals |
| `X-FlowPay-Recipient` | recipient for the route |
| `X-FlowPay-Contract` | session rail or relay identifier |
| `X-FlowPay-Stream-ID` | session proof used on retry |
| `X-FlowPay-Tx-Hash` | direct-payment proof used on retry |

## How They Are Used

1. Client requests a paid route
2. Server responds with `402 Payment Required`
3. Headers describe how payment can be satisfied
4. Client settles through direct payment or reusable session reuse
5. Client retries with proof
