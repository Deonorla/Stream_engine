import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function YieldTicker({ base, color }) {
  const [val, setVal] = useState(base);
  useEffect(() => {
    const id = setInterval(() => setVal(v => +(v + 0.0001 * (Math.random() * 2 + 1)).toFixed(4)), 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ color }} className="font-mono text-sm font-bold tabular-nums">{val.toFixed(4)} USDC/s</span>;
}

const ASSETS = [
  { icon: '🏢', name: 'Lagos Commercial Plaza', nft: '#4821', access: 'Smart lock · Floor 3–8', color: '#3b82f6', base: 0.0042 },
  { icon: '🚗', name: 'Tesla Model S Fleet',    nft: '#2103', access: 'IoT ignition unlock',   color: '#a855f7', base: 0.0139 },
  { icon: '⚙️', name: 'Industrial CNC Machinery',nft: '#9034', access: 'PLC controller unlock', color: '#10b981', base: 0.0028 },
];

export default function LandingRWASection({ tokenSymbol = 'USDC', assetCount = 0 }) {
  return (
    <section className="w-full bg-surface-950 py-24 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 70% 40%, rgba(16,185,129,0.07) 0%, transparent 70%)' }} aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid md:grid-cols-2 gap-16 items-center">

          <div className="space-y-6">
            <p className="text-success-400 text-sm font-semibold uppercase tracking-widest font-mono">RWA Studio · Stellar-backed runtime</p>
            <h2 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
              Own the asset.<br />Stream the access.
            </h2>
            <p className="text-surface-300 leading-relaxed">
              Create verified rental twins for real estate, vehicles, and machinery. Keep the twin and the revenue rights. Renters fund metered {tokenSymbol} access that unlocks smart locks, IoT ignition, and PLC controllers.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-success-500/20 bg-success-500/10 px-3 py-1 text-xs font-mono text-success-300">
              <span className="h-1.5 w-1.5 rounded-full bg-success-400" />
              {assetCount} indexed rental assets
            </div>
            <ul className="space-y-3">
              {[
                { label: 'Owner keeps NFT + yield + flash loan rights', color: 'text-success-400' },
                { label: `Renter streams ${tokenSymbol} → physical access unlocks instantly`, color: 'text-success-400' },
                { label: `Cancel anytime — unspent ${tokenSymbol} refunded immediately`, color: 'text-success-400' },
                { label: 'Fleet Control — freeze any asset to pause stream + access', color: 'text-warning-400' },
              ].map(item => (
                <li key={item.label} className="flex items-center gap-3">
                  <span className={`text-base ${item.color}`} aria-hidden="true">✓</span>
                  <span className={`text-sm ${item.color}`}>{item.label}</span>
                </li>
              ))}
            </ul>
            <Link to="/app/rwa" className="inline-block px-8 py-3 bg-success-500 hover:bg-success-600 text-white font-semibold rounded-lg shadow-glow-success transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-success-500/50">
              Explore RWA Studio
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            {ASSETS.map((asset, i) => (
              <div key={i} className="rounded-2xl border border-surface-700 p-5 relative overflow-hidden shadow-card hover:-translate-y-0.5 transition-transform duration-300" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
                <div className="absolute inset-0 bg-stream-flow opacity-[0.07] animate-shimmer pointer-events-none" aria-hidden="true" />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{asset.icon}</span>
                    <div>
                      <p className="text-white font-semibold text-sm">{asset.name}</p>
                      <p className="text-surface-500 font-mono text-xs">NFT {asset.nft}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-surface-500">Access</p>
                    <p className="font-mono text-xs" style={{ color: asset.color }}>{asset.access}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" aria-hidden="true" />
                    <span className="text-xs text-surface-500 font-mono">owner yield</span>
                  </div>
                  <YieldTicker base={asset.base} color={asset.color} />
                </div>
                <div className="h-0.5 rounded-full bg-surface-700 overflow-hidden mt-3">
                  <div className="h-full animate-stream-flow w-full" style={{ background: `${asset.color}70` }} aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
