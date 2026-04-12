import { useNavigate } from 'react-router-dom';
import { MapPin, Building2, TreePine, ArrowUpRight, Shield } from 'lucide-react';
import { PORTFOLIO_ASSETS, TYPE_META, VERIFICATION_STATUS_LABELS } from './rwa/rwaData';
import { getAssetImage } from '../components/AssetCard';

function verificationBadge(status: string) {
  if (status === 'verified' || status === 'legacy_verified')
    return 'bg-emerald-100 text-emerald-700';
  if (status === 'frozen' || status === 'revoked')
    return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

export default function Properties() {
  const navigate = useNavigate();

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Browse Properties</h2>
        <p className="mt-1 text-sm text-slate-500">
          All minted real estate and land RWA twins. Click any card to view full details.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {PORTFOLIO_ASSETS.map((asset: any) => {
          const isLand = asset.type === 'land';
          const vstatus = asset.verificationStatus || 'pending_attestation';
          const vLabel = VERIFICATION_STATUS_LABELS[vstatus] || vstatus;
          const TypeIcon = isLand ? TreePine : Building2;
          const typeMeta = TYPE_META[asset.type] || TYPE_META['real_estate'];

          return (
            <div
              key={asset.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg transition-shadow group"
            >
              {/* Photo */}
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={getAssetImage(asset.type, asset.id, 600, 340)}
                  alt={asset.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isLand ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                    <TypeIcon size={10} />
                    {typeMeta.label}
                  </span>
                </div>
                <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${verificationBadge(vstatus)}`}>
                  <Shield size={10} />
                  {vLabel}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-bold text-slate-800 text-sm truncate">{asset.name}</h3>
                <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                  <MapPin size={11} />
                  <span className="truncate">{asset.location}</span>
                </div>
                <p className="text-xs text-slate-500 mt-2 line-clamp-2">{asset.description}</p>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Monthly yield</p>
                    <p className="text-base font-bold text-slate-800">
                      ${(asset.monthlyYieldTarget ?? asset.pricePerHour * 24 * 30).toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/app/property/${asset.id}`, { state: { asset } })}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    View Details <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
