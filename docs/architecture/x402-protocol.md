# x402 Protocol

In Stream Engine, `x402` is the **payment negotiation layer**, not the settlement layer.

## Mental Model

| Layer | Responsibility |
|------|-----------------|
| x402 | “payment is required, here are the terms” |
| Stream Engine | satisfy those terms through direct settlement or reusable streams |
| Middleware | verify the proof and unlock the resource |

## Typical Flow

```text
1. Agent requests a protected route
2. Provider returns HTTP 402
3. Response headers describe token, price, recipient, and contract
4. SDK chooses direct payment or streaming
5. Agent retries with stream id or tx hash
6. Provider verifies proof and returns the resource
```

## Headers Used in This Repo

| Header | Purpose |
|--------|---------|
| `X-Payment-Required` | signals payment requirement |
| `X-FlowPay-Mode` | `streaming`, `direct`, or `free` |
| `X-FlowPay-Rate` | price quoted in token units |
| `X-FlowPay-Token` | payment token/precompile address |
| `X-FlowPay-Token-Decimals` | token decimals |
| `X-Payment-Currency` | display symbol, currently `USDC` |
| `X-FlowPay-Contract` | stream contract address |
| `X-FlowPay-Recipient` | recipient for the paid route |
| `X-FlowPay-Stream-ID` | stream proof on retry |
| `X-FlowPay-Tx-Hash` | direct-payment proof on retry |

## Why It Matters

x402 makes paid APIs machine-readable for agents. Stream Engine makes them economically usable when request volume is high.
