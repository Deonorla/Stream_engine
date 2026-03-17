# Stream Engine on Polkadot Westend Asset Hub

**Stream Engine** is an `x402`-compatible payment and settlement stack for AI agents.

It combines two product lanes on one runtime:

- agent-to-API payments using `x402` discovery plus reusable payment streams
- rental RWA issuance with IPFS metadata, verification, compliance, and yield streaming

The current deployment target is `Westend Asset Hub`, using Circle test `USDC` as the payment and yield asset for both lanes.

## x402 + Stream Engine

The clean mental model is:

- `x402` is the paywall handshake
- `Stream Engine` is the settlement engine behind that handshake

In practice:

- `x402` tells an agent that payment is required
- `x402` describes the terms: token, route mode, recipient, and proof format
- `Stream Engine` decides whether to satisfy that requirement with direct settlement or a reusable payment stream
- the middleware verifies the chosen payment state and turns it into API access

So Stream Engine does **not** replace `x402`. It makes `x402` economically usable for high-frequency agent traffic.

## Current target

- Network: `Westend Asset Hub`
- ETH RPC: `https://westend-asset-hub-eth-rpc.polkadot.io`
- Substrate RPC: `wss://westend-asset-hub-rpc.polkadot.io`
- Chain ID: `420420421`
- Native gas token: `WND`
- Payment asset: `Circle USDC`
- Asset ID: `31337`
- Decimals: `6`
- Asset precompile: `0x00007a6900000000000000000000000001200000`

## What Stream Engine does now

### Agent payments

- middleware emits standardized `HTTP 402 Payment Required` responses
- agents discover payment terms through an `x402`-style flow instead of custom provider logic
- the SDK or dashboard approves Circle USDC once
- `FlowPayStream` creates a reusable stream instead of signing every request
- subsequent requests reference the active stream, and the middleware validates that stream onchain

### Rental RWAs

- `FlowPayAssetNFT` mints the digital twin
- `FlowPayRWAHub` binds metadata, registry state, compliance, and yield streams
- metadata is pinned to IPFS and exposed as `ipfs://...`
- QR or NFC payloads can be verified against on-chain registry and activity history

## Stack

- Solidity contracts deployed through Polkadot's smart-contract stack
- native Substrate `revive` reads and writes for Westend compatibility
- React/Vite frontend with Polkadot wallet extension support
- Express backend for `x402` middleware, IPFS uploads, verification, and indexing
- TypeScript SDK with both EVM and Substrate transaction adapters

## Why this matters for agents

Human payment flows tolerate:

- checkout pages
- manual confirmations
- subscriptions
- custom billing integrations

Agents do not.

Agents need:

- machine-readable payment discovery
- automatic authorization
- low-friction repeated usage
- clear spending controls
- predictable failure modes

`x402` provides the payment negotiation layer.
Stream Engine provides the low-friction settlement layer.

That is why the combination works.

## Request lifecycle

```text
Agent request
  -> API returns HTTP 402
  -> x402-style response describes payment terms
  -> SDK/runtime decides direct payment vs streaming
  -> Stream Engine opens or reuses a stream
  -> middleware verifies stream state
  -> API serves the resource
```

For repeated usage, the important optimization is that many API requests can reuse one stream lifecycle instead of requiring a fresh onchain payment each time.

## Quick start

### 1. Install

```bash
npm run install:all
```

### 2. Prepare env

```bash
cp .env.example .env
```

At minimum, set:

```bash
POLKADOT_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
POLKADOT_SUBSTRATE_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
POLKADOT_CHAIN_ID=420420421
FLOWPAY_NETWORK_NAME="Westend Asset Hub"
FLOWPAY_PAYMENT_ASSET_ID=31337
FLOWPAY_PAYMENT_TOKEN_ADDRESS=0x00007a6900000000000000000000000001200000
FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
FLOWPAY_PAYMENT_TOKEN_DECIMALS=6
FLOWPAY_USE_SUBSTRATE_READS=true
FLOWPAY_USE_SUBSTRATE_WRITES=true
SUBSTRATE_JSON_PATH=./substrate.json
SUBSTRATE_PASSWORD=your_account_password
FLOWPAY_RECIPIENT_ADDRESS=0xYOUR_SERVICE_WALLET
PINATA_JWT=your_pinata_jwt
```

The same account needs:

- `WND` for gas on Westend Asset Hub
- `USDC` asset `31337` for payment streams and RWA funding

### 3. Deploy

Deploy the payment rail:

```bash
npm run deploy:westmint:substrate
```

Deploy the RWA suite:

```bash
npm run deploy:rwa:westmint:substrate
```

Copy the emitted contract addresses back into `.env`.

### 4. Run a live smoke test

```bash
npm run smoke:westmint:substrate
```

This validates:

- Circle USDC approval
- payment stream creation
- RWA mint
- compliance setup
- asset yield stream funding
- flash advance
- yield claim
- verification and activity lookup

### 5. Start the app

```bash
npm run start:all
```

Open [http://localhost:5173](http://localhost:5173).

## Frontend wallet model

The current UI uses a Polkadot wallet extension path instead of MetaMask assumptions.

Supported flow:

- connect a Substrate account from Talisman, SubWallet, or polkadot.js extension
- map it to an EVM alias through `revive`
- use that mapped identity for Solidity contract calls and ownership checks

## Useful commands

- `npm run test` — contracts + SDK tests
- `npm run build:web` — build the frontend
- `npm run deploy:westmint:substrate` — deploy `FlowPayStream`
- `npm run deploy:rwa:westmint:substrate` — deploy RWA contracts
- `npm run smoke:westmint:substrate` — live Westend smoke test
- `npm --prefix server test` — backend tests
- `npm --prefix sdk run test:all` — SDK tests

## Verified Westend deployment

These are the latest live contract addresses from the native Westend deployment path:

- `FlowPayStream`: `0x75edbf3d9857521f5fb2f581c896779f5110a8a0`
- `FlowPayAssetNFT`: `0x0340b3f493bae901f740c494b2f7744f5fffe348`
- `FlowPayAssetRegistry`: `0x9db31d67bd603508cfac61dcd31d98dfbd46cf5f`
- `FlowPayComplianceGuard`: `0x72a979756061c5993a4c9c95e87519e9492dd721`
- `FlowPayAssetStream`: `0x2d6bda7095b2d6c9d4eee9f754f2a1eba6114396`
- `FlowPayRWAHub`: `0x1286a0fe3413dd70083df2d654677a7c39096753`

## Notes

- Circle's public test faucet currently exposes Polkadot test USDC on Westend Asset Hub, which is why the verified path uses Westend rather than Polkadot Hub TestNet.
- The backend and smoke scripts already use native Substrate `revive` calls for Westend compatibility.
- Some legacy compatibility aliases still exist in the repo (`FlowPaySDK`, `FlowPayStream`, `mneeTokenAddress`, old env names), but the active product/runtime is **Stream Engine** on Westend with Circle USDC.
