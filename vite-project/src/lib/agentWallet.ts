/**
 * Agent wallet — non-custodial Stellar keypair stored encrypted in localStorage.
 * The private key never leaves the browser.
 */

import { Keypair } from '@stellar/stellar-sdk';

const STORAGE_KEY = 'se_agent_wallet';

// ── Crypto helpers ────────────────────────────────────────────────────────────

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const enc  = new TextEncoder();
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  // pack: salt(16) + iv(12) + ciphertext → base64
  const buf = new Uint8Array(16 + 12 + ct.byteLength);
  buf.set(salt, 0);
  buf.set(iv, 16);
  buf.set(new Uint8Array(ct), 28);
  return btoa(String.fromCharCode(...buf));
}

async function decrypt(b64: string, password: string): Promise<string> {
  const buf  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const salt = buf.slice(0, 16);
  const iv   = buf.slice(16, 28);
  const ct   = buf.slice(28);
  const key  = await deriveKey(password, salt);
  const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface AgentWalletRecord {
  publicKey: string;
  encryptedSecret: string;
  createdAt: number;
}

export function getStoredAgentWallet(): AgentWalletRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function createAgentWallet(password: string): Promise<AgentWalletRecord> {
  const kp = Keypair.random();
  const encryptedSecret = await encrypt(kp.secret(), password);
  const record: AgentWalletRecord = {
    publicKey: kp.publicKey(),
    encryptedSecret,
    createdAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

export async function unlockAgentWallet(password: string): Promise<Keypair | null> {
  const record = getStoredAgentWallet();
  if (!record) return null;
  try {
    const secret = await decrypt(record.encryptedSecret, password);
    return Keypair.fromSecret(secret);
  } catch { return null; }
}

export function deleteAgentWallet(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function exportAgentSecret(password: string): Promise<string | null> {
  const record = getStoredAgentWallet();
  if (!record) return null;
  try { return await decrypt(record.encryptedSecret, password); }
  catch { return null; }
}

/** Open a payment stream autonomously using the agent keypair */
export async function openAgentStream(password: string, params: {
  recipient: string;
  token: string;
  assetCode: string;
  assetIssuer?: string;
  totalAmount: bigint;
  durationSeconds: number;
  metadata?: string;
}) {
  const { openStellarSession } = await import('../lib/stellarSessionMeter');
  const kp = await unlockAgentWallet(password);
  if (!kp) throw new Error('Wrong password or no agent wallet.');
  return openStellarSession({
    payer: kp.publicKey(),
    keypair: kp,
    ...params,
    metadata: params.metadata || '{}',
  });
}
