import { useState } from 'react';
import { MapPin, TrendingUp, Zap, DollarSign, Building2, Car, Package } from 'lucide-react';
import { MOCK_ASSETS, TYPE_META, calcYield, calcRentPaid, useLiveTick } from './rwaData';

const TYPE_ICON = { real_estate: Building2, vehicle: Car, commodity: Package };

// Fake SVG map — dots positioned proportionally within a Nigeria bounding box
// lat: 4.2–13.9  lng: 2.7–14.7
function toMapPct(lat, lng) {
  const x = ((lng - 2.7) / (14.7 - 2.7)) * 100;
  const y = (1 - (lat - 4.2) / (13.9 - 4.2)) * 100;
  return { x: Math.min(95, Math.max(5, x)), y: Math.min(95, Math.max(5, y)) };
}

function MapDot({ asset, selected, onClick }) {
  const { x, y } = toMapPct(asset.lat, asset.lng);
  const isRented = !!asset.renter;
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle cx={`${x}%`} cy={`${y}%`} r="10" fill={isRented ? '#10b981' : '#6b7280'} opacity="0.2" />
      <circle
        cx={`${x}%`} cy={`${y}%`} r="5"
        fill={isRented ? '#10b981' : '#6b7280'}
        stroke={selected ? '#fff' : 'transparent'}
        strokeWidth="2"
      />
      {isRented && (
        <circle cx={`${x}%`} cy={`${y}%`} r="8" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.6">
          <animate attributeName="r" values="5;12;5" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

export default function GodView() {
  const [selected, setSelected] = useState(MOCK_ASSETS[0]);
  const totalYield = useLiveTick(() => MOCK_ASSETS.reduce((s, a) => s + calcYield(a), 0));
  const rentPaid   = useLiveTick(() => MOCK_ASSETS.reduce((s, a) => s + calcRentPaid(a), 0));
  const activeCount = MOCK_ASSETS.filter(a => a.renter).length;

  const selYield    = useLiveTick(() => calcYield(selected));
  const selRentPaid = useLiveTick(() => calcRentPaid(selected));

  return (
    <div className="space-y-5">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Assets',   value: MOCK_ASSETS.length,          suffix: '',      color: 'text-blue-400',    Icon: Building2  },
          { label: 'Active Rentals', value: activeCount,                  suffix: ' live', color: 'text-emerald-400', Icon: Zap        },
          { label: 'Owner Yield',    value: totalYield.toFixed(2),        suffix: ' DOT', color: 'text-cyan-400',    Icon: TrendingUp },
          { label: 'Rent Received',  value: rentPaid.toFixed(2),          suffix: ' DOT', color: 'text-purple-400',  Icon: DollarSign },
        ].map(({ label, value, suffix, color, Icon }) => (
          <div key={label} className="card-glass p-4 border border-white/5">
            <div className={`flex items-center gap-1.5 text-xs mb-1 ${color}`}><Icon className="w-3.5 h-3.5" />{label}</div>
            <div className="font-mono text-white font-bold text-xl tabular-nums">{value}{suffix}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2 card-glass border border-white/5 p-4">
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" /> Live Asset Map
          </h3>
          <div className="relative rounded-lg overflow-hidden bg-surface-900 border border-white/5" style={{ height: 320 }}>
            {/* Grid lines */}
            <svg width="100%" height="100%" className="absolute inset-0 opacity-10">
              {[...Array(6)].map((_, i) => (
                <line key={`h${i}`} x1="0" y1={`${i*20}%`} x2="100%" y2={`${i*20}%`} stroke="#fff" strokeWidth="0.5" />
              ))}
              {[...Array(6)].map((_, i) => (
                <line key={`v${i}`} x1={`${i*20}%`} y1="0" x2={`${i*20}%`} y2="100%" stroke="#fff" strokeWidth="0.5" />
              ))}
            </svg>
            {/* Country outline hint */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white/5 text-7xl font-black select-none">NG</span>
            </div>
            {/* Asset dots */}
            <svg width="100%" height="100%" className="absolute inset-0">
              {MOCK_ASSETS.map(a => (
                <MapDot key={a.id} asset={a} selected={selected?.id === a.id} onClick={() => setSelected(a)} />
              ))}
            </svg>
            {/* Legend */}
            <div className="absolute bottom-3 left-3 flex gap-3 text-xs text-white/50">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Rented</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500" />Available</span>
            </div>
          </div>
        </div>

        {/* Selected asset detail */}
        <div className="card-glass border border-white/5 p-4 flex flex-col gap-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400" /> Selected Asset
          </h3>
          {selected ? (
            <>
              <div>
                <div className={`text-xs font-medium mb-0.5 ${TYPE_META[selected.type].color}`}>
                  {TYPE_META[selected.type].label}
                </div>
                <p className="text-white font-semibold text-sm">{selected.title}</p>
                <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{selected.location}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Owner yield</span>
                  <span className="font-mono text-cyan-300 tabular-nums">{selYield.toFixed(4)} DOT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Rent received</span>
                  <span className="font-mono text-purple-300 tabular-nums">{selRentPaid.toFixed(4)} DOT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Rate</span>
                  <span className="font-mono text-white/70">{selected.pricePerHour} DOT/hr</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Access</span>
                  <span className="text-white/70 text-right">{selected.accessType}</span>
                </div>
              </div>

              <div className={`rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                selected.renter
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-white/5 border border-white/10 text-white/40'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${selected.renter ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                {selected.renter ? `Rented by ${selected.renter}` : 'Available'}
              </div>

              {/* Asset list */}
              <div className="mt-auto space-y-1">
                {MOCK_ASSETS.map(a => {
                  const Icon = TYPE_ICON[a.type];
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        selected.id === a.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{a.title}</span>
                      {a.renter && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-white/30 text-sm">Click a dot on the map</p>
          )}
        </div>
      </div>
    </div>
  );
}
