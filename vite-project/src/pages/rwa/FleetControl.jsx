import { useState } from 'react';
import { Snowflake, Play, AlertTriangle, Clock, DollarSign, TrendingUp, Building2, Car, Package } from 'lucide-react';
import { MOCK_ASSETS, TYPE_META, calcYield, calcRentPaid, useLiveTick } from './rwaData';
import { useWallet } from '../../context/WalletContext';

const TYPE_ICON = { real_estate: Building2, vehicle: Car, commodity: Package };

// Only show assets that have been rented (owner's active fleet)
const FLEET = MOCK_ASSETS.filter(a => a.renter);

function FleetCard({ asset, frozen, onToggleFreeze }) {
  const rentPaid = useLiveTick(() => calcRentPaid(asset));
  const yieldEarned = useLiveTick(() => calcYield(asset));
  const elapsed = Math.floor(Date.now() / 1000) - asset.rentedSince;
  const hours = (elapsed / 3600).toFixed(1);
  const Icon = TYPE_ICON[asset.type];
  const { color } = TYPE_META[asset.type];

  return (
    <div className={`card-glass border p-5 flex flex-col gap-4 transition-all duration-300 ${
      frozen ? 'border-red-500/30 bg-red-900/10 opacity-70' : `${asset.border} bg-gradient-to-br ${asset.gradient}`
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${color}`}>
            <Icon className="w-3.5 h-3.5" />{TYPE_META[asset.type].label}
          </div>
          <h3 className="text-white font-semibold text-sm">{asset.title}</h3>
          <p className="text-white/40 text-xs mt-0.5">{asset.location}</p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 ${
          frozen
            ? 'bg-red-500/20 text-red-400 border-red-500/30'
            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        }`}>
          <span className={`w-1 h-1 rounded-full ${frozen ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
          {frozen ? 'Frozen' : 'Active'}
        </span>
      </div>

      {/* Renter info */}
      <div className="bg-black/20 rounded-lg p-3 border border-white/5 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-white/40">Renter</span>
          <span className="font-mono text-white/70">{asset.renter}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Active for</span>
          <span className="font-mono text-white/70 flex items-center gap-1"><Clock className="w-3 h-3" />{hours}h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Access</span>
          <span className="text-white/70">{asset.accessType}</span>
        </div>
      </div>

      {/* Live financials */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-black/20 rounded-lg p-2.5 border border-white/5">
          <div className="flex items-center gap-1 text-xs text-purple-400/80 mb-1">
            <DollarSign className="w-3 h-3" />Rent paid
          </div>
          <div className="font-mono text-purple-300 text-sm font-bold tabular-nums">
            {frozen ? '—' : rentPaid.toFixed(4)}
            <span className="text-white/30 text-xs font-normal ml-1">DOT</span>
          </div>
        </div>
        <div className="bg-black/20 rounded-lg p-2.5 border border-white/5">
          <div className="flex items-center gap-1 text-xs text-cyan-400/80 mb-1">
            <TrendingUp className="w-3 h-3" />Yield earned
          </div>
          <div className="font-mono text-cyan-300 text-sm font-bold tabular-nums">
            {yieldEarned.toFixed(4)}
            <span className="text-white/30 text-xs font-normal ml-1">DOT</span>
          </div>
        </div>
      </div>

      {/* Freeze toggle */}
      <button
        onClick={() => onToggleFreeze(asset.id)}
        className={`w-full py-2.5 text-sm font-medium rounded-lg border flex items-center justify-center gap-2 transition-all duration-200 ${
          frozen
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
            : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
        }`}
      >
        {frozen
          ? <><Play className="w-3.5 h-3.5" />Unfreeze Asset</>
          : <><Snowflake className="w-3.5 h-3.5" />Freeze Asset</>
        }
      </button>

      {frozen && (
        <div className="flex items-start gap-2 text-xs text-red-400/70 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Asset frozen — payment stream paused, physical access disabled.
        </div>
      )}
    </div>
  );
}

export default function FleetControl() {
  const [frozenIds, setFrozenIds] = useState(new Set());

  const toggle = (id) => setFrozenIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (FLEET.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Building2 className="w-16 h-16 text-white/20 mb-4" />
        <h2 className="text-xl font-bold text-white mb-1">No Active Rentals</h2>
        <p className="text-white/40 text-sm">Assets you've tokenized will appear here when rented.</p>
      </div>
    );
  }

  const frozenCount = frozenIds.size;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-cyan-400" /> Fleet Control
          </h2>
          <p className="text-white/50 text-sm mt-0.5">
            {FLEET.length} active rental{FLEET.length !== 1 ? 's' : ''} · {frozenCount} frozen
          </p>
        </div>
        {frozenCount > 0 && (
          <button
            onClick={() => setFrozenIds(new Set())}
            className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            Unfreeze All
          </button>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {FLEET.map(asset => (
          <FleetCard
            key={asset.id}
            asset={asset}
            frozen={frozenIds.has(asset.id)}
            onToggleFreeze={toggle}
          />
        ))}
      </div>
    </div>
  );
}
