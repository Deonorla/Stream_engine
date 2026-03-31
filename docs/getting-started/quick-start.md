# Quick Start

Get Stella's Stream Engine running locally in a few minutes.

## Step 1: Install and start the stack

```bash
npm run install:all
npm run start:all
```

This starts:

- frontend on `http://localhost:5173`
- backend on `http://localhost:3001`

## Step 2: Connect a wallet

1. Open the app
2. Click **Connect Wallet**
3. Choose a supported wallet
4. Ensure the wallet is pointed at Stellar Testnet

## Step 3: Understand the paid request flow

The request flow is:

1. agent requests a protected resource
2. API returns `HTTP 402 Payment Required`
3. x402-style response describes payment terms
4. Stella's Stream Engine decides between direct settlement and a reusable payment session
5. payment is satisfied
6. request is retried

That is the key architectural split:

- `x402` handles payment discovery
- Stella's Stream Engine handles payment execution

## Step 4: Create a stream

```typescript
import { StreamEngineSDK } from './sdk/src/StreamEngineSDK';

const sdk = new StreamEngineSDK({
  adapter: stellarAdapter,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  token: {
    symbol: 'USDC',
    decimals: 7,
  }
});

const stream = await sdk.createStream(
  'stellar:session-meter',
  'stellar:usdc-sac',
  'G...provider_address',
  10_0000000n,
  3600,
  { purpose: 'API access' }
);
```

## Step 5: Make a paid request

```typescript
const response = await sdk.request('https://api.provider.com/premium');
```

For repeated usage, the runtime can reuse an existing payment session instead of forcing a fresh payment setup each time.

## Step 6: Inspect the app

Use:

- **Streams** to create or inspect payment streams
- **Agent Console** to inspect route policy and runtime decisions
- **RWA Studio** to mint, verify, and manage rental assets
- **Docs** to inspect live chain and contract configuration

The UI flow is intentionally unchanged even though the active backend runtime is now Stellar.

## What to expect

- free routes should respond immediately
- paid routes should return `402` until payment is satisfied
- RWA registry should load without blocking the whole frontend on cold start

## What's Next?

- [Configuration Options](configuration.md)
- [Architecture Deep Dive](../architecture/README.md)
- [Building AI Agents](../guides/building-ai-agents.md)
