import React, { useState, useRef } from "react";
import {
  UploadCloud,
  MapPin,
  Home,
  Bed,
  Bath,
  Maximize2,
  Calendar,
  DollarSign,
  Tag,
  FileText,
  ChevronDown,
  ChevronUp,
  Image,
  X,
  Plus,
  Thermometer,
  Wind,
  Zap,
  Car,
  Info,
  Building2,
  Layers,
  TreePine,
  Mountain,
} from "lucide-react";

// ─── Style constants ──────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border-none bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:ring-1 focus:ring-blue-300 outline-none";
const textareaCls =
  "w-full rounded-xl border-none bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:ring-1 focus:ring-blue-300 outline-none resize-none";

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = "estate" | "land";

interface FormState {
  // Shared / Overview
  price: string;
  zestimate: string;
  hoa: string;
  parcelNumber: string;
  // Estate overview
  beds: string;
  baths: string;
  sqft: string;
  yearBuilt: string;
  lotSize: string;
  pricePerSqft: string;
  estMonthlyPayment: string;
  propertyType: string;
  propertySubtype: string;
  // Address
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: string;
  lng: string;
  // Listing info
  mlsNumber: string;
  agent: string;
  source: string;
  // Description
  tags: string;
  description: string;
  // Interior
  bedroomsCount: string;
  fullBaths: string;
  halfBaths: string;
  primaryBedDim: string;
  bed2Dim: string;
  bed3Dim: string;
  kitchenDim: string;
  livingRoomDim: string;
  heating: string;
  cooling: string;
  appliances: string;
  interiorFeatures: string;
  // Construction
  homeType: string;
  archStyle: string;
  levels: string;
  stories: string;
  patioPorch: string;
  spa: string;
  materials: string;
  foundation: string;
  roof: string;
  condition: string;
  // Parking & Lot
  parkingFeatures: string;
  carport: string;
  uncoveredSpaces: string;
  lotSizeAcres: string;
  lotDimensions: string;
  lotFeatures: string;
  otherEquipment: string;
  // Land overview
  zoning: string;
  landType: string;
  // Land details
  topography: string;
  soilType: string;
  roadAccess: string;
  utilities: string;
  waterSource: string;
  floodZone: string;
  treeCover: string;
  surveyAvailable: string;
  // Land use
  landUseHistory: string;
  landNotes: string;
  // RWA Yield
  yieldTarget: string;
  monthlyRentalIncome: string;
  annualLandLeaseIncome: string;
  appreciationNotes: string;
}

