import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
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
} from "lucide-react";
import { useWallet } from "../context/WalletContext";
import {
  appName,
  paymentTokenDecimals,
  paymentTokenSymbol,
} from "../contactInfo";
import {
  fetchRwaAssets,
  fetchRwaAsset,
  fetchRwaActivity,
  mintRwaAsset,
  pinRwaMetadata,
  revokeRwaAttestation,
  storeRwaEvidence,
  submitRwaAttestation,
  verifyRwaAsset,
} from "../services/rwaApi";
import { useProtocolCatalog } from "../hooks/useProtocolCatalog";
import {
  approveAndCreateAssetYieldStream,
  claimAssetYield,
  flashAdvanceAssetYield,
  parseTokenAmount,
  readClaimableYield,
  setAssetAttestationPolicy,
  setAssetCompliance,
  setAssetIssuerApproval,
  setAssetPolicyOnChain,
  setAssetStreamFreeze,
  setAssetVerificationStatus,
  updateAssetEvidenceOnChain,
  updateAssetMetadataOnChain,
  updateAssetVerificationTag,
} from "../services/rwaContractApi";
import {
  buildRentalStreamMetadata,
  mapApiAssetToUiAsset,
  ATTESTATION_ROLE_LABELS,
  PORTFOLIO_ASSETS,
  RIGHTS_MODEL_LABELS,
  TYPE_TO_CHAIN_ASSET_TYPE,
  TYPE_META,
  VERIFICATION_STATUS_LABELS,
  verifyAssetRecord,
} from "./rwa/rwaData";

const TYPE_ICONS = {
  real_estate: Building2,
  vehicle: Car,
  commodity: Package,
};

const ATTESTATION_ROLE_OPTIONS = [
  "issuer",
  "lawyer",
  "registrar",
  "inspector",
  "valuer",
  "insurer",
  "compliance",
];

const ATTESTATION_ROLE_CODES = {
  issuer: 1,
  lawyer: 2,
  registrar: 3,
  inspector: 4,
  valuer: 5,
  insurer: 6,
  compliance: 7,
};

const ONCHAIN_VERIFICATION_STATUS_OPTIONS = [
  "draft",
  "pending_attestation",
  "verified",
  "verified_with_warnings",
  "stale",
  "frozen",
  "revoked",
  "disputed",
];

const STUDIO_TABS = [
  {
    key: "mint",
    label: "Minting",
    description: "Create the digital twin, metadata, and verification payload.",
    Icon: Plus,
  },
  {
    key: "verify",
    label: "Verify",
    description: "Check QR, NFC, CID, and registry history in one pass.",
    Icon: ScanSearch,
  },
  {
    key: "rent",
    label: "Rent Assets",
    description: "Browse rentable assets and start a payment stream.",
    Icon: PlayCircle,
  },
  {
    key: "active",
    label: "Active Rentals",
    description: "Track elapsed time, refund left, and end streams quickly.",
    Icon: Clock3,
  },
  {
    key: "portfolio",
    label: "My Portfolio",
    description: "Review yield-bearing assets and their current stream state.",
    Icon: Wallet,
  },
  {
    key: "workspace",
    label: "Asset Workspace",
    description: "Inspect one asset deeply and run contract-backed actions.",
    Icon: Settings2,
  },
];

const MINT_FORM_DEFAULT = {
  type: "real_estate",
  rightsModel: "verified_rental_asset",
  name: "",
  description: "",
  location: "",
  jurisdiction: "NG-LA",
  propertyRef: "",
  monthlyYieldTarget: "",
  imageUrl: "",
  tagSeed: "",
  deedHash: "",
  surveyHash: "",
  valuationHash: "",
  valuationExpiry: "",
  inspectionHash: "",
  inspectionExpiry: "",
  insuranceHash: "",
  insuranceExpiry: "",
  taxHash: "",
  taxExpiry: "",
};

function buildAssetMetadata(form) {
  return {
    name: form.name.trim() || "Untitled rental asset",
    description:
      form.description.trim() || "Verified productive rental twin prepared in Stream Engine.",
    image: form.imageUrl.trim(),
    assetType: form.type,
    rightsModel: form.rightsModel,
    location: form.location.trim() || "Undisclosed",
    jurisdiction: form.jurisdiction.trim() || "Undisclosed",
    monthlyYieldTarget: Number(form.monthlyYieldTarget || 0),
    accessMechanism: "Evidence-backed QR / NFC verification payload",
    tagSeed: form.tagSeed.trim(),
    properties: {
      location: form.location.trim() || "Undisclosed",
      accessMechanism: "Evidence-backed QR / NFC verification payload",
      rightsModel: form.rightsModel,
      jurisdiction: form.jurisdiction.trim() || "Undisclosed",
    },
    attributes: [
      { trait_type: "Asset Type", value: form.type },
      {
        trait_type: "Asset Class",
        value: TYPE_META[form.type]?.label || "Rental Asset",
      },
      { trait_type: "Location", value: form.location.trim() || "Undisclosed" },
      {
        trait_type: "Monthly Yield Target",
        value: Number(form.monthlyYieldTarget || 0),
      },
      {
        trait_type: "Rights Model",
        value: form.rightsModel,
      },
      {
        trait_type: "Jurisdiction",
        value: form.jurisdiction.trim() || "Undisclosed",
      },
    ],
  };
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function hashJson(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(stableStringify(value)));
}

