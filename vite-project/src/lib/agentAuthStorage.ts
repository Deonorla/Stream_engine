const AGENT_SESSION_STORAGE_KEY = 'agent_session_token';
const AGENT_SESSION_TOKENS_STORAGE_KEY = 'agent_session_tokens_by_owner';
const AGENT_SESSION_ACTIVE_OWNER_KEY = 'agent_session_active_owner';
const AUTH_TOKEN_STORAGE_KEYS = [
  'continuum_auth_token',
  'auth0_access_token',
  typeof import.meta !== 'undefined' ? import.meta.env?.VITE_AUTH_TOKEN_STORAGE_KEY : '',
].filter(Boolean);

const OWNER_CLAIM_NAMES = [
  'ownerPublicKey',
  'wallet_address',
  'stellar_public_key',
  'https://continuum.app/owner_public_key',
  'https://stream-engine.app/owner_public_key',
  'sub',
];

function normalizeOwnerPublicKey(ownerPublicKey?: string | null): string {
  return String(ownerPublicKey || '').trim().toUpperCase();
}

function decodeBase64Url(value: string): string {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const encoded = `${normalized}${padding}`;
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(encoded);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(encoded, 'base64').toString('utf8');
  }
  return '';
}

function decodeJwtPayload(token?: string | null): Record<string, unknown> | null {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
}

export function getAgentTokenOwner(token?: string | null): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return null;
  for (const claimName of OWNER_CLAIM_NAMES) {
    const value = payload?.[claimName];
    const normalized = normalizeOwnerPublicKey(typeof value === 'string' ? value : '');
    if (normalized) return normalized;
  }
  return null;
}

function readStoredAgentTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AGENT_SESSION_TOKENS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredAgentTokens(tokens: Record<string, string>) {
  localStorage.setItem(AGENT_SESSION_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
}

export function getActiveAgentOwner(): string | null {
  try {
    return normalizeOwnerPublicKey(localStorage.getItem(AGENT_SESSION_ACTIVE_OWNER_KEY));
  } catch {
    return null;
  }
}

export function setActiveAgentOwner(ownerPublicKey?: string | null) {
  const normalized = normalizeOwnerPublicKey(ownerPublicKey);
  try {
    if (!normalized) {
      localStorage.removeItem(AGENT_SESSION_ACTIVE_OWNER_KEY);
      return;
    }
    localStorage.setItem(AGENT_SESSION_ACTIVE_OWNER_KEY, normalized);
  } catch {
    // ignore storage failures in non-browser contexts
  }
}

export function getStoredAgentSessionToken(ownerPublicKey?: string | null): string | null {
  try {
    const normalizedOwner = normalizeOwnerPublicKey(ownerPublicKey || getActiveAgentOwner());
    const tokens = readStoredAgentTokens();
    if (normalizedOwner && tokens[normalizedOwner]) {
      return tokens[normalizedOwner];
    }

    const legacy = localStorage.getItem(AGENT_SESSION_STORAGE_KEY);
    if (!legacy) return null;
    if (!normalizedOwner) return legacy;
    const legacyOwner = getAgentTokenOwner(legacy);
    return legacyOwner === normalizedOwner ? legacy : null;
  } catch {
    return null;
  }
}

export function storeAgentSessionToken(token: string, ownerPublicKey?: string | null) {
  const normalizedOwner = normalizeOwnerPublicKey(ownerPublicKey || getAgentTokenOwner(token));
  if (normalizedOwner) {
    const tokens = readStoredAgentTokens();
    tokens[normalizedOwner] = token;
    writeStoredAgentTokens(tokens);
    setActiveAgentOwner(normalizedOwner);
  }
  localStorage.setItem(AGENT_SESSION_STORAGE_KEY, token);
}

export function clearAgentSessionToken(ownerPublicKey?: string | null) {
  const normalizedOwner = normalizeOwnerPublicKey(ownerPublicKey || getActiveAgentOwner());
  try {
    if (normalizedOwner) {
      const tokens = readStoredAgentTokens();
      delete tokens[normalizedOwner];
      writeStoredAgentTokens(tokens);
      if (getActiveAgentOwner() === normalizedOwner) {
        localStorage.removeItem(AGENT_SESSION_ACTIVE_OWNER_KEY);
        localStorage.removeItem(AGENT_SESSION_STORAGE_KEY);
      }
      return;
    }
    localStorage.removeItem(AGENT_SESSION_STORAGE_KEY);
    localStorage.removeItem(AGENT_SESSION_ACTIVE_OWNER_KEY);
  } catch {
    // ignore storage failures in non-browser contexts
  }
}

export function getExternalAgentAuthToken(ownerPublicKey?: string | null): string | null {
  const normalizedOwner = normalizeOwnerPublicKey(ownerPublicKey || getActiveAgentOwner());
  try {
    for (const key of AUTH_TOKEN_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (!value) continue;
      if (!normalizedOwner) return value;
      if (getAgentTokenOwner(value) === normalizedOwner) return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function getPreferredAgentAuthToken(ownerPublicKey?: string | null): string | null {
  return getStoredAgentSessionToken(ownerPublicKey) || getExternalAgentAuthToken(ownerPublicKey);
}