const DEFAULT_FORM: FormState = {
  price: "",
  zestimate: "",
  hoa: "",
  parcelNumber: "",
  beds: "",
  baths: "",
  sqft: "",
  yearBuilt: "",
  lotSize: "",
  pricePerSqft: "",
  estMonthlyPayment: "",
  propertyType: "",
  propertySubtype: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  lat: "",
  lng: "",
  mlsNumber: "",
  agent: "",
  source: "",
  tags: "",
  description: "",
  bedroomsCount: "",
  fullBaths: "",
  halfBaths: "",
  primaryBedDim: "",
  bed2Dim: "",
  bed3Dim: "",
  kitchenDim: "",
  livingRoomDim: "",
  heating: "",
  cooling: "",
  appliances: "",
  interiorFeatures: "",
  homeType: "",
  archStyle: "",
  levels: "",
  stories: "",
  patioPorch: "",
  spa: "",
  materials: "",
  foundation: "",
  roof: "",
  condition: "",
  parkingFeatures: "",
  carport: "",
  uncoveredSpaces: "",
  lotSizeAcres: "",
  lotDimensions: "",
  lotFeatures: "",
  otherEquipment: "",
  zoning: "",
  landType: "",
  topography: "",
  soilType: "",
  roadAccess: "",
  utilities: "",
  waterSource: "",
  floodZone: "",
  treeCover: "",
  surveyAvailable: "",
  landUseHistory: "",
  landNotes: "",
  yieldTarget: "",
  monthlyRentalIncome: "",
  annualLandLeaseIncome: "",
  appreciationNotes: "",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, accent = "bg-blue-600", children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent} text-white shrink-0`}>
          {icon}
        </span>
        <span className="flex-1 text-sm font-semibold text-slate-800">{title}</span>
        {open ? (
          <ChevronUp size={16} className="text-slate-400" />
        ) : (
          <ChevronDown size={16} className="text-slate-400" />
        )}
      </button>
      {open && <div className="px-5 pb-5 pt-1 grid grid-cols-1 gap-4">{children}</div>}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  col?: string;
}

function Field({ label, children, col = "" }: FieldProps) {
  return (
    <div className={col}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function ThreeCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-3">{children}</div>;
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

interface PhotoUploadProps {
  photos: string[];
  coverIndex: number;
  onAdd: (files: FileList) => void;
  onRemove: (i: number) => void;
  onSetCover: (i: number) => void;
}

function PhotoUpload({ photos, coverIndex, onAdd, onRemove, onSetCover }: PhotoUploadProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        {photos.map((src, i) => (
          <div key={i} className="relative rounded-xl overflow-hidden aspect-video bg-slate-100 group">
            <img src={src} alt="" className="w-full h-full object-cover" />
            {i === coverIndex && (
              <span className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Cover
              </span>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              {i !== coverIndex && (
                <button
                  type="button"
                  onClick={() => onSetCover(i)}
                  className="bg-white/90 text-slate-800 text-[10px] font-semibold px-2 py-1 rounded-lg"
                >
                  Set Cover
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="bg-red-500 text-white rounded-full p-1"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="aspect-video rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 hover:border-blue-300 hover:bg-blue-50 transition-colors"
        >
          <Plus size={18} className="text-slate-400" />
          <span className="text-[10px] text-slate-400 font-medium">Add Photo</span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50 transition-colors"
      >
        <UploadCloud size={18} />
        Upload Photos
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onAdd(e.target.files)}
      />
    </div>
  );
}

// ─── Evidence Bundle ──────────────────────────────────────────────────────────

interface EvidenceUploadProps {
  files: File[];
  onAdd: (fl: FileList) => void;
  onRemove: (i: number) => void;
}

function EvidenceUpload({ files, onAdd, onRemove }: EvidenceUploadProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      {files.length > 0 && (
        <ul className="mb-3 space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2 text-sm text-slate-700">
              <span className="truncate max-w-[80%]">{f.name}</span>
              <button type="button" onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-500">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50 transition-colors"
      >
        <UploadCloud size={18} />
        Upload Documents
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onAdd(e.target.files)}
      />
    </div>
  );
}

// ─── Google Maps Embed ────────────────────────────────────────────────────────

function MapEmbed({ street, city, state, zip, lat, lng }: {
  street: string; city: string; state: string; zip: string; lat: string; lng: string;
}) {
  const query = lat && lng
    ? `${lat},${lng}`
    : encodeURIComponent(`${street} ${city} ${state} ${zip}`.trim());

  if (!query || query === encodeURIComponent("   ")) return null;

  const src = `https://maps.google.com/maps?q=${query}&output=embed&z=15`;

  return (
    <div className="rounded-xl overflow-hidden border border-slate-100 mt-2">
      <iframe
        title="Property Location"
        src={src}
        width="100%"
        height="220"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

// ─── Shared Sections ──────────────────────────────────────────────────────────

function AddressSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Address & Location" icon={<MapPin size={15} />} accent="bg-blue-600">
      <TwoCol>
        <Field label="Street">
          <input className={inputCls} value={form.street} onChange={(e) => onChange("street", e.target.value)} placeholder="123 Main St" />
        </Field>
        <Field label="City">
          <input className={inputCls} value={form.city} onChange={(e) => onChange("city", e.target.value)} placeholder="City" />
        </Field>
      </TwoCol>
      <ThreeCol>
        <Field label="State">
          <input className={inputCls} value={form.state} onChange={(e) => onChange("state", e.target.value)} placeholder="CA" />
        </Field>
        <Field label="ZIP">
          <input className={inputCls} value={form.zip} onChange={(e) => onChange("zip", e.target.value)} placeholder="90210" />
        </Field>
        <Field label="Parcel #">
          <input className={inputCls} value={form.parcelNumber} onChange={(e) => onChange("parcelNumber", e.target.value)} placeholder="APN" />
        </Field>
      </ThreeCol>
      <TwoCol>
        <Field label="Latitude (optional)">
          <input className={inputCls} value={form.lat} onChange={(e) => onChange("lat", e.target.value)} placeholder="34.0522" />
        </Field>
        <Field label="Longitude (optional)">
          <input className={inputCls} value={form.lng} onChange={(e) => onChange("lng", e.target.value)} placeholder="-118.2437" />
        </Field>
      </TwoCol>
      <MapEmbed
        street={form.street}
        city={form.city}
        state={form.state}
        zip={form.zip}
        lat={form.lat}
        lng={form.lng}
      />
    </Section>
  );
}

function ListingInfoSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Listing Info" icon={<Tag size={15} />} accent="bg-violet-600">
      <ThreeCol>
        <Field label="MLS #">
          <input className={inputCls} value={form.mlsNumber} onChange={(e) => onChange("mlsNumber", e.target.value)} placeholder="MLS-12345" />
        </Field>
        <Field label="Agent">
          <input className={inputCls} value={form.agent} onChange={(e) => onChange("agent", e.target.value)} placeholder="Agent name" />
        </Field>
        <Field label="Source">
          <input className={inputCls} value={form.source} onChange={(e) => onChange("source", e.target.value)} placeholder="Zillow / MLS" />
        </Field>
      </ThreeCol>
    </Section>
  );
}

function DescriptionSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Description" icon={<FileText size={15} />} accent="bg-slate-600">
      <Field label="Special Tags (comma-separated)">
        <input className={inputCls} value={form.tags} onChange={(e) => onChange("tags", e.target.value)} placeholder="Pool, Ocean View, Corner Lot…" />
      </Field>
      <Field label="Description">
        <textarea className={textareaCls} rows={5} value={form.description} onChange={(e) => onChange("description", e.target.value)} placeholder="Describe the property…" />
      </Field>
    </Section>
  );
}

function RWAYieldSection({
  form,
  onChange,
  category,
}: {
  form: FormState;
  onChange: (k: keyof FormState, v: string) => void;
  category: Category;
}) {
  return (
    <Section title="RWA Yield Parameters" icon={<Zap size={15} />} accent="bg-amber-500">
      <TwoCol>
        <Field label="Yield Target (%)">
          <input className={inputCls} type="number" value={form.yieldTarget} onChange={(e) => onChange("yieldTarget", e.target.value)} placeholder="8.5" />
        </Field>
        {category === "estate" ? (
          <Field label="Monthly Rental Income ($)">
            <input className={inputCls} type="number" value={form.monthlyRentalIncome} onChange={(e) => onChange("monthlyRentalIncome", e.target.value)} placeholder="3500" />
          </Field>
        ) : (
          <Field label="Annual Land Lease Income ($)">
            <input className={inputCls} type="number" value={form.annualLandLeaseIncome} onChange={(e) => onChange("annualLandLeaseIncome", e.target.value)} placeholder="12000" />
          </Field>
        )}
      </TwoCol>
      {category === "land" && (
        <Field label="Appreciation Notes">
          <textarea className={textareaCls} rows={3} value={form.appreciationNotes} onChange={(e) => onChange("appreciationNotes", e.target.value)} placeholder="Notes on land appreciation potential…" />
        </Field>
      )}
    </Section>
  );
}

// ─── Estate Sections ──────────────────────────────────────────────────────────

function EstateOverviewSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Overview" icon={<Info size={15} />} accent="bg-blue-600">
      <TwoCol>
        <Field label="List Price ($)">
          <input className={inputCls} type="number" value={form.price} onChange={(e) => onChange("price", e.target.value)} placeholder="850000" />
        </Field>
        <Field label="Zestimate ($)">
          <input className={inputCls} type="number" value={form.zestimate} onChange={(e) => onChange("zestimate", e.target.value)} placeholder="860000" />
        </Field>
      </TwoCol>
      <ThreeCol>
        <Field label="Beds">
          <input className={inputCls} type="number" value={form.beds} onChange={(e) => onChange("beds", e.target.value)} placeholder="4" />
        </Field>
        <Field label="Baths">
          <input className={inputCls} type="number" value={form.baths} onChange={(e) => onChange("baths", e.target.value)} placeholder="3" />
        </Field>
        <Field label="Sqft">
          <input className={inputCls} type="number" value={form.sqft} onChange={(e) => onChange("sqft", e.target.value)} placeholder="2400" />
        </Field>
      </ThreeCol>
      <ThreeCol>
        <Field label="Year Built">
          <input className={inputCls} type="number" value={form.yearBuilt} onChange={(e) => onChange("yearBuilt", e.target.value)} placeholder="1998" />
        </Field>
        <Field label="Lot Size (sqft)">
          <input className={inputCls} type="number" value={form.lotSize} onChange={(e) => onChange("lotSize", e.target.value)} placeholder="6500" />
        </Field>
        <Field label="Price / Sqft ($)">
          <input className={inputCls} type="number" value={form.pricePerSqft} onChange={(e) => onChange("pricePerSqft", e.target.value)} placeholder="354" />
        </Field>
      </ThreeCol>
      <TwoCol>
        <Field label="HOA ($/mo)">
          <input className={inputCls} type="number" value={form.hoa} onChange={(e) => onChange("hoa", e.target.value)} placeholder="250" />
        </Field>
        <Field label="Est. Monthly Payment ($)">
          <input className={inputCls} type="number" value={form.estMonthlyPayment} onChange={(e) => onChange("estMonthlyPayment", e.target.value)} placeholder="4200" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Property Type">
          <input className={inputCls} value={form.propertyType} onChange={(e) => onChange("propertyType", e.target.value)} placeholder="Single Family" />
        </Field>
        <Field label="Subtype">
          <input className={inputCls} value={form.propertySubtype} onChange={(e) => onChange("propertySubtype", e.target.value)} placeholder="Detached" />
        </Field>
      </TwoCol>
    </Section>
  );
}

function InteriorSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Interior Details" icon={<Bed size={15} />} accent="bg-indigo-600" defaultOpen={false}>
      <ThreeCol>
        <Field label="Bedrooms">
          <input className={inputCls} type="number" value={form.bedroomsCount} onChange={(e) => onChange("bedroomsCount", e.target.value)} placeholder="4" />
        </Field>
        <Field label="Full Baths">
          <input className={inputCls} type="number" value={form.fullBaths} onChange={(e) => onChange("fullBaths", e.target.value)} placeholder="2" />
        </Field>
        <Field label="Half Baths">
          <input className={inputCls} type="number" value={form.halfBaths} onChange={(e) => onChange("halfBaths", e.target.value)} placeholder="1" />
        </Field>
      </ThreeCol>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Room Dimensions</p>
      <TwoCol>
        <Field label="Primary Bedroom">
          <input className={inputCls} value={form.primaryBedDim} onChange={(e) => onChange("primaryBedDim", e.target.value)} placeholder='14" × 16"' />
        </Field>
        <Field label="Bedroom 2">
          <input className={inputCls} value={form.bed2Dim} onChange={(e) => onChange("bed2Dim", e.target.value)} placeholder='11" × 12"' />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Bedroom 3">
          <input className={inputCls} value={form.bed3Dim} onChange={(e) => onChange("bed3Dim", e.target.value)} placeholder='10" × 11"' />
        </Field>
        <Field label="Kitchen">
          <input className={inputCls} value={form.kitchenDim} onChange={(e) => onChange("kitchenDim", e.target.value)} placeholder='12" × 14"' />
        </Field>
      </TwoCol>
      <Field label="Living Room">
        <input className={inputCls} value={form.livingRoomDim} onChange={(e) => onChange("livingRoomDim", e.target.value)} placeholder='18" × 20"' />
      </Field>
      <TwoCol>
        <Field label="Heating">
          <input className={inputCls} value={form.heating} onChange={(e) => onChange("heating", e.target.value)} placeholder="Central, Gas" />
        </Field>
        <Field label="Cooling">
          <input className={inputCls} value={form.cooling} onChange={(e) => onChange("cooling", e.target.value)} placeholder="Central Air" />
        </Field>
      </TwoCol>
      <Field label="Appliances">
        <input className={inputCls} value={form.appliances} onChange={(e) => onChange("appliances", e.target.value)} placeholder="Dishwasher, Refrigerator, Range…" />
      </Field>
      <Field label="Interior Features">
        <textarea className={textareaCls} rows={3} value={form.interiorFeatures} onChange={(e) => onChange("interiorFeatures", e.target.value)} placeholder="Hardwood floors, vaulted ceilings…" />
      </Field>
    </Section>
  );
}

function ConstructionSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Construction" icon={<Building2 size={15} />} accent="bg-cyan-600" defaultOpen={false}>
      <TwoCol>
        <Field label="Home Type">
          <input className={inputCls} value={form.homeType} onChange={(e) => onChange("homeType", e.target.value)} placeholder="Single Family" />
        </Field>
        <Field label="Architectural Style">
          <input className={inputCls} value={form.archStyle} onChange={(e) => onChange("archStyle", e.target.value)} placeholder="Contemporary" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Levels">
          <input className={inputCls} value={form.levels} onChange={(e) => onChange("levels", e.target.value)} placeholder="Two" />
        </Field>
        <Field label="Stories">
          <input className={inputCls} type="number" value={form.stories} onChange={(e) => onChange("stories", e.target.value)} placeholder="2" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Patio / Porch">
          <input className={inputCls} value={form.patioPorch} onChange={(e) => onChange("patioPorch", e.target.value)} placeholder="Covered Patio" />
        </Field>
        <Field label="Spa">
          <input className={inputCls} value={form.spa} onChange={(e) => onChange("spa", e.target.value)} placeholder="None / Hot Tub" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Exterior Materials">
          <input className={inputCls} value={form.materials} onChange={(e) => onChange("materials", e.target.value)} placeholder="Stucco, Wood" />
        </Field>
        <Field label="Foundation">
          <input className={inputCls} value={form.foundation} onChange={(e) => onChange("foundation", e.target.value)} placeholder="Slab" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Roof">
          <input className={inputCls} value={form.roof} onChange={(e) => onChange("roof", e.target.value)} placeholder="Composition Shingle" />
        </Field>
        <Field label="Condition">
          <input className={inputCls} value={form.condition} onChange={(e) => onChange("condition", e.target.value)} placeholder="Good" />
        </Field>
      </TwoCol>
    </Section>
  );
}

function ParkingLotSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Parking & Lot" icon={<Car size={15} />} accent="bg-teal-600" defaultOpen={false}>
      <TwoCol>
        <Field label="Parking Features">
          <input className={inputCls} value={form.parkingFeatures} onChange={(e) => onChange("parkingFeatures", e.target.value)} placeholder="Attached Garage, 2 spaces" />
        </Field>
        <Field label="Carport Spaces">
          <input className={inputCls} type="number" value={form.carport} onChange={(e) => onChange("carport", e.target.value)} placeholder="0" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Uncovered Spaces">
          <input className={inputCls} type="number" value={form.uncoveredSpaces} onChange={(e) => onChange("uncoveredSpaces", e.target.value)} placeholder="2" />
        </Field>
        <Field label="Lot Size (acres)">
          <input className={inputCls} type="number" value={form.lotSizeAcres} onChange={(e) => onChange("lotSizeAcres", e.target.value)} placeholder="0.15" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Lot Dimensions">
          <input className={inputCls} value={form.lotDimensions} onChange={(e) => onChange("lotDimensions", e.target.value)} placeholder='65" × 100"' />
        </Field>
        <Field label="Other Equipment">
          <input className={inputCls} value={form.otherEquipment} onChange={(e) => onChange("otherEquipment", e.target.value)} placeholder="Solar Panels, Generator" />
        </Field>
      </TwoCol>
      <Field label="Lot Features">
        <textarea className={textareaCls} rows={2} value={form.lotFeatures} onChange={(e) => onChange("lotFeatures", e.target.value)} placeholder="Corner lot, cul-de-sac, landscaped…" />
      </Field>
    </Section>
  );
}

// ─── Land Sections ────────────────────────────────────────────────────────────

function LandOverviewSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Land Overview" icon={<Info size={15} />} accent="bg-emerald-600">
      <TwoCol>
        <Field label="List Price ($)">
          <input className={inputCls} type="number" value={form.price} onChange={(e) => onChange("price", e.target.value)} placeholder="250000" />
        </Field>
        <Field label="Zestimate ($)">
          <input className={inputCls} type="number" value={form.zestimate} onChange={(e) => onChange("zestimate", e.target.value)} placeholder="255000" />
        </Field>
      </TwoCol>
      <ThreeCol>
        <Field label="Lot Size (acres)">
          <input className={inputCls} type="number" value={form.lotSizeAcres} onChange={(e) => onChange("lotSizeAcres", e.target.value)} placeholder="5.2" />
        </Field>
        <Field label="Lot Dimensions">
          <input className={inputCls} value={form.lotDimensions} onChange={(e) => onChange("lotDimensions", e.target.value)} placeholder='300" × 750"' />
        </Field>
        <Field label="HOA ($/yr)">
          <input className={inputCls} type="number" value={form.hoa} onChange={(e) => onChange("hoa", e.target.value)} placeholder="0" />
        </Field>
      </ThreeCol>
      <TwoCol>
        <Field label="Zoning">
          <input className={inputCls} value={form.zoning} onChange={(e) => onChange("zoning", e.target.value)} placeholder="A-1 Agricultural" />
        </Field>
        <Field label="Land Type">
          <input className={inputCls} value={form.landType} onChange={(e) => onChange("landType", e.target.value)} placeholder="Agricultural / Residential" />
        </Field>
      </TwoCol>
    </Section>
  );
}

function LandDetailsSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Land Details" icon={<Mountain size={15} />} accent="bg-emerald-700" defaultOpen={false}>
      <TwoCol>
        <Field label="Topography">
          <input className={inputCls} value={form.topography} onChange={(e) => onChange("topography", e.target.value)} placeholder="Flat / Rolling / Hilly" />
        </Field>
        <Field label="Soil Type">
          <input className={inputCls} value={form.soilType} onChange={(e) => onChange("soilType", e.target.value)} placeholder="Loam / Clay / Sandy" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Road Access">
          <input className={inputCls} value={form.roadAccess} onChange={(e) => onChange("roadAccess", e.target.value)} placeholder="Paved / Gravel / None" />
        </Field>
        <Field label="Utilities">
          <input className={inputCls} value={form.utilities} onChange={(e) => onChange("utilities", e.target.value)} placeholder="Electric, Water, Sewer" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Water Source">
          <input className={inputCls} value={form.waterSource} onChange={(e) => onChange("waterSource", e.target.value)} placeholder="Well / Municipal / None" />
        </Field>
        <Field label="Flood Zone">
          <input className={inputCls} value={form.floodZone} onChange={(e) => onChange("floodZone", e.target.value)} placeholder="Zone X / AE" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Tree Cover">
          <input className={inputCls} value={form.treeCover} onChange={(e) => onChange("treeCover", e.target.value)} placeholder="Sparse / Moderate / Dense" />
        </Field>
        <Field label="Survey Available">
          <select className={inputCls} value={form.surveyAvailable} onChange={(e) => onChange("surveyAvailable", e.target.value)}>
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="pending">Pending</option>
          </select>
        </Field>
      </TwoCol>
    </Section>
  );
}

function LandUseSection({ form, onChange }: { form: FormState; onChange: (k: keyof FormState, v: string) => void }) {
  return (
    <Section title="Land Use" icon={<Layers size={15} />} accent="bg-lime-600" defaultOpen={false}>
      <Field label="Land Use History">
        <textarea className={textareaCls} rows={3} value={form.landUseHistory} onChange={(e) => onChange("landUseHistory", e.target.value)} placeholder="Previously farmed, timber harvested…" />
      </Field>
      <Field label="Additional Notes">
        <textarea className={textareaCls} rows={3} value={form.landNotes} onChange={(e) => onChange("landNotes", e.target.value)} placeholder="Easements, restrictions, development potential…" />
      </Field>
    </Section>
  );
}

// ─── Category Picker ──────────────────────────────────────────────────────────

interface CategoryPickerProps {
  selected: Category;
  onSelect: (c: Category) => void;
}