function textToHex(value) {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function buildIssuerAuthorizationMessage({
  issuer,
  rightsModel,
  jurisdiction,
  propertyRef,
  publicMetadataHash,
  evidenceRoot,
  issuedAt,
  nonce,
}) {
  return [
    "Stream Engine RWA Mint Authorization",
    `issuer:${String(issuer || "").toLowerCase()}`,
    `rightsModel:${rightsModel || ""}`,
    `jurisdiction:${jurisdiction || ""}`,
    `propertyRef:${propertyRef || ""}`,
    `publicMetadataHash:${publicMetadataHash || ""}`,
    `evidenceRoot:${evidenceRoot || ""}`,
    `issuedAt:${issuedAt || ""}`,
    `nonce:${nonce || ""}`,
  ].join("\n");
}

function buildAttestationAuthorizationMessage({
  tokenId,
  role,
  attestor,
  evidenceHash,
  statementType,
  expiry,
  issuedAt,
  nonce,
}) {
  return [
    "Stream Engine RWA Attestation Authorization",
    `tokenId:${tokenId || ""}`,
    `role:${role || ""}`,
    `attestor:${String(attestor || "").toLowerCase()}`,
    `evidenceHash:${evidenceHash || ""}`,
    `statementType:${statementType || ""}`,
    `expiry:${expiry || 0}`,
    `issuedAt:${issuedAt || ""}`,
    `nonce:${nonce || ""}`,
  ].join("\n");
}

function buildAttestationRevocationAuthorizationMessage({
  attestationId,
  attestor,
  reason,
  issuedAt,
  nonce,
}) {
  return [
    "Stream Engine RWA Attestation Revocation Authorization",
    `attestationId:${attestationId || ""}`,
    `attestor:${String(attestor || "").toLowerCase()}`,
    `reason:${reason || ""}`,
    `issuedAt:${issuedAt || ""}`,
    `nonce:${nonce || ""}`,
  ].join("\n");
}

function buildEvidenceBundle(form) {
  return {
    documents: {
      deed: form.deedHash.trim() ? { hash: form.deedHash.trim() } : null,
      survey: form.surveyHash.trim() ? { hash: form.surveyHash.trim() } : null,
      valuation: form.valuationHash.trim()
        ? {
            hash: form.valuationHash.trim(),
            expiresAt: form.valuationExpiry || null,
          }
        : null,
      inspection: form.inspectionHash.trim()
        ? {
            hash: form.inspectionHash.trim(),
            expiresAt: form.inspectionExpiry || null,
          }
        : null,
      insurance: form.insuranceHash.trim()
        ? {
            hash: form.insuranceHash.trim(),
            expiresAt: form.insuranceExpiry || null,
          }
        : null,
      tax: form.taxHash.trim()
        ? {
            hash: form.taxHash.trim(),
            expiresAt: form.taxExpiry || null,
          }
        : null,
    },
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
  const currentCost = Math.min(
    rental.totalBudget,
    rental.asset.pricePerHour * elapsedHours,
  );
  const refund = Math.max(0, rental.totalBudget - currentCost);
  const budgetUsed =
    rental.totalBudget > 0
      ? Math.min(100, (currentCost / rental.totalBudget) * 100)
      : 0;
  const remainingHours =
    rental.asset.pricePerHour > 0 ? refund / rental.asset.pricePerHour : 0;

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

function StudioSidebar({
  activeTab,
  setActiveTab,
  walletAddress,
  activeRentals,
  indexedAssetCount,
  studioMintCount,
  onConnect,
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
      <div className="card-glass border border-white/10 p-4">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
          RWA Studio
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Indexed
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {indexedAssetCount}
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Minted
            </div>
            <div className="mt-2 text-2xl font-black text-cyan-300">
              {studioMintCount}
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Active Rentals
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-300">
              {activeRentals.length}
            </div>
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
                    ? "border-flowpay-500/50 bg-flowpay-500/15"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/7"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-xl p-2 ${
                      isActive
                        ? "bg-flowpay-500/20 text-cyan-200"
                        : "bg-white/8 text-white/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      isActive ? "text-white" : "text-white/78"
                    }`}
                  >
                    {label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-glass border border-white/10 p-4">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
          Wallet Status
        </div>
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
            <p className="text-sm text-white/58">
              Connect your wallet to mint new assets or start rental streams.
            </p>
            <button
              type="button"
              className="btn-primary w-full justify-center"
              onClick={onConnect}
            >
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
  const previewName = form.name.trim() || "Untitled rental asset";
  const previewDescription =
    form.description.trim() ||
    "Describe the rental unit, evidence posture, and income model.";
  const previewLocation = form.location.trim() || "Undisclosed";
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
      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <form
          onSubmit={handleSubmit}
          className="card-glass border border-white/10 p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                Mint Asset
              </div>
            </div>
            {walletAddress ? (
              <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                Wallet ready
              </div>
            ) : (
              <button
                type="button"
                className="btn-default text-sm"
                onClick={onConnect}
              >
                Connect wallet
              </button>
            )}
          </div>

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
                      onClick={() => updateField("type", key)}
                      className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                        active
                          ? `${meta.border} bg-gradient-to-br ${meta.gradient}`
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div
                        className={`inline-flex rounded-xl p-2 ${
                          active ? "bg-white/10" : "bg-white/8"
                        } ${meta.color}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">
                        {meta.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">
                Asset name
              </span>
              <input
                className="input-default w-full"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="name"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">
                What should a buyer understand immediately?
              </span>
              <textarea
                rows={4}
                className="input-default w-full resize-none"
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="description"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">
                  Rights model
                </span>
                <select
                  className="input-default w-full"
                  value={form.rightsModel}
                  onChange={(event) =>
                    updateField("rightsModel", event.target.value)
                  }
                >
                  {Object.entries(RIGHTS_MODEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">
                  Location
                </span>
                <input
                  className="input-default w-full"
                  value={form.location}
                  onChange={(event) =>
                    updateField("location", event.target.value)
                  }
                  placeholder="location"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">
                  Jurisdiction
                </span>
                <input
                  className="input-default w-full"
                  value={form.jurisdiction}
                  onChange={(event) =>
                    updateField("jurisdiction", event.target.value)
                  }
                  placeholder="NG-LA"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">
                  Monthly yield target ({paymentTokenSymbol})
                </span>
                <input
                  type="number"
                  min="0"
                  className="input-default w-full"
                  value={form.monthlyYieldTarget}
                  onChange={(event) =>
                    updateField("monthlyYieldTarget", event.target.value)
                  }
                  placeholder="amount"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">
                Property / asset reference
              </span>
              <input
                className="input-default w-full"
                value={form.propertyRef}
                onChange={(event) =>
                  updateField("propertyRef", event.target.value)
                }
                placeholder="plot-42-block-7 / VIN / chassis / yard slot"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">
                Image URL
              </span>
              <input
                className="input-default w-full"
                value={form.imageUrl}
                onChange={(event) =>
                  updateField("imageUrl", event.target.value)
                }
                placeholder="https://..."
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">
                QR / NFC tag seed
              </span>
              <input
                className="input-default w-full"
                value={form.tagSeed}
                onChange={(event) => updateField("tagSeed", event.target.value)}
                placeholder="Tag serial, NFC UID, or internal reference"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">
                Private Evidence Bundle
              </div>
              <p className="mt-2 text-sm leading-6 text-white/55">
                These hashes stay in the private evidence vault. The public NFT metadata stays sanitized; the deed, survey, tax, insurance, and inspection proofs stay server-side and only their roots are anchored onchain.
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Deed hash
                  </span>
                  <input
                    className="input-default w-full"
                    value={form.deedHash}
                    onChange={(event) =>
                      updateField("deedHash", event.target.value)
                    }
                    placeholder="0x..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Survey hash
                  </span>
                  <input
                    className="input-default w-full"
                    value={form.surveyHash}
                    onChange={(event) =>
                      updateField("surveyHash", event.target.value)
                    }
                    placeholder="0x..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Valuation hash
                  </span>
                  <input
                    className="input-default w-full"
                    value={form.valuationHash}
                    onChange={(event) =>
                      updateField("valuationHash", event.target.value)
                    }
                    placeholder="0x..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Valuation expiry
                  </span>
                  <input
                    type="date"
                    className="input-default w-full"
                    value={form.valuationExpiry}
                    onChange={(event) =>
                      updateField("valuationExpiry", event.target.value)
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Inspection hash
                  </span>
                  <input
                    className="input-default w-full"
                    value={form.inspectionHash}
                    onChange={(event) =>
                      updateField("inspectionHash", event.target.value)
                    }
                    placeholder="0x..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Inspection expiry
                  </span>
                  <input
                    type="date"
                    className="input-default w-full"
                    value={form.inspectionExpiry}
                    onChange={(event) =>
                      updateField("inspectionExpiry", event.target.value)
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Insurance hash
                  </span>
                  <input
                    className="input-default w-full"
                    value={form.insuranceHash}
                    onChange={(event) =>
                      updateField("insuranceHash", event.target.value)
                    }
                    placeholder="0x..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Insurance expiry
                  </span>
                  <input
                    type="date"
                    className="input-default w-full"
                    value={form.insuranceExpiry}
                    onChange={(event) =>
                      updateField("insuranceExpiry", event.target.value)
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Tax record hash
                  </span>
                  <input
                    className="input-default w-full"
                    value={form.taxHash}
                    onChange={(event) =>
                      updateField("taxHash", event.target.value)
                    }
                    placeholder="0x..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Tax record expiry
                  </span>
                  <input
                    type="date"
                    className="input-default w-full"
                    value={form.taxExpiry}
                    onChange={(event) =>
                      updateField("taxExpiry", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                className="btn-default w-full justify-center"
                onClick={() => onPrepareMetadata(form)}
                disabled={isPreparingMetadata}
              >
                <Link2 className="h-4 w-4" />
                {isPreparingMetadata ? "Pinning..." : "Prepare IPFS"}
              </button>

              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={isMinting}
              >
                <Plus className="h-4 w-4" />
                {isMinting ? "Minting..." : "Mint asset"}
              </button>
            </div>

            {preparedMetadata && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/8 p-4">
                <div className="text-sm font-semibold text-cyan-200">
                  Prepared metadata pinned to IPFS
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                      CID
                    </div>
                    <div className="mt-2 break-all font-mono text-xs text-white/72">
                      {preparedMetadata.cid}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                      URI
                    </div>
                    <div className="mt-2 break-all font-mono text-xs text-white/72">
                      {preparedMetadata.uri}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Metadata Preview
            </div>
            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <div
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  TYPE_META[form.type].color
                } bg-white/8`}
              >
                {TYPE_META[form.type].label}
              </div>
              <div className="mt-4 text-xl font-semibold text-white">
                {previewName}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/58">
                {previewDescription}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Location
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/82">
                    {previewLocation}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Rights Model
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/82">
                    {RIGHTS_MODEL_LABELS[form.rightsModel]}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Jurisdiction
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/82">
                    {form.jurisdiction || "Undisclosed"}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Monthly Yield ({paymentTokenSymbol})
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/82">
                    {previewYield.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              After Minting
            </div>
            {lastMint ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Asset #{lastMint.id} prepared
                </div>
                <div className="mt-3 rounded-2xl bg-black/25 p-3 text-sm leading-6 text-white/72">
                  The mint step creates the verified rental twin in{" "}
                  <span className="font-semibold text-white">
                    {lastMint.verificationStatusLabel || "Pending Attestation"}
                  </span>{" "}
                  state.
                  {lastMint.attestationRequirements?.length
                    ? " Open the workspace next to record the required role attestations and move the asset toward verified status."
                    : " No required attestation policy is configured for this asset type, so the twin can already verify as a v2 asset."}
                </div>
                {lastMint.attestationRequirements?.length ? (
                  <div className="mt-3 rounded-2xl bg-black/25 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Required attestation roles
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/72">
                      {lastMint.attestationRequirements.map((policy) => (
                        <span
                          key={`${policy.roleLabel}-${policy.maxAge || 0}`}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                        >
                          {policy.roleLabel}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl bg-black/25 p-3 text-sm text-white/72">
                    This asset type currently has no mandatory attestation roles configured in the policy layer.
                  </div>
                )}
                <div className="mt-3 rounded-2xl bg-black/25 p-3 font-mono text-xs text-white/70 break-all">
                  {lastMint.verificationPayload}
                </div>
                {lastMint.verificationUrl ? (
                  <div className="mt-3 rounded-2xl bg-black/25 p-3 text-xs text-white/70 break-all">
                    {lastMint.verificationUrl}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-default text-sm"
                    onClick={() => onOpenVerify(lastMint)}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={() => onOpenWorkspace(lastMint)}
                  >
                    Workspace
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-white/45">
                Mint an asset to see the verification payload here.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-glass border border-white/10 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Registry
            </div>
            {isRegistryLoading && (
              <span className="text-xs text-white/40">Syncing...</span>
            )}
          </div>

          <div className="flex gap-2 rounded-full border border-white/10 bg-white/5 p-1">
            {[
              { key: "mine", label: "My assets" },
              { key: "all", label: "All assets" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRegistryFilter(option.key)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  registryFilter === option.key
                    ? "bg-flowpay-500 text-white"
                    : "text-white/58 hover:text-white"
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
              <div className="text-xl font-semibold text-white">
                No assets yet.
              </div>
              <div className="mt-2 text-sm text-white/55">
                Mint your first rental asset above or switch to the full
                registry once other assets exist.
              </div>
            </div>
          ) : (
            registryAssets.slice(0, 6).map((asset) => {
              const Icon = TYPE_ICONS[asset.type];
              const meta = TYPE_META[asset.type];
              return (
                <div
                  key={asset.id}
                  className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div
                        className={`inline-flex items-center gap-2 text-xs ${meta.color}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {asset.name}{" "}
                        <span className="text-white/30">#{asset.id}</span>
                      </div>
                      <div className="mt-1 text-sm text-white/52">
                        {asset.location}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-default text-sm"
                        onClick={() => onOpenVerify(asset)}
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() => onOpenWorkspace(asset)}
                      >
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

function VerifyPanel({
  form,
  setForm,
  result,
  onVerify,
  networkName,
  isVerifying,
}) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="card-glass border border-white/10 p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
            Verification Input
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">
                Verification payload
              </span>
              <textarea
                rows={4}
                className="input-default w-full resize-none"
                placeholder="Paste the QR or NFC payload here"
                value={form.payload}
                onChange={(event) => updateField("payload", event.target.value)}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">
                  Token id
                </span>
                <input
                  className="input-default w-full"
                  placeholder="79b1"
                  value={form.tokenId}
                  onChange={(event) =>
                    updateField("tokenId", event.target.value)
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-white/70">
                  Public metadata URI
                </span>
                <input
                  className="input-default w-full"
                  placeholder="bafy... or ipfs://..."
                  value={form.cidOrUri}
                  onChange={(event) =>
                    updateField("cidOrUri", event.target.value)
                  }
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-white/70">
                Optional property reference
              </span>
              <input
                className="input-default w-full"
                placeholder="Only needed if you want to cross-check the property hash"
                value={form.propertyRef}
                onChange={(event) =>
                  updateField("propertyRef", event.target.value)
                }
              />
            </label>

            <button
              type="button"
              className="btn-primary w-full justify-center"
              onClick={onVerify}
              disabled={isVerifying}
            >
              <ShieldCheck className="h-4 w-4" />
              {isVerifying ? "Verifying asset..." : "Verify asset"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Network
            </div>
            <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-white/55">
              {networkName}
            </div>
          </div>

          {result && (
            <div
              className={`card-glass border p-6 ${
                result.authentic
                  ? "border-emerald-500/25"
                  : "border-amber-500/25"
              }`}
            >
              <div className="flex items-center gap-2">
                {result.authentic ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <BadgeCheck className="h-5 w-5 text-amber-400" />
                )}
                <div
                  className={`text-lg font-semibold ${
                    result.authentic ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {result.statusLabel}
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-white/62">
                {result.reason}
              </p>

              {result.asset && (
                <>
                  <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">
                      {result.asset.name}{" "}
                      <span className="text-white/35">#{result.asset.id}</span>
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      {result.asset.location}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Verification Status
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white/82">
                          {result.statusLabel}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Rights Model
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white/82">
                          {result.asset.rightsModelLabel}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Evidence Coverage
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white/82">
                          {result.evidenceCoverage.documentCount} documents
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Current Owner
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-white/82">
                          {result.asset.currentOwner || "Unavailable"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Active Stream
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white/82">
                          {result.asset.activeStreamId || 0}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Claimable Yield
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white/82">
                          {Number(result.asset.yieldBalance || 0).toFixed(4)} {paymentTokenSymbol}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Missing Evidence
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {result.evidenceCoverage.missingRequiredDocuments
                            ?.length ? (
                            result.evidenceCoverage.missingRequiredDocuments.map(
                              (item) => <div key={item}>{item}</div>,
                            )
                          ) : (
                            <div>No missing required evidence.</div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Missing Attestations
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {result.attestationCoverage.missingRoles?.length ? (
                            result.attestationCoverage.missingRoles.map(
                              (item) => <div key={item}>{item}</div>,
                            )
                          ) : (
                            <div>No missing attestation roles.</div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Asset Policy
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          <div>Frozen: {result.asset.assetPolicy?.frozen ? "Yes" : "No"}</div>
                          <div>Disputed: {result.asset.assetPolicy?.disputed ? "Yes" : "No"}</div>
                          <div>Revoked: {result.asset.assetPolicy?.revoked ? "Yes" : "No"}</div>
                          <div>Reason: {result.asset.assetPolicy?.reason || "No policy note."}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Checks
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {result.checks.length ? (
                            result.checks.map((check) => (
                              <div key={check.key}>
                                <span className={check.passed ? "text-emerald-300" : "text-amber-300"}>
                                  {check.passed ? "Pass" : "Fail"}
                                </span>{" "}
                                {check.label}
                              </div>
                            ))
                          ) : (
                            <div>No explicit checks returned.</div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Document Freshness
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {result.documentFreshness.staleDocuments?.length ? (
                            result.documentFreshness.staleDocuments.map((item) => (
                              <div key={item} className="text-amber-300">
                                Stale: {item}
                              </div>
                            ))
                          ) : (
                            <div>No stale documents.</div>
                          )}
                          {result.documentFreshness.validDocuments?.length ? (
                            result.documentFreshness.validDocuments.map((item) => (
                              <div key={item}>Valid: {item}</div>
                            ))
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Warnings
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {result.warnings.length ? (
                            result.warnings.map((warning) => (
                              <div key={warning}>{warning}</div>
                            ))
                          ) : (
                            <div>No warnings.</div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Required Actions
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {result.requiredActions.length ? (
                            result.requiredActions.map((action) => (
                              <div key={action}>{action}</div>
                            ))
                          ) : (
                            <div>No action required.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {result.failures.length ? (
                      <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
                        <div className="text-sm font-semibold text-amber-300">
                          Failed Checks
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {result.failures.map((failure) => (
                            <div key={failure}>{failure}</div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5">
                    <div className="text-sm font-semibold text-white">
                      Indexed activity trail
                    </div>
                    <div className="mt-3 space-y-3">
                      {result.asset.activity.map((entry) => (
                        <div
                          key={`${result.asset.id}-${entry.label}-${entry.timestamp}`}
                          className="rounded-2xl bg-white/5 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white">
                              {entry.label}
                            </div>
                            <div className="text-xs text-white/45">
                              {entry.timestamp}
                            </div>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-white/58">
                            {entry.detail}
                          </div>
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
  const [filter, setFilter] = useState("all");
  const filteredAssets =
    filter === "all" ? assets : assets.filter((asset) => asset.type === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All Assets" },
          { key: "vehicle", label: "Vehicles" },
          { key: "real_estate", label: "Real Estate" },
          { key: "commodity", label: "Equipment" },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              filter === option.key
                ? "border-flowpay-500 bg-flowpay-500 text-white"
                : "border-white/10 bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredAssets.length === 0 ? (
          <div className="card-glass border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center lg:col-span-2">
            <div className="text-2xl font-semibold text-white">
              No rental assets available yet.
            </div>
            <div className="mt-3 text-sm text-white/55">
              Mint an asset in the studio or wait for the registry to sync a new
              listing.
            </div>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const Icon = TYPE_ICONS[asset.type];
            const meta = TYPE_META[asset.type];
            return (
              <div
                key={asset.id}
                className={`card-glass border ${meta.border} overflow-hidden`}
              >
                {/* Color band */}
                <div
                  className={`h-1.5 w-full bg-gradient-to-r ${meta.gradient
                    .replace("from-", "from-")
                    .replace("/20", "/80")}`}
                />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.color} ${meta.border} bg-white/5`}
                      >
                        <Icon className="h-3 w-3" />
                        {meta.rentLabel}
                      </div>
                      <div className="mt-3 text-lg font-bold text-white leading-tight">
                        {asset.name}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {asset.location}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-black ${meta.color}`}>
                        {formatPerHour(asset.pricePerHour)}
                      </div>
                      <div className="text-xs text-white/35 mt-0.5">
                        per hour
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-white/60 line-clamp-2 leading-relaxed">
                    {asset.description}
                  </p>

                  <div className="mt-4 flex items-center gap-2 text-xs text-white/35">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    {asset.accessMechanism}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 pt-4 border-t border-white/8">
                    <div className="text-xs text-white/40">
                      <span className="text-white/70 font-mono">
                        {formatPerSecond(
                          asset.yieldRatePerSecond || asset.pricePerHour / 3600,
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      onClick={() => onOpenRental(asset)}
                    >
                      Rent Now
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ActiveRentalsPanel({ rentals, nowMs, onBrowseRentals, onEndRental }) {
  return (
    <div className="space-y-6">
      {rentals.length === 0 ? (
        <div className="card-glass border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
          <div className="text-2xl font-semibold text-white">
            No Active Rentals
          </div>
          <div className="mt-3 text-sm text-white/55">
            Start renting real world assets to see them here.
          </div>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={onBrowseRentals}
          >
            Browse Rentals
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {rentals.map((rental) => {
            const metrics = calculateRentalMetrics(rental, nowMs);
            const meta = TYPE_META[rental.asset.type];

            return (
              <div
                key={rental.asset.id}
                className="card-glass border border-white/10 p-6"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {rental.asset.name}
                    </div>
                    <div className="mt-0.5 text-xs text-white/45">
                      {rental.asset.location}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                      ACTIVE
                    </div>
                    <div className={`mt-2 text-xs ${meta.color}`}>
                      {meta.label} • {formatPerHour(rental.asset.pricePerHour)}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-default text-sm"
                    onClick={() => onEndRental(rental)}
                  >
                    End Rental
                  </button>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Time Elapsed
                    </div>
                    <div className="mt-2 text-2xl font-black text-white">
                      {formatMinutes(metrics.elapsedMs)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Current Cost
                    </div>
                    <div className="mt-2 text-2xl font-black text-white">
                      {formatMoney(metrics.currentCost)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Refund if Cancelled
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-300">
                      {formatMoney(metrics.refund)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Total Budget
                    </div>
                    <div className="mt-2 text-2xl font-black text-cyan-300">
                      {formatMoney(rental.totalBudget)}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-sm text-white/60">
                    <span>{metrics.budgetUsed.toFixed(1)}% of budget used</span>
                    <span>
                      {metrics.remainingHours < 1
                        ? "Less than 1 hour remaining in your budget"
                        : `${metrics.remainingHours.toFixed(
                            1,
                          )} hours remaining`}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                      style={{ width: `${metrics.budgetUsed}%` }}
                    />
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

function PortfolioPanel({
  assets,
  onRefresh,
  onOpenVerify,
  onOpenRental,
  onOpenWorkspace,
}) {
  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Portfolio
            </div>
            <span className="text-sm text-white/45">
              {assets.length} assets
            </span>
          </div>
          <button
            type="button"
            className="btn-default text-sm"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="card-glass border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
          <div className="text-2xl font-semibold text-white">
            No assets in your portfolio yet.
          </div>
          <div className="mt-3 text-sm text-white/55">
            Mint a new rental asset or wait for an indexed asset to transfer
            into this wallet.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => {
            const Icon = TYPE_ICONS[asset.type];
            const meta = TYPE_META[asset.type];
            return (
              <div
                key={asset.id}
                className={`card-glass border ${meta.border} bg-gradient-to-br ${meta.gradient} p-5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className={`inline-flex items-center gap-2 text-xs font-medium ${meta.color}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </div>
                    <div className="mt-2 text-base font-semibold text-white leading-snug">
                      {asset.name}
                    </div>
                    <div className="mt-0.5 text-xs text-white/45">
                      {asset.location}
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 shrink-0">
                    {asset.status}
                  </div>
                </div>

                <div className="mt-5 text-3xl font-black text-white">
                  {formatMoney(asset.yieldBalance)}
                </div>
                <div className="mt-2 text-sm text-white/55">
                  Streaming Rate: {formatPerSecond(asset.yieldRatePerSecond)}
                </div>

                <div className="mt-5 rounded-2xl bg-black/20 p-4">
                  <div className="flex items-center justify-between text-sm text-white/60">
                    <span>
                      {(asset.completionRatio * 100).toFixed(1)}% Complete
                    </span>
                    <span>Active</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                      style={{ width: `${asset.completionRatio * 100}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    className="btn-default flex-1 text-sm"
                    onClick={() => onOpenVerify(asset)}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex-1 text-sm"
                    onClick={() => onOpenWorkspace(asset)}
                  >
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
    return "Unavailable";
  }

  try {
    const date =
      typeof timestamp === "number"
        ? new Date(timestamp * 1000)
        : new Date(timestamp);
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
  hasFundingControls,
  controllerAddress,
  onRefresh,
  onOpenVerify,
  onOpenRental,
  onFundYieldStream,
  onClaimYield,
  onFlashAdvance,
  onSubmitAttestation,
  onRevokeAttestation,
  onSetCompliance,
  onSetVerificationStatus,
  onSetAssetPolicy,
  onSetIssuerApproval,
  onSetAttestationPolicy,
  onFreezeStream,
  onUpdateEvidence,
  onUpdateMetadata,
  onUpdateTag,
}) {
  const [fundForm, setFundForm] = useState({ amount: "", duration: "2592000" });
  const [flashAdvanceForm, setFlashAdvanceForm] = useState({ amount: "" });
  const [complianceForm, setComplianceForm] = useState({
    user: "",
    approved: true,
    expiry: "",
    jurisdiction: "NG",
  });
  const [freezeForm, setFreezeForm] = useState({ frozen: false, reason: "" });
  const [metadataUri, setMetadataUri] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [verificationFormState, setVerificationFormState] = useState({
    status: "pending_attestation",
    reason: "",
  });
  const [assetPolicyForm, setAssetPolicyForm] = useState({
    frozen: false,
    disputed: false,
    revoked: false,
    reason: "",
  });
  const [issuerApprovalForm, setIssuerApprovalForm] = useState({
    issuer: "",
    approved: true,
    note: "",
  });
  const [attestationPolicyForm, setAttestationPolicyForm] = useState({
    role: "lawyer",
    required: true,
    maxAgeDays: "30",
  });
  const [evidenceForm, setEvidenceForm] = useState({
    evidenceRoot: "",
    evidenceManifestHash: "",
  });
  const [attestationForm, setAttestationForm] = useState({
    role: "lawyer",
    attestor: "",
    evidenceHash: "",
    statementType: "title_review_complete",
    expiry: "",
  });
  const [revokeReasons, setRevokeReasons] = useState({});

  useEffect(() => {
    if (!asset) {
      return;
    }

    setComplianceForm({
      user: asset.currentOwner || asset.ownerAddress || "",
      approved: asset.compliance?.approved ?? true,
      expiry: asset.compliance?.expiry
        ? new Date(asset.compliance.expiry * 1000).toISOString().slice(0, 16)
        : "",
      jurisdiction: asset.compliance?.jurisdiction || "NG",
    });
    setFreezeForm({
      frozen: Boolean(asset.stream?.isFrozen),
      reason: "",
    });
    setMetadataUri(asset.ipfsUri || "");
    setTagValue(asset.tagSeed || "");
    setVerificationFormState({
      status: asset.verificationStatus || "pending_attestation",
      reason: asset.statusReason || "",
    });
    setAssetPolicyForm({
      frozen: Boolean(asset.assetPolicy?.frozen),
      disputed: Boolean(asset.assetPolicy?.disputed),
      revoked: Boolean(asset.assetPolicy?.revoked),
      reason: asset.assetPolicy?.reason || "",
    });
    setIssuerApprovalForm({
      issuer: asset.issuerAddress || asset.currentOwner || "",
      approved: asset.compliance?.approved ?? true,
      note: "",
    });
    const defaultPolicy = asset.attestationPolicies?.[0];
    setAttestationPolicyForm({
      role: defaultPolicy?.roleLabel || "lawyer",
      required: defaultPolicy?.required ?? true,
      maxAgeDays: defaultPolicy?.maxAge
        ? String(Math.max(1, Math.round(Number(defaultPolicy.maxAge) / 86400)))
        : "30",
    });
    setEvidenceForm({
      evidenceRoot: asset.evidenceRoot || "",
      evidenceManifestHash: asset.evidenceManifestHash || "",
    });
    setAttestationForm({
      role: "lawyer",
      attestor: controllerAddress || asset.currentOwner || asset.ownerAddress || "",
      evidenceHash: "",
      statementType: "title_review_complete",
      expiry: "",
    });
  }, [asset, controllerAddress]);

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
        <div className="text-2xl font-semibold text-white">
          No asset selected.
        </div>
        <div className="mt-3 text-sm text-white/55">
          Open an asset from the registry or portfolio to inspect detail,
          activity, and contract actions here.
        </div>
      </div>
    );
  }

  const workspaceActivity = activity?.length ? activity : asset.activity || [];
  const evidenceSummary = asset.evidenceSummary || {
    presentDocuments: [],
    missingRequiredDocuments: [],
    freshness: [],
  };
  const requiredRoles = asset.attestationPolicies?.filter((policy) => policy.required) || [];

  const handleSubmitAttestation = async () => {
    await onSubmitAttestation(asset, attestationForm);
    setAttestationForm((current) => ({
      ...current,
      evidenceHash: "",
      statementType: "title_review_complete",
      expiry: "",
    }));
  };

  const handleRevokeAttestation = async (attestationId) => {
    await onRevokeAttestation(asset, attestationId, revokeReasons[attestationId] || "");
    setRevokeReasons((current) => ({
      ...current,
      [attestationId]: "",
    }));
  };

  return (
    <div className="space-y-6">
      <div className="card-glass border border-white/10 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Asset Workspace
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
              {asset.name}{" "}
              <span className="text-white/35">#{asset.tokenId}</span>
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-default text-sm"
              onClick={onRefresh}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              className="btn-default text-sm"
              onClick={() => onOpenVerify(asset)}
            >
              <ShieldCheck className="h-4 w-4" />
              Verify
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => onOpenRental(asset)}
            >
              <PlayCircle className="h-4 w-4" />
              Rent asset
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Current Owner
            </div>
            <div className="mt-2 font-mono text-sm text-white/82 break-all">
              {asset.currentOwner || "Unavailable"}
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Claimable Yield
            </div>
            <div className="mt-2 text-2xl font-black text-cyan-300">
              {Number(claimableYieldDisplay || 0).toFixed(4)}{" "}
              {paymentTokenSymbol}
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Active Stream
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {asset.activeStreamId || 0}
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Compliance
            </div>
            <div className="mt-2 text-sm font-semibold text-white/82">
              {asset.compliance?.currentlyValid ? "Valid" : "Not validated"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Registry Snapshot
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Public Metadata URI
                </div>
                <div className="mt-2 break-all font-mono text-xs text-white/72">
                  {asset.ipfsUri || "Unavailable"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Verification Status
                </div>
                <div className="mt-2 text-sm text-white/82">
                  {asset.verificationStatusLabel || "Pending"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Evidence Root
                </div>
                <div className="mt-2 break-all font-mono text-xs text-white/72">
                  {asset.evidenceRoot || "Unavailable"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Evidence Manifest Hash
                </div>
                <div className="mt-2 break-all font-mono text-xs text-white/72">
                  {asset.evidenceManifestHash || "Unavailable"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Attestations
                </div>
                <div className="mt-2 text-sm text-white/82">
                  {asset.attestations?.length || 0} recorded
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Required Roles
                </div>
                <div className="mt-2 text-sm text-white/82">
                  {asset.attestationRequirements?.length
                    || asset.attestationPolicies?.filter((policy) => policy.required).length
                    || 0} required
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Property Ref Hash
                </div>
                <div className="mt-2 break-all font-mono text-xs text-white/72">
                  {asset.propertyRefHash || "Unavailable"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Public Metadata Hash
                </div>
                <div className="mt-2 break-all font-mono text-xs text-white/72">
                  {asset.publicMetadataHash || "Unavailable"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Verification Updated
                </div>
                <div className="mt-2 text-sm text-white/82">
                  {asset.verificationUpdatedAt
                    ? formatTimestamp(asset.verificationUpdatedAt)
                    : "Unavailable"}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                Status Reason
              </div>
              <div className="mt-2 text-sm text-white/72">
                {asset.statusReason || "No status note yet."}
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Evidence &amp; Attestation Summary
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Present Evidence
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/72">
                  {evidenceSummary.presentDocuments?.length ? (
                    evidenceSummary.presentDocuments.map((item) => (
                      <div key={item}>{item}</div>
                    ))
                  ) : (
                    <div>No evidence documents indexed yet.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Missing Evidence
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/72">
                  {evidenceSummary.missingRequiredDocuments?.length ? (
                    evidenceSummary.missingRequiredDocuments.map((item) => (
                      <div key={item}>{item}</div>
                    ))
                  ) : (
                    <div>No missing required evidence.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Required Attestation Roles
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/72">
                  {requiredRoles.length ? (
                    requiredRoles.map((policy) => (
                      <div key={`${policy.role}-${policy.maxAge}`}>
                        {policy.roleLabel}{" "}
                        <span className="text-white/45">
                          {policy.maxAge ? `· refresh every ${Math.round(policy.maxAge / 86400)}d` : "· no max age"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div>No required attestation roles configured.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Asset Policy
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/72">
                  <div>Frozen: {asset.assetPolicy?.frozen ? "Yes" : "No"}</div>
                  <div>Disputed: {asset.assetPolicy?.disputed ? "Yes" : "No"}</div>
                  <div>Revoked: {asset.assetPolicy?.revoked ? "Yes" : "No"}</div>
                  <div>Reason: {asset.assetPolicy?.reason || "No policy reason recorded."}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Yield Actions
            </div>
            <div className="mt-4 space-y-5">
              <div className="grid gap-4 md:grid-cols-[1fr,1fr,auto]">
                <input
                  className="input-default w-full"
                  placeholder={`Yield amount (${paymentTokenSymbol})`}
                  value={fundForm.amount}
                  onChange={(event) =>
                    setFundForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
                <input
                  className="input-default w-full"
                  placeholder="Duration in seconds"
                  value={fundForm.duration}
                  onChange={(event) =>
                    setFundForm((current) => ({
                      ...current,
                      duration: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn-primary justify-center"
                  onClick={() => onFundYieldStream(asset, fundForm)}
                  disabled={actionState.funding || !hasFundingControls}
                >
                  {actionState.funding ? "Funding..." : "Fund stream"}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                <input
                  className="input-default w-full"
                  placeholder={`Flash advance amount (${paymentTokenSymbol})`}
                  value={flashAdvanceForm.amount}
                  onChange={(event) =>
                    setFlashAdvanceForm({ amount: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="btn-default justify-center"
                  onClick={() => onFlashAdvance(asset, flashAdvanceForm.amount)}
                  disabled={actionState.flashAdvance || !hasContractControls}
                >
                  {actionState.flashAdvance ? "Advancing..." : "Flash advance"}
                </button>
              </div>

              <button
                type="button"
                className="btn-secondary justify-center"
                onClick={() => onClaimYield(asset)}
                disabled={actionState.claim || !hasContractControls}
              >
                {actionState.claim
                  ? "Claiming..."
                  : `Claim ${paymentTokenSymbol}`}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Attestation Panel
            </div>

            <div className="mt-5 space-y-5">
              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Record Attestation
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-white/70">
                      Role
                    </span>
                    <select
                      className="input-default w-full"
                      value={attestationForm.role}
                      onChange={(event) =>
                        setAttestationForm((current) => ({
                          ...current,
                          role: event.target.value,
                        }))
                      }
                    >
                      {ATTESTATION_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {ATTESTATION_ROLE_LABELS[role] || role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-white/70">
                      Attestor address
                    </span>
                    <input
                      className="input-default w-full"
                      value={attestationForm.attestor}
                      onChange={(event) =>
                        setAttestationForm((current) => ({
                          ...current,
                          attestor: event.target.value,
                        }))
                      }
                      placeholder="0x..."
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-white/70">
                      Evidence hash
                    </span>
                    <input
                      className="input-default w-full"
                      value={attestationForm.evidenceHash}
                      onChange={(event) =>
                        setAttestationForm((current) => ({
                          ...current,
                          evidenceHash: event.target.value,
                        }))
                      }
                      placeholder="0x..."
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-white/70">
                      Expiry
                    </span>
                    <input
                      type="date"
                      className="input-default w-full"
                      value={attestationForm.expiry}
                      onChange={(event) =>
                        setAttestationForm((current) => ({
                          ...current,
                          expiry: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-white/70">
                    Statement type
                  </span>
                  <input
                    className="input-default w-full"
                    value={attestationForm.statementType}
                    onChange={(event) =>
                      setAttestationForm((current) => ({
                        ...current,
                        statementType: event.target.value,
                      }))
                    }
                    placeholder="title_review_complete / inspection_current"
                  />
                </label>
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={handleSubmitAttestation}
                  disabled={actionState.attestation || !hasContractControls}
                >
                  {actionState.attestation ? "Recording..." : "Record attestation"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Recorded Attestations
                </div>
                {asset.attestations?.length ? (
                  asset.attestations.map((attestation) => (
                    <div
                      key={`${attestation.attestationId}-${attestation.roleLabel}-${attestation.issuedAt}`}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">
                          {ATTESTATION_ROLE_LABELS[attestation.roleLabel] || attestation.roleLabel}
                        </div>
                        <div className="text-xs text-white/45">
                          {attestation.revoked ? "Revoked" : "Active"}
                        </div>
                      </div>
                      <div className="mt-2 break-all font-mono text-xs text-cyan-200">
                        {attestation.evidenceHash}
                      </div>
                      <div className="mt-3 text-sm leading-6 text-white/60">
                        {attestation.statementType}
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-white/45 md:grid-cols-2">
                        <div>Attestor: {attestation.attestor}</div>
                        <div>
                          Expiry: {attestation.expiry ? formatTimestamp(attestation.expiry) : "No expiry"}
                        </div>
                      </div>
                      {!attestation.revoked ? (
                        <div className="mt-4 space-y-3">
                          <input
                            className="input-default w-full"
                            value={revokeReasons[attestation.attestationId] || ""}
                            onChange={(event) =>
                              setRevokeReasons((current) => ({
                                ...current,
                                [attestation.attestationId]: event.target.value,
                              }))
                            }
                            placeholder="Revocation reason"
                          />
                          <button
                            type="button"
                            className="btn-default w-full justify-center"
                            onClick={() => handleRevokeAttestation(attestation.attestationId)}
                            disabled={
                              actionState.revokeAttestation || !hasContractControls
                            }
                          >
                            {actionState.revokeAttestation
                              ? "Revoking..."
                              : "Revoke attestation"}
                          </button>
                        </div>
                      ) : null}
                      {attestation.revocationReason ? (
                        <div className="mt-3 text-xs text-amber-300">
                          Revocation reason: {attestation.revocationReason}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-white/45">
                    No attestations recorded yet for this asset.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Admin Controls
            </div>

            <div className="mt-5 space-y-5">
              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Compliance
                </div>
                <input
                  className="input-default w-full"
                  value={complianceForm.user}
                  onChange={(event) =>
                    setComplianceForm((current) => ({
                      ...current,
                      user: event.target.value,
                    }))
                  }
                  placeholder="Wallet address"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="input-default w-full"
                    type="datetime-local"
                    value={complianceForm.expiry}
                    onChange={(event) =>
                      setComplianceForm((current) => ({
                        ...current,
                        expiry: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="input-default w-full"
                    value={complianceForm.jurisdiction}
                    onChange={(event) =>
                      setComplianceForm((current) => ({
                        ...current,
                        jurisdiction: event.target.value,
                      }))
                    }
                    placeholder="Jurisdiction"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={complianceForm.approved}
                    onChange={(event) =>
                      setComplianceForm((current) => ({
                        ...current,
                        approved: event.target.checked,
                      }))
                    }
                  />
                  Approved
                </label>
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onSetCompliance(asset, complianceForm)}
                  disabled={actionState.compliance || !hasContractControls}
                >
                  {actionState.compliance ? "Updating..." : "Set compliance"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Stream Freeze
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={freezeForm.frozen}
                    onChange={(event) =>
                      setFreezeForm((current) => ({
                        ...current,
                        frozen: event.target.checked,
                      }))
                    }
                  />
                  Freeze current stream
                </label>
                <input
                  className="input-default w-full"
                  value={freezeForm.reason}
                  onChange={(event) =>
                    setFreezeForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Reason for freeze / unfreeze"
                />
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onFreezeStream(asset, freezeForm)}
                  disabled={
                    actionState.freeze ||
                    !hasContractControls ||
                    !asset.activeStreamId
                  }
                >
                  {actionState.freeze
                    ? "Submitting..."
                    : "Update stream freeze"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Verification Status
                </div>
                <select
                  className="input-default w-full"
                  value={verificationFormState.status}
                  onChange={(event) =>
                    setVerificationFormState((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  {ONCHAIN_VERIFICATION_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {VERIFICATION_STATUS_LABELS[status] || status}
                    </option>
                  ))}
                </select>
                <input
                  className="input-default w-full"
                  value={verificationFormState.reason}
                  onChange={(event) =>
                    setVerificationFormState((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Reason for the verification state"
                />
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onSetVerificationStatus(asset, verificationFormState)}
                  disabled={actionState.verificationStatus || !hasContractControls}
                >
                  {actionState.verificationStatus ? "Updating..." : "Set verification status"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Asset Policy
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={assetPolicyForm.frozen}
                    onChange={(event) =>
                      setAssetPolicyForm((current) => ({
                        ...current,
                        frozen: event.target.checked,
                      }))
                    }
                  />
                  Frozen
                </label>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={assetPolicyForm.disputed}
                    onChange={(event) =>
                      setAssetPolicyForm((current) => ({
                        ...current,
                        disputed: event.target.checked,
                      }))
                    }
                  />
                  Disputed
                </label>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={assetPolicyForm.revoked}
                    onChange={(event) =>
                      setAssetPolicyForm((current) => ({
                        ...current,
                        revoked: event.target.checked,
                      }))
                    }
                  />
                  Revoked
                </label>
                <input
                  className="input-default w-full"
                  value={assetPolicyForm.reason}
                  onChange={(event) =>
                    setAssetPolicyForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Policy reason"
                />
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onSetAssetPolicy(asset, assetPolicyForm)}
                  disabled={actionState.assetPolicy || !hasContractControls}
                >
                  {actionState.assetPolicy ? "Updating..." : "Set asset policy"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Issuer Approval
                </div>
                <input
                  className="input-default w-full"
                  value={issuerApprovalForm.issuer}
                  onChange={(event) =>
                    setIssuerApprovalForm((current) => ({
                      ...current,
                      issuer: event.target.value,
                    }))
                  }
                  placeholder="Issuer address"
                />
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={issuerApprovalForm.approved}
                    onChange={(event) =>
                      setIssuerApprovalForm((current) => ({
                        ...current,
                        approved: event.target.checked,
                      }))
                    }
                  />
                  Approved
                </label>
                <input
                  className="input-default w-full"
                  value={issuerApprovalForm.note}
                  onChange={(event) =>
                    setIssuerApprovalForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Approval note"
                />
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onSetIssuerApproval(asset, issuerApprovalForm)}
                  disabled={actionState.issuerApproval || !hasContractControls}
                >
                  {actionState.issuerApproval ? "Updating..." : "Set issuer approval"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Attestation Policy
                </div>
                <select
                  className="input-default w-full"
                  value={attestationPolicyForm.role}
                  onChange={(event) =>
                    setAttestationPolicyForm((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                >
                  {ATTESTATION_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {ATTESTATION_ROLE_LABELS[role] || role}
                    </option>
                  ))}
                </select>
                <input
                  className="input-default w-full"
                  value={attestationPolicyForm.maxAgeDays}
                  onChange={(event) =>
                    setAttestationPolicyForm((current) => ({
                      ...current,
                      maxAgeDays: event.target.value,
                    }))
                  }
                  placeholder="Max age in days"
                />
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={attestationPolicyForm.required}
                    onChange={(event) =>
                      setAttestationPolicyForm((current) => ({
                        ...current,
                        required: event.target.checked,
                      }))
                    }
                  />
                  Required for verification
                </label>
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onSetAttestationPolicy(asset, attestationPolicyForm)}
                  disabled={actionState.attestationPolicy || !hasContractControls}
                >
                  {actionState.attestationPolicy ? "Updating..." : "Set attestation policy"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Evidence Root Refresh
                </div>
                <input
                  className="input-default w-full"
                  value={evidenceForm.evidenceRoot}
                  onChange={(event) =>
                    setEvidenceForm((current) => ({
                      ...current,
                      evidenceRoot: event.target.value,
                    }))
                  }
                  placeholder="0x evidence root"
                />
                <input
                  className="input-default w-full"
                  value={evidenceForm.evidenceManifestHash}
                  onChange={(event) =>
                    setEvidenceForm((current) => ({
                      ...current,
                      evidenceManifestHash: event.target.value,
                    }))
                  }
                  placeholder="0x evidence manifest hash"
                />
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onUpdateEvidence(asset, evidenceForm)}
                  disabled={
                    actionState.evidence
                    || !hasContractControls
                    || !evidenceForm.evidenceRoot
                    || !evidenceForm.evidenceManifestHash
                  }
                >
                  {actionState.evidence ? "Updating..." : "Update evidence anchors"}
                </button>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Metadata / Tag
                </div>
                <input
                  className="input-default w-full"
                  value={metadataUri}
                  onChange={(event) => setMetadataUri(event.target.value)}
                  placeholder="ipfs://..."
                />
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onUpdateMetadata(asset, metadataUri)}
                  disabled={
                    actionState.metadata || !hasContractControls || !metadataUri
                  }
                >
                  {actionState.metadata
                    ? "Updating metadata..."
                    : "Update metadata URI"}
                </button>
                <input
                  className="input-default w-full"
                  value={tagValue}
                  onChange={(event) => setTagValue(event.target.value)}
                  placeholder="New tag seed / NFC UID"
                />
                <button
                  type="button"
                  className="btn-default w-full justify-center"
                  onClick={() => onUpdateTag(asset, tagValue)}
                  disabled={
                    actionState.tag || !hasContractControls || !tagValue
                  }
                >
                  {actionState.tag
                    ? "Updating tag..."
                    : "Update verification tag"}
                </button>
              </div>
            </div>
          </div>

          <div className="card-glass border border-white/10 p-6">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Indexed Activity
            </div>
            <div className="mt-4 space-y-3">
              {workspaceActivity.length ? (
                workspaceActivity.map((entry, index) => (
                  <div
                    key={`${entry.label}-${entry.timestamp}-${index}`}
                    className="rounded-2xl bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">
                        {entry.label}
                      </div>
                      <div className="text-xs text-white/45">
                        {entry.timestamp}
                      </div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-white/58">
                      {entry.detail}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/45">
                  No indexed activity yet for this asset.
                </div>
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
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Start Rental
            </div>
            <h3 className="mt-2 text-xl font-black tracking-tight text-white">
              {asset.name}
            </h3>
            <div className="mt-1 text-xs text-white/45">{asset.location}</div>
          </div>
          <button
            type="button"
            className="text-white/45 transition-colors hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-white/70">
              Rental Duration (hours)
            </span>
            <input
              type="number"
              min="1"
              className="input-default w-full"
              value={hours}
              onChange={(event) =>
                setHours(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>

          <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/62">
            <div className="flex items-center justify-between gap-3 py-1">
              <span>Price per hour:</span>
              <span className="font-semibold text-white">
                {formatMoney(asset.pricePerHour)} {paymentTokenSymbol}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span>Duration:</span>
              <span className="font-semibold text-white">{hours} hours</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span>Total Budget:</span>
              <span className="font-semibold text-cyan-300">
                {formatMoney(totalBudget)} {paymentTokenSymbol}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="btn-default flex-1 justify-center"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1 justify-center flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onConfirm(asset, hours)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
            ) : (
              'Confirm & Start Stream'
            )}
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
    nativeAccountAddress,
    substrateSession,
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
  const [registryError, setRegistryError] = useState("");
  const [registryFilter, setRegistryFilter] = useState("mine");
  const [verificationForm, setVerificationForm] = useState({
    payload: "",
    tokenId: "",
    cidOrUri: "",
    propertyRef: "",
  });
  const [verificationResult, setVerificationResult] = useState(null);
  const [selectedRentalAsset, setSelectedRentalAsset] = useState(null);
  const [selectedWorkspaceAssetId, setSelectedWorkspaceAssetId] = useState("");
  const [workspaceAsset, setWorkspaceAsset] = useState(null);
  const [workspaceActivity, setWorkspaceActivity] = useState([]);
  const [preparedMetadata, setPreparedMetadata] = useState(null);
  const [workspaceClaimableYield, setWorkspaceClaimableYield] = useState("0");
  const [actionState, setActionState] = useState({
    funding: false,
    claim: false,
    flashAdvance: false,
    attestation: false,
    revokeAttestation: false,
    compliance: false,
    verificationStatus: false,
    assetPolicy: false,
    issuerApproval: false,
    attestationPolicy: false,
    freeze: false,
    evidence: false,
    metadata: false,
    tag: false,
  });
  const [manualActiveRentals, setManualActiveRentals] = useState([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const hubAddress = catalog?.rwa?.hubAddress || "";
  const assetStreamAddress = catalog?.rwa?.assetStreamAddress || "";
  const tokenAddress = catalog?.payments?.tokenAddress || "";
  const hasContractControls = Boolean((signer || substrateSession) && hubAddress);
  const hasFundingControls = Boolean(
    hasContractControls && assetStreamAddress && tokenAddress,
  );

  const activeTab = STUDIO_TABS.some(
    (tab) => tab.key === searchParams.get("tab"),
  )
    ? searchParams.get("tab")
    : "mint";

  const loadRegistry = useCallback(
    async (notify = false) => {
      setIsRegistryLoading(true);
      setRegistryError("");

      try {
        const assets = await fetchRwaAssets();
        setLiveRegistryAssets(
          assets.map((asset) => mapApiAssetToUiAsset(asset)),
        );
        setStatus("Registry synced.");
        if (notify) {
          toast.success("Registry synced with indexed assets.", {
            title: "RWA Studio",
          });
        }
      } catch (error) {
        console.error("Failed to load RWA registry", error);
        setRegistryError(
          error.message || "Unable to reach the RWA API right now.",
        );
        setStatus("Registry sync unavailable.");
        if (notify) {
          toast.error(
            error.message || "Unable to reach the RWA API right now.",
            { title: "Registry sync failed" },
          );
        }
      } finally {
        setIsRegistryLoading(false);
      }
    },
    [setStatus, toast],
  );

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const allAssets = useMemo(() => {
    const fallbackAssets =
      liveRegistryAssets.length || sessionMints.length ? [] : PORTFOLIO_ASSETS;
    const combined = [
      ...sessionMints,
      ...liveRegistryAssets,
      ...fallbackAssets,
    ];
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
    return allAssets.filter(
      (asset) =>
        asset.currentOwner?.toLowerCase() === owner ||
        asset.ownerAddress?.toLowerCase() === owner ||
        asset.issuerAddress?.toLowerCase() === owner,
    );
  }, [allAssets, sessionMints, walletAddress]);

  const streamBackedRentals = useMemo(() => {
    return outgoingStreams
      .map((stream) => {
        try {
          const metadata = JSON.parse(stream.metadata || "{}");
          if (metadata.type !== "rwa-rental") {
            return null;
          }

          const assetTokenId = String(
            metadata.assetTokenId || metadata.assetId || "",
          );
          const asset = allAssets.find(
            (item) => String(item.tokenId || item.id) === assetTokenId,
          );
          if (!asset) {
            return null;
          }

          return {
            asset,
            startedAt: Number(stream.startTime) * 1000,
            durationHours: Math.max(
              1,
              (Number(stream.stopTime) - Number(stream.startTime)) / 3600,
            ),
            totalBudget: Number(
              String(formatEth(stream.totalAmount)).replace(/,/g, ""),
            ),
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

  const registryAssets = registryFilter === "mine" ? ownedAssets : allAssets;
  const latestMint = sessionMints[0] || null;
  const networkName = chainId ? getNetworkName(chainId) : "Westend Asset Hub";

  const setActiveTab = (nextTab) => setTabParam(setSearchParams, nextTab);
  const setActionFlag = (key, value) => {
    setActionState((current) => ({ ...current, [key]: value }));
  };

  const loadWorkspaceAsset = useCallback(
    async (tokenId, { notify = false } = {}) => {
      if (!tokenId) {
        return;
      }

      setSelectedWorkspaceAssetId(String(tokenId));
      setActiveTab("workspace");
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

        if ((provider || substrateSession) && hubAddress) {
          try {
            const claimable = await readClaimableYield({
              provider,
              substrateSession,
              hubAddress,
              tokenId: Number(tokenId),
            });
            setWorkspaceClaimableYield(
              ethers.formatUnits(claimable, paymentTokenDecimals),
            );
          } catch {
            setWorkspaceClaimableYield(String(mappedAsset.yieldBalance || 0));
          }
        } else {
          setWorkspaceClaimableYield(String(mappedAsset.yieldBalance || 0));
        }

        if (notify) {
          toast.success(`Asset #${tokenId} workspace refreshed.`, {
            title: "RWA Studio",
          });
        }
      } catch (error) {
        console.error("Failed to load asset workspace", error);
        const fallbackAsset =
          allAssets.find(
            (item) => String(item.tokenId || item.id) === String(tokenId),
          ) || null;
        if (fallbackAsset) {
          setWorkspaceAsset(fallbackAsset);
          setWorkspaceActivity(fallbackAsset.activity || []);
          setWorkspaceClaimableYield(String(fallbackAsset.yieldBalance || 0));
        }
        toast.error(
          error.message || "Unable to load the asset workspace right now.",
          { title: "Workspace unavailable" },
        );
      } finally {
        setIsWorkspaceLoading(false);
      }
    },
    [allAssets, hubAddress, provider, substrateSession, toast],
  );

  const openWorkspace = useCallback(
    (asset) => {
      const tokenId = asset?.tokenId || asset?.id;
      if (!tokenId) {
        return;
      }

      loadWorkspaceAsset(tokenId);
    },
    [loadWorkspaceAsset],
  );

  const prepareMetadata = useCallback(
    async (form) => {
      const metadata = buildAssetMetadata(form);
      const fingerprint = JSON.stringify(metadata);
      setIsPreparingMetadata(true);
      setStatus("Pinning metadata to IPFS...");

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
        toast.success("Metadata pinned to IPFS.", { title: "IPFS ready" });
      } catch (error) {
        console.error("Failed to pin metadata", error);
        setStatus("IPFS metadata preparation failed.");
        toast.error(error.message || "Unable to pin metadata right now.", {
          title: "IPFS failed",
        });
      } finally {
        setIsPreparingMetadata(false);
      }
    },
    [setStatus, toast],
  );

  const signIssuerAuthorization = useCallback(
    async ({
      issuer,
      rightsModel,
      jurisdiction,
      propertyRef,
      publicMetadataHash,
      evidenceRoot,
    }) => {
      const issuedAt = new Date().toISOString();
      const nonce = `mint-${Date.now()}`;
      const message = buildIssuerAuthorizationMessage({
        issuer,
        rightsModel,
        jurisdiction,
        propertyRef,
        publicMetadataHash,
        evidenceRoot,
        issuedAt,
        nonce,
      });

      if (
        substrateSession?.account?.injected?.signer?.signRaw &&
        nativeAccountAddress
      ) {
        const signatureResult =
          await substrateSession.account.injected.signer.signRaw({
            address: nativeAccountAddress,
            data: textToHex(message),
            type: "bytes",
          });

        return {
          issuedAt,
          nonce,
          signatureType: "substrate",
          signerAddress: nativeAccountAddress,
          signature: signatureResult.signature,
        };
      }

      if (!signer) {
        throw new Error("Connected wallet cannot sign the issuer authorization message.");
      }

      return {
        issuedAt,
        nonce,
        signatureType: "evm",
        signerAddress: walletAddress,
        signature: await signer.signMessage(message),
      };
    },
    [nativeAccountAddress, signer, substrateSession, walletAddress],
  );

  const signAttestationAuthorization = useCallback(
    async ({
      tokenId,
      role,
      attestor,
      evidenceHash,
      statementType,
      expiry,
    }) => {
      const issuedAt = new Date().toISOString();
      const nonce = `attest-${Date.now()}`;
      const message = buildAttestationAuthorizationMessage({
        tokenId,
        role,
        attestor,
        evidenceHash,
        statementType,
        expiry,
        issuedAt,
        nonce,
      });

      if (
        substrateSession?.account?.injected?.signer?.signRaw &&
        nativeAccountAddress
      ) {
        const signatureResult =
          await substrateSession.account.injected.signer.signRaw({
            address: nativeAccountAddress,
            data: textToHex(message),
            type: "bytes",
          });

        return {
          issuedAt,
          nonce,
          signatureType: "substrate",
          signerAddress: nativeAccountAddress,
          signature: signatureResult.signature,
        };
      }

      if (!signer) {
        throw new Error("Connected wallet cannot sign the attestation authorization message.");
      }

      return {
        issuedAt,
        nonce,
        signatureType: "evm",
        signerAddress: walletAddress,
        signature: await signer.signMessage(message),
      };
    },
    [nativeAccountAddress, signer, substrateSession, walletAddress],
  );

  const signAttestationRevocationAuthorization = useCallback(
    async ({ attestationId, attestor, reason }) => {
      const issuedAt = new Date().toISOString();
      const nonce = `revoke-${Date.now()}`;
      const message = buildAttestationRevocationAuthorizationMessage({
        attestationId,
        attestor,
        reason,
        issuedAt,
        nonce,
      });

      if (
        substrateSession?.account?.injected?.signer?.signRaw &&
        nativeAccountAddress
      ) {
        const signatureResult =
          await substrateSession.account.injected.signer.signRaw({
            address: nativeAccountAddress,
            data: textToHex(message),
            type: "bytes",
          });

        return {
          issuedAt,
          nonce,
          signatureType: "substrate",
          signerAddress: nativeAccountAddress,
          signature: signatureResult.signature,
        };
      }

      if (!signer) {
        throw new Error(
          "Connected wallet cannot sign the attestation revocation message.",
        );
      }

      return {
        issuedAt,
        nonce,
        signatureType: "evm",
        signerAddress: walletAddress,
        signature: await signer.signMessage(message),
      };
    },
    [nativeAccountAddress, signer, substrateSession, walletAddress],
  );

  const buildVerificationResult = useCallback((response, fallbackAsset) => {
    const mappedAsset = response?.asset
      ? mapApiAssetToUiAsset({
          ...response.asset,
          publicMetadata:
            response.metadata || response.asset.publicMetadata || response.asset.metadata,
          activity: response.activity || [],
        })
      : fallbackAsset;

    const status = response?.status || (response?.authentic ? "verified" : "mismatch");

    return {
      authentic: ["verified", "verified_with_warnings", "legacy_verified"].includes(
        status,
      ),
      asset: mappedAsset || null,
      status,
      statusLabel: VERIFICATION_STATUS_LABELS[status] || status,
      checks: response?.checks || [],
      warnings: response?.warnings || [],
      failures: response?.failures || [],
      requiredActions: response?.requiredActions || [],
      evidenceCoverage: response?.evidenceCoverage || {
        requiredDocuments: [],
        presentDocuments: [],
        missingRequiredDocuments: [],
        documentCount: 0,
      },
      attestationCoverage: response?.attestationCoverage || {
        requiredRoles: [],
        presentRoles: [],
        missingRoles: [],
        staleRoles: [],
      },
      documentFreshness: response?.documentFreshness || {
        staleDocuments: [],
        validDocuments: [],
      },
      reason:
        response?.failures?.[0] ||
        response?.warnings?.[0] ||
        response?.asset?.statusReason ||
        "Verification completed.",
    };
  }, []);

  const runVerification = useCallback(
    async (form) => {
      setIsVerifyingAsset(true);
      try {
        const response = await verifyRwaAsset({
          payload: form.payload || undefined,
          tokenId: form.tokenId || undefined,
          uri: form.cidOrUri || undefined,
          propertyRef: form.propertyRef || undefined,
        });
        const result = buildVerificationResult(response);
        setVerificationResult(result);
        setStatus(
          result.authentic
            ? `Verification passed for Asset #${
                result.asset?.tokenId || form.tokenId
              }.`
            : "Verification returned a mismatch.",
        );

        if (result.authentic && result.asset) {
          toast.success(`Asset #${result.asset.tokenId} passed verification.`, {
            title: "Authentic",
          });
        } else {
          toast.warning(result.reason, { title: "Verification mismatch" });
        }
      } catch (error) {
        console.error("Verification failed", error);
        const fallback = verifyAssetRecord(form, allAssets);
        setVerificationResult(fallback);
        setStatus(
          "Verification service unavailable. Showing local registry comparison.",
        );
        toast.warning(error.message || "Verification service unavailable.", {
          title: "Verification fallback",
        });
      } finally {
        setIsVerifyingAsset(false);
      }
    },
    [allAssets, buildVerificationResult, setStatus, toast],
  );

  const openVerify = (asset) => {
    const nextForm = {
      payload: asset.verificationPayload || "",
      tokenId: String(asset.tokenId || asset.id || ""),
      cidOrUri: asset.ipfsUri || "",
      propertyRef: asset.publicMetadata?.propertyRef || "",
    };
    setVerificationForm(nextForm);
    setVerificationResult(null);
    setActiveTab("verify");

    if (nextForm.payload || (nextForm.tokenId && nextForm.cidOrUri)) {
      runVerification(nextForm);
    }
  };

  const openRental = (asset) => {
    setSelectedRentalAsset(asset);
  };

  const handleMint = async (form) => {
    if (!walletAddress) {
      toast.warning("Connect your wallet to prepare an asset in the studio.", {
        title: "Wallet required",
      });
      return;
    }

    const requiredEvidenceFields = [
      "deedHash",
      "surveyHash",
      "valuationHash",
      "inspectionHash",
      "insuranceHash",
      "taxHash",
    ];
    const missingEvidence = requiredEvidenceFields.filter(
      (field) => !String(form[field] || "").trim(),
    );
    if (!form.propertyRef.trim()) {
      toast.warning("Add a property or asset reference before minting.", {
        title: "Reference required",
      });
      return;
    }
    if (missingEvidence.length > 0) {
      toast.warning(
        "Fill the private evidence hashes before minting the rental twin.",
        { title: "Evidence required" },
      );
      return;
    }

    setIsMintingAsset(true);
    setStatus("Anchoring evidence, authorizing issuer, and minting the rental twin...");
    const metadata = buildAssetMetadata(form);
    const evidenceBundle = buildEvidenceBundle(form);
    const preparedFingerprint = JSON.stringify(metadata);
    const preparedUri =
      preparedMetadata?.fingerprint === preparedFingerprint
        ? preparedMetadata.uri
        : "";

    try {
      const publicMetadataHash = hashJson(metadata);
      const evidenceResponse = await storeRwaEvidence({
        rightsModel: form.rightsModel,
        propertyRef: form.propertyRef.trim(),
        jurisdiction: form.jurisdiction.trim(),
        evidenceBundle,
      });
      const issuerAuthorization = await signIssuerAuthorization({
        issuer: walletAddress,
        rightsModel: form.rightsModel,
        jurisdiction: form.jurisdiction.trim(),
        propertyRef: form.propertyRef.trim(),
        publicMetadataHash,
        evidenceRoot: evidenceResponse.evidenceRoot,
      });

      const response = await mintRwaAsset({
        issuer: walletAddress,
        assetType: TYPE_TO_CHAIN_ASSET_TYPE[form.type] || 1,
        rightsModel: form.rightsModel,
        jurisdiction: form.jurisdiction.trim(),
        propertyRef: form.propertyRef.trim(),
        publicMetadata: preparedUri ? metadata : metadata,
        publicMetadataURI: preparedUri || undefined,
        evidenceRoot: evidenceResponse.evidenceRoot,
        evidenceManifestHash: evidenceResponse.evidenceManifestHash,
        issuerAuthorization,
        tag: form.tagSeed.trim(),
      });

      const asset = mapApiAssetToUiAsset({
        ...(response.asset || {}),
        publicMetadata:
          response.asset?.publicMetadata || response.metadata || metadata,
        evidenceSummary: response.evidenceSummary,
        activity: response.asset?.activity || [],
      });
      asset.attestationRequirements = response.attestationRequirements || [];
      asset.verificationPayload =
        response.verificationPayload || asset.verificationPayload;
      asset.verificationUrl = response.verificationUrl || asset.verificationUrl;
      asset.verificationApiUrl =
        response.verificationApiUrl || asset.verificationApiUrl;
      asset.evidenceSummary = response.evidenceSummary || asset.evidenceSummary;

      setSessionMints((current) => [
        asset,
        ...current.filter(
          (item) => String(item.tokenId) !== String(asset.tokenId),
        ),
      ]);
      setRegistryFilter("mine");
      setVerificationForm({
        payload: asset.verificationPayload || "",
        tokenId: String(asset.tokenId),
        cidOrUri: asset.ipfsUri,
        propertyRef: form.propertyRef.trim(),
      });
      setVerificationResult(null);
      setStatus(`Minted Asset #${asset.tokenId} in RWA Studio.`);
      toast.success(`Asset #${asset.tokenId} was minted and indexed.`, {
        title: "Asset minted",
      });
      await loadRegistry();
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Mint failed", error);
      setStatus("Asset mint failed.");
      toast.error(error.message || "Unable to mint the asset right now.", {
        title: "Mint failed",
      });
    } finally {
      setIsMintingAsset(false);
    }
  };

  const handleVerify = async () => {
    await runVerification(verificationForm);
  };

  const handleFundYieldStream = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning(
        "Connect a compatible controller wallet to fund an asset stream.",
        { title: "Wallet required" },
      );
      return;
    }

    setActionFlag("funding", true);
    try {
      await approveAndCreateAssetYieldStream({
        signer,
        substrateSession,
        tokenAddress,
        streamAddress: assetStreamAddress,
        hubAddress,
        tokenId: Number(asset.tokenId),
        totalAmount: parseTokenAmount(form.amount, paymentTokenDecimals),
        duration: Number(form.duration || 0),
      });
      toast.success(`Yield stream funded for Asset #${asset.tokenId}.`, {
        title: "Stream funded",
      });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error("Failed to fund asset yield stream", error);
      toast.error(error.message || "Unable to fund the asset stream.", {
        title: "Funding failed",
      });
    } finally {
      setActionFlag("funding", false);
    }
  };

  const handleClaimYieldAction = async (asset) => {
    if (!hasContractControls) {
      toast.warning("Connect a compatible wallet to claim yield.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("claim", true);
    try {
      await claimAssetYield({
        signer,
        substrateSession,
        hubAddress,
        tokenId: Number(asset.tokenId),
      });
      toast.success(`Yield claimed for Asset #${asset.tokenId}.`, {
        title: "Yield claimed",
      });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error("Failed to claim yield", error);
      toast.error(error.message || "Unable to claim yield right now.", {
        title: "Claim failed",
      });
    } finally {
      setActionFlag("claim", false);
    }
  };

  const handleSubmitAttestationAction = async (asset, form) => {
    if (!walletAddress) {
      toast.warning("Connect the attestor wallet before recording an attestation.", {
        title: "Wallet required",
      });
      return;
    }
    if (!form.evidenceHash.trim() || !form.statementType.trim()) {
      toast.warning("Provide an evidence hash and statement type before recording the attestation.", {
        title: "Attestation incomplete",
      });
      return;
    }

    setActionFlag("attestation", true);
    try {
      const attestationAddress = form.attestor.trim() || walletAddress;
      const expiry = form.expiry
        ? Math.floor(new Date(form.expiry).getTime() / 1000)
        : 0;
      const attestationAuthorization = await signAttestationAuthorization({
        tokenId: Number(asset.tokenId),
        role: form.role,
        attestor: attestationAddress,
        evidenceHash: form.evidenceHash.trim(),
        statementType: form.statementType.trim(),
        expiry,
      });

      await submitRwaAttestation({
        tokenId: Number(asset.tokenId),
        role: form.role,
        attestor: attestationAddress,
        evidenceHash: form.evidenceHash.trim(),
        statementType: form.statementType.trim(),
        expiry,
        attestationAuthorization,
      });

      toast.success(`Attestation recorded for Asset #${asset.tokenId}.`, {
        title: "Attestation recorded",
      });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error("Failed to record attestation", error);
      toast.error(error.message || "Unable to record the attestation right now.", {
        title: "Attestation failed",
      });
    } finally {
      setActionFlag("attestation", false);
    }
  };

  const handleRevokeAttestationAction = async (asset, attestationId, reason) => {
    if (!walletAddress) {
      toast.warning("Connect the attestor wallet before revoking an attestation.", {
        title: "Wallet required",
      });
      return;
    }

    const attestation = asset.attestations?.find(
      (item) => Number(item.attestationId) === Number(attestationId),
    );
    if (!attestation) {
      toast.warning("That attestation could not be found in the current workspace snapshot.", {
        title: "Attestation missing",
      });
      return;
    }

    setActionFlag("revokeAttestation", true);
    try {
      const revocationAuthorization =
        await signAttestationRevocationAuthorization({
          attestationId: Number(attestationId),
          attestor: attestation.attestor,
          reason: reason || "",
        });

      await revokeRwaAttestation({
        attestationId: Number(attestationId),
        reason: reason || "",
        revocationAuthorization,
      });

      toast.success(`Attestation #${attestationId} revoked.`, {
        title: "Attestation revoked",
      });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error("Failed to revoke attestation", error);
      toast.error(error.message || "Unable to revoke the attestation right now.", {
        title: "Revocation failed",
      });
    } finally {
      setActionFlag("revokeAttestation", false);
    }
  };

  const handleFlashAdvanceAction = async (asset, amountValue) => {
    if (!hasContractControls) {
      toast.warning("Connect a compatible wallet to flash advance yield.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("flashAdvance", true);
    try {
      await flashAdvanceAssetYield({
        signer,
        substrateSession,
        hubAddress,
        tokenId: Number(asset.tokenId),
        amount: parseTokenAmount(amountValue, paymentTokenDecimals),
      });
      toast.success(`Flash advance executed for Asset #${asset.tokenId}.`, {
        title: "Advance executed",
      });
      await Promise.all([loadRegistry(), loadWorkspaceAsset(asset.tokenId)]);
    } catch (error) {
      console.error("Failed to execute flash advance", error);
      toast.error(error.message || "Unable to execute flash advance.", {
        title: "Advance failed",
      });
    } finally {
      setActionFlag("flashAdvance", false);
    }
  };

  const handleSetComplianceAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to update compliance.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("compliance", true);
    try {
      const expiry = form.expiry
        ? Math.floor(new Date(form.expiry).getTime() / 1000)
        : 0;
      await setAssetCompliance({
        signer,
        substrateSession,
        hubAddress,
        user: form.user,
        assetType:
          TYPE_TO_CHAIN_ASSET_TYPE[asset.type] || Number(asset.assetType || 1),
        approved: Boolean(form.approved),
        expiry,
        jurisdiction: form.jurisdiction,
      });
      toast.success(`Compliance updated for Asset #${asset.tokenId}.`, {
        title: "Compliance updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to set compliance", error);
      toast.error(error.message || "Unable to update compliance.", {
        title: "Compliance failed",
      });
    } finally {
      setActionFlag("compliance", false);
    }
  };

  const handleSetVerificationStatusAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to update verification status.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("verificationStatus", true);
    try {
      await setAssetVerificationStatus({
        signer,
        substrateSession,
        hubAddress,
        tokenId: Number(asset.tokenId),
        status: ONCHAIN_VERIFICATION_STATUS_OPTIONS.indexOf(form.status),
        reason: form.reason || "",
      });
      toast.success(`Verification status updated for Asset #${asset.tokenId}.`, {
        title: "Verification updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to update verification status", error);
      toast.error(error.message || "Unable to update verification status.", {
        title: "Verification failed",
      });
    } finally {
      setActionFlag("verificationStatus", false);
    }
  };

  const handleSetAssetPolicyAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to update asset policy.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("assetPolicy", true);
    try {
      await setAssetPolicyOnChain({
        signer,
        substrateSession,
        hubAddress,
        tokenId: Number(asset.tokenId),
        frozen: Boolean(form.frozen),
        disputed: Boolean(form.disputed),
        revoked: Boolean(form.revoked),
        reason: form.reason || "",
      });
      toast.success(`Asset policy updated for Asset #${asset.tokenId}.`, {
        title: "Policy updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to update asset policy", error);
      toast.error(error.message || "Unable to update asset policy.", {
        title: "Policy failed",
      });
    } finally {
      setActionFlag("assetPolicy", false);
    }
  };

  const handleSetIssuerApprovalAction = async (_asset, form) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to update issuer approval.", {
        title: "Wallet required",
      });
      return;
    }
    if (!form.issuer.trim()) {
      toast.warning("Provide an issuer address before updating approval.", {
        title: "Issuer required",
      });
      return;
    }

    setActionFlag("issuerApproval", true);
    try {
      await setAssetIssuerApproval({
        signer,
        substrateSession,
        hubAddress,
        issuer: form.issuer.trim(),
        approved: Boolean(form.approved),
        note: form.note || "",
      });
      toast.success(`Issuer approval updated for ${form.issuer.trim()}.`, {
        title: "Issuer updated",
      });
      await loadRegistry();
      if (selectedWorkspaceAssetId) {
        await loadWorkspaceAsset(selectedWorkspaceAssetId);
      }
    } catch (error) {
      console.error("Failed to update issuer approval", error);
      toast.error(error.message || "Unable to update issuer approval.", {
        title: "Issuer failed",
      });
    } finally {
      setActionFlag("issuerApproval", false);
    }
  };

  const handleSetAttestationPolicyAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to update attestation policy.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("attestationPolicy", true);
    try {
      await setAssetAttestationPolicy({
        signer,
        substrateSession,
        hubAddress,
        assetType: TYPE_TO_CHAIN_ASSET_TYPE[asset.type] || Number(asset.assetType || 1),
        role: ATTESTATION_ROLE_CODES[form.role],
        required: Boolean(form.required),
        maxAge: Number(form.maxAgeDays || 0) * 86400,
      });
      toast.success(`Attestation policy updated for ${ATTESTATION_ROLE_LABELS[form.role] || form.role}.`, {
        title: "Policy updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to update attestation policy", error);
      toast.error(error.message || "Unable to update attestation policy.", {
        title: "Policy failed",
      });
    } finally {
      setActionFlag("attestationPolicy", false);
    }
  };

  const handleUpdateEvidenceAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to update evidence anchors.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("evidence", true);
    try {
      await updateAssetEvidenceOnChain({
        signer,
        substrateSession,
        hubAddress,
        tokenId: Number(asset.tokenId),
        evidenceRoot: form.evidenceRoot,
        evidenceManifestHash: form.evidenceManifestHash,
      });
      toast.success(`Evidence anchors updated for Asset #${asset.tokenId}.`, {
        title: "Evidence updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to update evidence anchors", error);
      toast.error(error.message || "Unable to update evidence anchors.", {
        title: "Evidence failed",
      });
    } finally {
      setActionFlag("evidence", false);
    }
  };

  const handleFreezeStreamAction = async (asset, form) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to freeze a stream.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("freeze", true);
    try {
      await setAssetStreamFreeze({
        signer,
        substrateSession,
        hubAddress,
        streamId: Number(asset.activeStreamId),
        frozen: Boolean(form.frozen),
        reason: form.reason || "",
      });
      toast.success(`Stream freeze updated for Asset #${asset.tokenId}.`, {
        title: "Freeze updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to update freeze state", error);
      toast.error(
        error.message || "Unable to update the stream freeze state.",
        { title: "Freeze failed" },
      );
    } finally {
      setActionFlag("freeze", false);
    }
  };

  const handleUpdateMetadataAction = async (asset, metadataURI) => {
    if (!hasContractControls) {
      toast.warning("Connect a controller wallet to update metadata.", {
        title: "Wallet required",
      });
      return;
    }

    setActionFlag("metadata", true);
    try {
      await updateAssetMetadataOnChain({
        signer,
        substrateSession,
        hubAddress,
        tokenId: Number(asset.tokenId),
        metadataURI,
      });
      toast.success(`Metadata URI updated for Asset #${asset.tokenId}.`, {
        title: "Metadata updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to update metadata URI", error);
      toast.error(error.message || "Unable to update metadata URI.", {
        title: "Metadata update failed",
      });
    } finally {
      setActionFlag("metadata", false);
    }
  };

  const handleUpdateTagAction = async (asset, tagValue) => {
    if (!hasContractControls) {
      toast.warning(
        "Connect a controller wallet to update the verification tag.",
        { title: "Wallet required" },
      );
      return;
    }

    setActionFlag("tag", true);
    try {
      await updateAssetVerificationTag({
        signer,
        substrateSession,
        hubAddress,
        tokenId: Number(asset.tokenId),
        tag: tagValue,
      });
      toast.success(`Verification tag updated for Asset #${asset.tokenId}.`, {
        title: "Tag updated",
      });
      await loadWorkspaceAsset(asset.tokenId);
    } catch (error) {
      console.error("Failed to update verification tag", error);
      toast.error(error.message || "Unable to update the verification tag.", {
        title: "Tag update failed",
      });
    } finally {
      setActionFlag("tag", false);
    }
  };

  const handleStartRental = async (asset, hours) => {
    if (!walletAddress) {
      toast.warning("Connect your wallet to start a rental stream.", {
        title: "Wallet required",
      });
      return;
    }

    const totalBudget = Number((asset.pricePerHour * hours).toFixed(4));
    const metadata = buildRentalStreamMetadata(asset, hours);

    if (typeof createStream !== "function") {
      toast.warning("Wallet streaming is not available in this session.", {
        title: "Stream unavailable",
      });
      return;
    }

    let streamId = null;
    try {
      streamId = await createStream(
        asset.ownerAddress,
        String(hours * 3600),
        totalBudget.toFixed(6),
        metadata,
      );
    } catch (error) {
      console.error("Rental stream setup failed", error);
    }

    if (streamId == null) {
      toast.error("Unable to start the rental stream.", {
        title: "Stream failed",
      });
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
    setActiveTab("active");
    setStatus(
      streamId
        ? `Rental stream #${streamId} started.`
        : `Rental prepared for Asset #${asset.id}.`,
    );
    toast.success(`Rental started for Asset #${asset.id}.`, {
      title: "Rental active",
    });
  };

  const handleEndRental = async (rental) => {
    try {
      if (rental.streamId) {
        await cancel?.(rental.streamId);
      }
      setManualActiveRentals((current) =>
        current.filter((item) => item.asset.id !== rental.asset.id),
      );
      setStatus(`Ended rental for Asset #${rental.asset.id}.`);
      toast.info(`Rental for Asset #${rental.asset.id} was ended.`, {
        title: "Rental ended",
      });
    } catch (error) {
      console.error("Failed to end rental", error);
      toast.error(error.message || "Unable to end the rental stream.", {
        title: "Cancellation failed",
      });
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

          {activeTab === "mint" && (
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

          {activeTab === "verify" && (
            <VerifyPanel
              form={verificationForm}
              setForm={setVerificationForm}
              result={verificationResult}
              onVerify={handleVerify}
              networkName={networkName}
              isVerifying={isVerifyingAsset}
            />
          )}

          {activeTab === "rent" && (
            <RentPanel assets={allAssets} onOpenRental={openRental} />
          )}

          {activeTab === "active" && (
            <ActiveRentalsPanel
              rentals={activeRentals}
              nowMs={nowMs}
              onBrowseRentals={() => setActiveTab("rent")}
              onEndRental={handleEndRental}
            />
          )}

          {activeTab === "portfolio" && (
            <PortfolioPanel
              assets={ownedAssets}
              onRefresh={handleRefreshPortfolio}
              onOpenVerify={openVerify}
              onOpenRental={openRental}
              onOpenWorkspace={openWorkspace}
            />
          )}

          {activeTab === "workspace" && (
            <AssetWorkspacePanel
              asset={workspaceAsset}
              activity={workspaceActivity}
              isLoading={isWorkspaceLoading}
              networkName={networkName}
              claimableYieldDisplay={workspaceClaimableYield}
              actionState={actionState}
              hasContractControls={hasContractControls}
              hasFundingControls={hasFundingControls}
              controllerAddress={walletAddress}
              onRefresh={() =>
                loadWorkspaceAsset(selectedWorkspaceAssetId, { notify: true })
              }
              onOpenVerify={openVerify}
              onOpenRental={openRental}
              onFundYieldStream={handleFundYieldStream}
              onClaimYield={handleClaimYieldAction}
              onFlashAdvance={handleFlashAdvanceAction}
              onSubmitAttestation={handleSubmitAttestationAction}
              onRevokeAttestation={handleRevokeAttestationAction}
              onSetCompliance={handleSetComplianceAction}
              onSetVerificationStatus={handleSetVerificationStatusAction}
              onSetAssetPolicy={handleSetAssetPolicyAction}
              onSetIssuerApproval={handleSetIssuerApprovalAction}
              onSetAttestationPolicy={handleSetAttestationPolicyAction}
              onFreezeStream={handleFreezeStreamAction}
              onUpdateEvidence={handleUpdateEvidenceAction}
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
          isProcessing={
            isProcessing ||
            isMintingAsset ||
            isVerifyingAsset ||
            isRegistryLoading
          }
        />
      )}
    </div>
  );
}
