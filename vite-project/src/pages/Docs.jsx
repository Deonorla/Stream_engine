import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { useProtocolCatalog } from '../hooks/useProtocolCatalog';

function buildRouteTable(routes = [], tokenSymbol = 'USDC') {
  if (!routes.length) {
    return '| Path | Mode | Price |\n|------|------|-------|\n| `/api/weather` | `streaming` | `0.0001 USDC/sec` |';
  }

  return [
    '| Path | Mode | Price |',
    '|------|------|-------|',
    ...routes.map((route) => (
      `| \`${route.path}\` | \`${route.mode}\` | \`${route.price} ${tokenSymbol}${route.mode === 'streaming' ? '/sec' : ''}\` |`
    )),
  ].join('\n');
}

function buildContractTable(catalog) {
  const contracts = [
    ['Stream contract', catalog?.payments?.contractAddress],
    ['RWA Hub', catalog?.rwa?.hubAddress],
    ['Asset NFT', catalog?.rwa?.assetNFTAddress],
    ['Asset Registry', catalog?.rwa?.assetRegistryAddress],
    ['Asset Stream', catalog?.rwa?.assetStreamAddress],
    ['Compliance Guard', catalog?.rwa?.complianceGuardAddress],
  ].filter(([, address]) => address);

  return [
    '| Contract | Address |',
    '|----------|---------|',
    ...contracts.map(([label, address]) => `| ${label} | \`${address}\` |`),
  ].join('\n');
}