function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {/* Estate */}
      <button
        type="button"
        onClick={() => onSelect("estate")}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 px-6 py-6 transition-all ${
          selected === "estate"
            ? "border-blue-500 bg-blue-50 shadow-md"
            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
        }`}
      >
        <span
          className={`flex items-center justify-center w-12 h-12 rounded-xl ${
            selected === "estate" ? "bg-blue-600" : "bg-slate-100"
          } transition-colors`}
        >
          <Home size={22} className={selected === "estate" ? "text-white" : "text-slate-500"} />
        </span>
        <span className={`text-sm font-bold ${selected === "estate" ? "text-blue-700" : "text-slate-700"}`}>
          Estate
        </span>
        <span className="text-[11px] text-slate-500 text-center leading-snug">
          Built property — house, condo, townhome
        </span>
      </button>

      {/* Land */}
      <button
        type="button"
        onClick={() => onSelect("land")}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 px-6 py-6 transition-all ${
          selected === "land"
            ? "border-emerald-500 bg-emerald-50 shadow-md"
            : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
        }`}
      >
        <span
          className={`flex items-center justify-center w-12 h-12 rounded-xl ${
            selected === "land" ? "bg-emerald-600" : "bg-slate-100"
          } transition-colors`}
        >
          <TreePine size={22} className={selected === "land" ? "text-white" : "text-slate-500"} />
        </span>
        <span className={`text-sm font-bold ${selected === "land" ? "text-emerald-700" : "text-slate-700"}`}>
          Land
        </span>
        <span className="text-[11px] text-slate-500 text-center leading-snug">
          Bare land — lot, acreage, farm, timber
        </span>
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PropertyMint() {
  const [category, setCategory] = useState<Category>("estate");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [photos, setPhotos] = useState<string[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleCategorySelect = (c: Category) => {
    if (c === category) return;
    setCategory(c);
    setForm(DEFAULT_FORM);
    setPhotos([]);
    setCoverIndex(0);
    setEvidenceFiles([]);
    setSubmitted(false);
  };

  const onChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddPhotos = (files: FileList) => {
    const urls = Array.from(files).map((f) => URL.createObjectURL(f));
    setPhotos((prev) => [...prev, ...urls]);
  };

  const handleRemovePhoto = (i: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    if (coverIndex >= i && coverIndex > 0) setCoverIndex((c) => c - 1);
  };

  const handleAddEvidence = (files: FileList) => {
    setEvidenceFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const handleRemoveEvidence = (i: number) => {
    setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap size={28} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Listing Submitted!</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your {category === "estate" ? "property" : "land"} has been submitted for RWA tokenization on Stellar.
          </p>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setForm(DEFAULT_FORM);
              setPhotos([]);
              setCoverIndex(0);
              setEvidenceFiles([]);
            }}
            className="w-full rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-xl"
          >
            List Another Property
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-3">
            <Zap size={12} />
            Stellar RWA
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">List a Property</h1>
          <p className="text-sm text-slate-500 mt-1">Tokenize real-world property as an RWA twin on Stellar</p>
        </div>

        {/* Category Picker */}
        <CategoryPicker selected={category} onSelect={handleCategorySelect} />

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photos */}
          <Section title="Property Photos" icon={<Image size={15} />} accent={category === "land" ? "bg-emerald-600" : "bg-blue-600"}>
            <PhotoUpload
              photos={photos}
              coverIndex={coverIndex}
              onAdd={handleAddPhotos}
              onRemove={handleRemovePhoto}
              onSetCover={setCoverIndex}
            />
          </Section>

          {/* Category-specific sections */}
          {category === "estate" ? (
            <>
              <EstateOverviewSection form={form} onChange={onChange} />
              <AddressSection form={form} onChange={onChange} />
              <ListingInfoSection form={form} onChange={onChange} />
              <DescriptionSection form={form} onChange={onChange} />
              <InteriorSection form={form} onChange={onChange} />
              <ConstructionSection form={form} onChange={onChange} />
              <ParkingLotSection form={form} onChange={onChange} />
            </>
          ) : (
            <>
              <LandOverviewSection form={form} onChange={onChange} />
              <AddressSection form={form} onChange={onChange} />
              <ListingInfoSection form={form} onChange={onChange} />
              <DescriptionSection form={form} onChange={onChange} />
              <LandDetailsSection form={form} onChange={onChange} />
              <LandUseSection form={form} onChange={onChange} />
            </>
          )}

          {/* RWA Yield */}
          <RWAYieldSection form={form} onChange={onChange} category={category} />

          {/* Evidence Bundle */}
          <Section title="Private Evidence Bundle" icon={<FileText size={15} />} accent="bg-rose-600" defaultOpen={false}>
            <p className="text-xs text-slate-500">
              Upload private supporting documents (title deed, appraisal, survey, etc.). These are encrypted and only shared with verified investors.
            </p>
            <EvidenceUpload
              files={evidenceFiles}
              onAdd={handleAddEvidence}
              onRemove={handleRemoveEvidence}
            />
          </Section>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-xl disabled:opacity-60 disabled:cursor-not-allowed transition-opacity mt-2"
          >
            {isSubmitting ? "Submitting…" : "Mint RWA Twin on Stellar"}
          </button>
        </form>
      </div>
    </div>
  );
}
