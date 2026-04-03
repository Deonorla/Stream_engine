# Configuration

The active hackathon configuration is now **Stellar-first**.

## Core runtime

```bash
STREAM_ENGINE_RUNTIME_KIND=stellar
STREAM_ENGINE_NETWORK_NAME="Stellar Testnet"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STREAM_ENGINE_BLOCK_EXPLORER_URL=https://stellar.expert/explorer/testnet
```

## Settlement asset

```bash
STELLAR_ASSET_CODE=USDC
STELLAR_ASSET_ISSUER=your_testnet_usdc_issuer
STELLAR_ASSET_DECIMALS=7
STELLAR_USDC_SAC_ADDRESS=stellar:usdc-sac
STREAM_ENGINE_PAYMENT_TOKEN_SYMBOL=USDC
STREAM_ENGINE_PAYMENT_TOKEN_DECIMALS=7
```

## Backend addresses and services

```bash
STREAM_ENGINE_RECIPIENT_ADDRESS=G...
STREAM_ENGINE_SESSION_API_URL=http://127.0.0.1:3001
STREAM_ENGINE_APP_BASE_URL=http://localhost:5173

STREAM_ENGINE_RWA_ASSET_NFT_ADDRESS=stellar:rwa-nft
STREAM_ENGINE_RWA_ASSET_REGISTRY_ADDRESS=stellar:rwa-registry
STREAM_ENGINE_RWA_ATTESTATION_REGISTRY_ADDRESS=stellar:rwa-attestation
STREAM_ENGINE_RWA_COMPLIANCE_GUARD_ADDRESS=stellar:policy
STREAM_ENGINE_RWA_ASSET_STREAM_ADDRESS=stellar:yield-vault
STREAM_ENGINE_RWA_HUB_ADDRESS=stellar:rwa-registry

PINATA_JWT=your_pinata_jwt_here
IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/stream_engine
```

## Demo and CLI

```bash
DEMO_STELLAR_SENDER=G...
STREAM_ENGINE_SESSION_API_URL=http://127.0.0.1:3001
```

The CLI/provider demo now reuses the backend session API instead of opening chain-specific streams directly.

## Frontend env

```bash
VITE_STREAM_ENGINE_RUNTIME_KIND=stellar
VITE_STREAM_ENGINE_NETWORK_NAME="Stellar Testnet"
VITE_STREAM_ENGINE_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
VITE_STELLAR_PAYMENT_ASSET_CODE=USDC
VITE_STELLAR_PAYMENT_ASSET_ISSUER=your_testnet_usdc_issuer
VITE_STREAM_ENGINE_PAYMENT_TOKEN_ADDRESS=stellar:usdc-sac
VITE_STREAM_ENGINE_PAYMENT_TOKEN_SYMBOL=USDC
VITE_STREAM_ENGINE_PAYMENT_TOKEN_DECIMALS=7
VITE_RWA_API_URL=http://localhost:3001
```

## Issuer onboarding

Issuer approval is normally handled automatically during minting.

- the backend checks whether the issuer is already approved
- if not, the backend admin signer auto-onboards the issuer before minting
- if automatic onboarding fails, mint returns a clear issuer-onboarding error instead of an opaque contract revert
