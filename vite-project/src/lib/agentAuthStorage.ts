const AGENT_SESSION_STORAGE_KEY = 'agent_session_token';
const AUTH_TOKEN_STORAGE_KEYS = [
  'continuum_auth_token',
  'auth0_access_token',
  typeof import.meta !== 'undefined' ? import.meta.env?.VITE_AUTH_TOKEN_STORAGE_KEY : '',
].filter(Boolean);

export function getStoredAgentSessionToken(): string | null {
  try {
    return localStorage.getItem(AGENT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeAgentSessionToken(token: string) {
  localStorage.setItem(AGENT_SESSION_STORAGE_KEY, token);
}

export function clearAgentSessionToken() {
  localStorage.removeItem(AGENT_SESSION_STORAGE_KEY);
}

export function getExternalAgentAuthToken(): string | null {
  try {
    for (const key of AUTH_TOKEN_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function getPreferredAgentAuthToken(): string | null {
  return getStoredAgentSessionToken() || getExternalAgentAuthToken();
}
