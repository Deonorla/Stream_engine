import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';

const SECTIONS = [
  {
    id: 'introduction',
    title: 'Introduction',
    content: `# Stream Engine

**Stream Engine** is a protocol that combines x402 HTTP-native payment discovery, continuous DOT token streaming for AI agents, and Real World Asset (RWA) yield streaming — all on Ethereum Sepolia.

## Three Layers

| Layer | What it does |
|-------|-------------|
| **x402 Streaming** | HTTP 402 responses tell agents what payment is required. One signature, unlimited requests. |
| **RWA Yield** | Tokenized physical assets stream income to owners continuously per-second. |
| **Gemini AI** | Decides streaming vs per-request based on usage patterns. |

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| FlowPayStream | \`0x155A00fBE3D290a8935ca4Bf5244283685Bb0035\` |
| MockDOT | \`0x96B1FE54Ee89811f46ecE4a347950E0D682D3896\` |

## Quick Start

\`\`\`bash
git clone https://github.com/ola-893/flowpay.git
cd flowpay && npm run install:all && npm run dev
\`\`\`

Open http://localhost:5173, connect MetaMask on Sepolia (Chain ID: 11155111), mint DOT, and create your first stream.`,
  },
  {
    id: 'streams',
    title: 'Payment Streams',
    content: `# Payment Streams

## How Streaming Works

DOT tokens are locked in the FlowPayStream contract and released to the recipient per-second based on a flow rate.

\`\`\`
Flow Rate = Total Amount ÷ Duration (seconds)
Claimable = (flow_rate × seconds_elapsed) − amount_withdrawn
\`\`\`

## Creating a Stream (Dashboard)

1. Go to **Streams** → Create Stream
2. Enter recipient address, total DOT amount, duration in seconds
3. Approve DOT spend → confirm transaction
4. Stream starts immediately — recipient can withdraw anytime

## Creating a Stream (SDK)

\`\`\`typescript
import { FlowPayAgent } from 'flowpay-sdk';

const agent = new FlowPayAgent({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  dailyBudget: '50.00'
});

// SDK handles x402 automatically
const data = await agent.fetch('https://api.weather-agent.com/forecast');
\`\`\`

## Cancelling a Stream

Either party can cancel. The sender receives all unstreamed DOT back instantly — no lock-in.

## x402 Middleware (Provider Side)

\`\`\`javascript
import { flowPayMiddleware } from 'flowpay-sdk';

app.use(flowPayMiddleware({
  endpoints: {
    "GET /api/weather": { price: "0.0001", mode: "streaming", minDeposit: "1.00" },
    "POST /api/translate": { price: "0.001", mode: "per-request" }
  }
}));
\`\`\``,
  },
  {
    id: 'rwa',
    title: 'RWA Module',
    content: `# Real World Assets (RWA)

## The Model

Asset owners tokenize physical assets as NFTs. They keep the NFT and all financial rights (yield stream, flash loans). Renters stream DOT to unlock physical access.

\`\`\`
Owner: holds NFT → earns yield per-second from the yield pool
Renter: streams DOT → physical access unlocked (smart lock / IoT / PLC)
Cancel: unspent DOT refunded instantly
\`\`\`

## Four Views

| Tab | Purpose |
|-----|---------|
| **Browse Assets** | Find tokenized assets available to rent |
| **God View** | Live map of all your assets + per-asset yield and rental status |
| **Asset Factory** | Tokenize a new physical asset |
| **Fleet Control** | Manage active rentals — freeze/unfreeze to disable access and pause payment |

## Yield Formula

\`\`\`
Claimable = (flow_rate × seconds_elapsed) − amount_withdrawn
\`\`\`

Balance ticks up every second in the dashboard.

## Asset Types

| Type | Access Mechanism | Example |
|------|-----------------|---------|
| Real Estate | Smart lock | Office building, apartment |
| Vehicle | IoT ignition unlock | EV fleet, car rental |
| Commodity | PLC controller | CNC machinery, equipment |

## Freeze / Unfreeze

In Fleet Control, freezing an asset pauses the payment stream and disables physical access immediately. Unfreeze to resume.

## Renting an Asset (SDK)

\`\`\`javascript
// Tenant streams rent to asset owner per-second
const stream = await agent.createStream({
  recipient: assetOwnerAddress,
  ratePerSecond: '0.0139',  // ~50 DOT/hour
  deposit: '50.00',
  metadata: { purpose: 'Tesla Model S rental' }
});

// Cancel early → unused DOT refunded automatically
await stream.cancel();
\`\`\``,
  },
  {
    id: 'sdk',
    title: 'Agent SDK',
    content: `# Agent SDK

## Installation

\`\`\`bash
cd sdk && npm install
\`\`\`

## FlowPayAgent

\`\`\`typescript
import { FlowPayAgent } from './src/FlowPaySDK';

const agent = new FlowPayAgent({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,  // optional
  dailyBudget: '50.00',                       // optional
  network: 'sepolia'
});
\`\`\`

## Methods

| Method | Description |
|--------|-------------|
| \`agent.fetch(url)\` | Makes HTTP request, auto-handles 402 |
| \`agent.createStream(opts)\` | Creates a DOT payment stream |
| \`agent.cancelStream(id)\` | Cancels stream, refunds sender |
| \`agent.getBalance()\` | Returns current DOT balance |
| \`agent.optimizeSpending()\` | AI recommends payment mode |

## GeminiPaymentBrain

\`\`\`typescript
import { GeminiPaymentBrain } from './src/GeminiPaymentBrain';

const brain = new GeminiPaymentBrain(process.env.GEMINI_API_KEY);
const decision = await brain.decide({ expectedCalls: 1000, service: 'weather-api' });
// { mode: 'streaming', reason: 'High volume — streaming saves 90% on gas' }
\`\`\`

## SpendingMonitor

\`\`\`typescript
import { SpendingMonitor } from './src/SpendingMonitor';

const monitor = new SpendingMonitor({ dailyLimit: '50.00' });
monitor.onLimitReached(() => agent.pause());
\`\`\``,
  },
  {
    id: 'contracts',
    title: 'Smart Contracts',
    content: `# Smart Contracts

## FlowPayStream.sol

Core streaming contract on Ethereum Sepolia.

### Key Functions

| Function | Description |
|----------|-------------|
| \`createStream(recipient, duration, amount, metadata)\` | Lock DOT and start a stream |
| \`withdrawFromStream(streamId)\` | Recipient claims accrued DOT |
| \`cancelStream(streamId)\` | Cancel and refund unstreamed DOT |
| \`getClaimableBalance(streamId)\` | View current claimable amount |
| \`isStreamActive(streamId)\` | Check if stream is still running |

### Stream Struct

\`\`\`solidity
struct Stream {
  address sender;
  address recipient;
  uint256 totalAmount;
  uint256 flowRate;       // DOT per second (wei)
  uint256 startTime;
  uint256 stopTime;
  uint256 amountWithdrawn;
  bool    isActive;
  string  metadata;
}
\`\`\`

### Events

\`\`\`solidity
event StreamCreated(uint256 streamId, address sender, address recipient, uint256 totalAmount, ...);
event Withdrawn(uint256 streamId, address recipient, uint256 amount);
event StreamCancelled(uint256 streamId, address sender, address recipient, ...);
\`\`\`

## MockDOT.sol

ERC-20 test token for Sepolia. Call \`mint(address, amount)\` to get free tokens.

## Deploy Your Own

\`\`\`bash
cp .env.example .env
# fill SEPOLIA_RPC_URL and PRIVATE_KEY
npx hardhat run scripts/deploy.js --network sepolia
\`\`\``,
  },
];

