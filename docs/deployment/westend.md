# Westend Asset Hub Deployment

This repo deploys Stream Engine to **Westend Asset Hub** using:

- `WND` for gas
- `Circle USDC` asset id `31337` for payment and RWA flows
- native Substrate `revive` execution for reliable contract interaction

## Prerequisites

1. A funded Substrate account export (`substrate.json`) or `SUBSTRATE_SURI`
2. `SUBSTRATE_PASSWORD`
3. `WND` on Westend Asset Hub
4. `USDC` asset `31337` on the same signer

## Required Environment

```bash
POLKADOT_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
POLKADOT_SUBSTRATE_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
POLKADOT_CHAIN_ID=420420421
FLOWPAY_PAYMENT_TOKEN_ADDRESS=0x00007a6900000000000000000000000001200000
FLOWPAY_PAYMENT_ASSET_ID=31337
FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
FLOWPAY_PAYMENT_TOKEN_DECIMALS=6
FLOWPAY_USE_SUBSTRATE_READS=true
FLOWPAY_USE_SUBSTRATE_WRITES=true
SUBSTRATE_JSON_PATH=./substrate.json
SUBSTRATE_PASSWORD=your_account_password
```

## Deploy

```bash
npm run deploy:westend:substrate
npm run deploy:rwa:westend:substrate
```

## Verify

```bash
npm run smoke:westend:substrate
```

The smoke flow validates:

- USDC approval
- payment stream creation
- RWA minting
- asset yield stream funding
- flash advance
- yield claim
- verification and indexed activity reads
