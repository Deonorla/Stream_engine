import { ArrowUpRight, Globe, X, MapPin, Clock, Shield, Zap, Building2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { StrKey } from '@stellar/stellar-sdk';
import { TYPE_META } from '../pages/rwa/rwaData';

export const TYPE_ICON = { real_estate: Building2, land: MapPin };

// Curated Unsplash photo IDs per asset type
const ASSET_IMAGES: Record<string, string[]> = {
  real_estate: [
    'photo-1564013799919-ab600027ffc6', // modern house
    'photo-1600596542815-ffad4c1539a9', // luxury villa
    'photo-1570129477492-45c003edd2be', // suburban home
    'photo-1512917774080-9991f1c4c750', // contemporary house
    'photo-1600585154340-be6161a56a0c', // real estate exterior
    'photo-1580587771525-78b9dba3b914', // white modern house
  ],
  land: [
    'photo-1500382017468-9049fed747ef', // open land
    'photo-1469474968028-56623f02e42e', // green parcel
    'photo-1472396961693-142e6e269027', // acreage
    'photo-1500530855697-b586d89ba3ee', // site landscape
  ],
};

const FALLBACK_IMAGES = [
  'photo-1560518883-ce09059eeffa',
  'photo-1486406146926-c627a92ad1ab',
];

export function getAssetImage(type: string, id: string | number, w = 600, h = 450): string {
  const list = ASSET_IMAGES[type] ?? FALLBACK_IMAGES;
  const n = typeof id === 'number' ? id : String(id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const photoId = list[n % list.length];
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;
}

/** @deprecated use getAssetImage */
export const IMAGE_SEEDS = {
  real_estate: 'villa',
  land: 'terrain',
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
  const rentalReadiness = resolveRentalReadiness(asset);
  const isRentalReady = Boolean(rentalReadiness.ready);
  const rentalActivity = asset.rentalActivity || {
    currentlyRented: false,
    label: isRentalReady ? 'Ready To Rent' : 'Not Rental Ready',
    reason: rentalReadiness.reason,
  };
  const isCurrentlyRented = Boolean(rentalActivity.currentlyRented);
  const agentSignals = asset.agentSignals || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-slate-200 transition-all group"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          src={getAssetImage(asset.type, asset.id, 600, 450)}
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
          isCurrentlyRented
            ? 'border-emerald-300 bg-emerald-500/90 text-white'
            : isRentalReady
              ? 'border-emerald-200 bg-emerald-50/95 text-emerald-600'
              : 'border-amber-200 bg-amber-50/95 text-amber-700'
        }`}>
          {isCurrentlyRented ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {rentalActivity.label}
            </span>
          ) : rentalReadiness.label}
        </div>
      </div>
      <div className="p-8">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-slate-400" />
          <span className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">{asset.location}</span>
        </div>
        <h3 className="text-xl font-headline font-bold text-slate-900 mb-2">{asset.name}</h3>
        <p className="text-sm text-slate-500 line-clamp-2 mb-4">{asset.description}</p>
        <div className={`mb-4 flex items-center gap-2 text-xs ${
          rentalActivity.status === 'rented' ? 'text-emerald-600'
          : rentalActivity.status === 'idle'  ? 'text-blue-500'
          : isRentalReady                      ? 'text-slate-500'
          :                                      'text-amber-700'
        }`}>
          <Clock size={12} />
          <span className="font-medium">{rentalActivity.label}</span>
          {rentalActivity.status === 'rented' && rentalActivity.sessionId > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              Session #{rentalActivity.sessionId}
            </span>
          )}
          {rentalActivity.activeRevenueStream && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              Revenue Live
            </span>
          )}
        </div>
        {agentSignals && (agentSignals.bidFocus || agentSignals.watchSignal || agentSignals.screenHit || agentSignals.watched) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {agentSignals.bidFocus && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700">
                Bid Focus
              </span>
            )}
            {agentSignals.watchSignal && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                Watch Signal
              </span>
            )}
            {agentSignals.screenHit && (
              <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-purple-600">
                Shortlist Hit
              </span>
            )}
            {agentSignals.watched && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                Watching
              </span>
            )}
          </div>
        )}
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
  const navigate = useNavigate();
  const meta = TYPE_META[asset.type] || TYPE_META.real_estate;
  const Icon = TYPE_ICON[asset.type] || Building2;
  const rentalReadiness = resolveRentalReadiness(asset);
  const isRentalReady = Boolean(rentalReadiness.ready);
  const rentalActivity = asset.rentalActivity || {
    currentlyRented: false,
    label: isRentalReady ? 'Ready To Rent' : 'Not Rental Ready',
    reason: rentalReadiness.reason,
  };
  const isCurrentlyRented = Boolean(rentalActivity.currentlyRented);

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
            src={getAssetImage(asset.type, asset.id, 800, 450)}
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

          {isCurrentlyRented && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Currently Rented</p>
                {rentalActivity.sessionId > 0 && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">Session #{rentalActivity.sessionId} · {rentalActivity.reason || 'A live rental session is active on this twin.'}</p>
                )}
              </div>
            </div>
          )}

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

          <div className={`rounded-2xl border px-4 py-3 text-xs ${
            rentalActivity.status === 'rented' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : rentalActivity.status === 'idle'  ? 'border-blue-100 bg-blue-50 text-blue-700'
            : isRentalReady                      ? 'border-slate-200 bg-slate-50 text-slate-600'
            :                                      'border-amber-100 bg-amber-50 text-amber-700'
          }`}>
            <span className="font-bold uppercase tracking-widest text-[10px] mr-2">Rent Status</span>
            {rentalActivity.status === 'rented' && rentalActivity.sessionId > 0 && (
              <span className="mr-1 font-bold">Session #{rentalActivity.sessionId} · </span>
            )}
            {rentalActivity.label}
            {rentalActivity.reason ? ` · ${rentalActivity.reason}` : ''}
          </div>

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

        <div className="p-6 border-t border-slate-100 shrink-0 space-y-3">
          {/* View full detail page */}
          <button
            onClick={() => { onClose(); navigate(`/app/property/${asset.id}`, { state: { asset } }); }}
            className="w-full py-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"
          >
            <ExternalLink size={15} /> View Full Details
          </button>
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