function buildSections(catalog) {
  const networkName = catalog?.network?.name || 'Westend Asset Hub';
  const tokenSymbol = catalog?.payments?.tokenSymbol || 'USDC';
  const paymentAssetId = catalog?.payments?.paymentAssetId || 31337;
  const recipientAddress = catalog?.payments?.recipientAddress || 'Not configured';

  return [
    {
      id: 'introduction',
      title: 'Introduction',
      content: `# Stream Engine

**Stream Engine** is an agent payments + rental RWA protocol on **${networkName}**.

It combines:

| Layer | What it does |
|-------|-------------|
| **x402 negotiation** | Agents discover paid endpoints through standard HTTP 402 flows. |
| **${tokenSymbol} settlement** | One approval powers continuous machine payments and instant cancellation refunds. |
| **RWA Studio** | Mint, verify, rent, and monitor rental assets with IPFS-backed provenance. |

## Mental Model

| Layer | Role |
|------|------|
| **x402** | Payment negotiation and paywall signaling |
| **Stream Engine** | Stream-based settlement and authorization |
| **Middleware** | Verifies payment state and turns it into API access |

Stream Engine does **not** replace x402.
It uses x402 as the machine-readable paywall handshake, then satisfies that payment requirement through direct settlement or reusable streaming.

## Runtime

| Item | Value |
|------|-------|
| Network | \`${networkName}\` |
| Gas token | \`WND\` |
| Payment token | \`Circle ${tokenSymbol}\` |
| Circle asset id | \`${paymentAssetId}\` |
| Service wallet | \`${recipientAddress}\` |

## Live Contracts

${buildContractTable(catalog)}

## Quick Start

\`\`\`bash
git clone https://github.com/ola-893/flowpay.git
cd flowpay
npm run install:all
npm run start:all
\`\`\`

Launch the app, connect a Westend-compatible EVM wallet, and fund payment streams with Circle ${tokenSymbol} on asset id \`${paymentAssetId}\`.`,
    },
    {
      id: 'streams',
      title: 'Payment Streams',
      content: `# Payment Streams

## x402 vs Streaming

\`x402\` is the negotiation layer.

It tells an agent:

- payment is required
- which route is paid
- which token is accepted
- who gets paid
- which payment mode is supported

Streaming is the settlement layer.

Instead of forcing a new onchain payment for every request, Stream Engine lets an agent open one reusable stream and satisfy repeated route access against that stream.

## Why this matters

Without streaming, a naive x402 flow can still become:

1. Request
2. 402
3. Onchain payment
4. Retry request
5. Repeat for every call

That breaks down for high-frequency agent workloads.

Stream Engine keeps the x402 handshake, but replaces repeated payment execution with one stream lifecycle.

## How Stream Settlement Works

Circle ${tokenSymbol} is approved to the stream contract and released per-second to the configured recipient.

\`\`\`
Flow Rate = Total Amount ÷ Duration (seconds)
Claimable = (flow_rate × seconds_elapsed) − amount_withdrawn
\`\`\`

## Creating a Stream

1. Open **Streams**
2. Enter the recipient EVM address or use a protected route preset
3. Set a ${tokenSymbol} budget and duration
4. Approve ${tokenSymbol}
5. Confirm the stream transaction

The recipient can withdraw as value accrues. The sender can cancel early and recover unused balance.

## Agent Flow

1. Agent calls a protected route
2. API returns HTTP 402
3. x402-style response describes payment terms
4. Stream Engine runtime chooses direct settlement or streaming
5. Middleware verifies the active stream or direct payment proof
6. API returns the resource

## Live Route Policy

${buildRouteTable(catalog?.routes, tokenSymbol)}

## SDK Note

The product is now **Stream Engine**, but some exported SDK and contract identifiers still keep earlier FlowPay names for compatibility.`,
    },
    {
      id: 'rwa',
      title: 'RWA Module',
      content: `# RWA Studio

## Model

Owners mint a digital twin for a rental asset, attach IPFS metadata, bind a verification payload, and fund the attached yield stream. Renters do **not** take the NFT. They stream payment for physical access.

\`\`\`
Owner: keeps NFT + yield rights
Renter: streams ${tokenSymbol} for access
Verifier: checks QR / NFC / IPFS against the on-chain registry
Cancel: unused rental balance refunds automatically
\`\`\`

## Studio Tabs

| Tab | Purpose |
|-----|---------|
| **Minting** | Create the digital twin and pin metadata |
| **Verify** | Check QR, NFC, CID, and registry history |
| **Rent Assets** | Browse assets available for pay-as-you-go access |
| **Active Rentals** | Track current rental streams and refunds |
| **My Portfolio** | View owned yield-bearing assets |

## Verification Flow

1. Fetch metadata from IPFS
2. Compare CID and tag hashes with the on-chain registry
3. Show indexed activity so provenance stays audit-friendly

## Supported Asset Classes

| Type | Example |
|------|---------|
| Real Estate | Apartments, offices, warehouses |
| Vehicle | Fleets, rentals, logistics vehicles |
| Commodity | Machinery, heavy equipment, industrial assets |`,
    },
    {
      id: 'sdk',
      title: 'Agent SDK',
      content: `# Agent SDK

## Current State

The product is **Stream Engine**, but some exported class names still use older FlowPay-era identifiers for compatibility with the existing codebase.

## What it handles

| Capability | Description |
|-----------|-------------|
| \`fetch(url)\` | Makes HTTP requests and handles x402-style 402 payment negotiation |
| \`createStream(opts)\` | Creates a reusable ${tokenSymbol} payment stream |
| \`cancelStream(id)\` | Cancels a stream and refunds unused balance |
| \`getBalance()\` | Reads current token balance |
| \`optimizeSpending()\` | Lets the runtime choose streaming vs direct settlement |

## Design Role

The SDK is the bridge between:

- machine-readable x402 payment requirements
- agent budget policy
- actual settlement execution

That means the SDK is not just a wallet wrapper.
It is the runtime that takes a 402 response, interprets the payment requirements, chooses the cheapest safe payment path, and retries the request once payment is satisfied.

## Budgeting

The agent console exposes:

- daily spend caps
- per-request limits
- emergency pause
- activity monitoring`,
    },
    {
      id: 'contracts',
      title: 'Smart Contracts',
      content: `# Smart Contracts

## Stream Contract

The core payment rail still uses the Solidity stream contract with per-stream metadata.

| Function | Description |
|----------|-------------|
| \`createStream(recipient, duration, amount, metadata)\` | Lock ${tokenSymbol} and start a stream |
| \`withdrawFromStream(streamId)\` | Recipient claims accrued ${tokenSymbol} |
| \`cancelStream(streamId)\` | Cancel and refund unused balance |
| \`getClaimableBalance(streamId)\` | Read current claimable amount |

## RWA Suite

| Contract | Role |
|----------|------|
| \`FlowPayAssetNFT\` | Mints the rental asset NFT |
| \`FlowPayAssetRegistry\` | Stores provenance and verification hashes |
| \`FlowPayAssetStream\` | Handles yield streams, flash advance, freezes |
| \`FlowPayComplianceGuard\` | Stores compliance state |
| \`FlowPayRWAHub\` | Orchestrates minting and asset actions |

## Deployment

\`\`\`bash
npm run deploy:westmint:substrate
npm run deploy:rwa:westmint:substrate
\`\`\`

Use **WND** for gas and **Circle ${tokenSymbol} asset id ${paymentAssetId}** for payments and RWA flows.`,
    },
  ];
}

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
  const { catalog } = useProtocolCatalog();
  const { section } = useParams();
  const navigate = useNavigate();
  const sections = useMemo(() => buildSections(catalog), [catalog]);
  const active = sections.find(s => s.id === section) || sections[0];

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
          {sections.map(s => (
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
            {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
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
