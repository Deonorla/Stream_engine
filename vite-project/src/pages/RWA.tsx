import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Car,
  CheckCircle2,
  CircleAlert,
  Cpu,
  FilePenLine,
  FileText,
  Info,
  ShieldCheck,
  UploadCloud,
  WalletCards,
} from 'lucide-react';
import {
  ATTESTATION_ROLE_LABELS,
  mapApiAssetToUiAsset,
  PORTFOLIO_ASSETS,
  TYPE_TO_CHAIN_ASSET_TYPE,
} from './rwa/rwaData';
import { AssetCard, AssetDetailPortal } from '../components/AssetCard';
import RentalSessionComposer from '../components/RentalSessionComposer.tsx';
import { useWallet } from '../context/WalletContext';
import { supportedPaymentAssets } from '../contactInfo.js';
import {
  fetchRwaAsset,
  fetchRwaAssets,
  mintRwaAsset,
  pinRwaMetadata,
  storeRwaEvidence,
} from '../services/rwaApi.js';
import {
  approveAndCreateAssetYieldStream,
  claimAssetYield,
  flashAdvanceAssetYield,
  parseTokenAmount,
  registerAssetAttestationWithFreighter,
  revokeAssetAttestationWithFreighter,
  updateAssetEvidenceOnChain,
  updateAssetMetadataOnChain,
  updateAssetVerificationTag,
} from '../services/rwaContractApi.js';
import {
  hashJson,
  hashText,
} from '../lib/stellarRwaContracts.ts';
import { createIssuerAuthorization } from '../lib/rwaAuthorization.js';

const ASSET_CATEGORIES = [
  { key: 'real_estate', label: 'Real Estate', Icon: Building2 },
  { key: 'vehicle', label: 'Vehicle', Icon: Car },
  { key: 'commodity', label: 'Equipment', Icon: Cpu },
];

const DEFAULT_FORM = {
  name: '',
  location: '',
  yieldTargetPercent: '',
  estimatedValueUsd: '',
};

const RIGHTS_MODEL = 'verified_rental_asset';
const DOCUMENT_ORDER = ['deed', 'survey', 'valuation', 'inspection', 'insurance', 'tax', 'tenancy', 'encumbrance'];
const ACCESS_MECHANISMS = {
  real_estate: 'Smart lock + concierge verification',
  vehicle: 'IoT ignition unlock',
  commodity: 'Telematics unlock + operator dispatch',
};
const DOCUMENT_LABELS = {
  deed: 'Title deed',
  survey: 'Survey plan',
  valuation: 'Valuation',
  inspection: 'Inspection',
  insurance: 'Insurance',
  tax: 'Tax record',
  tenancy: 'Tenancy',
  encumbrance: 'Encumbrance',
};
const DOCUMENT_KEYWORDS = {
  deed: ['deed', 'title', 'ownership'],
  survey: ['survey', 'plan', 'site'],
  valuation: ['valuation', 'appraisal', 'value'],
  inspection: ['inspection', 'engineer', 'condition'],
  insurance: ['insurance', 'policy', 'cover'],
  tax: ['tax', 'levy', 'rate'],
  tenancy: ['tenancy', 'lease', 'rental'],
  encumbrance: ['encumbrance', 'lien', 'charge'],
};
const DEFAULT_PAYMENT_ASSET = supportedPaymentAssets.find((asset) => !asset.isNative) || supportedPaymentAssets[0];
const OWNER_ACTION_HINT = 'Connect the current owner wallet in Freighter to use these controls.';
const ATTESTATION_ROLE_CODES = {
  issuer: 1,
  lawyer: 2,
  registrar: 3,
  inspector: 4,
  valuer: 5,
  insurer: 6,
  compliance: 7,
};
const ATTESTATION_ROLE_OPTIONS = Object.entries(ATTESTATION_ROLE_LABELS).map(([key, label], index) => ({
  key,
  label,
  code: ATTESTATION_ROLE_CODES[key] || index + 1,
}));

function formatCompactNumber(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: numeric >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrency(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '$0.00';
  }
  return `$${numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTimestamp(value) {
  const numeric = Number(value || 0);
  if (!numeric) {
    return 'Not set';
  }
  return new Date(numeric * 1000).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatShortAddress(value) {
  if (!value) {
    return 'Unassigned';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function buildPropertyRef(name, location, category) {
  const categoryCode = category === 'commodity' ? 'EQP' : category === 'vehicle' ? 'VEH' : 'REA';
  const nameSlug = slugify(name) || 'ASSET';
  const locationSlug = slugify(location).slice(0, 12) || 'GLOBAL';
  return `STREAM-${categoryCode}-${nameSlug}-${locationSlug}`;
}

function arrayBufferToHex(buffer) {
  return `0x${Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

async function hashFile(file) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('This browser does not support secure local document hashing.');
  }
  const buffer = await file.arrayBuffer();
  const digest = await subtle.digest('SHA-256', buffer);
  return arrayBufferToHex(digest);
}

