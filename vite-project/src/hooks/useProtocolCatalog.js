import { useEffect, useState } from 'react';
import {
  appName,
  contractAddress,
  paymentTokenAddress,
  paymentTokenDecimals,
  paymentTokenSymbol,
} from '../contactInfo';
import { ACTIVE_NETWORK } from '../networkConfig';
import { fetchProtocolCatalog } from '../services/protocolApi';

const DEFAULT_CATALOG = {
  appName,
  network: {
    kind: ACTIVE_NETWORK.kind,
    name: ACTIVE_NETWORK.name,
    chainId: ACTIVE_NETWORK.chainId,
    rpcUrl: ACTIVE_NETWORK.rpcUrl,
    horizonUrl: ACTIVE_NETWORK.horizonUrl,
    passphrase: ACTIVE_NETWORK.passphrase,
  },
  payments: {
    tokenAddress: paymentTokenAddress,
    tokenSymbol: paymentTokenSymbol,
    tokenDecimals: paymentTokenDecimals,
    assetCode: ACTIVE_NETWORK.paymentAssetCode,
    assetIssuer: ACTIVE_NETWORK.paymentAssetIssuer,
    settlement: 'soroban-sac',
    recipientAddress: '',
    contractAddress,
  },
  rwa: {
    hubAddress: '',
    assetNFTAddress: '',
    assetRegistryAddress: '',
    assetStreamAddress: '',
    complianceGuardAddress: '',
  },
  routes: [],
};

export function useProtocolCatalog() {
  const [catalog, setCatalog] = useState(DEFAULT_CATALOG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setIsLoading(true);
    setError('');

    try {
      const nextCatalog = await fetchProtocolCatalog();
      setCatalog({
        ...DEFAULT_CATALOG,
        ...nextCatalog,
        network: {
          ...DEFAULT_CATALOG.network,
          ...(nextCatalog?.network || {}),
        },
        payments: {
          ...DEFAULT_CATALOG.payments,
          ...(nextCatalog?.payments || {}),
        },
        rwa: {
          ...DEFAULT_CATALOG.rwa,
          ...(nextCatalog?.rwa || {}),
        },
        routes: nextCatalog?.routes || [],
      });
    } catch (nextError) {
      console.error('Failed to load protocol catalog', nextError);
      setError(nextError.message || 'Unable to load protocol catalog.');
      setCatalog(DEFAULT_CATALOG);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return {
    catalog,
    isLoading,
    error,
    refresh,
  };
}