function renderContent(md) {
  return md
    .split('\n')
    .map((line, i) => {
      if (line.startsWith('# '))  return <h1 key={i} className="text-2xl font-bold text-white mb-4 mt-2">{line.slice(2)}</h1>;
      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold text-white mb-3 mt-6">{line.slice(3)}</h2>;
      if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold text-cyan-300 mb-2 mt-4">{line.slice(4)}</h3>;
      if (line.startsWith('```')) return null; // handled below
      if (line.startsWith('| ')) {
        const cells = line.split('|').filter(Boolean).map(c => c.trim());
        const isHeader = cells.every(c => c);
        return <tr key={i}>{cells.map((c, j) => isHeader
          ? <td key={j} className="px-3 py-2 text-white/70 text-sm border-b border-white/5">{c}</td>
          : <td key={j} className="px-3 py-2 text-white/50 text-sm border-b border-white/5">{c}</td>
        )}</tr>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="text-white/60 text-sm ml-4 list-disc">{line.slice(2)}</li>;
      if (line === '') return <div key={i} className="h-2" />;
      return <p key={i} className="text-white/60 text-sm leading-relaxed">{line}</p>;
    });
}

// Simple but readable markdown renderer
function DocContent({ content }) {
  const blocks = [];
  let codeLines = [];
  let inCode = false;
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (tableRows.length) {
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto my-4">
          <table className="w-full border border-white/10 rounded-lg overflow-hidden text-sm">
            <tbody>{tableRows}</tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  };

  content.split('\n').forEach((line, i) => {
    if (line.startsWith('```')) {
      if (!inCode) { inCode = true; codeLines = []; return; }
      blocks.push(
        <pre key={blocks.length} className="bg-black/40 border border-white/10 rounded-lg p-4 overflow-x-auto my-3 text-xs text-cyan-200 font-mono leading-relaxed">
          {codeLines.join('\n')}
        </pre>
      );
      inCode = false; return;
    }
    if (inCode) { codeLines.push(line); return; }

    if (line.startsWith('| ')) {
      inTable = true;
      const cells = line.split('|').filter(c => c.trim() && !c.trim().match(/^[-:]+$/));
      if (cells.length) {
        tableRows.push(
          <tr key={i} className="border-b border-white/5 last:border-0">
            {cells.map((c, j) => (
              <td key={j} className={`px-3 py-2 text-sm ${j === 0 ? 'text-white/80 font-medium' : 'text-white/50'}`}>
                {c.trim().replace(/`([^`]+)`/g, (_, m) => m)}
              </td>
            ))}
          </tr>
        );
      }
      return;
    }
    if (inTable) flushTable();

    if (line.startsWith('# '))  { blocks.push(<h1 key={i} className="text-2xl font-bold text-white mb-3 mt-2">{line.slice(2)}</h1>); return; }
    if (line.startsWith('## ')) { blocks.push(<h2 key={i} className="text-lg font-semibold text-white mb-2 mt-6 pb-2 border-b border-white/10">{line.slice(3)}</h2>); return; }
    if (line.startsWith('### ')){ blocks.push(<h3 key={i} className="text-sm font-semibold text-cyan-300 mb-2 mt-4">{line.slice(4)}</h3>); return; }
    if (line.startsWith('- ') || line.startsWith('* ')) { blocks.push(<li key={i} className="text-white/60 text-sm ml-5 list-disc leading-relaxed">{line.slice(2)}</li>); return; }
    if (line === '') { blocks.push(<div key={i} className="h-2" />); return; }
    // inline code
    const parts = line.split(/`([^`]+)`/);
    blocks.push(
      <p key={i} className="text-white/60 text-sm leading-relaxed">
        {parts.map((p, j) => j % 2 === 1
          ? <code key={j} className="bg-white/10 text-cyan-300 px-1 py-0.5 rounded text-xs font-mono">{p}</code>
          : p
        )}
      </p>
    );
  });
  if (inTable) flushTable();
  return <div className="space-y-1">{blocks}</div>;
}

export default function Docs() {
  const { section } = useParams();
  const navigate = useNavigate();
  const active = SECTIONS.find(s => s.id === section) || SECTIONS[0];

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-surface-900/90 backdrop-blur border-b border-surface-700 px-4 h-14 flex items-center gap-4">
        <Link to="/app" className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> App
        </Link>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span className="text-white font-semibold text-sm">Stream Engine Docs</span>
        </div>
      </div>

      <div className="flex flex-1 max-w-6xl mx-auto w-full px-4 py-8 gap-8">
        {/* Sidebar */}
        <nav className="hidden md:flex flex-col gap-1 w-48 shrink-0 sticky top-20 self-start">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => navigate(`/app/docs/${s.id}`)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                active.id === s.id
                  ? 'bg-flowpay-500/20 text-white border border-flowpay-500/30'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>

        {/* Mobile section picker */}
        <div className="md:hidden w-full mb-4">
          <select
            value={active.id}
            onChange={e => navigate(`/app/docs/${e.target.value}`)}
            className="input-default w-full"
          >
            {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <DocContent content={active.content} />
        </main>
      </div>
    </div>
  );
}
