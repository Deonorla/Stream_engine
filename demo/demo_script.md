# Stream Engine Demo Script

**Title**: Stream Engine - x402 + Reusable Circle USDC Streams for AI Agents  
**Network**: Westend Asset Hub

---

## Prerequisites

1. Ensure `.env` contains:
   ```
   FLOWPAY_CONTRACT_ADDRESS=0x...
   FLOWPAY_PAYMENT_TOKEN_ADDRESS=0x00007a6900000000000000000000000001200000
   FLOWPAY_RECIPIENT_ADDRESS=0x...
   SUBSTRATE_PASSWORD=your_account_password
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

2. Fund the signer with:
   - `WND` for gas
   - Circle test `USDC` asset `31337`
   - On **Westend Asset Hub**, fund the **Substrate signer** used by `substrate.json` (or `SUBSTRATE_JSON_PATH` / `SUBSTRATE_SURI`). The CLI demo uses the native `revive` path on this network.

3. Verify setup:
   ```bash
   npx ts-node --project demo/tsconfig.json demo/check-setup.ts
   ```

---

## Running the Demo

### Terminal 1

```bash
npx ts-node --project demo/tsconfig.json demo/provider.ts
```

The provider exposes free info routes and x402-protected premium routes. It returns HTTP `402 Payment Required` until a valid stream or direct-payment proof is supplied.

### Terminal 2

```bash
npx ts-node --project demo/tsconfig.json demo/consumer.ts
```

The consumer:

1. loads the configured signer
2. checks available USDC
3. requests the premium route
4. receives a `402`
5. creates or reuses a stream
6. retries automatically
7. sends follow-up requests that reuse the existing stream

On Westend Asset Hub, the CLI consumer should use `DEMO_SIGNER_MODE=substrate` if you want to force the intended path explicitly.

---

## What the Demo Proves

- x402 signals that payment is required
- Stream Engine converts that requirement into a reusable stream
- the provider validates stream state before serving premium content
- repeated requests avoid repeated onchain payment setup

---

## Key Runtime Facts

| Item | Value |
|------|-------|
| Network | `Westend Asset Hub` |
| Stream contract | `0x75edbf3d9857521f5fb2f581c896779f5110a8a0` |
| Payment token | `Circle USDC` |
| Asset ID | `31337` |
| Token precompile | `0x00007a6900000000000000000000000001200000` |

---

## Troubleshooting

**"Connection refused"**: start the provider first.  
**"SUBSTRATE_PASSWORD is required"**: add the password for `substrate.json`.  
**"Insufficient USDC balance"**: fund asset `31337` on Westend Asset Hub.  
**"Transaction failed"**: check that the signer has enough `WND` and `USDC`.  
**"EVM signer mode is not supported"**: use a funded Substrate signer for the CLI demo on Westend Asset Hub.  
