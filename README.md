# Continuum: Autonomous Agent RWA Marketplace

> AI agents that autonomously screen, bid, and generate yield from real-world assets on the Stellar network, powered by x402 micropayments.

Continuum is an agent-first Real-World Asset (RWA) marketplace. It tokenizes physical real estate and land as on-chain twins on the Stellar Testnet. AI agents—running 24/7 with managed Stellar wallets—autonomously screen these assets through an internal rules engine (or LLM), place multi-currency bids in active auctions, and continuously farm yield without human intervention.

---

## System Architecture

The ecosystem relies on an aggressive separation of concerns across the client interface, Node.js backend orchestration, and Stellar smart contracts.

```mermaid
graph TD
    subgraph Client [Frontend App - React/Vite]
        UI[Zillow-Style Mint UI]
        Port[Agent Portfolio Dash]
        Crypto[Freighter Wallet]
        LocalHash[Browser Crypto Subtle]
    end

    subgraph Backend [Node.js / Express Engine]
        API[API Gateway & x402 Middleware]
        Agent[Continuous Agent Tick Loop]
        Screener[Asset Screener & Yield Calc]
        Engine[Timed Auction Engine]
        Vault[Zero-Knowledge Evidence Vault]
        LLM[GenAI Logic Matrix]
        DB[(PostgreSQL)]
        
        API --> Agent
        API --> Vault
        API --> DB
        Agent --> Screener
        Agent --> Engine
        Agent --> LLM
    end

    subgraph IPFS [Decentralized Storage]
        Pinata[Pinata Cloud]
        Schema[Schema Version 3 JSON]
    end

    subgraph Stellar [Stellar Testnet / Soroban]
        SAC[Stellar Asset Contracts: USDC/XLM]
        Registry[Soroban RWA Registry]
        Streams[Session/Yield Runtime]
    end

    UI -- "1. Structured Payload" --> API
    LocalHash -- "2. Evidence SHA-256" --> Vault
    Vault -- "3. Pin Evidence/Metadata" --> Pinata
    API -- "4. Trigger Contract Build" --> Registry
    Engine -- "5. Escrow & Settle" --> SAC
    Streams -- "6. Emit Yield" --> DB
```

### Core Architecture Components
- **Minting & Privacy (Zero-Knowledge):** Users interact with a Zillow-style UI to catalog property details. Sensitive documents (title deeds, appraisals) are hashed locally using the browser's `crypto.subtle`. Only the `evidenceRoot` touches the backend and chain, ensuring absolute privacy.
- **Agent Loop:** The `AgentRuntimeService` operates a relentless 2-minute tick sequence. It hits the `AssetScreener` to verify the parsed IPFS yield parameters (`monthlyRentalIncome`, `annualLandLeaseIncome`). 
- **x402 Micropayments:** Deep API endpoints (analytics, treasury rebalancing) require clients to transmit x402 cryptographic headers to pay per-request compute costs, minimizing spam and charging for LLM resources dynamically.

---

## Tech Stack & Tooling

| Domain | Technology / Protocol | Description |
|---|---|---|
| **Blockchain** | Stellar / Soroban Contracts | High-throughput asset registry and verifiable state execution. |
| **Payments** | x402 Protocol · USDC · XLM | Continuous streaming payments & hybrid-currency auction settlement. |
| **Backend** | Node.js / Express | Robust monolith managing live auctions, PG caching, and AI orchestration. |
| **Storage / DB** | PostgreSQL · IPFS (Pinata) | Relational state + decentralized metadata storage for canonical verification. |
| **Frontend** | React / Vite / TypeScript | Zillow-inspired UI with structured forms and dynamic Google Map renders. |
| **AI Layer** | Groq / Gemini / OpenRouter | Evaluates risk and constructs agent portfolio heuristics. |

---

## Key API Surface

Below are the primary core API collections for interfacing directly with the Continuum backend:

### Continuum Market and Agents
- `GET /api/market/assets` — Hydrated public asset catalog 
- `GET /api/market/assets/:assetId/analytics` — x402-gated deep analysis
- `POST /api/market/assets/:assetId/auctions` — Initialize timed English auction
- `POST /api/market/auctions/:auctionId/bids` — Submit dynamic token bids
- `POST /api/market/auctions/:auctionId/settle` — Finalize escrow and transfer Soroban token
- `POST /api/market/yield/route` — Autonomously claim active streams
- `GET /api/agents/:agentId/state` — Query tick state, portfolio allocation, and idle balances

### RWA Registry & Integrity
- `POST /api/rwa/photos` — Binary file upload/pinning via Pinata
- `POST /api/rwa/evidence` — Store anonymous client-side fingerprints in `EvidenceVault`
- `POST /api/rwa/assets` — Mint Zillow-style property payloads onto Stellar
- `POST /api/rwa/verify` — Validates document freshness, verification status, and attestations 

---

## Local Development

Continuum utilizes a tightly integrated full-stack monorepo. Ensure you have Node.js (v18+) and Docker installed for the local PostgreSQL database.

### 1. Install Dependencies
Install dependencies concurrently across the root, Web UI, SDK, and Server:
```bash
npm run install:all
```

### 2. Configure Environment

Copy the environment template required for the backend services:
```bash
cp .env.example .env
```

Your environment variables define the active Stellar runtime. Ensure the following critical sections are populated in your `.env` file:

**Core Runtime & Settlement Asset:**
```env
STREAM_ENGINE_RUNTIME_KIND=stellar
STREAM_ENGINE_NETWORK_NAME="Stellar Testnet"
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_ASSET_CODE=USDC
STELLAR_USDC_SAC_ADDRESS=stellar:usdc-sac
```

**Backend Services (IPFS & DB):**
*(Ensure you have an active Pinata JWT if you plan on pinning genuine IPFS content locally, otherwise the server falls back to deterministic local CID hashes).*
```env
PINATA_JWT=your_pinata_jwt_here
IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/stream_engine
```

**Frontend Env (`vite-project/.env`):**
The Vite frontend mirrors the backend's network settings. Key variables include:
```env
VITE_STREAM_ENGINE_RUNTIME_KIND=stellar
VITE_STREAM_ENGINE_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_PAYMENT_ASSET_CODE=USDC
VITE_RWA_API_URL=http://localhost:3001
```

### 3. Wallet Prerequisites
To interact with the frontend, you must have the **Freighter** wallet extension installed in your browser.
1. Set the network to **Stellar Testnet**.
2. Ensure you have funded your wallet with testnet XLM for transaction fees.
3. Add Stellar Testnet USDC to participate in multi-currency auctions.

### 4. Run the Monolith
Continuum comes with an automated dev runner. This command spins up the Vite frontend, the Express API, and automatically boots a local `postgres:16` Docker container (`postgres://postgres:postgres@127.0.0.1:5432/stream_engine`):
```bash
npm run start:all
```
*If you are running your own local PostgreSQL instance and want to disable Docker auto-start, run:* `STREAM_ENGINE_AUTO_START_POSTGRES=false npm run start:all`

The web application will be accessible at [http://localhost:5173](http://localhost:5173).

---

## Verification & Testing

Before creating a pull request or deploying changes to the Soroban contracts, run the entire verification suite:

```bash
# Frontend build & unit tests
npm --prefix vite-project run build
npm --prefix vite-project run test

# Backend service tests
npm --prefix server test -- --exit

# SDK integrity and bindings compile
npm --prefix sdk run build
npm --prefix sdk run test:all
```

To run a CLI smoke test mimicking an autonomous consumer agent parsing an x402 requirement:
```bash
npx ts-node --project demo/tsconfig.json demo/consumer.ts
```
