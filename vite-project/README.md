## Stream Engine Frontend
Small notes:
- Tailwind config is CJS (`tailwind.config.cjs`) for better Windows compatibility.
- PostCSS config is CJS (`postcss.config.cjs`).

### Setup

1. Install deps
```
cd vite-project
npm install
```

2. Configure environment

Create a `.env` file in `vite-project/` with:
```
VITE_CONTRACT_ADDRESS=0x75edbf3d9857521f5fb2f581c896779f5110a8a0
VITE_FLOWPAY_CHAIN_ID=420420421
VITE_FLOWPAY_RPC_URL=https://westend-asset-hub-eth-rpc.polkadot.io
VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS=0x00007a6900000000000000000000000001200000
VITE_FLOWPAY_PAYMENT_ASSET_ID=31337
VITE_FLOWPAY_PAYMENT_TOKEN_SYMBOL=USDC
```

3. Run
```
npm run dev
```

### Build
```
npm run build
npm run preview
```

The frontend assumes:

- Westend Asset Hub
- Circle USDC as the payment asset
- backend API at `http://localhost:3001`
