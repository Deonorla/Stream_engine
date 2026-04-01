import { ArrowUpRight, Globe, X, MapPin, Clock, Shield, Zap, Building2, Car, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StrKey } from '@stellar/stellar-sdk';
import { TYPE_META } from '../pages/rwa/rwaData';

export const TYPE_ICON = { real_estate: Building2, vehicle: Car, commodity: Package };

export const IMAGE_SEEDS = {
  real_estate: 'villa',
  vehicle: 'tech',
  commodity: 'cyber',
};

function resolveRentalReadiness(asset) {
  if (asset?.rentalReadiness) {
    return asset.rentalReadiness;
  }

  const ownerAddress = asset.currentOwner || asset.ownerAddress || asset.assetAddress || '';
  const ready = StrKey.isValidEd25519PublicKey(String(ownerAddress || '').trim());
  return {
    ready,
    label: ready ? 'Stellar Rental Ready' : 'Needs Owner Sync',
    reason: ready
      ? 'This asset is ready for live Stellar rental sessions.'
      : 'This asset still needs a Stellar owner account before rentals can start.',
  };
}

export function AssetCard({ asset, onDetails }) {
  const meta = TYPE_META[asset.type] || TYPE_META.real_estate;
  const Icon = TYPE_ICON[asset.type] || Building2;
  const seed = IMAGE_SEEDS[asset.type] || 'villa';
  const rentalReadiness = resolveRentalReadiness(asset);
  const isRentalReady = Boolean(rentalReadiness.ready);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-slate-200 transition-all group"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          src={`https://picsum.photos/seed/${seed}${asset.id}/600/450`}
          alt={asset.name}
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-lg">
          <Icon size={12} className={meta.color} />
          <span className={`text-[10px] font-label font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
        </div>
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-2 pb-1  rounded-full border border-white/20 shadow-lg">
          <span className="text-[10px] font-headline font-bold text-primary uppercase tracking-widest">
            ${asset.pricePerHour.toFixed(4)}/hr
          </span>
        </div>
        <div className={`absolute bottom-4 left-4 rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest shadow-lg ${
          isRentalReady
            ? 'border-emerald-200 bg-emerald-50/95 text-emerald-600'
            : 'border-amber-200 bg-amber-50/95 text-amber-700'
        }`}>
          {rentalReadiness.label}
        </div>
      </div>
      <div className="p-8">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-slate-400" />
          <span className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">{asset.location}</span>
        </div>
        <h3 className="text-xl font-headline font-bold text-slate-900 mb-2">{asset.name}</h3>
        <p className="text-sm text-slate-500 line-clamp-2 mb-6">{asset.description}</p>
        <div className="flex items-center justify-between pt-6 border-t border-slate-50">
          <div>
            <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400 mb-1">Monthly Est.</p>
            <p className="text-lg font-headline font-bold text-slate-900">
              ${(asset.pricePerHour * 24 * 30).toFixed(2)}
            </p>
          </div>
          <button
            onClick={() => onDetails(asset)}
            className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-blue-500/20 hover:scale-110 transition-transform"
          >
            <ArrowUpRight size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function DetailDrawer({ asset, onClose, renderBody, renderFooter }) {
  const meta = TYPE_META[asset.type] || TYPE_META.real_estate;
  const Icon = TYPE_ICON[asset.type] || Building2;
  const seed = IMAGE_SEEDS[asset.type] || 'villa';
  const rentalReadiness = resolveRentalReadiness(asset);
  const isRentalReady = Boolean(rentalReadiness.ready);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto flex flex-col"
      >
        <div className="relative aspect-[16/9] shrink-0 overflow-hidden">
          <img
            src={`https://picsum.photos/seed/${seed}${asset.id}/800/450`}
            alt={asset.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="absolute bottom-4 left-5 right-5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md mb-2">
              <Icon size={12} className="text-white" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white">{meta.label}</span>
            </div>
            <h2 className="text-2xl font-headline font-bold text-white">{asset.name}</h2>
          </div>
        </div>

        <div className="p-6 space-y-6 flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500">
              <MapPin size={14} />
              <span className="text-sm">{asset.location}</span>
            </div>
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
              isRentalReady
                ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}>
              <Shield size={11} /> {rentalReadiness.label}
            </span>
          </div>

          <p className="text-slate-600 text-sm leading-relaxed">{asset.description}</p>

          {rentalReadiness.reason && (
            <div className={`rounded-2xl border px-4 py-3 text-xs ${
              isRentalReady
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}>
              {rentalReadiness.reason}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Rate',          value: `$${asset.pricePerHour.toFixed(4)}`,           sub: 'per hour'          },
              { label: 'Monthly Est.',  value: `$${(asset.pricePerHour * 24 * 30).toFixed(2)}`, sub: 'at full occupancy' },
              { label: 'Yield Balance', value: `${asset.yieldBalance.toFixed(4)}`,             sub: 'USDC accrued'      },
              { label: 'Asset ID',      value: `#${asset.id}`,                                 sub: asset.displayAddress || `${asset.assetAddress?.slice(0, 10)}…` },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                <p className="text-lg font-headline font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100">
            <Zap size={16} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Access Mechanism</p>
              <p className="text-sm text-slate-700">{asset.accessMechanism}</p>
            </div>
          </div>

          {asset.yieldRatePerSecond > 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live yield streaming at {(asset.yieldRatePerSecond * 3600).toFixed(6)} USDC/hr
            </div>
          )}

          {typeof renderBody === 'function' && renderBody(asset)}
        </div>

        <div className="p-6 border-t border-slate-100 shrink-0">
          {typeof renderFooter === 'function' ? (
            renderFooter(asset)
          ) : (
            <button className="w-full py-4 rounded-2xl ethereal-gradient text-white font-label font-bold uppercase tracking-widest text-sm shadow-lg shadow-blue-500/20 hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Clock size={16} /> Start Rental Session
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AssetDetailPortal({ selected, onClose, renderBody, renderFooter }) {
  return (
    <AnimatePresence>
      {selected && (
        <DetailDrawer
          asset={selected}
          onClose={onClose}
          renderBody={renderBody}
          renderFooter={renderFooter}
        />
      )}
    </AnimatePresence>
  );
}
