import { useState } from 'react';
import { Building2, Car, Package, Plus, CheckCircle } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';

const ASSET_TYPES = [
  { key: 'real_estate', label: 'Real Estate', Icon: Building2, eg: 'Office, apartment, warehouse' },
  { key: 'vehicle',     label: 'Vehicle',     Icon: Car,       eg: 'Car fleet, EV, truck'         },
  { key: 'commodity',   label: 'Equipment',   Icon: Package,   eg: 'Machinery, equipment'         },
];

const EMPTY = { title: '', location: '', description: '', type: 'real_estate', accessType: '', pricePerHour: '', totalYield: '', durationDays: '' };

export default function AssetFactory() {
  const { walletAddress, toast } = useWallet();
  const [form, setForm] = useState(EMPTY);
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!walletAddress) { toast?.warning('Connect your wallet first'); return; }
    if (!form.title || !form.pricePerHour || !form.totalYield || !form.durationDays) {
      toast?.warning('Fill in all required fields');
      return;
    }
    // In production: call StreamEngineStream.createStream() to lock yield pool
    setDone(true);
    setTimeout(() => { setDone(false); setForm(EMPTY); }, 3000);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <CheckCircle className="w-16 h-16 text-emerald-400 mb-4" />
        <h2 className="text-xl font-bold text-white mb-1">Asset Tokenized!</h2>
        <p className="text-white/50 text-sm">Your RWA is live. Renters can now stream DOT to unlock access.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <Plus className="w-5 h-5 text-cyan-400" /> Asset Factory
        </h2>
        <p className="text-white/50 text-sm mt-1">
          Tokenize a physical asset. You keep the NFT and all financial rights — renters stream DOT to unlock access.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card-glass border border-white/5 p-6 space-y-5">

        {/* Asset type */}
        <div>
          <label className="block text-sm text-white/70 mb-2">Asset Type</label>
          <div className="grid grid-cols-3 gap-2">
            {ASSET_TYPES.map(({ key, label, Icon, eg }) => (
              <button
                key={key} type="button"
                onClick={() => set('type', key)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-all ${
                  form.type === key
                    ? 'bg-stream-500/20 border-stream-500/60 text-white'
                    : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
                <span className="text-white/30 text-center leading-tight">{eg}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Basic info */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-white/70 block mb-1.5">Asset Name *</span>
            <input className="input-default w-full" placeholder="e.g. Lagos Office Block" value={form.title} onChange={e => set('title', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm text-white/70 block mb-1.5">Location *</span>
            <input className="input-default w-full" placeholder="e.g. Victoria Island, Lagos" value={form.location} onChange={e => set('location', e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-white/70 block mb-1.5">Description</span>
          <textarea className="input-default w-full resize-none" rows={2} placeholder="Brief description of the asset..." value={form.description} onChange={e => set('description', e.target.value)} />
        </label>

        <label className="block">
          <span className="text-sm text-white/70 block mb-1.5">Access Mechanism *</span>
          <input className="input-default w-full" placeholder="e.g. Smart lock · Floor 3, IoT ignition unlock" value={form.accessType} onChange={e => set('accessType', e.target.value)} />
        </label>

        {/* Financials */}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm text-white/70 block mb-1.5">Rent (DOT/hr) *</span>
            <input type="number" min="0.01" step="0.01" className="input-default w-full" placeholder="50" value={form.pricePerHour} onChange={e => set('pricePerHour', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm text-white/70 block mb-1.5">Yield Pool (DOT) *</span>
            <input type="number" min="1" className="input-default w-full" placeholder="10000" value={form.totalYield} onChange={e => set('totalYield', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm text-white/70 block mb-1.5">Duration (days) *</span>
            <input type="number" min="1" className="input-default w-full" placeholder="365" value={form.durationDays} onChange={e => set('durationDays', e.target.value)} />
          </label>
        </div>

        {/* Yield preview */}
        {form.totalYield && form.durationDays && (
          <div className="bg-black/20 rounded-lg p-3 border border-white/5 text-xs text-white/50 flex justify-between">
            <span>Yield flow rate</span>
            <span className="font-mono text-cyan-300">
              {(Number(form.totalYield) / (Number(form.durationDays) * 86400)).toFixed(8)} DOT/sec
            </span>
          </div>
        )}

        <button type="submit" className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Tokenize Asset
        </button>
      </form>
    </div>
  );
}
