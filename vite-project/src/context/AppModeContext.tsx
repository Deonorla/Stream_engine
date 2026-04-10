import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getRwaApiBaseUrl } from '../services/rwaApi';
import {
  clearAgentSessionToken,
  getAgentTokenOwner,
  getExternalAgentAuthToken,
  getPreferredAgentAuthToken,
  setActiveAgentOwner,
  storeAgentSessionToken,
} from '../lib/agentAuthStorage';

type AppMode = 'owner' | 'agent';

interface AppModeContextValue {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  agentPublicKey: string | null;
  agentLoading: boolean;
  agentError: string;
  activateAgent: (ownerPublicKey: string) => Promise<{ agentPublicKey: string | null; token?: string; error?: string } | null>;
  silentRestore: (ownerPublicKey: string) => Promise<{ agentPublicKey: string | null; token?: string } | null>;
}

const AppModeContext = createContext<AppModeContextValue>({
  mode: 'owner',
  setMode: () => {},
  agentPublicKey: null,
  agentLoading: false,
  agentError: '',
  activateAgent: async () => null,
  silentRestore: async () => null,
});

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(() =>
    (localStorage.getItem('app_mode') as AppMode) || 'owner'
  );
  const setMode = useCallback((m: AppMode) => {
    localStorage.setItem('app_mode', m);
    setModeState(m);
  }, []);
  const [agentPublicKey, setAgentPublicKey] = useState<string | null>(null);
  const [agentOwnerPublicKey, setAgentOwnerPublicKey] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');

  // On mount: restore from existing JWT
  useEffect(() => {
    const token = getPreferredAgentAuthToken();
    if (!token) return;
    const tokenOwner = getAgentTokenOwner(token);
    if (tokenOwner) {
      setActiveAgentOwner(tokenOwner);
      setAgentOwnerPublicKey(tokenOwner);
    }
    fetch(`${getRwaApiBaseUrl()}/api/agent/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.publicKey) {
          setAgentPublicKey(data.publicKey);
        } else {
          clearAgentSessionToken(tokenOwner || undefined);
          setAgentPublicKey(null);
          setAgentOwnerPublicKey(null);
        }
      })
      .catch(() => {});
  }, []);

  // When owner connects and no token exists, silently get a fresh token
  // (server returns existing wallet — never creates a new one without explicit activation)
  const silentRestore = useCallback(async (ownerPublicKey: string) => {
    const normalizedOwner = String(ownerPublicKey || '').trim().toUpperCase();
    if (!normalizedOwner) return null;
    setActiveAgentOwner(normalizedOwner);
    if (agentPublicKey && agentOwnerPublicKey === normalizedOwner) {
      return {
        agentPublicKey,
        token: getPreferredAgentAuthToken(normalizedOwner) || undefined,
      };
    }
    const token = getPreferredAgentAuthToken(normalizedOwner);
    try {
      if (token) {
        const existing = await fetch(`${getRwaApiBaseUrl()}/api/agent/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (existing.ok) {
          const data = await existing.json();
          storeAgentSessionToken(token, normalizedOwner);
          setAgentPublicKey(data.publicKey || data.agentPublicKey || null);
          setAgentOwnerPublicKey(normalizedOwner);
          return { ...data, token };
        }
        clearAgentSessionToken(normalizedOwner);
      }

      const externalToken = getExternalAgentAuthToken(normalizedOwner);
      const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/wallet-restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(externalToken ? { Authorization: `Bearer ${externalToken}` } : {}),
        },
        body: JSON.stringify({ ownerPublicKey }),
      });
      if (!res.ok) return; // no wallet exists yet — show activation UI
      const data = await res.json();
      storeAgentSessionToken(data.token, normalizedOwner);
      setAgentPublicKey(data.agentPublicKey);
      setAgentOwnerPublicKey(normalizedOwner);
      return data;
    } catch {}
    return null;
  }, [agentOwnerPublicKey, agentPublicKey]);

  const activateAgent = useCallback(async (ownerPublicKey: string) => {
    const normalizedOwner = String(ownerPublicKey || '').trim().toUpperCase();
    if (normalizedOwner) {
      setActiveAgentOwner(normalizedOwner);
    }
    setAgentLoading(true); setAgentError('');
    try {
      const externalToken = getExternalAgentAuthToken(normalizedOwner);
      const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(externalToken ? { Authorization: `Bearer ${externalToken}` } : {}),
        },
        body: JSON.stringify({ ownerPublicKey }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Activation failed.');
      const data = await res.json();
      storeAgentSessionToken(data.token, normalizedOwner);
      setAgentPublicKey(data.agentPublicKey);
      setAgentOwnerPublicKey(normalizedOwner);
      return data;
    } catch (err: any) {
      const message = err.message || 'Activation failed.';
      setAgentError(message);
      return { agentPublicKey: null, error: message };
    } finally {
      setAgentLoading(false);
    }
  }, []);

  return (
    <AppModeContext.Provider value={{ mode, setMode, agentPublicKey, agentLoading, agentError, activateAgent, silentRestore }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
