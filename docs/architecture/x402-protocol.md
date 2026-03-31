# x402 Protocol

In Stella's Stream Engine, `x402` is the **payment negotiation layer**, not the settlement layer.

## Mental Model

| Layer | Responsibility |
|------|-----------------|
| x402 | “payment is required, here are the terms” |
| Stella's Stream Engine | satisfy those terms through direct settlement or reusable payment state |
| Middleware | verify the proof and unlock the resource |

## Typical Flow

```text
1. Agent requests a protected route
2. Provider returns HTTP 402
3. Response headers describe token, price, recipient, and contract
4. SDK chooses direct payment or reusable sessions
5. Agent retries with session id or tx hash
6. Provider verifies proof and returns the resource
```

## Headers Used in This Repo

| Header | Purpose |
|--------|---------|
| `X-Payment-Required` | signals payment requirement |
| `X-Stream-Mode` | `streaming`, `direct`, or `free` |
| `X-Stream-Rate` | price quoted in token units |
| `X-Stream-Token` | payment token/precompile address |
| `X-Stream-Token-Decimals` | token decimals |
| `X-Payment-Currency` | display symbol, currently `USDC` |
| `X-Stream-Contract` | session rail or relay identifier |
| `X-Stream-Recipient` | recipient for the paid route |
| `X-Stream-Stream-ID` | session proof on retry |
| `X-Stream-Tx-Hash` | direct-payment proof on retry |

## Why It Matters

x402 makes paid APIs machine-readable for agents. Stella's Stream Engine makes them economically usable when request volume is high.
