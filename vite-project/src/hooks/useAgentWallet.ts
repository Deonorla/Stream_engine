import { useEffect } from 'react';
import { useAppMode } from '../context/AppModeContext';
import { useWallet } from '../context/WalletContext';
import { getPreferredAgentAuthToken, setActiveAgentOwner } from '../lib/agentAuthStorage';

export function useAgentWallet(_ownerPublicKey?: string | null) {
  const { agentPublicKey, agentLoading, agentError, activateAgent, silentRestore } = useAppMode();
  const { walletAddress } = useWallet();

  // When wallet connects, silently restore existing agent wallet (no UI prompt)
  useEffect(() => {
    if (!walletAddress) return;
    setActiveAgentOwner(walletAddress);
    silentRestore(walletAddress);
  }, [silentRestore, walletAddress]);

  const activate = () => {
    if (walletAddress) activateAgent(walletAddress);
  };

  return { agentPublicKey, loading: agentLoading, error: agentError, activate };
}

export function getAgentToken(ownerPublicKey?: string | null): string | null {
  return getPreferredAgentAuthToken(ownerPublicKey);
}

export function agentAuthHeaders(ownerPublicKey?: string | null): Record<string, string> {
  const token = getAgentToken(ownerPublicKey);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
