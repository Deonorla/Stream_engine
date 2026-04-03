import { useEffect } from 'react';
import { useAppMode } from '../context/AppModeContext';
import { useWallet } from '../context/WalletContext';
import { getPreferredAgentAuthToken } from '../lib/agentAuthStorage';

export function useAgentWallet(_ownerPublicKey?: string | null) {
  const { agentPublicKey, agentLoading, agentError, activateAgent, silentRestore } = useAppMode();
  const { walletAddress } = useWallet();

  // When wallet connects, silently restore existing agent wallet (no UI prompt)
  useEffect(() => {
    if (walletAddress) silentRestore(walletAddress);
  }, [walletAddress]); // eslint-disable-line

  const activate = () => {
    if (walletAddress) activateAgent(walletAddress);
  };

  return { agentPublicKey, loading: agentLoading, error: agentError, activate };
}

export function getAgentToken(): string | null {
  return getPreferredAgentAuthToken();
}

export function agentAuthHeaders(): Record<string, string> {
  const token = getAgentToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
