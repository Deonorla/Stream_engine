import { useState, useEffect, useCallback } from 'react';
import { signMessage } from '@stellar/freighter-api';
import { getRwaApiBaseUrl } from '../services/rwaApi';

const STORAGE_KEY = 'agent_session_token';

function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function storeToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token);
}

function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

async function activate(ownerPublicKey: string): Promise<{ token: string; agentPublicKey: string } | null> {
  try {
    const message = `agent-auth:${ownerPublicKey.toUpperCase()}`;
    const { signedMessage } = await signMessage(message, { networkPassphrase: undefined as any });
    const sig = btoa(String.fromCharCode(...new Uint8Array(signedMessage as unknown as ArrayBuffer)));
    const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerPublicKey, signature: sig }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchWallet(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey || null;
  } catch {
    return null;
  }
}

export function useAgentWallet(ownerPublicKey: string | null | undefined) {
  const [agentPublicKey, setAgentPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // On mount / owner change: try existing token first, else wait for user to activate
  useEffect(() => {
    if (!ownerPublicKey) { setAgentPublicKey(null); return; }
    const token = getStoredToken();
    if (!token) return;
    fetchWallet(token).then(pk => {
      if (pk) setAgentPublicKey(pk);
      else clearToken(); // token expired
    });
  }, [ownerPublicKey]);

  // Called once by the user — signs with Freighter, gets JWT, stores it
  const activateWallet = useCallback(async () => {
    if (!ownerPublicKey) return;
    setLoading(true); setError('');
    const result = await activate(ownerPublicKey);
    if (result) {
      storeToken(result.token);
      setAgentPublicKey(result.agentPublicKey);
    } else {
      setError('Activation failed. Please try again.');
    }
    setLoading(false);
  }, [ownerPublicKey]);

  return { agentPublicKey, loading, error, activate: activateWallet };
}

/** Get the stored JWT for use in agent API calls — no Freighter needed */
export function getAgentToken(): string | null {
  return getStoredToken();
}

/** Build Authorization header for agent API requests */
export function agentAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
