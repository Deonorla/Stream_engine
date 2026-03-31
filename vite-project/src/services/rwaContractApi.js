import { ethers } from 'ethers';
import { fetchRwaAsset, rwaAdminAction, rwaRelayAction } from './rwaApi.js';

function requireWalletSigner(signer, message = 'Connect Freighter before sending this Stellar action.') {
  if (!signer) {
    throw new Error(message);
  }
}

export function hashText(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value || ''));
}

export function parseTokenAmount(value, decimals = 7) {
  return ethers.parseUnits(String(value || 0), decimals);
}

export async function approveAndCreateAssetYieldStream({
  signer,
  tokenId,
  totalAmount,
  duration,
}) {
  requireWalletSigner(signer);
  return rwaRelayAction({
    action: 'createAssetYieldStream',
    tokenId,
    totalAmount: String(totalAmount),
    duration,
  });
}

export async function claimAssetYield({ signer, tokenId }) {
  requireWalletSigner(signer);
  return rwaRelayAction({
    action: 'claimYield',
    tokenId,
  });
}

export async function flashAdvanceAssetYield({ signer, tokenId, amount }) {
  requireWalletSigner(signer);
  return rwaRelayAction({
    action: 'flashAdvance',
    tokenId,
    amount: String(amount),
  });
}

export async function setAssetCompliance({
  assetType,
  user,
  approved,
  expiry,
  jurisdiction,
}) {
  return rwaAdminAction({ action: 'setCompliance', user, assetType, approved, expiry, jurisdiction });
}

export async function setAssetStreamFreeze({ streamId, frozen, reason }) {
  return rwaAdminAction({ action: 'freezeStream', streamId, frozen, reason });
}

export async function setAssetIssuerApproval({ issuer, approved, note }) {
  return rwaAdminAction({ action: 'setIssuerApproval', issuer, approved, note });
}

export async function setAssetAttestationPolicy({
  assetType,
  role,
  required,
  maxAge,
}) {
  return rwaAdminAction({ action: 'setAttestationPolicy', assetType, role, required, maxAge });
}

export async function setAssetPolicyOnChain({
  tokenId,
  frozen,
  disputed,
  revoked,
  reason,
}) {
  return rwaAdminAction({ action: 'setAssetPolicy', tokenId, frozen, disputed, revoked, reason });
}

export async function setAssetVerificationStatus({
  tokenId,
  status,
  reason,
}) {
  return rwaAdminAction({ action: 'setVerificationStatus', tokenId, status, reason });
}

export async function updateAssetMetadataOnChain({ signer, tokenId, metadataURI }) {
  requireWalletSigner(signer);
  return rwaRelayAction({
    action: 'updateAssetMetadata',
    tokenId,
    metadataURI,
  });
}

export async function updateAssetEvidenceOnChain({
  signer,
  tokenId,
  evidenceRoot,
  evidenceManifestHash,
}) {
  requireWalletSigner(signer);
  return rwaRelayAction({
    action: 'updateAssetEvidence',
    tokenId,
    evidenceRoot,
    evidenceManifestHash,
  });
}

export async function updateAssetVerificationTag({ signer, tokenId, tag }) {
  requireWalletSigner(signer);
  return rwaRelayAction({
    action: 'updateVerificationTag',
    tokenId,
    tag,
  });
}

export async function readClaimableYield({ tokenId }) {
  const asset = await fetchRwaAsset(tokenId);
  return BigInt(asset?.claimableYield || 0);
}
