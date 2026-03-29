# Stream Engine on Stellar

**Stream Engine** is an `x402`-compatible payment and settlement stack for AI agents plus a rental-RWA backend for verified productive assets.

The current hackathon path is now **Stellar-first**:

- agent/API payments use reusable **payment sessions** instead of Polkadot streams
- the RWA backend uses a **Stellar runtime** with private evidence storage, attestation-backed verification, and explicit issuer onboarding
- the existing web UI/UX stays the same; only the backend and integration layer changed

## What changed

The previous Polkadot/Westend demo path caused repeated demo failures:

- owner-only issuer approval surprises during mint
- opaque contract/runtime revert errors
- broken cancel/refund behavior
- CLI drift from the web app
- frontend integrations depending on chain-specific event reads

The active runtime now fixes those issues by moving the hackathon path to a Stellar-backed integration model.

## Active Architecture

### Agent payments

- middleware still emits `HTTP 402 Payment Required`
- the backend now exposes a reusable **session meter** model through `/api/sessions`
- clients open or reuse a session, then send `X-FlowPay-Stream-ID` for compatibility
- middleware validates the session and unlocks paid routes

### RWA verification

- the NFT represents a **verified productive rental twin**, not direct deed transfer
- raw documents stay private on the server
- only public metadata plus evidence roots are anchored
- verification is structured and returns:
  - `status`
  - `checks`
  - `warnings`
  - `failures`
  - `requiredActions`
  - `evidenceCoverage`
  - `attestationCoverage`
  - `documentFreshness`
  - `asset`
  - `activity`

### Runtime stance

- **Primary runtime:** Stellar testnet
- **Settlement asset:** Stellar testnet USDC via SAC
- **Legacy path:** Polkadot/Westend remains in the repo for reference and fallback only; it is no longer the primary demo target

## Preserved public surfaces

These stay stable across the migration:

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

### 3. Minimum Stellar env

```bash
FLOWPAY_RUNTIME_KIND=stellar
FLOWPAY_NETWORK_NAME="Stellar Testnet"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_ASSET_CODE=USDC
STELLAR_ASSET_ISSUER=your_testnet_usdc_issuer
STELLAR_USDC_SAC_ADDRESS=stellar:usdc-sac

FLOWPAY_RECIPIENT_ADDRESS=G...
FLOWPAY_SESSION_API_URL=http://127.0.0.1:3001
DEMO_STELLAR_SENDER=G...

FLOWPAY_RWA_HUB_ADDRESS=stellar:rwa-registry
FLOWPAY_RWA_ASSET_NFT_ADDRESS=stellar:rwa-nft
FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS=stellar:rwa-registry
FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS=stellar:rwa-attestation
FLOWPAY_RWA_ASSET_STREAM_ADDRESS=stellar:yield-vault
FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS=stellar:policy

PINATA_JWT=your_pinata_jwt
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/flowpay
```

## Issuer onboarding

Issuer approval is now **explicit**.

- minting no longer auto-approves issuers
- the platform admin/operator onboards an issuer once
- later mints for that issuer succeed without owner-only surprises
- if onboarding is missing, mint fails with `issuer_not_onboarded`

This is intentional and matches the current backend implementation.

## Run the app

```bash
npm run start:all
```

Open [http://localhost:5173](http://localhost:5173).

## Demo flow

### Backend/web

1. Start the stack with `npm run start:all`
2. Confirm `GET /api/health`
3. Confirm `GET /api/engine/catalog`
4. Connect Freighter in the web app
5. Mint an asset after the issuer has been onboarded
6. Verify the asset
7. Start a rental session
8. End or cancel the session and confirm refund/remaining state
9. Fund an asset yield stream and claim yield

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

These commands currently pass:

- `npm --prefix vite-project run build`
- `npm --prefix vite-project run test`
- `npm --prefix server test -- --exit`
- `npm --prefix sdk run build`
- `npm --prefix sdk run test:all`

## Legacy note

The repo still contains Polkadot/Westend code paths, scripts, and docs because they were the previous demo path. Treat them as **legacy/deprecated for the hackathon** unless a document explicitly says otherwise.
