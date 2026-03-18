# Configuration

The repo defaults to **Westend Asset Hub** plus **Circle USDC**.

## Core Runtime

```bash
POLKADOT_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
POLKADOT_SUBSTRATE_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
POLKADOT_CHAIN_ID=420420421
FLOWPAY_NETWORK_NAME="Westend Asset Hub"
FLOWPAY_PAYMENT_TOKEN_ADDRESS=0x00007a6900000000000000000000000001200000
FLOWPAY_PAYMENT_ASSET_ID=31337
FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
FLOWPAY_PAYMENT_TOKEN_DECIMALS=6
FLOWPAY_USE_SUBSTRATE_READS=true
FLOWPAY_USE_SUBSTRATE_WRITES=true
```

## Contracts

```bash
FLOWPAY_CONTRACT_ADDRESS=0x75edbf3d9857521f5fb2f581c896779f5110a8a0
FLOWPAY_RECIPIENT_ADDRESS=0x506e724d7FDdbF91B6607d5Af0700d385D952f8a
FLOWPAY_RWA_ASSET_NFT_ADDRESS=0x0340b3f493bae901f740c494b2f7744f5fffe348
FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS=0x9db31d67bd603508cfac61dcd31d98dfbd46cf5f
FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS=0xyour_attestation_registry_here
FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS=0x72a979756061c5993a4c9c95e87519e9492dd721
FLOWPAY_RWA_ASSET_STREAM_ADDRESS=0x2d6bda7095b2d6c9d4eee9f754f2a1eba6114396
FLOWPAY_RWA_HUB_ADDRESS=0x1286a0fe3413dd70083df2d654677a7c39096753
```

The attestation registry is part of the v2 productive-RWA flow. If it is missing, the backend can still start, but the full evidence-backed verification and attestation workflow will be incomplete.

## Demo Signer

```bash
SUBSTRATE_JSON_PATH=./substrate.json
SUBSTRATE_PASSWORD=your_account_password
```

## Frontend Env

```bash
VITE_FLOWPAY_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
VITE_FLOWPAY_SUBSTRATE_RPC_URL=wss://westend-asset-hub-rpc.polkadot.io
VITE_FLOWPAY_CHAIN_ID=420420421
VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS=0x00007a6900000000000000000000000001200000
VITE_FLOWPAY_PAYMENT_ASSET_ID=31337
VITE_FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
```

## RWA v2 Backend Features

```bash
FLOWPAY_APP_BASE_URL=http://localhost:5173
IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
PINATA_JWT=your_pinata_jwt_here
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/flowpay
RWA_INDEXER_START_BLOCK=0
```

These values support:

- public metadata pinning
- private evidence-backed verification responses
- indexed activity hydration
