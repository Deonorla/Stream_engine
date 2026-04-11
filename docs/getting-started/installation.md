# Installation

Install the full Stella's Stream Engine workspace:

```bash
npm run install:all
```

This installs:

- root contracts and scripts
- `sdk/`
- `server/`
- `vite-project/`

## Runtime Dependencies

- Node.js 18+
- a funded Stellar testnet account
- XLM for testnet fees
- Stellar testnet USDC

## Local Stack

```bash
npm run start:all
```

That starts:

- local Docker Postgres on `localhost:5432` (auto-started by the dev stack)
- frontend on `http://localhost:5173`
- backend on `http://localhost:3001`

If you need to skip Docker Postgres auto-start for a temporary session:

```bash
STREAM_ENGINE_AUTO_START_POSTGRES=false npm run start:all
```

## Demo CLI

```bash
npx ts-node --project demo/tsconfig.json demo/check-setup.ts
npx ts-node --project demo/tsconfig.json demo/provider.ts
npx ts-node --project demo/tsconfig.json demo/consumer.ts
```