function resolveDocumentKey(fileName, usedKeys) {
  const normalized = String(fileName || '').toLowerCase();
  for (const [key, keywords] of Object.entries(DOCUMENT_KEYWORDS)) {
    if (usedKeys.has(key)) {
      continue;
    }
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return key;
    }
  }

  return DOCUMENT_ORDER.find((key) => !usedKeys.has(key)) || null;
}

async function buildEvidenceBundle(files, { propertyRef, jurisdiction, rightsModel }) {
  const documents = {};
  const usedKeys = new Set();

  for (const file of files) {
    let key = resolveDocumentKey(file.name, usedKeys);
    if (!key) {
      // overflow: use sanitized filename as key
      key = file.name.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 32);
      let deduped = key;
      let i = 2;
      while (usedKeys.has(deduped)) deduped = `${key}_${i++}`;
      key = deduped;
    }
    usedKeys.add(key);
    documents[key] = {
      hash: await hashFile(file),
      issuer: 'Owner supplied private evidence',
      reference: file.name,
      notes: `Fingerprint captured locally for ${file.name}`,
    };
  }

  return {
    rightsModel,
    propertyRef,
    jurisdiction,
    notes: `Uploaded privately via RWA Studio on ${new Date().toISOString()}.`,
    documents,
  };
}

function buildPublicMetadata({ category, form, propertyRef, evidenceFiles }) {
  const estimatedValueUsd = Number(form.estimatedValueUsd || 0);
  const yieldTargetPercent = Number(form.yieldTargetPercent || 0);
  const annualYieldTarget = estimatedValueUsd > 0 && yieldTargetPercent > 0
    ? (estimatedValueUsd * yieldTargetPercent) / 100
    : 0;
  const monthlyYieldTarget = annualYieldTarget / 12;
  const categoryLabel = ASSET_CATEGORIES.find((item) => item.key === category)?.label || 'Rental Asset';
  const accessMechanism = ACCESS_MECHANISMS[category] || 'Verified access control';

  return {
    name: form.name.trim(),
    description: `${categoryLabel} in ${form.location.trim()} verified as a productive rental twin for Stellar settlement.`,
    location: form.location.trim(),
    assetType: category,
    rightsModel: RIGHTS_MODEL,
    propertyRef,
    tagSeed: `${propertyRef}-VERIFY`,
    accessMechanism,
    monthlyYieldTarget: Number(monthlyYieldTarget.toFixed(2)),
    pricePerHour: Number((monthlyYieldTarget / 720 || 0).toFixed(6)),
    attributes: [
      { trait_type: 'Asset Type', value: category },
      { trait_type: 'Rights Model', value: RIGHTS_MODEL },
      { trait_type: 'Estimated Value (USD)', value: estimatedValueUsd || 0 },
      { trait_type: 'Yield Target (%)', value: yieldTargetPercent || 0 },
      { trait_type: 'Evidence Documents', value: evidenceFiles.length },
    ],
  };
}

function buildOptimisticAsset({
  tokenId,
  category,
  issuer,
  metadataURI,
  publicMetadata,
  publicMetadataHash,
  evidenceRoot,
  evidenceManifestHash,
  propertyRef,
}) {
  return mapApiAssetToUiAsset({
    tokenId,
    assetType: TYPE_TO_CHAIN_ASSET_TYPE[category],
    rightsModel: RIGHTS_MODEL,
    verificationStatusLabel: 'pending_attestation',
    statusReason: 'Awaiting attestation review',
    propertyRefHash: hashText(propertyRef),
    publicMetadataHash,
    evidenceRoot,
    evidenceManifestHash,
    publicMetadataURI: metadataURI,
    metadataURI,
    tokenURI: metadataURI,
    publicMetadata,
    currentOwner: issuer,
    issuer,
    activeStreamId: 0,
    claimableYield: '0',
    stream: null,
    attestationPolicies: [],
    attestations: [],
    assetPolicy: {
      frozen: false,
      disputed: false,
      revoked: false,
      reason: '',
    },
  });
}

function buildUpdatedPublicMetadata(asset, { description, location, tagSeed }) {
  const current = asset.publicMetadata || asset.metadata || {};
  const nextDescription = description.trim() || current.description || asset.description;
  const nextLocation = location.trim() || current.location || asset.location;
  return {
    ...current,
    name: current.name || asset.name,
    description: nextDescription,
    location: nextLocation,
    tagSeed: tagSeed.trim() || current.tagSeed || `${current.propertyRef || asset.id}-VERIFY`,
  };
}

