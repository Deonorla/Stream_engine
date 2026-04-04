const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};
const resolveStellarRuntimeId = (value, fallback) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.startsWith('stellar:') && fallback ? fallback : normalized;
};

const chainId = Number(env.VITE_STREAM_ENGINE_CHAIN_ID || 0);

export const ACTIVE_NETWORK = {
  key: 'stellar-testnet',
  kind: 'stellar',
  name: env.VITE_STREAM_ENGINE_NETWORK_NAME || 'Stellar Testnet',
  chainId,
  chainIdHex: `0x${chainId.toString(16)}`,
  rpcUrl: env.VITE_STREAM_ENGINE_RPC_URL || 'https://soroban-testnet.stellar.org',
  horizonUrl: env.VITE_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  passphrase: env.VITE_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  explorerUrl: env.VITE_STREAM_ENGINE_BLOCK_EXPLORER_URL || 'https://stellar.expert/explorer/testnet',
  nativeCurrency: { name: 'Stellar Lumens', symbol: 'XLM', decimals: 7 },
  contractAddress:
    resolveStellarRuntimeId(
      env.VITE_STREAM_ENGINE_CONTRACT_ADDRESS
      || env.VITE_STELLA_CONTRACT_ADDRESS,
      'CDS4XG3PAOWRNFVFKMK7LKJEXFQIJXFAMX54F5T3EBNFLNOL3RMGSECX',
    ),
  paymentTokenAddress:
    resolveStellarRuntimeId(
      env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_ADDRESS,
      'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    ),
  paymentAssetCode: env.VITE_STELLAR_PAYMENT_ASSET_CODE || 'USDC',
  paymentAssetIssuer: env.VITE_STELLAR_PAYMENT_ASSET_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  recipientAddress: env.VITE_STREAM_ENGINE_RECIPIENT_ADDRESS || '',
};

export const IS_POLKADOT = false;
export const IS_READY = Boolean(ACTIVE_NETWORK.contractAddress);
