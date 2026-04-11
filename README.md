# Continuum

**Continuum** is an agent marketplace for productive RWA twins on **Stellar testnet**. It uses **Stream Engine** underneath as the settlement, session, and yield runtime for paid market actions.

## What It Does

- lets agents browse productive twins for free, then pay for premium analysis, bidding, and treasury actions
- runs timed USDC auctions for platform and economic ownership of productive asset twins
- supports server-managed agent wallets, mandate enforcement, yield claims, and treasury rebalancing
- keeps **Stream Engine** underneath as the reusable payment-session and RWA runtime

## Product Split

- **Continuum**: the public marketplace, agent console, auctions, analytics, and treasury layer
- **Stream Engine**: the underlying session, settlement, RWA registry, and yield runtime

## Runtime

- **Network:** Stellar Testnet
- **Auction quote asset:** USDC via SAC
- **Runtime assets:** USDC + XLM
- **Wallet:** Freighter
- **Managed agent auth:** local agent JWTs or Auth0 bearer tokens bound to a Stellar owner key
- **Payment model:** x402 negotiation + reusable session settlement
- **Exchange model:** timed English auction
- **RWA model:** productive twin + private evidence + attestations + policy controls

## Preserved public surfaces

- `/api/engine/catalog`
- `/api/rwa/*`
- `/api/market/*`
- `/api/agents/*`
- x402 `402` headers
- `StreamEngineSDK`
- `StreamEngineRWAClient`
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
- `POST /api/sessions/:sessionId/metadata`
- `POST /api/sessions/:sessionId/cancel`
- `POST /api/sessions/:sessionId/claim`

### Continuum market and agents

- `GET /api/market/assets`
- `GET /api/market/assets/:assetId`
- `GET /api/market/assets/:assetId/analytics`
- `POST /api/market/assets/:assetId/auctions`
- `GET /api/market/auctions/:auctionId`
- `POST /api/market/auctions/:auctionId/bids`
- `POST /api/market/auctions/:auctionId/settle`
- `GET /api/market/positions`
- `POST /api/market/yield/claim`
- `POST /api/market/yield/route`
- `POST /api/market/treasury/rebalance`
- `POST /api/agents`
- `GET /api/agents/:agentId/state`
- `GET /api/agents/:agentId/performance`
- `GET /api/agents/:agentId/mandate`
- `POST /api/agents/:agentId/mandate`
- `GET /api/agents/:agentId/wallet`

### RWA

- `POST /api/rwa/ipfs/metadata`
- `POST /api/rwa/evidence`
- `POST /api/rwa/assets` (active low-friction Stellar mint surface)
- `GET /api/rwa/assets`
- `GET /api/rwa/assets/:tokenId`
- `GET /api/rwa/assets/:tokenId/activity`
- `POST /api/rwa/attestations` (legacy backend/operator attestation surface on Stellar)
- `POST /api/rwa/verify`
- `POST /api/rwa/relay` (legacy backend/operator write surface on Stellar)
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

If you want the managed-agent path protected by Auth0, fill:

- `AUTH0_DOMAIN`
- `AUTH0_AUDIENCE`
- `AUTH0_ISSUER`
- `AUTH0_OWNER_PUBLIC_KEY_CLAIM`

For the live Continuum treasury loop, also fill:

- `CONTINUUM_SAFE_YIELD_VENUES`
- `CONTINUUM_BLEND_VENUES`
- `CONTINUUM_AMM_VENUES`

### 3. Run the stack

```bash
npm run start:all
```

`start:all` now auto-starts a local Docker Postgres (`postgres:16`) and uses
`postgres://postgres:postgres@127.0.0.1:5432/stream_engine` for the backend,
so tester setup stays one-command.

If you want to disable Docker auto-start for Postgres:

```bash
STREAM_ENGINE_AUTO_START_POSTGRES=false npm run start:all
```

Open [http://localhost:5173](http://localhost:5173).

## Demo flow

### Web

1. Start the stack with `npm run start:all`
2. Confirm `GET /api/health`
3. Confirm `GET /api/engine/catalog`
4. Connect Freighter in the web app
5. Create or load the managed agent wallet
6. Mint and verify a productive twin in RWA Studio
7. Open the Marketplace and fetch premium analysis with a payment session
8. List the twin in a timed auction or place a bid from the managed agent
9. Settle the auction after the close time
10. Claim or route yield from the new position
11. Rebalance treasury and confirm idle funds move into approved strategies

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
