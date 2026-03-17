import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ethers } from 'ethers';
import {
  BadgeCheck,
  Building2,
  Car,
  CheckCircle2,
  Clock3,
  Link2,
  Package,
  PlayCircle,
  Plus,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Settings2,
  Wallet,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { appName, paymentTokenDecimals, paymentTokenSymbol } from '../contactInfo';
import {
  fetchRwaAssets,
  fetchRwaAsset,
  fetchRwaActivity,
  mintRwaAsset,
  pinRwaMetadata,
  verifyRwaAsset,
} from '../services/rwaApi';
import { useProtocolCatalog } from '../hooks/useProtocolCatalog';
import {
  approveAndCreateAssetYieldStream,
  claimAssetYield,
  flashAdvanceAssetYield,
  parseTokenAmount,
  readClaimableYield,
  setAssetCompliance,
  setAssetStreamFreeze,
  updateAssetMetadataOnChain,
  updateAssetVerificationTag,
} from '../services/rwaContractApi';
import {
  buildRentalStreamMetadata,
  mapApiAssetToUiAsset,
  PORTFOLIO_ASSETS,
  TYPE_TO_CHAIN_ASSET_TYPE,
  TYPE_META,
  verifyAssetRecord,
} from './rwa/rwaData';

const TYPE_ICONS = {
  real_estate: Building2,
  vehicle: Car,
  commodity: Package,
};

const STUDIO_TABS = [
  {
    key: 'mint',
    label: 'Minting',
    description: 'Create the digital twin, metadata, and verification payload.',
    Icon: Plus,
  },
  {
    key: 'verify',
    label: 'Verify',
    description: 'Check QR, NFC, CID, and registry history in one pass.',
    Icon: ScanSearch,
  },
  {
    key: 'rent',
    label: 'Rent Assets',
    description: 'Browse rentable assets and start a payment stream.',
    Icon: PlayCircle,
  },
  {
    key: 'active',
    label: 'Active Rentals',
    description: 'Track elapsed time, refund left, and end streams quickly.',
    Icon: Clock3,
  },
  {
    key: 'portfolio',
    label: 'My Portfolio',
    description: 'Review yield-bearing assets and their current stream state.',
    Icon: Wallet,
  },
  {
    key: 'workspace',
    label: 'Asset Workspace',
    description: 'Inspect one asset deeply and run contract-backed actions.',
    Icon: Settings2,
  },
];

const MINT_FORM_DEFAULT = {
  type: 'real_estate',
  name: 'Lekki Duplex 204',
  description: 'Three-bedroom unit with attached rental income and on-chain verification history.',
  location: 'Lagos, Nigeria',
  monthlyYieldTarget: '4500',
  imageUrl: 'https://...',
  tagSeed: 'Tag serial, NFC UID, or internal reference',
};

function buildAssetMetadata(form) {
  return {
    name: form.name.trim() || 'Untitled rental asset',
    description: form.description.trim() || 'Rental asset prepared in Stream Engine.',
    image: form.imageUrl.trim(),
    assetType: form.type,
    location: form.location.trim() || 'Undisclosed',
    monthlyYieldTarget: Number(form.monthlyYieldTarget || 0),
    accessMechanism: 'QR / NFC verification payload',
    tagSeed: form.tagSeed.trim(),
    properties: {
      location: form.location.trim() || 'Undisclosed',
      accessMechanism: 'QR / NFC verification payload',
    },
    attributes: [
      { trait_type: 'Asset Type', value: form.type },
      { trait_type: 'Asset Class', value: TYPE_META[form.type]?.label || 'Rental Asset' },
      { trait_type: 'Location', value: form.location.trim() || 'Undisclosed' },
      { trait_type: 'Monthly Yield Target', value: Number(form.monthlyYieldTarget || 0) },
    ],
  };
}

function formatMoney(value, maximumFractionDigits = 4) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })}`;
}

function formatPerHour(value) {
  return `${formatMoney(value, 6)}/hr`;
}

function formatPerSecond(value) {
  return `${formatMoney(value, 4)} / sec`;
}

function formatMinutes(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function calculateRentalMetrics(rental, nowMs) {
  const elapsedMs = Math.max(0, nowMs - rental.startedAt);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const currentCost = Math.min(rental.totalBudget, rental.asset.pricePerHour * elapsedHours);
  const refund = Math.max(0, rental.totalBudget - currentCost);
  const budgetUsed = rental.totalBudget > 0 ? Math.min(100, (currentCost / rental.totalBudget) * 100) : 0;
  const remainingHours = rental.asset.pricePerHour > 0 ? refund / rental.asset.pricePerHour : 0;

  return {
    elapsedMs,
    currentCost,
    refund,
    budgetUsed,
    remainingHours,
  };
}

function setTabParam(setSearchParams, nextTab) {
  setSearchParams({ tab: nextTab });
}

function StudioSidebar({ activeTab, setActiveTab, walletAddress, activeRentals, indexedAssetCount, studioMintCount, onConnect }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
      <div className="card-glass border border-white/10 p-4">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">RWA Studio</div>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-white">Mint, verify, rent, and manage.</h1>
        <p className="mt-3 text-sm leading-6 text-white/62">
          The asset owner keeps the NFT and financial rights. Renters stream payment for physical access, and buyers
          can verify provenance before they move.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Indexed Assets</div>
            <div className="mt-2 text-2xl font-black text-white">{indexedAssetCount}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Studio Mints</div>
            <div className="mt-2 text-2xl font-black text-cyan-300">{studioMintCount}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Active Rentals</div>
            <div className="mt-2 text-2xl font-black text-emerald-300">{activeRentals.length}</div>
          </div>
        </div>
      </div>

      <div className="card-glass border border-white/10 p-3">
        <div className="space-y-2">
          {STUDIO_TABS.map(({ key, label, description, Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                  isActive
                    ? 'border-flowpay-500/50 bg-flowpay-500/15'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/7'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-xl p-2 ${isActive ? 'bg-flowpay-500/20 text-cyan-200' : 'bg-white/8 text-white/50'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-white/78'}`}>{label}</div>
                    <div className="mt-1 text-xs leading-5 text-white/48">{description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-glass border border-white/10 p-4">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Wallet Status</div>
        {walletAddress ? (
          <div className="mt-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Wallet ready
            </div>
            <div className="mt-3 rounded-2xl bg-white/5 p-3 font-mono text-xs text-white/65">
              {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-white/58">Connect your wallet to mint new assets or start rental streams.</p>
            <button type="button" className="btn-primary w-full justify-center" onClick={onConnect}>
              Connect Wallet
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function MintPanel({
  walletAddress,
  onConnect,
  onMint,
  onPrepareMetadata,
  lastMint,
  isMinting,
  isPreparingMetadata,
  preparedMetadata,
  isRegistryLoading,
  registryAssets,
  registryFilter,
  setRegistryFilter,
  onOpenVerify,
  onOpenWorkspace,
}) {
  const [form, setForm] = useState(MINT_FORM_DEFAULT);
  const previewName = form.name.trim() || 'Untitled rental asset';
  const previewDescription = form.description.trim() || 'Describe the unit, tenant profile, and income model.';
  const previewLocation = form.location.trim() || 'Undisclosed';
  const previewYield = Number(form.monthlyYieldTarget || 0);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onMint(form);
  };

  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-6">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">RWA Studio</div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
          Mint rental assets and prepare them for trading and verification.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">
          Start here to create the asset NFT, attach IPFS metadata, and generate the QR / NFC verification payload.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            {
              title: '1. Mint the digital twin',
              body: 'Create the rental asset NFT and pin standard metadata to IPFS.',
            },
            {
              title: '2. Fund the yield stream',
              body: 'Attach the cash-flow stream so ownership and yield stay coupled.',
            },
            {
              title: '3. Share the verification payload',
              body: 'Use the generated QR / NFC payload for provenance and authenticity checks.',
            },
          ].map((step) => (
            <div key={step.title} className="rounded-2xl bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">{step.title}</div>
              <div className="mt-2 text-sm leading-6 text-white/55">{step.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <form onSubmit={handleSubmit} className="card-glass border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Issuer Form</div>
              <h3 className="mt-2 text-xl font-black tracking-tight text-white">Mint a rental asset in one pass.</h3>
            </div>
            {walletAddress ? (
              <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                Wallet ready
              </div>
            ) : (
              <button type="button" className="btn-default text-sm" onClick={onConnect}>
                Connect wallet
              </button>
            )}
          </div>

          <p className="mt-3 text-sm leading-6 text-white/58">
            The backend handles IPFS metadata and the hub mints the asset NFT. You only need the asset story and the
            tag seed you want to bind to QR or NFC.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <div className="mb-2 text-sm text-white/70">Asset type</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(TYPE_META).map(([key, meta]) => {
                  const Icon = TYPE_ICONS[key];
                  const active = form.type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateField('type', key)}
                      className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                        active
                          ? `${meta.border} bg-gradient-to-br ${meta.gradient}`
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className={`inline-flex rounded-xl p-2 ${active ? 'bg-white/10' : 'bg-white/8'} ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">{meta.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">Asset name</span>
              <input
                className="input-default w-full"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Lekki Duplex 204"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">What should a buyer understand immediately?</span>
              <textarea
                rows={4}
                className="input-default w-full resize-none"
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Three-bedroom unit with attached rental income and on-chain verification history."
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">Location</span>
                <input
                  className="input-default w-full"
                  value={form.location}
                  onChange={(event) => updateField('location', event.target.value)}
                  placeholder="Lagos, Nigeria"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">Monthly yield target ({paymentTokenSymbol})</span>
                <input
                  type="number"
                  min="0"
                  className="input-default w-full"
                  value={form.monthlyYieldTarget}
                  onChange={(event) => updateField('monthlyYieldTarget', event.target.value)}
                  placeholder="4500"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">Image URL</span>
              <input
                className="input-default w-full"
                value={form.imageUrl}
                onChange={(event) => updateField('imageUrl', event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">QR / NFC tag seed</span>
              <input
                className="input-default w-full"
                value={form.tagSeed}
                onChange={(event) => updateField('tagSeed', event.target.value)}
                placeholder="Tag serial, NFC UID, or internal reference"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" className="btn-default w-full justify-center" onClick={() => onPrepareMetadata(form)} disabled={isPreparingMetadata}>
                <Link2 className="h-4 w-4" />
                {isPreparingMetadata ? 'Pinning metadata...' : 'Prepare IPFS metadata'}
              </button>

              <button type="submit" className="btn-primary w-full justify-center" disabled={isMinting}>
                <Plus className="h-4 w-4" />
                {isMinting ? 'Minting asset...' : 'Mint asset'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/58">
              {appName} will pin metadata to IPFS, mint the NFT, and return the verification payload.
            </div>

            {preparedMetadata && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/8 p-4">
                <div className="text-sm font-semibold text-cyan-200">Prepared metadata pinned to IPFS</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">CID</div>
                    <div className="mt-2 break-all font-mono text-xs text-white/72">{preparedMetadata.cid}</div>
                  </div>
                  <div className="rounded-2xl bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">URI</div>
                    <div className="mt-2 break-all font-mono text-xs text-white/72">{preparedMetadata.uri}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Metadata Preview</div>
            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <div className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${TYPE_META[form.type].color} bg-white/8`}>
                {TYPE_META[form.type].label}
              </div>
              <div className="mt-4 text-xl font-semibold text-white">{previewName}</div>
              <p className="mt-2 text-sm leading-6 text-white/58">{previewDescription}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">Location</div>
                  <div className="mt-2 text-sm font-medium text-white/82">{previewLocation}</div>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">Monthly Yield ({paymentTokenSymbol})</div>
                  <div className="mt-2 text-sm font-medium text-white/82">{previewYield.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">After Minting</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-white/62">
              <div>1. Open the asset workspace and fund its rental stream.</div>
              <div>2. Share the verification URL in a QR code or write the payload to NFC.</div>
              <div>3. Use the verification screen whenever a buyer or auditor needs proof.</div>
            </div>

            {lastMint && (
              <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Asset #{lastMint.id} prepared
                </div>
                <div className="mt-3 rounded-2xl bg-black/25 p-3 font-mono text-xs text-white/70 break-all">
                  {lastMint.verificationPayload}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-default text-sm" onClick={() => onOpenVerify(lastMint)}>
                    Open verification workspace
                  </button>
                  <button type="button" className="btn-secondary text-sm" onClick={() => onOpenWorkspace(lastMint)}>
                    Open asset workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-glass border border-white/10 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Registry</div>
            <h3 className="mt-2 text-xl font-black tracking-tight text-white">Browse indexed rental assets.</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
              Use this list to jump into the asset workspace for stream funding, ownership checks, or verification.
            </p>
            {isRegistryLoading && <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/40">Refreshing registry...</p>}
          </div>

          <div className="flex gap-2 rounded-full border border-white/10 bg-white/5 p-1">
            {[
              { key: 'mine', label: 'My assets' },
              { key: 'all', label: 'All assets' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRegistryFilter(option.key)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  registryFilter === option.key ? 'bg-flowpay-500 text-white' : 'text-white/58 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {registryAssets.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] px-6 py-10 text-center">
              <div className="text-xl font-semibold text-white">No assets yet.</div>
              <div className="mt-2 text-sm text-white/55">
                Mint your first rental asset above or switch to the full registry once other assets exist.
              </div>
            </div>
          ) : (
            registryAssets.slice(0, 6).map((asset) => {
              const Icon = TYPE_ICONS[asset.type];
              const meta = TYPE_META[asset.type];
              return (
                <div key={asset.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className={`inline-flex items-center gap-2 text-xs ${meta.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {asset.name} <span className="text-white/30">#{asset.id}</span>
                      </div>
                      <div className="mt-1 text-sm text-white/52">{asset.location}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-default text-sm" onClick={() => onOpenVerify(asset)}>
                        Verify
                      </button>
                      <button type="button" className="btn-secondary text-sm" onClick={() => onOpenWorkspace(asset)}>
                        Open workspace
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function VerifyPanel({ form, setForm, result, onVerify, networkName, isVerifying }) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-6">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Verification</div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Confirm authenticity from QR, NFC, or IPFS metadata.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">
          Cross-check the on-chain registry, verification hashes, and indexed activity trail in one pass.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'QR or NFC payload',
              body: `Fastest path. Paste the full payload and ${appName} will derive the token, CID, and tag hash for you.`,
            },
            {
              title: 'IPFS URI or raw CID',
              body: 'Use this when the payload is unavailable but you still have the metadata reference.',
            },
            {
              title: 'Token id + optional tag seed',
              body: 'Best for internal reviews when the buyer already knows which asset they want to inspect.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="mt-2 text-sm leading-6 text-white/55">{item.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="card-glass border border-white/10 p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Verification Input</div>
          <h3 className="mt-2 text-xl font-black tracking-tight text-white">Paste what you have and let Stream Engine fill in the rest.</h3>
          <p className="mt-3 text-sm leading-6 text-white/58">
            If you have the full payload, use only that. The token id and CID fields are the fallback path.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">Verification payload</span>
              <textarea
                rows={4}
                className="input-default w-full resize-none"
                placeholder="Paste the QR or NFC payload here"
                value={form.payload}
                onChange={(event) => updateField('payload', event.target.value)}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">Token id</span>
                <input
                  className="input-default w-full"
                  placeholder="79b1"
                  value={form.tokenId}
                  onChange={(event) => updateField('tokenId', event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">CID or IPFS URI</span>
                <input
                  className="input-default w-full"
                  placeholder="bafy... or ipfs://..."
                  value={form.cidOrUri}
                  onChange={(event) => updateField('cidOrUri', event.target.value)}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">Optional tag seed</span>
              <input
                className="input-default w-full"
                placeholder="Only needed if you are not using the full payload"
                value={form.tagSeed}
                onChange={(event) => updateField('tagSeed', event.target.value)}
              />
            </label>

            <button type="button" className="btn-primary w-full justify-center" onClick={onVerify} disabled={isVerifying}>
              <ShieldCheck className="h-4 w-4" />
              {isVerifying ? 'Verifying asset...' : 'Verify asset'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">What the verifier checks</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-white/62">
              <div>1. Fetch metadata from IPFS.</div>
              <div>2. Compare CID and tag hashes against the on-chain registry.</div>
              <div>3. Show the indexed activity trail so provenance is easy to audit.</div>
            </div>
            <div className="mt-5 rounded-2xl bg-white/5 p-4 text-sm text-white/55">Connected to {networkName}.</div>
          </div>

          {result && (
            <div className={`card-glass border p-6 ${result.authentic ? 'border-emerald-500/25' : 'border-amber-500/25'}`}>
              <div className="flex items-center gap-2">
                {result.authentic ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <BadgeCheck className="h-5 w-5 text-amber-400" />
                )}
                <div className={`text-lg font-semibold ${result.authentic ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {result.authentic ? 'Authentic registry match' : 'Verification mismatch detected'}
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-white/62">{result.reason}</p>

              {result.asset && (
                <>
                  <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">
                      {result.asset.name} <span className="text-white/35">#{result.asset.id}</span>
                    </div>
                    <div className="mt-1 text-sm text-white/55">{result.asset.location}</div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">CID</div>
                        <div className="mt-2 break-all font-mono text-xs text-white/72">{result.asset.verificationCid}</div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">Tag Check</div>
                        <div className="mt-2 text-sm font-semibold text-white/82">
                          {result.tagMatches ? 'Matched' : 'Mismatch'}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">Registry</div>
                        <div className="mt-2 text-sm font-semibold text-white/82">
                          {result.cidMatches ? 'CID matched' : 'CID mismatch'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="text-sm font-semibold text-white">Indexed activity trail</div>
                    <div className="mt-3 space-y-3">
                      {result.asset.activity.map((entry) => (
                        <div key={`${result.asset.id}-${entry.label}-${entry.timestamp}`} className="rounded-2xl bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white">{entry.label}</div>
                            <div className="text-xs text-white/45">{entry.timestamp}</div>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-white/58">{entry.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RentPanel({ assets, onOpenRental }) {
  const [filter, setFilter] = useState('all');
  const filteredAssets = filter === 'all' ? assets : assets.filter((asset) => asset.type === filter);

  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-6">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Rent Real World Assets</div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
          Pay-as-you-go physical access.
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/62">
          Stream money to use cars, apartments, equipment in real life.
        </p>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/62">
          How it works: Asset owner keeps the NFT and financial rights. You stream payment to unlock physical access
          to the real-world asset. Cancel anytime and get refunded instantly.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'All Assets' },
          { key: 'vehicle', label: 'Vehicles' },
          { key: 'real_estate', label: 'Real Estate' },
          { key: 'commodity', label: 'Equipment' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              filter === option.key
                ? 'border-flowpay-500 bg-flowpay-500 text-white'
                : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredAssets.length === 0 ? (
          <div className="card-glass border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center lg:col-span-2">
            <div className="text-2xl font-semibold text-white">No rental assets available yet.</div>
            <div className="mt-3 text-sm text-white/55">
              Mint an asset in the studio or wait for the registry to sync a new listing.
            </div>
          </div>
        ) : filteredAssets.map((asset) => {
          const Icon = TYPE_ICONS[asset.type];
          const meta = TYPE_META[asset.type];
          return (
            <div key={asset.id} className={`card-glass border ${meta.border} bg-gradient-to-br ${meta.gradient} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`inline-flex items-center gap-2 text-xs font-medium ${meta.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.rentLabel}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">
                    Asset #{asset.id}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-cyan-300">{formatPerHour(asset.pricePerHour)}</div>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-white/62">{asset.description}</p>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">Per-second billing</div>
                <button type="button" className="btn-primary text-sm" onClick={() => onOpenRental(asset)}>
                  Start Rental
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActiveRentalsPanel({ rentals, nowMs, onBrowseRentals, onEndRental }) {
  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-6">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Active Rentals</div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white">My Active Rentals</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">
          Manage your ongoing rental streams. Cancel anytime to get refunded for unused time.
        </p>
      </div>

      {rentals.length === 0 ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <div className="card-glass border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
            <div className="text-2xl font-semibold text-white">No Active Rentals</div>
            <div className="mt-3 text-sm text-white/55">Start renting real world assets to see them here.</div>
            <button type="button" className="btn-primary mt-6" onClick={onBrowseRentals}>
              Browse Rentals
            </button>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-lg font-semibold text-white">How Rental Cancellation Works</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-white/58">
              <div>Click "End Rental" to stop the money stream.</div>
              <div>Contract calculates exact time used down to the second.</div>
              <div>Unused funds are refunded instantly to your wallet.</div>
              <div>Asset access is immediately revoked.</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4">
            {rentals.map((rental) => {
              const metrics = calculateRentalMetrics(rental, nowMs);
              const meta = TYPE_META[rental.asset.type];

              return (
                <div key={rental.asset.id} className="card-glass border border-white/10 p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Asset #{rental.asset.id}</div>
                      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                        ACTIVE
                      </div>
                      <div className={`mt-3 text-sm ${meta.color}`}>
                        {meta.label} • {formatPerHour(rental.asset.pricePerHour)}
                      </div>
                    </div>

                    <button type="button" className="btn-default text-sm" onClick={() => onEndRental(rental)}>
                      End Rental
                    </button>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/45">Time Elapsed</div>
                      <div className="mt-2 text-2xl font-black text-white">{formatMinutes(metrics.elapsedMs)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/45">Current Cost</div>
                      <div className="mt-2 text-2xl font-black text-white">{formatMoney(metrics.currentCost)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/45">Refund if Cancelled</div>
                      <div className="mt-2 text-2xl font-black text-emerald-300">{formatMoney(metrics.refund)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/45">Total Budget</div>
                      <div className="mt-2 text-2xl font-black text-cyan-300">{formatMoney(rental.totalBudget)}</div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-sm text-white/60">
                      <span>{metrics.budgetUsed.toFixed(1)}% of budget used</span>
                      <span>{metrics.remainingHours < 1 ? 'Less than 1 hour remaining in your budget' : `${metrics.remainingHours.toFixed(1)} hours remaining`}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${metrics.budgetUsed}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-lg font-semibold text-white">How Rental Cancellation Works</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-white/58">
              <div>Click "End Rental" to stop the money stream.</div>
              <div>Contract calculates exact time used down to the second.</div>
              <div>Unused funds are refunded instantly to your wallet.</div>
              <div>Asset access is immediately revoked.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PortfolioPanel({ assets, onRefresh, onOpenVerify, onOpenRental, onOpenWorkspace }) {
  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Portfolio</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">My Portfolio</h2>
            <p className="mt-2 text-sm leading-6 text-white/58">{assets.length} yield-bearing assets</p>
          </div>

          <button type="button" className="btn-default" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="card-glass border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
          <div className="text-2xl font-semibold text-white">No assets in your portfolio yet.</div>
          <div className="mt-3 text-sm text-white/55">
            Mint a new rental asset or wait for an indexed asset to transfer into this wallet.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => {
          const Icon = TYPE_ICONS[asset.type];
          const meta = TYPE_META[asset.type];
          return (
            <div key={asset.id} className={`card-glass border ${meta.border} bg-gradient-to-br ${meta.gradient} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`inline-flex items-center gap-2 text-xs font-medium ${meta.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">Asset #{asset.id}</div>
                  <div className="mt-1 font-mono text-xs text-white/45">{asset.displayAddress}</div>
                </div>
                <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  {asset.status}
                </div>
              </div>

              <div className="mt-5 text-3xl font-black text-white">{formatMoney(asset.yieldBalance)}</div>
              <div className="mt-2 text-sm text-white/55">Streaming Rate: {formatPerSecond(asset.yieldRatePerSecond)}</div>

              <div className="mt-5 rounded-2xl bg-black/20 p-4">
                <div className="flex items-center justify-between text-sm text-white/60">
                  <span>{(asset.completionRatio * 100).toFixed(1)}% Complete</span>
                  <span>Active</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${asset.completionRatio * 100}%` }} />
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button type="button" className="btn-default flex-1 text-sm" onClick={() => onOpenVerify(asset)}>
                  Verify
                </button>
                <button type="button" className="btn-secondary flex-1 text-sm" onClick={() => onOpenWorkspace(asset)}>
                  Workspace
                </button>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'Unavailable';
  }

  try {
    const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return String(timestamp);
  }
}

function AssetWorkspacePanel({
  asset,
  activity,
  isLoading,
  networkName,
  claimableYieldDisplay,
  actionState,
  hasContractControls,
  onRefresh,
  onOpenVerify,
  onOpenRental,
  onFundYieldStream,
  onClaimYield,
  onFlashAdvance,
  onSetCompliance,
  onFreezeStream,
  onUpdateMetadata,
  onUpdateTag,
}) {
  const [fundForm, setFundForm] = useState({ amount: '', duration: '2592000' });
  const [flashAdvanceForm, setFlashAdvanceForm] = useState({ amount: '' });
  const [complianceForm, setComplianceForm] = useState({
    user: '',
    approved: true,
    expiry: '',
    jurisdiction: 'NG',
  });
  const [freezeForm, setFreezeForm] = useState({ frozen: false, reason: '' });
  const [metadataUri, setMetadataUri] = useState('');
  const [tagValue, setTagValue] = useState('');

  useEffect(() => {
    if (!asset) {
      return;
    }

    setComplianceForm({
      user: asset.currentOwner || asset.ownerAddress || '',
      approved: asset.compliance?.approved ?? true,
      expiry: asset.compliance?.expiry ? new Date(asset.compliance.expiry * 1000).toISOString().slice(0, 16) : '',
      jurisdiction: asset.compliance?.jurisdiction || 'NG',
    });
    setFreezeForm({
      frozen: Boolean(asset.stream?.isFrozen),
      reason: '',
    });
    setMetadataUri(asset.ipfsUri || '');
    setTagValue(asset.tagSeed || '');
  }, [asset]);

  if (isLoading) {
    return (
      <div className="card-glass border border-white/10 p-6 text-sm text-white/55">
        Loading asset workspace...
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="card-glass border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
        <div className="text-2xl font-semibold text-white">No asset selected.</div>
        <div className="mt-3 text-sm text-white/55">
          Open an asset from the registry or portfolio to inspect detail, activity, and contract actions here.
        </div>
      </div>
    );
  }

  const workspaceActivity = activity?.length ? activity : asset.activity || [];

  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Asset Workspace</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
              {asset.name} <span className="text-white/35">#{asset.tokenId}</span>
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">
              Deep asset view backed by the registry, indexer activity, and the live RWA hub contract.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-default text-sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button type="button" className="btn-default text-sm" onClick={() => onOpenVerify(asset)}>
              <ShieldCheck className="h-4 w-4" />
              Verify
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => onOpenRental(asset)}>
              <PlayCircle className="h-4 w-4" />
              Rent asset
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Current Owner</div>
            <div className="mt-2 font-mono text-sm text-white/82 break-all">{asset.currentOwner || 'Unavailable'}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Claimable Yield</div>
            <div className="mt-2 text-2xl font-black text-cyan-300">{Number(claimableYieldDisplay || 0).toFixed(4)} {paymentTokenSymbol}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Active Stream</div>
            <div className="mt-2 text-2xl font-black text-white">{asset.activeStreamId || 0}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Compliance</div>
            <div className="mt-2 text-sm font-semibold text-white/82">
              {asset.compliance?.currentlyValid ? 'Valid' : 'Not validated'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Registry Snapshot</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">IPFS URI</div>
                <div className="mt-2 break-all font-mono text-xs text-white/72">{asset.ipfsUri || 'Unavailable'}</div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Verification Payload</div>
                <div className="mt-2 break-all font-mono text-xs text-white/72">{asset.verificationPayload || 'Unavailable'}</div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Location</div>
                <div className="mt-2 text-sm text-white/82">{asset.location}</div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">Network</div>
                <div className="mt-2 text-sm text-white/82">{networkName}</div>
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Yield Actions</div>
            <div className="mt-4 space-y-5">
              <div className="grid gap-4 md:grid-cols-[1fr,1fr,auto]">
                <input
                  className="input-default w-full"
                  placeholder={`Yield amount (${paymentTokenSymbol})`}
                  value={fundForm.amount}
                  onChange={(event) => setFundForm((current) => ({ ...current, amount: event.target.value }))}
                />
                <input
                  className="input-default w-full"
                  placeholder="Duration in seconds"
                  value={fundForm.duration}
                  onChange={(event) => setFundForm((current) => ({ ...current, duration: event.target.value }))}
                />
                <button
                  type="button"
                  className="btn-primary justify-center"
                  onClick={() => onFundYieldStream(asset, fundForm)}
                  disabled={actionState.funding || !hasContractControls}
                >
                  {actionState.funding ? 'Funding...' : 'Fund stream'}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                <input
                  className="input-default w-full"
                  placeholder={`Flash advance amount (${paymentTokenSymbol})`}
                  value={flashAdvanceForm.amount}
                  onChange={(event) => setFlashAdvanceForm({ amount: event.target.value })}
                />
                <button
                  type="button"
                  className="btn-default justify-center"
                  onClick={() => onFlashAdvance(asset, flashAdvanceForm.amount)}
                  disabled={actionState.flashAdvance || !hasContractControls}
                >
                  {actionState.flashAdvance ? 'Advancing...' : 'Flash advance'}
                </button>
              </div>

              <button
                type="button"
                className="btn-secondary justify-center"
                onClick={() => onClaimYield(asset)}
                disabled={actionState.claim || !hasContractControls}
              >
                {actionState.claim ? 'Claiming...' : `Claim ${paymentTokenSymbol}`}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Admin Controls</div>
            <p className="mt-3 text-sm leading-6 text-white/58">
              These actions call the RWA hub contract directly. Connect with the controller wallet to use them.
            </p>

            <div className="mt-5 space-y-5">
              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">Compliance</div>
                <input className="input-default w-full" value={complianceForm.user} onChange={(event) => setComplianceForm((current) => ({ ...current, user: event.target.value }))} placeholder="Wallet address" />
                <div className="grid gap-3 md:grid-cols-2">
                  <input className="input-default w-full" type="datetime-local" value={complianceForm.expiry} onChange={(event) => setComplianceForm((current) => ({ ...current, expiry: event.target.value }))} />
                  <input className="input-default w-full" value={complianceForm.jurisdiction} onChange={(event) => setComplianceForm((current) => ({ ...current, jurisdiction: event.target.value }))} placeholder="Jurisdiction" />
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={complianceForm.approved} onChange={(event) => setComplianceForm((current) => ({ ...current, approved: event.target.checked }))} />
                  Approved
                </label>
                <button type="button" className="btn-default w-full justify-center" onClick={() => onSetCompliance(asset, complianceForm)} disabled={actionState.compliance || !hasContractControls}>
                  {actionState.compliance ? 'Updating...' : 'Set compliance'}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">Stream Freeze</div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={freezeForm.frozen} onChange={(event) => setFreezeForm((current) => ({ ...current, frozen: event.target.checked }))} />
                  Freeze current stream
                </label>
                <input className="input-default w-full" value={freezeForm.reason} onChange={(event) => setFreezeForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason for freeze / unfreeze" />
                <button type="button" className="btn-default w-full justify-center" onClick={() => onFreezeStream(asset, freezeForm)} disabled={actionState.freeze || !hasContractControls || !asset.activeStreamId}>
                  {actionState.freeze ? 'Submitting...' : 'Update stream freeze'}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">Metadata / Tag</div>
                <input className="input-default w-full" value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} placeholder="ipfs://..." />
                <button type="button" className="btn-default w-full justify-center" onClick={() => onUpdateMetadata(asset, metadataUri)} disabled={actionState.metadata || !hasContractControls || !metadataUri}>
                  {actionState.metadata ? 'Updating metadata...' : 'Update metadata URI'}
                </button>
                <input className="input-default w-full" value={tagValue} onChange={(event) => setTagValue(event.target.value)} placeholder="New tag seed / NFC UID" />
                <button type="button" className="btn-default w-full justify-center" onClick={() => onUpdateTag(asset, tagValue)} disabled={actionState.tag || !hasContractControls || !tagValue}>
                  {actionState.tag ? 'Updating tag...' : 'Update verification tag'}
                </button>
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Indexed Activity</div>
            <div className="mt-4 space-y-3">
              {workspaceActivity.length ? workspaceActivity.map((entry, index) => (
                <div key={`${entry.label}-${entry.timestamp}-${index}`} className="rounded-2xl bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{entry.label}</div>
                    <div className="text-xs text-white/45">{entry.timestamp}</div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/58">{entry.detail}</div>
                </div>
              )) : (
                <div className="text-sm text-white/45">No indexed activity yet for this asset.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StartRentalModal({ asset, onClose, onConfirm, isProcessing }) {
  const [hours, setHours] = useState(1);
  const totalBudget = Number((asset.pricePerHour * hours).toFixed(4));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="card-glass w-full max-w-md border border-white/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Start Rental</div>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">Asset #{asset.id}</h3>
          </div>
          <button type="button" className="text-white/45 transition-colors hover:text-white" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-white/70">Rental Duration (hours)</span>
            <input
              type="number"
              min="1"
              className="input-default w-full"
              value={hours}
              onChange={(event) => setHours(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>

          <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/62">
            <div className="flex items-center justify-between gap-3 py-1">
              <span>Price per hour:</span>
              <span className="font-semibold text-white">{formatMoney(asset.pricePerHour)} {paymentTokenSymbol}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span>Duration:</span>
              <span className="font-semibold text-white">{hours} hours</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span>Total Budget:</span>
              <span className="font-semibold text-cyan-300">{formatMoney(totalBudget)} {paymentTokenSymbol}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/58">
            You rent physical access, not the NFT. Owner keeps NFT ownership and financial rights. Your payment streams
            per-second for real-world usage. Cancel anytime and get refunded for unused time.
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-default flex-1 justify-center" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1 justify-center"
            onClick={() => onConfirm(asset, hours)}
            disabled={isProcessing}
          >
            Confirm &amp; Start Stream
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RWA() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    provider,
    signer,
    walletAddress,
    walletDisplayAddress,
    openWalletPicker,
    createStream,
    cancel,
    isProcessing,
    setStatus,
    toast,
    getNetworkName,
    chainId,
    outgoingStreams,
    formatEth,
  } = useWallet();
  const { catalog } = useProtocolCatalog();

  const [sessionMints, setSessionMints] = useState([]);
  const [liveRegistryAssets, setLiveRegistryAssets] = useState([]);
  const [isRegistryLoading, setIsRegistryLoading] = useState(false);
  const [isMintingAsset, setIsMintingAsset] = useState(false);
  const [isPreparingMetadata, setIsPreparingMetadata] = useState(false);
  const [isVerifyingAsset, setIsVerifyingAsset] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [registryError, setRegistryError] = useState('');
  const [registryFilter, setRegistryFilter] = useState('mine');
  const [verificationForm, setVerificationForm] = useState({
    payload: '',
    tokenId: '',
    cidOrUri: '',
    tagSeed: '',
  });
  const [verificationResult, setVerificationResult] = useState(null);
  const [selectedRentalAsset, setSelectedRentalAsset] = useState(null);
  const [selectedWorkspaceAssetId, setSelectedWorkspaceAssetId] = useState('');
  const [workspaceAsset, setWorkspaceAsset] = useState(null);
  const [workspaceActivity, setWorkspaceActivity] = useState([]);
  const [preparedMetadata, setPreparedMetadata] = useState(null);
  const [workspaceClaimableYield, setWorkspaceClaimableYield] = useState('0');
  const [actionState, setActionState] = useState({
    funding: false,
    claim: false,
    flashAdvance: false,
    compliance: false,
    freeze: false,
    metadata: false,
    tag: false,
  });
  const [manualActiveRentals, setManualActiveRentals] = useState([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const hubAddress = catalog?.rwa?.hubAddress || '';
  const assetStreamAddress = catalog?.rwa?.assetStreamAddress || '';
  const tokenAddress = catalog?.payments?.tokenAddress || '';
  const hasContractControls = Boolean(signer && provider && hubAddress && assetStreamAddress && tokenAddress);

  const activeTab = STUDIO_TABS.some((tab) => tab.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'mint';

  const loadRegistry = useCallback(async (notify = false) => {
    setIsRegistryLoading(true);
    setRegistryError('');

    try {
      const assets = await fetchRwaAssets();
      setLiveRegistryAssets(assets.map((asset) => mapApiAssetToUiAsset(asset)));
      setStatus('Registry synced.');
      if (notify) {
        toast.success('Registry synced with indexed assets.', { title: 'RWA Studio' });
      }
    } catch (error) {
      console.error('Failed to load RWA registry', error);
      setRegistryError(error.message || 'Unable to reach the RWA API right now.');
      setStatus('Registry sync unavailable.');
      if (notify) {
        toast.error(error.message || 'Unable to reach the RWA API right now.', { title: 'Registry sync failed' });
      }
    } finally {
      setIsRegistryLoading(false);
    }
  }, [setStatus, toast]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const allAssets = useMemo(() => {
    const fallbackAssets = liveRegistryAssets.length || sessionMints.length ? [] : PORTFOLIO_ASSETS;
    const combined = [...sessionMints, ...liveRegistryAssets, ...fallbackAssets];
    const seen = new Set();

    return combined.filter((asset) => {
      const key = String(asset.tokenId || asset.id);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [liveRegistryAssets, sessionMints]);

  const ownedAssets = useMemo(() => {
    if (!walletAddress) {
      return sessionMints;
    }

    const owner = walletAddress.toLowerCase();
    return allAssets.filter((asset) =>
      asset.currentOwner?.toLowerCase() === owner
      || asset.ownerAddress?.toLowerCase() === owner
      || asset.issuerAddress?.toLowerCase() === owner
    );
  }, [allAssets, sessionMints, walletAddress]);

  const streamBackedRentals = useMemo(() => {
    return outgoingStreams
      .map((stream) => {
        try {
          const metadata = JSON.parse(stream.metadata || '{}');
          if (metadata.type !== 'rwa-rental') {
            return null;
          }

          const assetTokenId = String(metadata.assetTokenId || metadata.assetId || '');
          const asset = allAssets.find((item) => String(item.tokenId || item.id) === assetTokenId);
          if (!asset) {
            return null;
          }

          return {
            asset,
            startedAt: Number(stream.startTime) * 1000,
            durationHours: Math.max(1, (Number(stream.stopTime) - Number(stream.startTime)) / 3600),
            totalBudget: Number(String(formatEth(stream.totalAmount)).replace(/,/g, '')),
            streamId: stream.id,
            metadata,
          };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  }, [allAssets, formatEth, outgoingStreams]);

  const activeRentals = useMemo(() => {
    const merged = [...streamBackedRentals, ...manualActiveRentals];
    const seen = new Set();

    return merged.filter((rental) => {
      const key = String(rental.asset.id);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [manualActiveRentals, streamBackedRentals]);

  useEffect(() => {
    if (!activeRentals.length) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeRentals.length]);

  const registryAssets = registryFilter === 'mine' ? ownedAssets : allAssets;
  const latestMint = sessionMints[0] || null;
  const networkName = chainId ? getNetworkName(chainId) : 'Westend Asset Hub';

  const setActiveTab = (nextTab) => setTabParam(setSearchParams, nextTab);
  const setActionFlag = (key, value) => {
    setActionState((current) => ({ ...current, [key]: value }));
  };

  const loadWorkspaceAsset = useCallback(async (tokenId, { notify = false } = {}) => {
    if (!tokenId) {
      return;
    }

    setSelectedWorkspaceAssetId(String(tokenId));
    setActiveTab('workspace');
    setIsWorkspaceLoading(true);

    try {
      const [assetResponse, activityResponse] = await Promise.all([
        fetchRwaAsset(tokenId),
        fetchRwaActivity(tokenId),
      ]);
      const mappedAsset = mapApiAssetToUiAsset({
        ...(assetResponse || {}),
        activity: activityResponse || [],
        metadata: assetResponse?.metadata,
      });

      setWorkspaceAsset(mappedAsset);
      setWorkspaceActivity(mappedAsset.activity || []);

      if (provider && hubAddress) {
        try {
          const claimable = await readClaimableYield({ provider, hubAddress, tokenId: Number(tokenId) });
          setWorkspaceClaimableYield(ethers.formatUnits(claimable, paymentTokenDecimals));
        } catch {
          setWorkspaceClaimableYield(String(mappedAsset.yieldBalance || 0));
        }
      } else {
        setWorkspaceClaimableYield(String(mappedAsset.yieldBalance || 0));
      }

      if (notify) {
        toast.success(`Asset #${tokenId} workspace refreshed.`, { title: 'RWA Studio' });
      }
    } catch (error) {
      console.error('Failed to load asset workspace', error);
      const fallbackAsset = allAssets.find((item) => String(item.tokenId || item.id) === String(tokenId)) || null;
      if (fallbackAsset) {
        setWorkspaceAsset(fallbackAsset);
        setWorkspaceActivity(fallbackAsset.activity || []);
        setWorkspaceClaimableYield(String(fallbackAsset.yieldBalance || 0));
      }
      toast.error(error.message || 'Unable to load the asset workspace right now.', { title: 'Workspace unavailable' });
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, [allAssets, hubAddress, provider, toast]);

  const openWorkspace = useCallback((asset) => {
    const tokenId = asset?.tokenId || asset?.id;
    if (!tokenId) {
      return;
    }

    loadWorkspaceAsset(tokenId);
  }, [loadWorkspaceAsset]);

  const prepareMetadata = useCallback(async (form) => {
    const metadata = buildAssetMetadata(form);
    const fingerprint = JSON.stringify(metadata);
    setIsPreparingMetadata(true);
    setStatus('Pinning metadata to IPFS...');

    try {
      const result = await pinRwaMetadata(metadata);
      setPreparedMetadata({
        ...result,
        uri: result.uri,
        cid: result.cid,
        fingerprint,
        metadata,
      });
      setStatus(`Prepared metadata at ${result.uri}.`);
      toast.success('Metadata pinned to IPFS.', { title: 'IPFS ready' });
    } catch (error) {
      console.error('Failed to pin metadata', error);
      setStatus('IPFS metadata preparation failed.');
      toast.error(error.message || 'Unable to pin metadata right now.', { title: 'IPFS failed' });
    } finally {
      setIsPreparingMetadata(false);
    }
  }, [setStatus, toast]);

  const buildVerificationResult = useCallback((response, fallbackAsset) => {
    const mappedAsset = response?.asset
      ? mapApiAssetToUiAsset({
        ...response.asset,
        metadata: response.metadata || response.asset.metadata,
        activity: response.activity || [],
      })
      : fallbackAsset;

    return {
      authentic: Boolean(response?.authentic),
      asset: mappedAsset || null,
      cidMatches: Boolean(response?.verification?.onChain?.cidMatches && response?.verification?.tokenUriMatches),
      tagMatches: Boolean(response?.verification?.onChain?.tagMatches),
      reason: response?.authentic
        ? 'Verification payload matches the registry, metadata, and indexed activity trail.'
        : 'One or more verification checks failed. Review the CID, tag binding, and activity trail below.',
    };
  }, []);

  const runVerification = useCallback(async (form) => {
    setIsVerifyingAsset(true);
    try {
      const response = await verifyRwaAsset({
        payload: form.payload || undefined,
        tokenId: form.tokenId || undefined,
        cid: form.cidOrUri?.startsWith('ipfs://') ? undefined : form.cidOrUri || undefined,
        uri: form.cidOrUri?.startsWith('ipfs://') ? form.cidOrUri : undefined,
        tag: form.tagSeed || undefined,
      });
      const result = buildVerificationResult(response);
      setVerificationResult(result);
      setStatus(
        result.authentic
          ? `Verification passed for Asset #${result.asset?.tokenId || form.tokenId}.`
          : 'Verification returned a mismatch.'
      );

      if (result.authentic && result.asset) {
        toast.success(`Asset #${result.asset.tokenId} passed verification.`, { title: 'Authentic' });
      } else {
        toast.warning(result.reason, { title: 'Verification mismatch' });
      }
    } catch (error) {
      console.error('Verification failed', error);
      const fallback = verifyAssetRecord(form, allAssets);
      setVerificationResult(fallback);
      setStatus('Verification service unavailable. Showing local registry comparison.');
      toast.warning(error.message || 'Verification service unavailable.', { title: 'Verification fallback' });
    } finally {
      setIsVerifyingAsset(false);
    }
  }, [allAssets, buildVerificationResult, setStatus, toast]);

  const openVerify = (asset) => {
    const nextForm = {
      payload: asset.verificationPayload || '',
      tokenId: String(asset.tokenId || asset.id || ''),
      cidOrUri: asset.ipfsUri || '',
      tagSeed: asset.tagSeed || '',
    };
    setVerificationForm(nextForm);
    setVerificationResult(null);
    setActiveTab('verify');

    if (nextForm.payload || (nextForm.tokenId && nextForm.cidOrUri)) {
      runVerification(nextForm);
    }
  };

  const openRental = (asset) => {
    setSelectedRentalAsset(asset);
  };

  const handleMint = async (form) => {
    if (!walletAddress) {
      toast.warning('Connect your wallet to prepare an asset in the studio.', { title: 'Wallet required' });
      return;
    }

    setIsMintingAsset(true);
    setStatus('Minting asset and pinning metadata...');
    const metadata = buildAssetMetadata(form);
    const preparedFingerprint = JSON.stringify(metadata);
    const preparedUri = preparedMetadata?.fingerprint === preparedFingerprint ? preparedMetadata.uri : '';

    try {
      const response = await mintRwaAsset({
        issuer: walletAddress,
        assetType: TYPE_TO_CHAIN_ASSET_TYPE[form.type] || 1,
        metadata: preparedUri ? undefined : metadata,
        metadataURI: preparedUri || undefined,
        tag: form.tagSeed.trim(),
      });

      const asset = mapApiAssetToUiAsset({
        ...(response.asset || {}),
        metadata: response.asset?.metadata || metadata,
        activity: response.asset?.activity || [],
      });
      asset.verificationPayload = response.verificationPayload || asset.verificationPayload;
      asset.verificationUrl = response.verificationUrl || asset.verificationUrl;

      setSessionMints((current) => [asset, ...current.filter((item) => String(item.tokenId) !== String(asset.tokenId))]);
      setRegistryFilter('mine');
      setVerificationForm({
        payload: asset.verificationPayload || '',
        tokenId: String(asset.tokenId),
        cidOrUri: asset.ipfsUri,
        tagSeed: metadata.tagSeed,
      });
      setVerificationResult(null);
      setStatus(`Minted Asset #${asset.tokenId} in RWA Studio.`);
      toast.success(`Asset #${asset.tokenId} was minted and indexed.`, { title: 'Asset minted' });
      await loadRegistry();
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error('Mint failed', error);
      setStatus('Asset mint failed.');
      toast.error(error.message || 'Unable to mint the asset right now.', { title: 'Mint failed' });
    } finally {
      setIsMintingAsset(false);
    }
  };

  const handleVerify = async () => {
    await runVerification(verificationForm);
  };

  const handleFundYieldStream = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning('Connect a compatible controller wallet to fund an asset stream.', { title: 'Wallet required' });
      return;
    }

    setActionFlag('funding', true);
    try {
      await approveAndCreateAssetYieldStream({
        signer,
        tokenAddress,
        streamAddress: assetStreamAddress,
        hubAddress,
        tokenId: Number(asset.tokenId),
        totalAmount: parseTokenAmount(form.amount, paymentTokenDecimals),
        duration: Number(form.duration || 0),
      });
      toast.success(`Yield stream funded for Asset #${asset.tokenId}.`, { title: 'Stream funded' });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error('Failed to fund asset yield stream', error);
      toast.error(error.message || 'Unable to fund the asset stream.', { title: 'Funding failed' });
    } finally {
      setActionFlag('funding', false);
    }
  };

  const handleClaimYieldAction = async (asset) => {
    if (!hasContractControls) {
      toast.warning('Connect a compatible wallet to claim yield.', { title: 'Wallet required' });
      return;
    }

    setActionFlag('claim', true);
    try {
      await claimAssetYield({ signer, hubAddress, tokenId: Number(asset.tokenId) });
      toast.success(`Yield claimed for Asset #${asset.tokenId}.`, { title: 'Yield claimed' });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error('Failed to claim yield', error);
      toast.error(error.message || 'Unable to claim yield right now.', { title: 'Claim failed' });
    } finally {
      setActionFlag('claim', false);
    }
  };

  const handleFlashAdvanceAction = async (asset, amountValue) => {
    if (!hasContractControls) {
      toast.warning('Connect a compatible wallet to flash advance yield.', { title: 'Wallet required' });
      return;
    }

    setActionFlag('flashAdvance', true);
    try {
      await flashAdvanceAssetYield({
        signer,
        hubAddress,
        tokenId: Number(asset.tokenId),
        amount: parseTokenAmount(amountValue, paymentTokenDecimals),
      });
      toast.success(`Flash advance executed for Asset #${asset.tokenId}.`, { title: 'Advance executed' });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error('Failed to execute flash advance', error);
      toast.error(error.message || 'Unable to execute flash advance.', { title: 'Advance failed' });
    } finally {
      setActionFlag('flashAdvance', false);
    }
  };

  const handleSetComplianceAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning('Connect a controller wallet to update compliance.', { title: 'Wallet required' });
      return;
    }

    setActionFlag('compliance', true);
    try {
      const expiry = form.expiry ? Math.floor(new Date(form.expiry).getTime() / 1000) : 0;
      await setAssetCompliance({
        signer,
        hubAddress,
        user: form.user,
        assetType: TYPE_TO_CHAIN_ASSET_TYPE[asset.type] || Number(asset.assetType || 1),
        approved: Boolean(form.approved),
        expiry,
        jurisdiction: form.jurisdiction,
      });
      toast.success(`Compliance updated for Asset #${asset.tokenId}.`, { title: 'Compliance updated' });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error('Failed to set compliance', error);
      toast.error(error.message || 'Unable to update compliance.', { title: 'Compliance failed' });
    } finally {
      setActionFlag('compliance', false);
    }
  };

  const handleFreezeStreamAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning('Connect a controller wallet to freeze a stream.', { title: 'Wallet required' });
      return;
    }

    setActionFlag('freeze', true);
    try {
      await setAssetStreamFreeze({
        signer,
        hubAddress,
        streamId: Number(asset.activeStreamId),
        frozen: Boolean(form.frozen),
        reason: form.reason || '',
      });
      toast.success(`Stream freeze updated for Asset #${asset.tokenId}.`, { title: 'Freeze updated' });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error('Failed to update freeze state', error);
      toast.error(error.message || 'Unable to update the stream freeze state.', { title: 'Freeze failed' });
    } finally {
      setActionFlag('freeze', false);
    }
  };

  const handleUpdateMetadataAction = async (asset, metadataURI) => {
    if (!hasContractControls) {
      toast.warning('Connect a controller wallet to update metadata.', { title: 'Wallet required' });
      return;
    }

    setActionFlag('metadata', true);
    try {
      await updateAssetMetadataOnChain({
        signer,
        hubAddress,
        tokenId: Number(asset.tokenId),
        metadataURI,
      });
      toast.success(`Metadata URI updated for Asset #${asset.tokenId}.`, { title: 'Metadata updated' });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error('Failed to update metadata URI', error);
      toast.error(error.message || 'Unable to update metadata URI.', { title: 'Metadata update failed' });
    } finally {
      setActionFlag('metadata', false);
    }
  };

  const handleUpdateTagAction = async (asset, tagValue) => {
    if (!hasContractControls) {
      toast.warning('Connect a controller wallet to update the verification tag.', { title: 'Wallet required' });
      return;
    }

    setActionFlag('tag', true);
    try {
      await updateAssetVerificationTag({
        signer,
        hubAddress,
        tokenId: Number(asset.tokenId),
        tag: tagValue,
      });
      toast.success(`Verification tag updated for Asset #${asset.tokenId}.`, { title: 'Tag updated' });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error('Failed to update verification tag', error);
      toast.error(error.message || 'Unable to update the verification tag.', { title: 'Tag update failed' });
    } finally {
      setActionFlag('tag', false);
    }
  };

  const handleStartRental = async (asset, hours) => {
    if (!walletAddress) {
      toast.warning('Connect your wallet to start a rental stream.', { title: 'Wallet required' });
      return;
    }

    const totalBudget = Number((asset.pricePerHour * hours).toFixed(4));
    const metadata = buildRentalStreamMetadata(asset, hours);

    if (typeof createStream !== 'function') {
      toast.warning('Wallet streaming is not available in this session.', { title: 'Stream unavailable' });
      return;
    }

    let streamId = null;
    try {
      streamId = await createStream(asset.ownerAddress, String(hours * 3600), totalBudget.toFixed(6), metadata);
    } catch (error) {
      console.error('Rental stream setup failed', error);
    }

    if (streamId == null) {
      toast.error('Unable to start the rental stream.', { title: 'Stream failed' });
      return;
    }

    setManualActiveRentals((current) => [
      {
        asset,
        startedAt: Date.now(),
        durationHours: hours,
        totalBudget,
        streamId,
        metadata: JSON.parse(metadata),
      },
      ...current.filter((rental) => rental.asset.id !== asset.id),
    ]);

    setSelectedRentalAsset(null);
    setActiveTab('active');
    setStatus(streamId ? `Rental stream #${streamId} started.` : `Rental prepared for Asset #${asset.id}.`);
    toast.success(`Rental started for Asset #${asset.id}.`, { title: 'Rental active' });
  };

  const handleEndRental = async (rental) => {
    try {
      if (rental.streamId) {
        await cancel?.(rental.streamId);
      }
      setManualActiveRentals((current) => current.filter((item) => item.asset.id !== rental.asset.id));
      setStatus(`Ended rental for Asset #${rental.asset.id}.`);
      toast.info(`Rental for Asset #${rental.asset.id} was ended.`, { title: 'Rental ended' });
    } catch (error) {
      console.error('Failed to end rental', error);
      toast.error(error.message || 'Unable to end the rental stream.', { title: 'Cancellation failed' });
    }
  };

  const handleRefreshPortfolio = async () => {
    await loadRegistry(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-6 lg:grid-cols-[280px,minmax(0,1fr)]">
        <StudioSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          walletAddress={walletDisplayAddress}
          activeRentals={activeRentals}
          indexedAssetCount={allAssets.length}
          studioMintCount={sessionMints.length}
          onConnect={openWalletPicker}
        />

        <div className="min-w-0 space-y-6">
          {registryError && (
            <div className="card-glass border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
              {registryError}
            </div>
          )}

          {activeTab === 'mint' && (
            <MintPanel
              walletAddress={walletAddress}
              onConnect={openWalletPicker}
              onMint={handleMint}
              onPrepareMetadata={prepareMetadata}
              lastMint={latestMint}
              isMinting={isMintingAsset}
              isPreparingMetadata={isPreparingMetadata}
              preparedMetadata={preparedMetadata}
              isRegistryLoading={isRegistryLoading}
              registryAssets={registryAssets}
              registryFilter={registryFilter}
              setRegistryFilter={setRegistryFilter}
              onOpenVerify={openVerify}
              onOpenWorkspace={openWorkspace}
            />
          )}

          {activeTab === 'verify' && (
            <VerifyPanel
              form={verificationForm}
              setForm={setVerificationForm}
              result={verificationResult}
              onVerify={handleVerify}
              networkName={networkName}
              isVerifying={isVerifyingAsset}
            />
          )}

          {activeTab === 'rent' && (
            <RentPanel
              assets={allAssets}
              onOpenRental={openRental}
            />
          )}

          {activeTab === 'active' && (
            <ActiveRentalsPanel
              rentals={activeRentals}
              nowMs={nowMs}
              onBrowseRentals={() => setActiveTab('rent')}
              onEndRental={handleEndRental}
            />
          )}

          {activeTab === 'portfolio' && (
            <PortfolioPanel
              assets={ownedAssets}
              onRefresh={handleRefreshPortfolio}
              onOpenVerify={openVerify}
              onOpenRental={openRental}
              onOpenWorkspace={openWorkspace}
            />
          )}

          {activeTab === 'workspace' && (
            <AssetWorkspacePanel
              asset={workspaceAsset}
              activity={workspaceActivity}
              isLoading={isWorkspaceLoading}
              networkName={networkName}
              claimableYieldDisplay={workspaceClaimableYield}
              actionState={actionState}
              hasContractControls={hasContractControls}
              onRefresh={() => loadWorkspaceAsset(selectedWorkspaceAssetId, { notify: true })}
              onOpenVerify={openVerify}
              onOpenRental={openRental}
              onFundYieldStream={handleFundYieldStream}
              onClaimYield={handleClaimYieldAction}
              onFlashAdvance={handleFlashAdvanceAction}
              onSetCompliance={handleSetComplianceAction}
              onFreezeStream={handleFreezeStreamAction}
              onUpdateMetadata={handleUpdateMetadataAction}
              onUpdateTag={handleUpdateTagAction}
            />
          )}
        </div>
      </div>

      {selectedRentalAsset && (
        <StartRentalModal
          asset={selectedRentalAsset}
          onClose={() => setSelectedRentalAsset(null)}
          onConfirm={handleStartRental}
          isProcessing={isProcessing || isMintingAsset || isVerifyingAsset || isRegistryLoading}
        />
      )}
    </div>
  );
}
