# Stella's Stream Engine

**Stella's Stream Engine** is an `x402`-compatible payment and settlement stack for AI agents plus a rental-RWA backend for verified productive assets on **Stellar testnet**.

## What It Does

- uses reusable **payment sessions** to unlock paid API routes
- keeps the current web UI/UX while running on a **Stellar-backed runtime**
- supports **verified productive rental assets** with private evidence storage, attestation-backed verification, and ownership-linked yield

## Runtime

- **Network:** Stellar Testnet
- **Settlement asset:** USDC via SAC
- **Wallet:** Freighter
- **Payment model:** x402 negotiation + reusable session settlement
- **RWA model:** verified rental twin + private evidence + attestations + policy controls

## Preserved public surfaces

- `/api/engine/catalog`
- `/api/rwa/*`
- x402 `402` headers
- `FlowPaySDK`
- `FlowPayRWAClient`
- the current frontend pages and user journeys

## Key backend endpoints

### Catalog and payments

- `GET /api/engine/catalog`
- `GET /api/free`
- `GET /api/weather`
- `GET /api/premium`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/cancel`
- `POST /api/sessions/:sessionId/claim`

### RWA

- `POST /api/rwa/ipfs/metadata`
- `POST /api/rwa/evidence`
- `POST /api/rwa/assets`
- `GET /api/rwa/assets`
- `GET /api/rwa/assets/:tokenId`
- `GET /api/rwa/assets/:tokenId/activity`
- `POST /api/rwa/attestations`
- `POST /api/rwa/verify`
- `POST /api/rwa/relay`
- `POST /api/rwa/admin`

## Quick start

### 1. Install

```bash
npm run install:all
```

### 2. Copy env

```bash
cp .env.example .env
```

### 3. Run the stack

```bash
npm run start:all
```

Open [http://localhost:5173](http://localhost:5173).

## Demo flow

### Web

1. Start the stack with `npm run start:all`
2. Confirm `GET /api/health`
3. Confirm `GET /api/engine/catalog`
4. Connect Freighter in the web app
5. Onboard the issuer once
6. Mint an asset
7. Verify the asset
8. Start a rental session
9. End or cancel the session and inspect the refund state
10. Fund yield and claim it

### CLI/provider smoke

Provider:

```bash
npx ts-node --project demo/tsconfig.json demo/provider.ts
```

Consumer:

```bash
npx ts-node --project demo/tsconfig.json demo/consumer.ts
```

Setup check:

```bash
npx ts-node --project demo/tsconfig.json demo/check-setup.ts
```

## Verification

These are the main checks to run after changes:

- `npm --prefix vite-project run build`
- `npm --prefix vite-project run test`
- `npm --prefix server test -- --exit`
- `npm --prefix sdk run build`
- `npm --prefix sdk run test:all`
