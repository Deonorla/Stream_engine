import { useState, useEffect } from 'react';
import {
  Building2, Car, Package, Zap, TrendingUp, Clock,
  DollarSign, Unlock, X, AlertCircle, Lock, Key,
  ShieldCheck, Globe, Plus, Snowflake
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { MOCK_ASSETS, TYPE_META, calcYield } from './rwa/rwaData';
import GodView from './rwa/GodView';
import AssetFactory from './rwa/AssetFactory';
import FleetControl from './rwa/FleetControl';

const TYPE_ICON = { real_estate: Building2, vehicle: Car, commodity: Package };

// ─── Asset Card (browse tab) ──────────────────────────────────────────────────
function AssetCard({ asset, onStream }) {
  const [ownerYield, setOwnerYield] = useState(() => calcYield(asset));
  const { color } = TYPE_META[asset.type];
  const Icon = TYPE_ICON[asset.type];
  const daysLeft = Math.max(0, Math.floor((asset.startTime + asset.duration - Math.floor(Date.now() / 1000)) / 86400));

  useEffect(() => {
    const id = setInterval(() => setOwnerYield(calcYield(asset)), 1000);
    return () => clearInterval(id);
  }, [asset]);

  return (
    <div className={`card-glass border ${asset.border} bg-gradient-to-br ${asset.gradient} p-5 flex flex-col gap-4 hover:scale-[1.01] transition-transform duration-200`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${color}`}>
            <Icon className="w-3.5 h-3.5" />{TYPE_META[asset.type].label}
          </div>
          <h3 className="text-white font-semibold text-sm leading-snug">{asset.title}</h3>
          <p className="text-white/40 text-xs mt-0.5">{asset.location}</p>
        </div>
        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/30 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />Live
        </span>
      </div>

      <p className="text-white/50 text-xs leading-relaxed">{asset.description}</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-black/20 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1 text-xs text-cyan-400/80 mb-1.5">
            <ShieldCheck className="w-3 h-3" />Owner earns
          </div>
          <div className="font-mono text-cyan-300 text-sm font-bold tabular-nums">
            {ownerYield.toFixed(4)}<span className="text-white/30 text-xs font-normal ml-1">DOT</span>
          </div>
          <div className="text-white/25 text-xs mt-0.5">{(asset.flowRate * 3600).toFixed(4)}/hr</div>
        </div>
        <div className="bg-black/20 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1 text-xs text-amber-400/80 mb-1.5">
            <Key className="w-3 h-3" />Access via
          </div>
          <div className="text-white/70 text-xs font-medium leading-snug">{asset.accessType}</div>
          <div className="text-white/25 text-xs mt-0.5">{asset.pricePerHour} DOT/hr</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-white/30">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{daysLeft}d remaining</span>
        <span>{asset.totalYield.toLocaleString()} DOT pool</span>
      </div>

      <button onClick={() => onStream(asset)} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5">
        <Unlock className="w-3.5 h-3.5" />Stream to Unlock — {asset.pricePerHour} DOT/hr
      </button>
    </div>
  );
}

// ─── Stream Modal ─────────────────────────────────────────────────────────────
function StreamModal({ asset, onClose, onConfirm, isProcessing }) {
  const [hours, setHours] = useState(1);
  const total = (asset.pricePerHour * hours).toFixed(4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card-glass border border-white/10 w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Unlock className="w-5 h-5 text-cyan-400" />Unlock Access
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-white/5 rounded-lg p-3 mb-4 border border-white/10">
          <p className="text-white font-medium text-sm">{asset.title}</p>
          <p className="text-white/40 text-xs mt-0.5">{asset.location}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-400/80">
            <Key className="w-3 h-3" />{asset.accessType}
          </div>
        </div>

        <div className="bg-black/20 rounded-lg p-3 mb-4 border border-white/5 space-y-1.5 text-xs text-white/50">
          <div className="flex items-start gap-2"><Lock className="w-3 h-3 text-white/30 mt-0.5 shrink-0" /><span>Owner keeps the NFT and all financial rights (yield, flash loans)</span></div>
          <div className="flex items-start gap-2"><Zap className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" /><span>Your DOT streams per-second — physical access unlocks instantly</span></div>
          <div className="flex items-start gap-2"><DollarSign className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" /><span>Cancel anytime — unspent DOT refunded immediately</span></div>
        </div>

        <label className="block mb-4">
          <span className="text-sm text-white/70 block mb-1.5">Duration (hours)</span>
          <input type="number" min={1} max={720} value={hours} onChange={e => setHours(Math.max(1, Number(e.target.value)))} className="input-default w-full" />
          <span className="text-white/30 text-xs mt-1 block">{(asset.pricePerHour / 3600).toFixed(8)} DOT/sec</span>
        </label>

        <div className="flex items-center justify-between bg-black/30 rounded-lg p-3 mb-5 border border-white/5">
          <span className="text-white/60 text-sm">Total locked</span>
          <span className="font-mono text-cyan-300 font-bold">{total} DOT</span>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-default flex-1 py-2.5 text-sm">Cancel</button>
          <button onClick={() => onConfirm(asset, hours)} disabled={isProcessing} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
            {isProcessing
              ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Streaming...</>
              : <><Unlock className="w-4 h-4" />Start Stream</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Browse tab ───────────────────────────────────────────────────────────────
function Browse({ onStream }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? MOCK_ASSETS : MOCK_ASSETS.filter(a => a.type === filter);

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all',         label: 'All Assets'  },
          { key: 'real_estate', label: 'Real Estate' },
          { key: 'vehicle',     label: 'Vehicles'    },
          { key: 'commodity',   label: 'Commodities' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
              filter === key ? 'bg-flowpay-500 border-flowpay-500 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20'
            }`}
          >{label}</button>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {filtered.map(asset => <AssetCard key={asset.id} asset={asset} onStream={onStream} />)}
      </div>
    </div>
  );
}

// ─── Main RWA page ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'browse',  label: 'Browse Assets', Icon: Building2  },
  { key: 'god',     label: 'God View',      Icon: Globe      },
  { key: 'factory', label: 'Asset Factory', Icon: Plus       },
  { key: 'fleet',   label: 'Fleet Control', Icon: Snowflake  },
];

export default function RWA() {
  const { walletAddress, createStream, isProcessing, toast } = useWallet();
  const [tab, setTab] = useState('browse');
  const [selectedAsset, setSelectedAsset] = useState(null);

  const handleConfirm = async (asset, hours) => {
    if (!walletAddress) { toast?.warning('Connect your wallet first'); return; }
    await createStream(asset.ownerAddress, String(hours * 3600), (asset.pricePerHour * hours).toFixed(6));
    setSelectedAsset(null);
  };

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <Lock className="w-16 h-16 text-white/20 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Real World Assets</h2>
        <p className="text-white/50 text-center max-w-sm">Connect your wallet to browse tokenized assets and stream rent to unlock physical access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="w-6 h-6 text-cyan-400" />Real World Assets
        </h1>
        <p className="text-white/50 text-sm mt-1">
          Asset owners keep the NFT &amp; financial rights. Stream DOT to unlock physical access — cancel anytime, refunded instantly.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === key ? 'bg-flowpay-500 text-white shadow' : 'text-white/50 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'browse'  && <Browse onStream={setSelectedAsset} />}
      {tab === 'god'     && <GodView />}
      {tab === 'factory' && <AssetFactory />}
      {tab === 'fleet'   && <FleetControl />}

      {selectedAsset && (
        <StreamModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onConfirm={handleConfirm}
          isProcessing={isProcessing}
        />
      )}
    </div>
  );
}
