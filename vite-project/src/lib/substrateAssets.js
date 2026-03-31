import { StrKey } from '@stellar/stellar-sdk';

function unsupported(action) {
  throw new Error(`${action} is unavailable because the legacy Substrate runtime has been removed. Use the Stellar wallet flow instead.`);
}

function normalizeAddress(value) {
  return String(value || '').trim();
}

function isValidStellarAddress(value) {
  const candidate = normalizeAddress(value);
  if (!candidate) {
    return false;
  }

  return (
    StrKey.isValidEd25519PublicKey(candidate)
    || StrKey.isValidContract(candidate)
    || StrKey.isValidMed25519PublicKey(candidate)
  );
}

export function normalizeContractAddressInput(address) {
  const candidate = normalizeAddress(address);
  if (!isValidStellarAddress(candidate)) {
    throw new Error('Enter a valid Stellar account (`G...`), muxed account (`M...`), or contract address (`C...`).');
  }
  return candidate;
}

export function isSupportedAddressInput(address) {
  return isValidStellarAddress(address);
}

export async function readNativeAssetBalance() {
  unsupported('Legacy native asset balance reads');
}

export async function connectInjectedSubstrateWallet() {
  unsupported('Substrate wallet connections');
}

export async function disconnectInjectedSubstrateWallet() {
  return null;
}

export async function inspectSubstrateApprovalAccount() {
  unsupported('Substrate approval account inspection');
}

export async function substrateApproveTransfer() {
  unsupported('Substrate approvals');
}

export async function substrateApproveTransferForSession() {
  unsupported('Substrate session approvals');
}

export async function substrateCallContract() {
  unsupported('Substrate contract calls');
}

export async function substrateReadContract() {
  unsupported('Substrate contract reads');
}
