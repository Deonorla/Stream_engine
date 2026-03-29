# Configuration

The active hackathon configuration is now **Stellar-first**.

## Core runtime

```bash
FLOWPAY_RUNTIME_KIND=stellar
FLOWPAY_NETWORK_NAME="Stellar Testnet"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
FLOWPAY_BLOCK_EXPLORER_URL=https://stellar.expert/explorer/testnet
```

## Settlement asset

```bash
STELLAR_ASSET_CODE=USDC
STELLAR_ASSET_ISSUER=your_testnet_usdc_issuer
STELLAR_ASSET_DECIMALS=7
STELLAR_USDC_SAC_ADDRESS=stellar:usdc-sac
FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
FLOWPAY_PAYMENT_TOKEN_DECIMALS=7
```

## Backend addresses and services

```bash
FLOWPAY_RECIPIENT_ADDRESS=G...
FLOWPAY_SESSION_API_URL=http://127.0.0.1:3001
FLOWPAY_APP_BASE_URL=http://localhost:5173

FLOWPAY_RWA_ASSET_NFT_ADDRESS=stellar:rwa-nft
FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS=stellar:rwa-registry
FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS=stellar:rwa-attestation
FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS=stellar:policy
FLOWPAY_RWA_ASSET_STREAM_ADDRESS=stellar:yield-vault
FLOWPAY_RWA_HUB_ADDRESS=stellar:rwa-registry

PINATA_JWT=your_pinata_jwt_here
IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/flowpay
```

## Demo and CLI

```bash
DEMO_STELLAR_SENDER=G...
FLOWPAY_SESSION_API_URL=http://127.0.0.1:3001
```

The CLI/provider demo now reuses the backend session API instead of opening chain-specific streams directly.

## Frontend env

```bash
VITE_FLOWPAY_RUNTIME_KIND=stellar
VITE_FLOWPAY_NETWORK_NAME="Stellar Testnet"
VITE_FLOWPAY_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
VITE_STELLAR_PAYMENT_ASSET_CODE=USDC
VITE_STELLAR_PAYMENT_ASSET_ISSUER=your_testnet_usdc_issuer
VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS=stellar:usdc-sac
VITE_FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
VITE_FLOWPAY_PAYMENT_TOKEN_DECIMALS=7
VITE_RWA_API_URL=http://localhost:3001
```

## Issuer onboarding

Issuer approval is now a separate admin action.

- onboarding happens once
- mint checks onboarding but does not auto-fix it
- mint failures now return `issuer_not_onboarded` instead of opaque contract reverts

## Legacy note

Polkadot/Westend env vars still exist in the repo for the old demo path, but they are legacy and no longer the primary documented flow.
