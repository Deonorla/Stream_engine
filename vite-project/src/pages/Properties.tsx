import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Building2, TreePine, ArrowUpRight, Shield, RefreshCw, AlertCircle, Home } from 'lucide-react';
import { fetchRwaAssets } from '../services/rwaApi.js';
import { mapApiAssetToUiAsset, TYPE_META, VERIFICATION_STATUS_LABELS } from './rwa/rwaData';
import { getAssetImage } from '../components/AssetCard';

// ─── helpers ─────────────────────────────────────────────────────────────────

function verificationBadgeCls(status: string) {
  if (status === 'verified' || status === 'legacy_verified') return 'bg-emerald-100 text-emerald-700';
  if (status === 'frozen' || status === 'revoked' || status === 'disputed') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

function resolveDescription(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return raw.text || raw.description || '';
  return String(raw);
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
      <div className="aspect-video bg-slate-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-slate-200 rounded w-3/4" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-5/6" />
        <div className="flex justify-between items-center pt-2">
          <div className="h-5 bg-slate-200 rounded w-1/3" />
          <div className="h-8 w-24 bg-slate-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Property card ────────────────────────────────────────────────────────────

function PropertyCard({ asset, onView }: { asset: any; onView: () => void }) {
  const isLand = asset.type === 'land';
  const vstatus = asset.verificationStatus || 'pending_attestation';
  const vLabel = VERIFICATION_STATUS_LABELS[vstatus] || vstatus;
  const TypeIcon = isLand ? TreePine : Building2;
  const typeMeta = TYPE_META[asset.type] || TYPE_META['real_estate'];
  const pm = asset.publicMetadata || {};

  const description = resolveDescription(asset.description || pm.description);
  const monthlyYield = asset.monthlyYieldTarget ?? (asset.pricePerHour * 24 * 30);

  // Quick stats for estate
  const beds = pm.beds || pm.bedroomsCount;
  const baths = pm.baths || pm.fullBaths;
  const sqft = pm.sqft;
  // Quick stats for land
  const lotSize = pm.lotSizeAcres || pm.lotSize;
  const zoning = pm.zoning;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-200 group flex flex-col">
      {/* Photo */}
      <div className="relative aspect-video overflow-hidden shrink-0">
        <img
          src={getAssetImage(asset.type, asset.id, 600, 340, asset.imageUrl)}
          alt={asset.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
        {/* Type badge */}
        <div className={`absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isLand ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
          <TypeIcon size={10} />
          {typeMeta.label}
        </div>
        {/* Verification badge */}
        <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${verificationBadgeCls(vstatus)}`}>
          <Shield size={10} />
          {vLabel}
        </div>
        {/* Rental status dot */}
        {asset.rentalActivity?.currentlyRented && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Rented
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-slate-800 text-sm truncate">{asset.name}</h3>
        <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
          <MapPin size={11} />
          <span className="truncate">{asset.location}</span>
        </div>

        {/* Quick stats row */}
        {(beds || baths || sqft || lotSize || zoning) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {beds && (
              <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg">{beds} bd</span>
            )}
            {baths && (
              <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg">{baths} ba</span>
            )}
            {sqft && (
              <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg">{Number(sqft).toLocaleString()} sqft</span>
            )}
            {lotSize && (
              <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg">{lotSize} ac</span>
            )}
            {zoning && (
              <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg">{zoning}</span>
            )}
          </div>
        )}

        {description && (
          <p className="text-xs text-slate-500 mt-2 line-clamp-2 flex-1">{description}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Monthly yield</p>
            <p className="text-base font-bold text-slate-800">${monthlyYield.toFixed(2)}</p>
          </div>
          <button
            onClick={onView}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
          >
            View Details <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Filter = 'all' | 'real_estate' | 'land';

export default function Properties() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const raw = await fetchRwaAssets();
      const mapped = (raw || []).map((a: any) => mapApiAssetToUiAsset(a));
      setAssets(mapped);
    } catch (err: any) {
      setError(err?.message || 'Failed to load properties.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = assets.filter(a => {
    if (filter !== 'all' && a.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q) ||
        resolveDescription(a.description).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const estateCount = assets.filter(a => a.type === 'real_estate').length;
  const landCount = assets.filter(a => a.type === 'land').length;

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Marketplace</h2>
          <p className="mt-1 text-sm text-slate-500">
            All minted real estate and land RWA twins on Stellar.
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Type tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {([
            { key: 'all',          label: `All (${assets.length})`,         icon: Home },
            { key: 'real_estate',  label: `Estate (${estateCount})`,        icon: Building2 },
            { key: 'land',         label: `Land (${landCount})`,            icon: TreePine },
          ] as { key: Filter; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or location…"
            className="w-full pl-8 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>
      </div>

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
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {assets.length === 0 ? 'No properties minted yet.' : 'No properties match your filters.'}
          </p>
          {assets.length === 0 && (
            <button
              onClick={() => navigate('/app/property-mint')}
              className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
            >
              List a Property
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((asset: any) => (
            <PropertyCard
              key={asset.id}
              asset={asset}
              onView={() => navigate(`/app/property/${asset.id}`, { state: { asset } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
