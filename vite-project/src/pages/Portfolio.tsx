import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, TreePine, MapPin, ArrowUpRight, Shield,
  RefreshCw, AlertCircle, Wallet, Plus, DollarSign, Zap
} from 'lucide-react';
import { fetchRwaAssets } from '../services/rwaApi.js';
import { mapApiAssetToUiAsset, TYPE_META, VERIFICATION_STATUS_LABELS } from './rwa/rwaData';
import { getAssetImage } from '../components/AssetCard';
import { useWallet } from '../context/WalletContext';
import { useAppMode } from '../context/AppModeContext';

function resolveDescription(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return raw.text || raw.description || '';
  return String(raw);
}

function verificationBadgeCls(status: string) {
  if (status === 'verified' || status === 'legacy_verified') return 'bg-emerald-100 text-emerald-700';
  if (status === 'frozen' || status === 'revoked' || status === 'disputed') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
      <div className="aspect-video bg-slate-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-slate-200 rounded w-3/4" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="flex justify-between items-center pt-2">
          <div className="h-5 bg-slate-200 rounded w-1/3" />
          <div className="h-8 w-24 bg-slate-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const navigate = useNavigate();
  const { walletAddress } = useWallet();
  const { agentPublicKey } = useAppMode();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch assets owned by the connected wallet OR the managed agent wallet
      const [ownerAssets, agentAssets] = await Promise.all([
        fetchRwaAssets(walletAddress),
        agentPublicKey && agentPublicKey !== walletAddress
          ? fetchRwaAssets(agentPublicKey)
          : Promise.resolve([]),
      ]);
      const all = [...(ownerAssets || []), ...(agentAssets || [])];
      // Deduplicate by tokenId
      const seen = new Set<string>();
      const deduped = all.filter(a => {
        const key = String(a.tokenId ?? a.id ?? '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAssets(deduped.map((a: any) => mapApiAssetToUiAsset(a)));
    } catch (err: any) {
      setError(err?.message || 'Failed to load portfolio.');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, agentPublicKey]);

  useEffect(() => { load(); }, [load]);

  // Summary stats
  const totalYield = assets.reduce((s, a) => s + (a.monthlyYieldTarget ?? 0), 0);
  const totalBalance = assets.reduce((s, a) => s + (a.yieldBalance ?? 0), 0);
  const estateCount = assets.filter(a => a.type === 'real_estate').length;
  const landCount = assets.filter(a => a.type === 'land').length;

  if (!walletAddress) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Wallet size={28} className="text-slate-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-700 mb-2">Connect your wallet</h2>
        <p className="text-sm text-slate-400 max-w-xs">
          Connect Freighter to view the assets you've minted and own.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">My Portfolio</h2>
          <p className="mt-1 text-sm text-slate-500">
            Properties you've minted and own on Stellar.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/app/property-mint')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
          >
            <Plus size={13} /> List Property
          </button>
          <button
            onClick={() => load()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {assets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Building2, label: 'Total Assets', value: String(assets.length), color: 'text-blue-600', bg: 'bg-blue-50' },
            { icon: Building2, label: 'Estates', value: String(estateCount), color: 'text-blue-600', bg: 'bg-blue-50' },
            { icon: TreePine,  label: 'Land',    value: String(landCount),   color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { icon: DollarSign, label: 'Monthly Yield', value: `$${totalYield.toFixed(2)}`, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl p-4 flex items-center gap-3`}>
              <Icon size={18} className={color} />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
          <button onClick={() => load()} className="ml-auto text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium mb-4">You haven't minted any properties yet.</p>
          <button
            onClick={() => navigate('/app/property-mint')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
          >
            <Plus size={13} /> List your first property
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {assets.map((asset: any) => {
            const isLand = asset.type === 'land';
            const vstatus = asset.verificationStatus || 'pending_attestation';
            const vLabel = VERIFICATION_STATUS_LABELS[vstatus] || vstatus;
            const TypeIcon = isLand ? TreePine : Building2;
            const typeMeta = TYPE_META[asset.type] || TYPE_META['real_estate'];
            const pm = asset.publicMetadata || {};
            const description = resolveDescription(asset.description || pm.description);
            const monthlyYield = asset.monthlyYieldTarget ?? (asset.pricePerHour * 24 * 30);
            const isRented = asset.rentalActivity?.currentlyRented;

            return (
              <div key={asset.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-200 group flex flex-col">
                {/* Photo */}
                <div className="relative aspect-video overflow-hidden shrink-0">
                  <img
                    src={getAssetImage(asset.type, asset.id, 600, 340, asset.imageUrl)}
                    alt={asset.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className={`absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isLand ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                    <TypeIcon size={10} /> {typeMeta.label}
                  </div>
                  <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${verificationBadgeCls(vstatus)}`}>
                    <Shield size={10} /> {vLabel}
                  </div>
                  {isRented && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Rented
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-bold text-slate-800 text-sm truncate">{asset.name}</h3>
                  <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                    <MapPin size={11} />
                    <span className="truncate">{asset.location}</span>
                  </div>
                  {description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2 flex-1">{description}</p>
                  )}

                  {/* Yield balance */}
                  {asset.yieldBalance > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 font-medium">
                      <Zap size={11} />
                      ${asset.yieldBalance.toFixed(4)} claimable yield
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Monthly yield</p>
                      <p className="text-base font-bold text-slate-800">${monthlyYield.toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/app/property/${asset.id}`, { state: { asset } })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      View <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
