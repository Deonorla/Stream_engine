import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { fetchRwaAsset } from '../services/rwaApi.js';
import {
  ArrowLeft, Bed, Bath, Maximize2, Calendar, DollarSign, MapPin,
  Shield, Zap, FileText, Home, Car, Thermometer, Wind, TreePine,
  CheckCircle2, XCircle, Clock, Share2, Heart, ChevronRight,
  Building2, Layers, Mountain, Tag, ExternalLink, Copy
} from 'lucide-react';
import { getAssetImage } from '../components/AssetCard';
import { PORTFOLIO_ASSETS, TYPE_META, VERIFICATION_STATUS_LABELS } from './rwa/rwaData';

// ─── helpers ────────────────────────────────────────────────────────────────

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr || '—';
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function relativeTime(ts: number | string): string {
  if (!ts) return '—';
  const unix = typeof ts === 'string' ? Date.parse(ts) / 1000 : ts;
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString();
}

function fmtDate(ts: number | string): string {
  if (!ts) return '—';
  const unix = typeof ts === 'string' ? Date.parse(ts) / 1000 : ts;
  return new Date(unix * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function verificationColor(status: string): string {
  if (status === 'verified' || status === 'legacy_verified') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'frozen' || status === 'revoked' || status === 'disputed') return 'bg-red-100 text-red-700 border-red-200';
  if (status === 'pending_attestation' || status === 'stale' || status === 'incomplete') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

const TABS = ['Overview', 'Facts & Features', 'Location', 'On-Chain'] as const;
type Tab = typeof TABS[number];

// ─── sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-3">
      {children}
    </p>
  );
}

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
      <div className="text-slate-400">{icon}</div>
      <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">{label}</p>
      <p className="text-base font-bold text-slate-800">{value}</p>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value || value === '—') return null;
  return (
    <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 text-slate-400 hover:text-blue-600 transition-colors"
      title="Copy"
    >
      {copied ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

// ─── Photo Gallery ───────────────────────────────────────────────────────────

function PhotoGallery({ asset }: { asset: any }) {
  const { id, type, verificationStatus } = asset;
  const imgs = [0, 1, 2, 3, 4].map((offset) =>
    getAssetImage(type, typeof id === 'number' ? id + offset : String(id).charCodeAt(0) + offset, 800, 600)
  );
  const isLand = type === 'land';

  return (
    <div className="relative w-full h-[420px] rounded-2xl overflow-hidden flex gap-1.5">
      {/* Main photo */}
      <div className="relative flex-[3] h-full">
        <img src={imgs[0]} alt="main" className="w-full h-full object-cover" />
        {/* badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          <Pill className="bg-blue-600 text-white shadow">For Sale</Pill>
          {(verificationStatus === 'verified' || verificationStatus === 'legacy_verified') && (
            <Pill className="bg-emerald-500 text-white shadow">
              <Shield size={11} /> Verified
            </Pill>
          )}
          {isLand && (
            <Pill className="bg-emerald-700 text-white shadow">Land</Pill>
          )}
        </div>
      </div>

      {/* 2×2 grid */}
      <div className="flex-[2] grid grid-cols-2 grid-rows-2 gap-1.5 h-full">
        {imgs.slice(1, 5).map((src, i) => (
          <div key={i} className="relative overflow-hidden">
            <img src={src} alt={`photo-${i + 1}`} className="w-full h-full object-cover" />
          </div>
        ))}
        {/* See all photos overlay on last cell */}
        <button className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-xl shadow hover:bg-white transition-colors flex items-center gap-1">
          <Layers size={13} /> See all photos
        </button>
      </div>
    </div>
  );
}

// ─── Key Stats Bar ───────────────────────────────────────────────────────────

function KeyStatsBar({ asset }: { asset: any }) {
  const pm = asset.publicMetadata || {};
  const isEstate = asset.type === 'real_estate';
  const isLand = asset.type === 'land';
  const vstatus = asset.verificationStatus || 'draft';
  const vLabel = VERIFICATION_STATUS_LABELS[vstatus] || vstatus;

  return (
    <div className="flex flex-wrap items-center gap-3 py-4 border-b border-slate-100">
      {/* Price */}
      <span className="text-2xl font-bold text-slate-900">
        ${(asset.monthlyYieldTarget ?? 0).toFixed(0)}
        <span className="text-base font-normal text-slate-500">/mo yield</span>
      </span>

      <div className="w-px h-6 bg-slate-200" />

      {isEstate && pm.beds && (
        <Pill className="bg-slate-100 text-slate-700">
          <Bed size={13} /> {pm.beds} bd
        </Pill>
      )}
      {isEstate && pm.baths && (
        <Pill className="bg-slate-100 text-slate-700">
          <Bath size={13} /> {pm.baths} ba
        </Pill>
      )}
      {isEstate && pm.sqft && (
        <Pill className="bg-slate-100 text-slate-700">
          <Maximize2 size={13} /> {Number(pm.sqft).toLocaleString()} sqft
        </Pill>
      )}
      {isLand && pm.lotSize && (
        <Pill className="bg-slate-100 text-slate-700">
          <Mountain size={13} /> {pm.lotSize}
        </Pill>
      )}
      {isLand && pm.zoning && (
        <Pill className="bg-slate-100 text-slate-700">
          <Tag size={13} /> {pm.zoning}
        </Pill>
      )}

      {(pm.propertyType || pm.propertySubtype) && (
        <Pill className="bg-blue-50 text-blue-700">
          <Home size={13} /> {pm.propertyType || pm.propertySubtype}
        </Pill>
      )}

      <Pill className={`border ${verificationColor(vstatus)}`}>
        <Shield size={11} /> {vLabel}
      </Pill>
    </div>
  );
}

// ─── Tab: Overview ───────────────────────────────────────────────────────────

function OverviewTab({ asset }: { asset: any }) {
  const pm = asset.publicMetadata || {};
  const tags: string[] = pm.specialTags
    ? pm.specialTags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];

  const rental = asset.rentalActivity || {};
  const readiness = asset.rentalReadiness || {};

  let rentalBanner = null;
  if (rental.currentlyRented) {
    rentalBanner = (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
        <Zap size={15} className="text-emerald-500" />
        <span className="font-semibold">Currently Rented</span>
        <span className="text-emerald-600">— {rental.label || 'Active session'}</span>
        {rental.sessionId && <span className="ml-auto text-xs text-emerald-500 font-mono">{truncateAddr(rental.sessionId)}</span>}
      </div>
    );
  } else if (readiness.ready) {
    rentalBanner = (
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <CheckCircle2 size={15} className="text-blue-500" />
        <span className="font-semibold">Rental Ready</span>
        <span className="text-blue-600">— {readiness.label}</span>
      </div>
    );
  } else {
    rentalBanner = (
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        <Clock size={15} className="text-amber-500" />
        <span className="font-semibold">Not Ready</span>
        <span className="text-amber-600">— {readiness.reason || readiness.label || 'Setup required'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Special tags */}
      {tags.length > 0 && (
        <div>
          <SectionHeader>What's Special</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Pill key={tag} className="bg-blue-50 text-blue-700 border border-blue-100">
                <Tag size={11} /> {tag}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {(asset.description || pm.description) && (
        <div>
          <SectionHeader>About this property</SectionHeader>
          <p className="text-sm text-slate-600 leading-relaxed">{asset.description || pm.description}</p>
        </div>
      )}

      {/* Quick stats */}
      <div>
        <SectionHeader>Financial Overview</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<DollarSign size={16} />}
            label="Monthly Yield"
            value={`$${(pm.yieldParameters?.monthlyRentalIncome ?? (pm.yieldParameters?.annualLandLeaseIncome != null ? pm.yieldParameters.annualLandLeaseIncome / 12 : null) ?? asset.monthlyYieldTarget ?? 0).toFixed(2)}`}
          />
          <StatCard
            icon={<Zap size={16} />}
            label="Yield Balance"
            value={`$${(asset.yieldBalance ?? 0).toFixed(4)}`}
          />
          <StatCard
            icon={<Clock size={16} />}
            label="Rate / hr"
            value={`${(pm.yieldParameters?.yieldTargetPct ?? asset.pricePerHour ?? 0).toFixed(4)}`}
          />
          <StatCard
            icon={<FileText size={16} />}
            label="Asset ID"
            value={`#${asset.tokenId ?? asset.id ?? '—'}`}
          />
        </div>
      </div>

      {/* Rental status */}
      <div>
        <SectionHeader>Rental Status</SectionHeader>
        {rentalBanner}
      </div>

      {/* Access mechanism */}
      {(pm.accessMechanism || asset.accessMechanism) && (
        <div>
          <SectionHeader>Access Mechanism</SectionHeader>
          <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3">
            {pm.accessMechanism || asset.accessMechanism}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Facts & Features ───────────────────────────────────────────────────

function FactsEstate({ pm }: { pm: any }) {
  return (
    <div className="space-y-6">
      {/* Interior */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Interior</SectionHeader>
        <div className="divide-y divide-slate-100">
          <FactRow label="Bedrooms" value={dash(pm.interior?.bedroomsCount ?? pm.beds)} />
          <FactRow label="Bathrooms" value={dash(pm.interior?.fullBaths ?? pm.baths)} />
          <FactRow label="Sq Ft" value={(pm.interior?.livingAreaSqft ?? pm.sqft) ? Number(pm.interior?.livingAreaSqft ?? pm.sqft).toLocaleString() : undefined} />
          <FactRow label="Year Built" value={dash(pm.interior?.yearBuilt ?? pm.yearBuilt)} />
          <FactRow label="Heating" value={dash(pm.interior?.heating ?? pm.heating)} />
          <FactRow label="Cooling" value={dash(pm.interior?.cooling ?? pm.cooling)} />
          <FactRow label="Appliances" value={dash(pm.interior?.appliances ?? pm.appliances)} />
          <FactRow label="Interior Features" value={dash(pm.interior?.interiorFeatures ?? pm.interiorFeatures)} />
        </div>
      </div>

      {/* Construction */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Construction</SectionHeader>
        <div className="divide-y divide-slate-100">
          <FactRow label="Property Type" value={dash(pm.construction?.homeType ?? pm.propertyType)} />
          <FactRow label="Property Subtype" value={dash(pm.construction?.propertySubtype ?? pm.propertySubtype)} />
          <FactRow label="Architectural Style" value={dash(pm.construction?.architecturalStyle ?? pm.architecturalStyle)} />
          <FactRow label="Materials" value={dash(pm.construction?.materials ?? pm.materials)} />
          <FactRow label="Foundation" value={dash(pm.construction?.foundation ?? pm.foundation)} />
          <FactRow label="Roof" value={dash(pm.construction?.roof ?? pm.roof)} />
          <FactRow label="Condition" value={dash(pm.construction?.condition ?? pm.condition)} />
        </div>
      </div>

      {/* Parking & Lot */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Parking &amp; Lot</SectionHeader>
        <div className="divide-y divide-slate-100">
          <FactRow label="Parking Features" value={dash(pm.parkingAndLot?.parkingFeatures ?? pm.parkingFeatures)} />
          <FactRow label="Lot Size" value={dash(pm.parkingAndLot?.lotSize ?? pm.lotSize)} />
          <FactRow label="Lot Size (Acres)" value={dash(pm.parkingAndLot?.lotSizeAcres ?? pm.lotSizeAcres)} />
          <FactRow label="Lot Dimensions" value={dash(pm.parkingAndLot?.lotDimensions ?? pm.lotDimensions)} />
          <FactRow label="Lot Features" value={dash(pm.parkingAndLot?.lotFeatures ?? pm.lotFeatures)} />
          <FactRow label="Parcel Number" value={dash(pm.address?.parcelNumber ?? pm.parcelNumber)} />
          <FactRow label="HOA" value={(pm.parkingAndLot?.hoa ?? pm.hoa) ? `$${pm.parkingAndLot?.hoa ?? pm.hoa}/mo` : undefined} />
          <FactRow label="Price / Sqft" value={(pm.parkingAndLot?.pricePerSqft ?? pm.pricePerSqft) ? `$${pm.parkingAndLot?.pricePerSqft ?? pm.pricePerSqft}` : undefined} />
        </div>
      </div>
    </div>
  );
}

function FactsLand({ pm }: { pm: any }) {
  return (
    <div className="space-y-6">
      {/* Land Details */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Land Details</SectionHeader>
        <div className="divide-y divide-slate-100">
          <FactRow label="Lot Size" value={dash(pm.landDetails?.lotSize ?? pm.lotSize)} />
          <FactRow label="Lot Size (Acres)" value={dash(pm.landDetails?.lotSizeAcres ?? pm.lotSizeAcres)} />
          <FactRow label="Lot Dimensions" value={dash(pm.landDetails?.lotDimensions ?? pm.lotDimensions)} />
          <FactRow label="Zoning" value={dash(pm.landDetails?.zoning ?? pm.zoning)} />
          <FactRow label="Land Type" value={dash(pm.landDetails?.landType ?? pm.landType)} />
          <FactRow label="Topography" value={dash(pm.landDetails?.topography ?? pm.topography)} />
          <FactRow label="Soil Type" value={dash(pm.landDetails?.soilType ?? pm.soilType)} />
          <FactRow label="Parcel Number" value={dash(pm.address?.parcelNumber ?? pm.parcelNumber)} />
        </div>
      </div>

      {/* Infrastructure */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Infrastructure</SectionHeader>
        <div className="divide-y divide-slate-100">
          <FactRow label="Road Access" value={dash(pm.roadAccess)} />
          <FactRow label="Utilities" value={dash(pm.utilities)} />
          <FactRow label="Water Source" value={dash(pm.waterSource)} />
          <FactRow label="Flood Zone" value={dash(pm.floodZone)} />
          <FactRow label="Tree Cover" value={dash(pm.treeCover)} />
          <FactRow label="Survey Available" value={pm.surveyAvailable != null ? (pm.surveyAvailable ? 'Yes' : 'No') : undefined} />
        </div>
      </div>

      {/* Land Use */}
      {(pm.landUse?.history ?? pm.landHistory || pm.landUse?.additionalNotes ?? pm.landNotes) && (
        <div className="bg-slate-50 rounded-2xl p-5">
          <SectionHeader>Land Use</SectionHeader>
          <div className="divide-y divide-slate-100">
            <FactRow label="History" value={dash(pm.landUse?.history ?? pm.landHistory)} />
            <FactRow label="Notes" value={dash(pm.landUse?.additionalNotes ?? pm.landNotes)} />
          </div>
        </div>
      )}
    </div>
  );
}

function FactsTab({ asset }: { asset: any }) {
  const pm = asset.publicMetadata || {};
  const isLand = pm.propertyType === 'LAND' || asset.type === 'land';
  return isLand ? <FactsLand pm={pm} /> : <FactsEstate pm={pm} />;
}

// ─── Tab: Location ───────────────────────────────────────────────────────────

function LocationTab({ asset }: { asset: any }) {
  const pm = asset.publicMetadata || {};
  const lat = pm.address?.latitude ?? pm.latitude;
  const lng = pm.address?.longitude ?? pm.longitude;
  const addr = pm.address?.street ?? pm.address ?? asset.location ?? '';
  const city = pm.address?.city ?? pm.city ?? '';
  const state = pm.address?.state ?? pm.state ?? '';
  const zip = pm.address?.zip ?? pm.zip ?? '';

  const query = lat && lng
    ? `${lat},${lng}`
    : [addr, city, state, zip].filter(Boolean).join(', ');

  const mapSrc = query
    ? `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed&z=15`
    : null;

  const fullAddress = [addr, city, state, zip].filter(Boolean).join(', ') || asset.location || '—';

  return (
    <div className="space-y-5">
      {/* Map */}
      {mapSrc ? (
        <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-100 h-72">
          <iframe
            title="Property Location"
            src={mapSrc}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-100 h-72 flex items-center justify-center text-slate-400 text-sm">
          <MapPin size={20} className="mr-2" /> Map unavailable
        </div>
      )}

      {/* Address */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Address</SectionHeader>
        <div className="flex items-start gap-2">
          <MapPin size={15} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-700">{fullAddress}</p>
        </div>
      </div>

      {/* Listing info */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Listing Info</SectionHeader>
        <div className="divide-y divide-slate-100">
          <FactRow label="MLS #" value={dash(pm.mlsNumber)} />
          <FactRow label="Listing Agent" value={dash(pm.listingAgent)} />
          <FactRow label="Source" value={dash(pm.listingSource)} />
        </div>
      </div>

      {/* Travel times placeholder */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Travel Times</SectionHeader>
        <p className="text-sm text-slate-400 italic">Travel time estimates coming soon.</p>
      </div>
    </div>
  );
}

// ─── Tab: On-Chain ───────────────────────────────────────────────────────────

function OnChainTab({ asset }: { asset: any }) {
  const pm = asset.publicMetadata || {};
  const vstatus = asset.verificationStatus || 'draft';
  const vLabel = VERIFICATION_STATUS_LABELS[vstatus] || vstatus;
  const attestations: any[] = asset.attestations || [];
  const policies: any[] = asset.attestationPolicies || [];
  const evidence = asset.evidenceSummary || {};
  const activity: any[] = asset.activity || [];

  return (
    <div className="space-y-6">
      {/* Verification status */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>Verification Status</SectionHeader>
        <div className="flex items-center gap-3">
          <Shield size={20} className={vstatus === 'verified' ? 'text-emerald-500' : vstatus === 'frozen' ? 'text-red-500' : 'text-amber-500'} />
          <div>
            <p className={`text-sm font-semibold ${vstatus === 'verified' ? 'text-emerald-700' : vstatus === 'frozen' ? 'text-red-700' : 'text-amber-700'}`}>
              {vLabel}
            </p>
            {asset.verificationStatusLabel && (
              <p className="text-xs text-slate-500 mt-0.5">{asset.verificationStatusLabel}</p>
            )}
          </div>
          <Pill className={`ml-auto border ${verificationColor(vstatus)}`}>{vLabel}</Pill>
        </div>
      </div>

      {/* Attestations */}
      {(attestations.length > 0 || policies.length > 0) && (
        <div className="bg-slate-50 rounded-2xl p-5">
          <SectionHeader>Attestations</SectionHeader>
          {attestations.length === 0 && (
            <p className="text-sm text-slate-400 italic">No attestations recorded yet.</p>
          )}
          <div className="space-y-3">
            {attestations.map((att, i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <Pill className="bg-blue-50 text-blue-700 text-[10px]">{att.roleLabel || att.role}</Pill>
                  {att.revoked && <Pill className="bg-red-50 text-red-600 text-[10px]">Revoked</Pill>}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="font-mono">{truncateAddr(att.attestor)}</span>
                  {att.attestor && <CopyButton text={att.attestor} />}
                </div>
                <div className="flex gap-4 mt-2 text-[11px] text-slate-400">
                  {att.issuedAt && <span>Issued: {fmtDate(att.issuedAt)}</span>}
                  {att.expiry && <span>Expires: {fmtDate(att.expiry)}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Required policies */}
          {policies.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Required Roles</p>
              <div className="flex flex-wrap gap-2">
                {policies.map((p, i) => {
                  const fulfilled = attestations.some((a) => a.role === p.role && !a.revoked);
                  return (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${fulfilled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {fulfilled ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                      {p.roleLabel || p.role}
                      {p.required && !fulfilled && <span className="text-[10px] opacity-70">*required</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence summary */}
      {(evidence.documentCount > 0 || evidence.requiredDocuments?.length > 0) && (
        <div className="bg-slate-50 rounded-2xl p-5">
          <SectionHeader>Evidence Documents</SectionHeader>
          <div className="flex gap-4 text-sm mb-3">
            <span className="text-slate-500">Required: <strong>{evidence.requiredDocuments?.length ?? 0}</strong></span>
            <span className="text-slate-500">Present: <strong className="text-emerald-600">{evidence.presentDocuments?.length ?? 0}</strong></span>
            {evidence.missingRequiredDocuments?.length > 0 && (
              <span className="text-red-500">Missing: <strong>{evidence.missingRequiredDocuments.length}</strong></span>
            )}
          </div>
          <div className="space-y-1.5">
            {(evidence.requiredDocuments || []).map((doc: string, i: number) => {
              const present = (evidence.presentDocuments || []).includes(doc);
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {present
                    ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    : <XCircle size={14} className="text-red-400 shrink-0" />}
                  <span className={present ? 'text-slate-700' : 'text-slate-400'}>{doc}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity timeline */}
      {activity.length > 0 && (
        <div className="bg-slate-50 rounded-2xl p-5">
          <SectionHeader>Activity Timeline</SectionHeader>
          <div className="relative pl-4 border-l-2 border-slate-200 space-y-4">
            {activity.map((ev, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-400 border-2 border-white" />
                <p className="text-sm font-medium text-slate-700">{ev.label}</p>
                {ev.detail && <p className="text-xs text-slate-500 mt-0.5">{ev.detail}</p>}
                <p className="text-[11px] text-slate-400 mt-0.5">{relativeTime(ev.timestamp)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chain metadata */}
      <div className="bg-slate-50 rounded-2xl p-5">
        <SectionHeader>On-Chain Details</SectionHeader>
        <div className="divide-y divide-slate-100">
          <FactRow label="Rights Model" value={dash(asset.rightsModelLabel)} />
          <FactRow label="Property Ref" value={dash(pm.propertyRef)} />
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-sm text-slate-500">Token ID</span>
            <span className="text-sm font-mono text-slate-800 flex items-center gap-1">
              {dash(asset.tokenId)}
              {asset.tokenId && <CopyButton text={String(asset.tokenId)} />}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-sm text-slate-500">Owner</span>
            <span className="text-sm font-mono text-slate-800 flex items-center gap-1">
              {truncateAddr(asset.ownerAddress || asset.displayAddress || '')}
              {(asset.ownerAddress || asset.displayAddress) && (
                <CopyButton text={asset.ownerAddress || asset.displayAddress} />
              )}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-slate-500">Issuer</span>
            <span className="text-sm font-mono text-slate-800 flex items-center gap-1">
              {truncateAddr(asset.issuerAddress || '')}
              {asset.issuerAddress && <CopyButton text={asset.issuerAddress} />}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sticky Action Panel ─────────────────────────────────────────────────────

function ActionPanel({ asset }: { asset: any }) {
  const pm = asset.publicMetadata || {};
  const vstatus = asset.verificationStatus || 'draft';
  const vLabel = VERIFICATION_STATUS_LABELS[vstatus] || vstatus;
  const isLand = asset.type === 'land';

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-5 sticky top-6">
      {/* Price */}
      <div>
        <p className="text-2xl font-bold text-slate-900">
          ${(asset.monthlyYieldTarget ?? 0).toFixed(0)}
          <span className="text-base font-normal text-slate-500">/mo yield</span>
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          ${(asset.pricePerHour ?? 0).toFixed(4)}/hr · ${(asset.yieldBalance ?? 0).toFixed(4)} balance
        </p>
      </div>

      {/* CTA buttons */}
      <div className="space-y-2.5">
        <button className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold text-sm shadow hover:from-blue-700 hover:to-blue-600 transition-all flex items-center justify-center gap-2">
          <Zap size={15} /> Start Rental Session
        </button>
        <button className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
          <ExternalLink size={14} /> Contact Agent
        </button>
      </div>

      {/* Share / Save */}
      <div className="flex gap-2">
        <button className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
          <Share2 size={14} /> Share
        </button>
        <button className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
          <Heart size={14} /> Save
        </button>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <SectionHeader>Listing Info</SectionHeader>
        {pm.mlsNumber && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">MLS #</span>
            <span className="text-slate-600 font-medium">{pm.mlsNumber}</span>
          </div>
        )}
        {pm.listingAgent && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Agent</span>
            <span className="text-slate-600 font-medium">{pm.listingAgent}</span>
          </div>
        )}
        {pm.listingSource && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Source</span>
            <span className="text-slate-600 font-medium">{pm.listingSource}</span>
          </div>
        )}
        {!pm.mlsNumber && !pm.listingAgent && !pm.listingSource && (
          <p className="text-xs text-slate-400 italic">No listing info available.</p>
        )}
      </div>

      {/* Verification badge */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${verificationColor(vstatus)}`}>
        <Shield size={14} />
        <span className="text-xs font-semibold">{vLabel}</span>
        {(vstatus === 'verified' || vstatus === 'legacy_verified') && (
          <CheckCircle2 size={13} className="ml-auto text-emerald-500" />
        )}
      </div>

      {/* Type badge */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isLand ? 'bg-emerald-50' : 'bg-blue-50'}`}>
        {isLand ? <TreePine size={14} className="text-emerald-600" /> : <Building2 size={14} className="text-blue-600" />}
        <span className={`text-xs font-medium ${isLand ? 'text-emerald-700' : 'text-blue-700'}`}>
          {isLand ? 'Land Parcel' : 'Real Estate'}
        </span>
        {asset.rightsModelLabel && (
          <span className="ml-auto text-[10px] text-slate-400">{asset.rightsModelLabel}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PropertyDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const [asset, setAsset] = useState<any>(location.state?.asset ?? null);
  const [loading, setLoading] = useState(!location.state?.asset);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.asset) return;
    if (!id) return;
    setLoading(true);
    setFetchError(null);
    fetchRwaAsset(id)
      .then((fetched) => {
        if (fetched) setAsset(fetched);
        else setFetchError('Asset not found.');
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load asset.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <p>Loading property…</p>
      </div>
    );
  }
  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <p>{fetchError}</p>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <p>Asset not found.</p>
      </div>
    );
  }

  const pm = asset.publicMetadata || {};
  const isLand = pm.propertyType === 'LAND' || asset.type === 'land';
  const typeMeta = TYPE_META[asset.type] || TYPE_META['real_estate'];

  const addressLine = [
    pm.address?.street ?? pm.address ?? asset.location,
    pm.address?.city ?? pm.city,
    pm.address?.state ?? pm.state,
    pm.address?.zip ?? pm.zip,
  ].filter(Boolean).join(', ') || asset.location || '—';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          Back
        </button>

        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{asset.name || pm.name || 'Unnamed Property'}</h1>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500">
              <MapPin size={13} className="text-slate-400" />
              <span>{addressLine}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Pill className={`border text-xs ${isLand ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              {isLand ? <TreePine size={11} /> : <Building2 size={11} />}
              {typeMeta.label}
            </Pill>
          </div>
        </div>

        {/* Photo gallery */}
        <PhotoGallery asset={asset} />

        {/* Key stats bar */}
        <KeyStatsBar asset={asset} />

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* LEFT — tabbed content */}
          <div className="flex-1 min-w-0">
            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? 'border-b-2 border-blue-600 text-blue-700'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'Overview' && <OverviewTab asset={asset} />}
            {activeTab === 'Facts & Features' && <FactsTab asset={asset} />}
            {activeTab === 'Location' && <LocationTab asset={asset} />}
            {activeTab === 'On-Chain' && <OnChainTab asset={asset} />}
          </div>

          {/* RIGHT — sticky action panel */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0">
            <ActionPanel asset={asset} />
          </div>
        </div>

      </div>
    </div>
  );
}