function AssetWorkspacePanel({ asset, onAssetChanged }) {
  const { fetchPaymentBalance, signer, toast, walletAddress } = useWallet();
  const [attestationRole, setAttestationRole] = useState(() => {
    const suggestedRole = asset?.attestationPolicies?.find((policy) => policy.required)?.role;
    return Number(suggestedRole || 2);
  });
  const [attestationStatement, setAttestationStatement] = useState('evidence_review_complete');
  const [yieldAmount, setYieldAmount] = useState('');
  const [yieldDuration, setYieldDuration] = useState('2592000');
  const [flashAmount, setFlashAmount] = useState('');
  const [paymentToken, setPaymentToken] = useState(DEFAULT_PAYMENT_ASSET?.symbol || 'USDC');
  const [metadataDescription, setMetadataDescription] = useState(asset?.publicMetadata?.description || asset?.description || '');
  const [metadataLocation, setMetadataLocation] = useState(asset?.publicMetadata?.location || asset?.location || '');
  const [tagSeed, setTagSeed] = useState(asset?.publicMetadata?.tagSeed || asset?.tagSeed || '');
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const evidenceInputRef = useRef(null);

  useEffect(() => {
    setMetadataDescription(asset?.publicMetadata?.description || asset?.description || '');
    setMetadataLocation(asset?.publicMetadata?.location || asset?.location || '');
    setTagSeed(asset?.publicMetadata?.tagSeed || asset?.tagSeed || '');
    setEvidenceFiles([]);
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = '';
    }
    const suggestedRole = asset?.attestationPolicies?.find((policy) => policy.required)?.role;
    setAttestationRole(Number(suggestedRole || 2));
  }, [asset]);

  const isOwner = Boolean(walletAddress && (walletAddress === asset.currentOwner || walletAddress === asset.ownerAddress));
  const missingDocuments = asset.evidenceSummary?.missingRequiredDocuments || [];
  const missingRoles = (asset.attestationPolicies || [])
    .filter((policy) => policy.required)
    .map((policy) => policy.roleLabel)
    .filter((roleLabel) => !(asset.attestations || []).some((attestation) => !attestation.revoked && attestation.roleLabel === roleLabel));

  const syncAsset = async (tokenId) => {
    const refreshed = await fetchRwaAsset(tokenId);
    const mapped = refreshed ? mapApiAssetToUiAsset(refreshed) : null;
    if (mapped) {
      onAssetChanged?.(mapped);
    }
    return mapped;
  };

  const runAction = async (message, action) => {
    let loadingToast = null;
    try {
      setIsBusy(true);
      loadingToast = toast.transaction.pending(message);
      const result = await action();
      if (typeof fetchPaymentBalance === 'function') {
        await fetchPaymentBalance();
      }
      const refreshed = await syncAsset(asset.tokenId);
      toast.dismiss(loadingToast);
      return { result, refreshed };
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(error?.message || 'The action could not be completed.', {
        title: 'Action Failed',
      });
      throw error;
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegisterAttestation = async () => {
    const evidenceHash = asset.evidenceRoot || asset.evidenceManifestHash || '';
    if (!evidenceHash) {
      toast.warning('This asset does not have an anchored evidence root yet.', {
        title: 'Evidence Missing',
      });
      return;
    }

    const { result } = await runAction('Recording attestation on Soroban...', () =>
      registerAssetAttestationWithFreighter({
        signer,
        tokenId: asset.tokenId,
        role: attestationRole,
        evidenceHash,
        statementType: attestationStatement.trim() || 'evidence_review_complete',
        expiry: 0,
      })
    );

    toast.transaction.success('Attestation recorded on the Stellar registry.', result?.txHash);
  };

  const handleRevokeAttestation = async (attestationId) => {
    const { result } = await runAction('Revoking attestation...', () =>
      revokeAssetAttestationWithFreighter({
        signer,
        attestationId,
        reason: 'Revoked from the RWA Studio workspace',
      })
    );
    toast.transaction.success('Attestation revoked.', result?.txHash);
  };

  const handleOpenYield = async () => {
    if (!yieldAmount || Number(yieldAmount) <= 0 || !yieldDuration || Number(yieldDuration) <= 0) {
      toast.warning('Enter a yield amount and duration first.', {
        title: 'Yield Details Required',
      });
      return;
    }

    const assetConfig = supportedPaymentAssets.find((item) => item.symbol === paymentToken) || DEFAULT_PAYMENT_ASSET;
    const parsedAmount = parseTokenAmount(yieldAmount, assetConfig?.decimals || 7);

    const { result } = await runAction('Opening asset yield stream on Soroban...', () =>
      approveAndCreateAssetYieldStream({
        signer,
        substrateSession: null,
        tokenAddress: assetConfig?.tokenAddress,
        streamAddress: null,
        hubAddress: null,
        tokenId: asset.tokenId,
        totalAmount: parsedAmount,
        duration: Number(yieldDuration),
      })
    );

    toast.transaction.success('Yield stream funded successfully.', result?.txHash);
  };

  const handleClaimYield = async () => {
    const { result } = await runAction('Claiming accrued yield...', () =>
      claimAssetYield({
        signer,
        substrateSession: null,
        hubAddress: null,
        tokenId: asset.tokenId,
      })
    );
    toast.transaction.success('Yield claim submitted.', result?.txHash);
  };

  const handleFlashAdvance = async () => {
    if (!flashAmount || Number(flashAmount) <= 0) {
      toast.warning('Enter a flash advance amount first.', {
        title: 'Amount Required',
      });
      return;
    }
    const parsedAmount = parseTokenAmount(flashAmount, DEFAULT_PAYMENT_ASSET?.decimals || 7);
    const { result } = await runAction('Requesting flash advance...', () =>
      flashAdvanceAssetYield({
        signer,
        substrateSession: null,
        hubAddress: null,
        tokenId: asset.tokenId,
        amount: parsedAmount,
      })
    );
    toast.transaction.success('Flash advance submitted.', result?.txHash);
  };

  const handleMetadataUpdate = async () => {
    let pinResult;
    try {
      const updatedMetadata = buildUpdatedPublicMetadata(asset, {
        description: metadataDescription,
        location: metadataLocation,
        tagSeed,
      });
      pinResult = await pinRwaMetadata(updatedMetadata);
    } catch (error) {
      toast.error(error?.message || 'Metadata refresh failed before the onchain update.', {
        title: 'Action Failed',
      });
      return;
    }

    const { result } = await runAction('Republishing public metadata...', () =>
      updateAssetMetadataOnChain({
        signer,
        substrateSession: null,
        hubAddress: null,
        tokenId: asset.tokenId,
        metadataURI: pinResult.uri,
      })
    );
    toast.transaction.success('Metadata anchor refreshed.', result?.txHash);
  };

  const handleEvidenceUpdate = async () => {
    if (!evidenceFiles.length) {
      toast.warning('Select updated private evidence documents first.', {
        title: 'Evidence Required',
      });
      return;
    }

    let storedEvidence;
    try {
      const propertyRef = asset.publicMetadata?.propertyRef || asset.tokenId;
      const evidenceBundle = await buildEvidenceBundle(evidenceFiles, {
        propertyRef,
        jurisdiction: '',
        rightsModel: RIGHTS_MODEL,
      });
      storedEvidence = await storeRwaEvidence({
        evidenceBundle,
        rightsModel: RIGHTS_MODEL,
        propertyRef,
        jurisdiction: '',
      });
    } catch (error) {
      toast.error(error?.message || 'Evidence refresh failed before the onchain update.', {
        title: 'Action Failed',
      });
      return;
    }

    const { result } = await runAction('Refreshing evidence anchors...', () =>
      updateAssetEvidenceOnChain({
        signer,
        substrateSession: null,
        hubAddress: null,
        tokenId: asset.tokenId,
        evidenceRoot: storedEvidence.evidenceRoot,
        evidenceManifestHash: storedEvidence.evidenceManifestHash,
      })
    );
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = '';
    }
    setEvidenceFiles([]);
    toast.transaction.success('Evidence anchors refreshed.', result?.txHash);
  };

  const handleTagUpdate = async () => {
    if (!tagSeed.trim()) {
      toast.warning('Enter a verification tag first.', {
        title: 'Tag Required',
      });
      return;
    }
    const { result } = await runAction('Updating verification tag...', () =>
      updateAssetVerificationTag({
        signer,
        substrateSession: null,
        hubAddress: null,
        tokenId: asset.tokenId,
        tag: tagSeed.trim(),
      })
    );
    toast.transaction.success('Verification tag updated.', result?.txHash);
  };

  return (
    <div className="space-y-6 border-t border-slate-100 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Asset Workspace</p>
          <h3 className="text-lg font-headline font-bold text-slate-900">Live owner controls</h3>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
          isOwner ? 'border border-emerald-100 bg-emerald-50 text-emerald-600' : 'border border-amber-100 bg-amber-50 text-amber-600'
        }`}>
          {isOwner ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
          {isOwner ? 'Owner controls ready' : 'Read-only until owner connects'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="mb-1 text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Verification</p>
          <p className="text-sm font-semibold text-slate-900">{asset.verificationStatusLabel || asset.status}</p>
          <p className="mt-1 text-xs text-slate-500">
            Updated {formatTimestamp(asset.verificationUpdatedAt)}. Missing docs: {missingDocuments.length || 0}. Missing roles: {missingRoles.length || 0}.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="mb-1 text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Owner</p>
          <p className="text-sm font-semibold text-slate-900">{formatShortAddress(asset.currentOwner || asset.ownerAddress)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Active stream: {asset.activeStreamId || 'None'} • Claimable yield: {asset.yieldBalance?.toFixed?.(4) || '0.0000'}
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" />
          <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Attestations</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.2fr_auto]">
          <select
            value={attestationRole}
            onChange={(event) => setAttestationRole(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            disabled={!isOwner || isBusy}
          >
            {ATTESTATION_ROLE_OPTIONS.map((option) => (
              <option key={option.key} value={option.code}>{option.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={attestationStatement}
            onChange={(event) => setAttestationStatement(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="evidence_review_complete"
            disabled={!isOwner || isBusy}
          />
          <button
            type="button"
            onClick={() => void handleRegisterAttestation()}
            disabled={!isOwner || isBusy}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Record
          </button>
        </div>
        <div className="space-y-2">
          {(asset.attestations || []).length === 0 ? (
            <p className="text-xs text-slate-500">No attestations recorded yet.</p>
          ) : (
            (asset.attestations || []).map((attestation) => {
              const canRevoke = isOwner && walletAddress === attestation.attestor && !attestation.revoked;
              return (
                <div key={attestation.attestationId} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{attestation.roleLabel}</p>
                    <p className="text-xs text-slate-500">
                      {formatShortAddress(attestation.attestor)} • {attestation.revoked ? 'Revoked' : 'Active'} • Issued {formatTimestamp(attestation.issuedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRevokeAttestation(attestation.attestationId)}
                    disabled={!canRevoke || isBusy}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50 p-5">
        <div className="flex items-center gap-2">
          <WalletCards size={16} className="text-primary" />
          <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Yield Vault</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[0.9fr_1fr_1fr_auto]">
          <select
            value={paymentToken}
            onChange={(event) => setPaymentToken(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            disabled={!isOwner || isBusy}
          >
            {supportedPaymentAssets.map((option) => (
              <option key={option.symbol} value={option.symbol}>{option.symbol}</option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.0001"
            value={yieldAmount}
            onChange={(event) => setYieldAmount(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="Yield amount"
            disabled={!isOwner || isBusy}
          />
          <input
            type="number"
            min="1"
            step="1"
            value={yieldDuration}
            onChange={(event) => setYieldDuration(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="Duration (seconds)"
            disabled={!isOwner || isBusy}
          />
          <button
            type="button"
            onClick={() => void handleOpenYield()}
            disabled={!isOwner || isBusy}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Fund
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            type="number"
            min="0"
            step="0.0001"
            value={flashAmount}
            onChange={(event) => setFlashAmount(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="Flash advance amount"
            disabled={!isOwner || isBusy}
          />
          <button
            type="button"
            onClick={() => void handleClaimYield()}
            disabled={!isOwner || isBusy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Claim
          </button>
          <button
            type="button"
            onClick={() => void handleFlashAdvance()}
            disabled={!isOwner || isBusy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Flash Advance
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50 p-5">
        <div className="flex items-center gap-2">
          <FilePenLine size={16} className="text-primary" />
          <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Refresh Anchors</h4>
        </div>
        <div className="space-y-3">
          <input
            type="text"
            value={metadataLocation}
            onChange={(event) => setMetadataLocation(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="Public location"
            disabled={!isOwner || isBusy}
          />
          <textarea
            value={metadataDescription}
            onChange={(event) => setMetadataDescription(event.target.value)}
            className="min-h-[92px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="Public description"
            disabled={!isOwner || isBusy}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={tagSeed}
              onChange={(event) => setTagSeed(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              placeholder="Verification tag seed"
              disabled={!isOwner || isBusy}
            />
            <button
              type="button"
              onClick={() => void handleTagUpdate()}
              disabled={!isOwner || isBusy}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Update Tag
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]">
            <label className="block">
              <input
                ref={evidenceInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(event) => setEvidenceFiles(Array.from(event.target.files || []))}
              />
              <span className={`flex min-h-[44px] cursor-pointer items-center rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500 ${(!isOwner || isBusy) ? 'cursor-not-allowed opacity-60' : ''}`}>
                {evidenceFiles.length
                  ? `${evidenceFiles.length} evidence document${evidenceFiles.length > 1 ? 's' : ''} selected`
                  : 'Select updated private evidence'}
              </span>
            </label>
            <button
              type="button"
              onClick={() => void handleEvidenceUpdate()}
              disabled={!isOwner || isBusy}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh Evidence
            </button>
            <button
              type="button"
              onClick={() => void handleMetadataUpdate()}
              disabled={!isOwner || isBusy}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Republish Metadata
            </button>
          </div>
          {!isOwner && (
            <p className="text-xs text-amber-600">{OWNER_ACTION_HINT}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MintingTab({ onMinted, portfolioCount }) {
  const { fetchPaymentBalance, signer, toast, walletAddress } = useWallet();
  const [category, setCategory] = useState('real_estate');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const propertyRef = useMemo(
    () => buildPropertyRef(form.name, form.location, category),
    [category, form.location, form.name],
  );
  const previewMetadata = useMemo(
    () => buildPublicMetadata({ category, form, propertyRef, evidenceFiles }),
    [category, evidenceFiles, form, propertyRef],
  );

  const setField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleEvidenceSelection = (event) => {
    const incoming = Array.from(event.target.files || []) as File[];
    setEvidenceFiles(prev => {
      const existingNames = new Set((prev as File[]).map(f => f.name));
      return [...prev, ...incoming.filter(f => !existingNames.has(f.name))];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMint = async (event) => {
    event.preventDefault();

    if (!walletAddress || !signer) {
      toast.warning('Connect Freighter before minting an asset.', {
        title: 'Wallet Required',
      });
      return;
    }

    if (!form.name.trim() || !form.location.trim()) {
      toast.warning('Add an asset name and location before minting.', {
        title: 'Missing Asset Details',
      });
      return;
    }

    if (!evidenceFiles.length) {
      toast.warning('Attach at least one private evidence document before minting.', {
        title: 'Evidence Required',
      });
      return;
    }

    let loadingToast = null;
    try {
      setIsSubmitting(true);
      loadingToast = toast.transaction.pending('Preparing metadata, hashing evidence, and onboarding the issuer if needed...');

      const evidenceBundle = await buildEvidenceBundle(evidenceFiles, {
        propertyRef,
        jurisdiction: '',
        rightsModel: RIGHTS_MODEL,
      });

      const [pinResult, evidenceResult] = await Promise.all([
        pinRwaMetadata(previewMetadata),
        storeRwaEvidence({
          evidenceBundle,
          rightsModel: RIGHTS_MODEL,
          propertyRef,
          jurisdiction: '',
        }),
      ]);

      const publicMetadataURI = pinResult.uri;
      const publicMetadataHash = hashJson(previewMetadata);
      const tagSeed = `${propertyRef}-VERIFY`;
      const issuerAuthorization = await createIssuerAuthorization({
        signer,
        issuer: walletAddress,
        rightsModel: RIGHTS_MODEL,
        jurisdiction: '',
        propertyRef,
        publicMetadataHash,
        evidenceRoot: evidenceResult.evidenceRoot,
      });

      const mintResult = await mintRwaAsset({
        issuer: walletAddress,
        assetType: TYPE_TO_CHAIN_ASSET_TYPE[category],
        rightsModel: RIGHTS_MODEL,
        propertyRef,
        publicMetadataURI,
        evidenceRoot: evidenceResult.evidenceRoot,
        evidenceManifestHash: evidenceResult.evidenceManifestHash,
        jurisdiction: '',
        tag: tagSeed,
        issuerSignature: issuerAuthorization.signature,
        issuerAuthorization,
        statusReason: 'Awaiting attestation review',
      });

      let nextAsset = null;
      try {
        const fetchedAsset = await fetchRwaAsset(mintResult.tokenId);
        nextAsset = fetchedAsset ? mapApiAssetToUiAsset(fetchedAsset) : null;
      } catch {
        nextAsset = null;
      }

      if (!nextAsset) {
        nextAsset = buildOptimisticAsset({
          tokenId: mintResult.tokenId,
          category,
          issuer: walletAddress,
          metadataURI: publicMetadataURI,
          publicMetadata: previewMetadata,
          publicMetadataHash,
          evidenceRoot: evidenceResult.evidenceRoot,
          evidenceManifestHash: evidenceResult.evidenceManifestHash,
          propertyRef,
        });
      }

      if (typeof fetchPaymentBalance === 'function') {
        await fetchPaymentBalance();
      }

      setForm(DEFAULT_FORM);
      setEvidenceFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      onMinted?.(nextAsset);
      toast.dismiss(loadingToast);
      toast.transaction.success(
        `Asset #${mintResult.tokenId} is now live on the Stellar network.`,
        mintResult.txHash,
      );
      toast.success(
        mintResult.issuerOnboarding?.automaticallyApproved
          ? `Private evidence stayed offchain while the rental twin was anchored on Soroban. The issuer was auto-onboarded in the background. Portfolio size: ${portfolioCount + 1}.`
          : `Private evidence stayed offchain while the rental twin was anchored on Soroban. Portfolio size: ${portfolioCount + 1}.`,
        { title: 'Mint Complete' },
      );
    } catch (error) {
      const message = error?.message || 'Asset minting failed.';
      toast.dismiss(loadingToast);
      toast.error(
        /issuer/i.test(message) && /(onboarding|approve)/i.test(message)
          ? `${message} The backend admin signer may need to be configured for automatic onboarding, or a platform admin can onboard the issuer manually.`
          : message,
        { title: 'Mint Failed' },
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategoryLabel = ASSET_CATEGORIES.find((item) => item.key === category)?.label || 'Real Estate';

  return (
    <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
      <div className="space-y-8">
        <div>
          <h4 className="text-2xl font-headline font-bold text-on-surface">Asset Definition</h4>
          <p className="mt-1 text-sm text-on-surface-variant">
            Define the physical parameters for the smart stream.
          </p>
        </div>
        <form className="space-y-6" onSubmit={handleMint}>
          <div className="space-y-2">
            <label className="font-label text-[10px] uppercase tracking-widest text-slate-400">
              Asset Category
            </label>
            <div className="grid grid-cols-3 gap-3">
              {ASSET_CATEGORIES.map(({ key, label, Icon }) => {
                const active = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors ${
                      active
                        ? 'border-blue-200 bg-blue-50 text-primary'
                        : 'border-transparent bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-[10px] font-bold uppercase">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-4">
            {[
              { field: 'name', label: 'Asset Name', placeholder: 'e.g. Skyline Logistics Hub B' },
              { field: 'location', label: 'Location', placeholder: 'City, district, or verified address' },
            ].map(({ field, label, placeholder }) => (
              <div key={field} className="space-y-1">
                <label className="ml-1 font-label text-[10px] uppercase tracking-widest text-slate-400">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[field]}
                  onChange={(event) => setField(field, event.target.value)}
                  className="w-full rounded-xl border-none bg-slate-50 px-4 py-3 text-on-surface focus:ring-1 focus:ring-blue-300"
                  placeholder={placeholder}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="ml-1 font-label text-[10px] uppercase tracking-widest text-slate-400">
                  Yield Target
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.yieldTargetPercent}
                    onChange={(event) => setField('yieldTargetPercent', event.target.value)}
                    className="w-full rounded-xl border-none bg-slate-50 px-4 py-3 pr-10 focus:ring-1 focus:ring-blue-300"
                    placeholder="7.5"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="ml-1 font-label text-[10px] uppercase tracking-widest text-slate-400">
                  Est. Value (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.estimatedValueUsd}
                  onChange={(event) => setField('estimatedValueUsd', event.target.value)}
                  className="w-full rounded-xl border-none bg-slate-50 px-4 py-3 focus:ring-1 focus:ring-blue-300"
                  placeholder="1250000"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="font-label text-[10px] uppercase tracking-widest text-slate-400">
              Evidence Bundle
            </label>
            <label className="block cursor-pointer rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/30 p-8 transition-all hover:bg-blue-50/50">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleEvidenceSelection}
              />
              <div className="flex flex-col items-center justify-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                  <UploadCloud size={24} className="text-primary" />
                </div>
                <p className="text-sm font-medium text-on-surface">
                  {evidenceFiles.length
                    ? `${evidenceFiles.length} private document${evidenceFiles.length > 1 ? 's' : ''} ready`
                    : 'Title deeds, surveys, valuations'}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-400">
                  PDF, JPG, PNG up to 50MB each
                </p>
                <p className="mt-3 text-center text-xs text-slate-500">
                  Documents are fingerprinted locally in your browser. Raw files stay private.
                </p>
              </div>
            </label>
            {evidenceFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {evidenceFiles.map((file, idx) => (
                  <span
                    key={`${file.name}-${file.size}`}
                    className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-medium"
                  >
                    <FileText size={12} />
                    {file.name}
                    <button
                      type="button"
                      onClick={() => setEvidenceFiles(f => f.filter((_, i) => i !== idx))}
                      className="ml-1 text-slate-400 hover:text-red-500 transition-colors leading-none"
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-xl shadow-blue-500/30 transition-all hover:shadow-blue-500/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Minting On Stellar...' : 'Initialize Asset Minting'}
          </button>
        </form>
      </div>

      <div className="space-y-8">
        <div>
          <h4 className="text-2xl font-headline font-bold text-on-surface">Metadata Preview</h4>
          <p className="mt-1 text-sm text-on-surface-variant">
            Immutable JSON schema before ledger push.
          </p>
        </div>
        <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-8">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-teal-200 opacity-30 blur-[80px]" />
          <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-200 opacity-30 blur-[80px]" />
          <div className="relative z-10 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                  <span className="font-label text-[9px] font-bold uppercase tracking-widest text-secondary">
                    Awaiting Signature
                  </span>
                </div>
                <h5 className="text-xl font-headline font-bold">
                  {form.name.trim() || `${selectedCategoryLabel} Rental Twin`}
                </h5>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                <ShieldCheck size={20} className="text-primary" />
              </div>
            </div>
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-6">
              {[
                { label: 'Schema Type', value: `${selectedCategoryLabel} v2.1` },
                { label: 'Rights Model', value: 'Verified Rental Twin' },
                { label: 'Property Ref', value: propertyRef || 'Generated on mint' },
                { label: 'Monthly Yield', value: formatCurrency(previewMetadata.monthlyYieldTarget) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="mb-1 font-label text-[9px] uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="truncate text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="mb-2 font-label text-[9px] uppercase tracking-widest text-slate-400">
                Linked Evidence
              </p>
              <div className="flex flex-wrap gap-2">
                {(evidenceFiles.length ? evidenceFiles : [{ name: 'Private evidence bundle' }]).map((file) => (
                  <span
                    key={file.name}
                    className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-medium"
                  >
                    <FileText size={12} />
                    {file.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-4 rounded-3xl border border-teal-100 bg-teal-50 p-6">
          <Info className="text-secondary" size={20} />
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-secondary">
              Stellar Interoperability
            </p>
            <p className="text-xs leading-relaxed text-on-secondary-container">
              This asset will be minted as a verified productive rental twin on the Stellar network.
              Public metadata is pinned for verification, while raw deeds, surveys, and tax files stay private.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioTab({ assets, isLoading, onAssetChanged }) {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!selected) {
      return;
    }
    const nextSelected = assets.find((item) => item.tokenId === selected.tokenId);
    if (nextSelected) {
      setSelected(nextSelected);
    }
  }, [assets, selected]);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-2xl font-headline font-bold text-on-surface">My Portfolio</h4>
        <p className="mt-1 text-sm text-on-surface-variant">
          {isLoading
            ? 'Syncing your live Stellar registry view...'
            : `${assets.length} verified assets in your registry.`}
        </p>
      </div>
      {isLoading ? (
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-8 text-sm text-slate-500">
          Loading your on-chain rental twins from Soroban...
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-8 text-sm text-slate-500">
          No assets are indexed for this wallet yet. Mint the first verified rental twin from the Minting tab.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onDetails={setSelected} />
          ))}
        </div>
      )}
      <AssetDetailPortal
        selected={selected}
        onClose={() => setSelected(null)}
        renderBody={(asset) => (
          <AssetWorkspacePanel
            asset={asset}
            onAssetChanged={onAssetChanged}
          />
        )}
        renderFooter={(asset) => (
          <RentalSessionComposer
            asset={asset}
            onStarted={() => {}}
          />
        )}
      />
    </div>
  );
}

const TABS = ['Minting', 'My Portfolio'];

export default function RWA() {
  const [tab, setTab] = useState('Minting');
  const [portfolioAssets, setPortfolioAssets] = useState(PORTFOLIO_ASSETS);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const { paymentBalance, toast, walletAddress, xlmBalance } = useWallet();

  const refreshPortfolio = useCallback(async () => {
    if (!walletAddress) {
      setPortfolioAssets(PORTFOLIO_ASSETS);
      setIsPortfolioLoading(false);
      return;
    }

    try {
      setIsPortfolioLoading(true);
      const assets = await fetchRwaAssets(walletAddress);
      setPortfolioAssets(assets.map(mapApiAssetToUiAsset));
    } catch (error) {
      console.error('Failed to load live RWA portfolio:', error);
      toast.warning(
        error?.message || 'Falling back to the local studio snapshot because the live registry view could not be loaded.',
        { title: 'Portfolio Sync Issue' },
      );
      setPortfolioAssets(PORTFOLIO_ASSETS);
    } finally {
      setIsPortfolioLoading(false);
    }
  }, [toast, walletAddress]);

  useEffect(() => {
    void refreshPortfolio();
  }, [refreshPortfolio]);

  const handleAssetChanged = useCallback((asset) => {
    if (!asset) {
      return;
    }
    setPortfolioAssets((current) => {
      const withoutDuplicate = current.filter((item) => item.tokenId !== asset.tokenId);
      return [asset, ...withoutDuplicate];
    });
  }, []);

  const handleMinted = useCallback((asset) => {
    if (asset) {
      handleAssetChanged(asset);
    }
    setTab('My Portfolio');
    void refreshPortfolio();
  }, [handleAssetChanged, refreshPortfolio]);

  const fmt = (value) => parseFloat(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const indexedAssets = portfolioAssets.length;
  const totalMinted = formatCompactNumber(indexedAssets);
  const activeRentals = portfolioAssets.filter((asset) => Number(asset.activeStreamId || 0) > 0).length;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-8 lg:p-12">
      <header className="mb-12 flex flex-col items-center justify-between md:flex-row">
        <div>
          <h2 className="text-4xl font-headline font-bold tracking-tight text-on-surface"> Studio</h2>
          <p className="mt-2 max-w-md font-body text-on-surface-variant">
            Mint, manage and attest tokenized real-world assets on Stellar.
          </p>
        </div>
        <div className="glass-card mt-3 flex items-center gap-3 rounded-full px-4 py-2 md:mt-0">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          <span className="font-label text-xs font-bold text-primary">{fmt(xlmBalance)} XLM</span>
          <div className="h-4 w-[1px] bg-slate-200" />
          <span className="font-label text-xs font-bold text-primary">{fmt(paymentBalance)} USDC</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="col-span-1 space-y-6 lg:col-span-3">
          <div className="flex items-center space-x-4 rounded-3xl border border-slate-100 bg-slate-50 p-6 md:flex-col md:space-x-0 md:space-y-8">
            {[
              {
                label: 'Indexed Assets',
                value: indexedAssets.toLocaleString(),
                sub: walletAddress ? 'Live Soroban view' : 'Studio snapshot',
                subColor: 'text-secondary',
                color: 'text-primary',
              },
              {
                label: 'Total Minted',
                value: totalMinted,
                sub: 'Stellar rental twins',
                subColor: 'text-on-surface-variant',
                color: 'text-on-surface',
              },
              {
                label: 'Active Rentals',
                value: activeRentals.toLocaleString(),
                sub: 'Yield vault sessions',
                subColor: 'text-secondary',
                color: 'text-purple-600',
                pulse: true,
              },
            ].map((item) => (
              <div key={item.label}>
                <span className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {item.label}
                </span>
                <h3 className={`text-5xl font-headline font-light ${item.color}`}>{item.value}</h3>
                <div className="mt-1 flex items-center gap-1">
                  {/* {item.pulse && <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />} */}
                  <p className={`text-xs font-medium m-0 ${item.subColor}`}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="group relative aspect-[4/5] overflow-hidden rounded-3xl bg-slate-200">
            <img
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              src="https://picsum.photos/seed/villa/600/800"
              alt="Featured Asset"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent to-transparent p-6">
              <span className="mb-3 self-start rounded bg-secondary px-2 py-1 font-label text-[10px] uppercase tracking-widest text-white">
                Trending RWA
              </span>
              <h4 className="text-xl font-headline font-bold text-white">Azure Heights Residence</h4>
              <p className="text-xs font-body text-white/70">Yield Target: 8.2% APY</p>
            </div>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-9">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm lg:p-12">
            <div className="mb-10 flex gap-8 border-b border-slate-100">
              {TABS.map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={`border-b-2 pb-4 font-label text-sm uppercase tracking-[0.15em] transition-colors ${
                    tab === item
                      ? 'border-primary font-bold text-primary'
                      : 'border-transparent text-slate-400 hover:text-primary'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            {tab === 'Minting' && (
              <MintingTab
                onMinted={handleMinted}
                portfolioCount={portfolioAssets.length}
              />
            )}
            {tab === 'My Portfolio' && (
              <PortfolioTab
                assets={portfolioAssets}
                isLoading={isPortfolioLoading}
                onAssetChanged={handleAssetChanged}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
