# FlowPay Westend Deployment

This repo is currently wired for a native Westend Asset Hub deployment using Circle test `USDC` asset `31337`.

## Runtime defaults

- Network: `Westend Asset Hub`
- ETH RPC: `https://westend-asset-hub-eth-rpc.polkadot.io`
- Substrate RPC: `wss://westend-asset-hub-rpc.polkadot.io`
- Chain ID: `420420421`
- Explorer: `https://westmint.subscan.io`
- Gas token: `WND`
- Payment asset: `Circle USDC`
- Asset ID: `31337`
- Token precompile: `0x00007a6900000000000000000000000001200000`

## Required accounts and funds

Use one funded Substrate account export for the native deployment and smoke path.

That account needs:

- `WND` on Westend Asset Hub for gas
- `USDC` asset `31337` for payment and RWA smoke operations

## Root env

Copy `.env.example` to `.env` and set at least:

```bash
POLKADOT_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
POLKADOT_SUBSTRATE_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
POLKADOT_CHAIN_ID=420420421
FLOWPAY_NETWORK_NAME="Westend Asset Hub"
FLOWPAY_BLOCK_EXPLORER_URL=https://westmint.subscan.io
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
FLOWPAY_APP_BASE_URL=http://localhost:5173
```

Optional but useful:

```bash
WESTMINT_WS_URL=wss://westend-asset-hub-rpc.polkadot.io
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/flowpay
RWA_INDEXER_START_BLOCK=0
```

## Frontend env

Set these in `vite-project/.env`:

```bash
VITE_FLOWPAY_CHAIN_ID=420420421
VITE_FLOWPAY_NETWORK_NAME="Westend Asset Hub"
VITE_FLOWPAY_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
VITE_FLOWPAY_SUBSTRATE_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
VITE_FLOWPAY_BLOCK_EXPLORER_URL=https://westmint.subscan.io
VITE_FLOWPAY_PAYMENT_ASSET_ID=31337
VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS=0x00007a6900000000000000000000000001200000
VITE_FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
VITE_FLOWPAY_PAYMENT_TOKEN_DECIMALS=6
VITE_RWA_API_URL=http://localhost:3001
VITE_CONTRACT_ADDRESS=0xYOUR_FLOWPAY_STREAM
VITE_FLOWPAY_RWA_HUB_ADDRESS=0xYOUR_RWA_HUB
VITE_FLOWPAY_RWA_ASSET_STREAM_ADDRESS=0xYOUR_ASSET_STREAM
```

## Deploy contracts

Deploy the payment contract:

```bash
npm run deploy:westmint:substrate
```

Deploy the RWA suite:

```bash
npm run deploy:rwa:westmint:substrate
```

The scripts print the deployed addresses. Add those addresses back into `.env`:

```bash
FLOWPAY_CONTRACT_ADDRESS=0x...
FLOWPAY_RWA_ASSET_NFT_ADDRESS=0x...
FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS=0x...
FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS=0x...
FLOWPAY_RWA_ASSET_STREAM_ADDRESS=0x...
FLOWPAY_RWA_HUB_ADDRESS=0x...
```

## Run the live smoke test

```bash
npm run smoke:westmint:substrate
```

This uses the Substrate account JSON and validates the full Westend-native path.

## Start services

```bash
npm --prefix server run dev
npm --prefix vite-project run dev
```

## Operator notes

- The browser UI uses a Polkadot wallet extension path, not MetaMask-only assumptions.
- The backend can still emit compatibility headers, but the active token model is Circle USDC on Westend.
- The verified deployment and smoke path is `westmint:substrate`; older `deploy:polkadot` commands remain in the repo but are not the preferred production path.
