# Westend Asset Hub Deployment

This repo deploys Stream Engine to **Westend Asset Hub** using:

- `WND` for gas
- `Circle USDC` asset id `31337` for payment and RWA flows
- native Substrate `revive` execution for reliable contract interaction
- a separate attestation registry for productive-RWA verification

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
FLOWPAY_RWA_OPERATOR_ADDRESSES=0xyour_backend_operator_here
FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS=0xyour_attestation_registry_here
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
- evidence-root anchoring
- attestation registration
- asset yield stream funding
- flash advance
- yield claim
- verification and indexed activity reads

`FLOWPAY_RWA_OPERATOR_ADDRESSES` should include the backend signer if you want issuer approval to happen automatically during minting. In the updated hub, operators can onboard issuers once and then mint on their behalf without a separate owner-only approval transaction per issuer.

If your current hub was deployed before the operator-driven issuer onboarding change, redeploy the RWA hub/controller stack to pick up the new permission model. Old hubs keep the previous owner-only issuer approval behavior.

## What The Westend Deployment Proves

The deployed stack proves the **verified rental twin** model:

- public metadata is stored on IPFS
- private evidence stays offchain in the server vault
- onchain records anchor evidence roots and attestation state
- verification returns structured trust states instead of a single boolean

It does **not** claim that the NFT alone is a jurisdiction-specific legal title transfer.
