# Stream Engine Demo Script

**Title**: Stream Engine - x402 + reusable Stellar payment sessions for AI agents
**Primary network**: Stellar Testnet

---

## Prerequisites

1. Ensure `.env` contains:
   ```
   STREAM_ENGINE_RUNTIME_KIND=stellar
   STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
   STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   STELLAR_ASSET_CODE=USDC
   STELLAR_ASSET_ISSUER=...
   STREAM_ENGINE_RECIPIENT_ADDRESS=G...
   STREAM_ENGINE_SESSION_API_URL=http://127.0.0.1:3001
   DEMO_STELLAR_SENDER=G...
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

2. Fund the signer with:
   - Stellar testnet XLM
   - Stellar testnet USDC

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

The provider exposes free info routes and x402-protected premium routes. It returns HTTP `402 Payment Required` until a valid payment session is supplied.

### Terminal 2

```bash
npx ts-node --project demo/tsconfig.json demo/consumer.ts
```

The consumer:

1. loads the configured sender identity
2. requests the premium route
3. receives a `402`
4. opens a backend-backed Stellar payment session
5. retries automatically
6. sends follow-up requests that reuse the same session

---

## What the Demo Proves

- x402 signals that payment is required
- Stream Engine converts that requirement into a reusable payment session
- the provider validates session state before serving premium content
- repeated requests avoid repeated payment setup

---

## Key Runtime Facts

| Item | Value |
|------|-------|
| Network | `Stellar Testnet` |
| Session meter id | `stellar:session-meter` |
| Payment token | `USDC via SAC` |
| Session API | `http://127.0.0.1:3001/api/sessions` |

---

## Troubleshooting

**"Connection refused"**: start the backend/provider first.
**"DEMO_STELLAR_SENDER is required"**: add the Stellar public key used for the CLI demo.
**"issuer_not_onboarded"**: approve the issuer through the admin path before minting.
**"session_not_active"**: open a new payment session or retry after the consumer creates one.
