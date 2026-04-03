import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getRwaApiBaseUrl } from '../services/rwaApi';
import {
  clearAgentSessionToken,
  getExternalAgentAuthToken,
  getPreferredAgentAuthToken,
  storeAgentSessionToken,
} from '../lib/agentAuthStorage';

type AppMode = 'owner' | 'agent';

interface AppModeContextValue {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  agentPublicKey: string | null;
  agentLoading: boolean;
  agentError: string;
  activateAgent: (ownerPublicKey: string) => Promise<void>;
  silentRestore: (ownerPublicKey: string) => Promise<void>;
}

const AppModeContext = createContext<AppModeContextValue>({
  mode: 'owner',
  setMode: () => {},
  agentPublicKey: null,
  agentLoading: false,
  agentError: '',
  activateAgent: async () => {},
  silentRestore: async () => {},
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
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');

  // On mount: restore from existing JWT
  useEffect(() => {
    const token = getPreferredAgentAuthToken();
    if (!token) return;
    fetch(`${getRwaApiBaseUrl()}/api/agent/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.publicKey) setAgentPublicKey(data.publicKey); else clearAgentSessionToken(); })
      .catch(() => {});
  }, []);

  // When owner connects and no token exists, silently get a fresh token
  // (server returns existing wallet — never creates a new one without explicit activation)
  const silentRestore = useCallback(async (ownerPublicKey: string) => {
    if (agentPublicKey) return; // already loaded
    const token = getPreferredAgentAuthToken();
    if (token) return; // already have a token, useEffect above handles it
    try {
      const externalToken = getExternalAgentAuthToken();
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
      storeAgentSessionToken(data.token);
      setAgentPublicKey(data.agentPublicKey);
    } catch {}
  }, [agentPublicKey]);

  const activateAgent = useCallback(async (ownerPublicKey: string) => {
    setAgentLoading(true); setAgentError('');
    try {
      const externalToken = getExternalAgentAuthToken();
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
      storeAgentSessionToken(data.token);
      setAgentPublicKey(data.agentPublicKey);
    } catch (err: any) {
      setAgentError(err.message || 'Activation failed.');
    }
    setAgentLoading(false);
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
