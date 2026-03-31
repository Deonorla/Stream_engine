const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};

export const ACTIVE_NETWORK = {
  key: 'stellar-testnet',
  kind: 'stellar',
  name: env.VITE_STREAM_ENGINE_NETWORK_NAME || 'Stellar Testnet',
  chainId: Number(env.VITE_STREAM_ENGINE_CHAIN_ID || 0),
  rpcUrl: env.VITE_STREAM_ENGINE_RPC_URL || 'https://soroban-testnet.stellar.org',
  horizonUrl: env.VITE_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  passphrase: env.VITE_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  explorerUrl: env.VITE_STREAM_ENGINE_BLOCK_EXPLORER_URL || 'https://stellar.expert/explorer/testnet',
  nativeCurrency: { name: 'Stellar Lumens', symbol: 'XLM', decimals: 7 },
  contractAddress:
    env.VITE_STREAM_ENGINE_CONTRACT_ADDRESS
    || 'stellar:session-meter',
  paymentTokenAddress:
    env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_ADDRESS
    || 'stellar:usdc-sac',
  paymentAssetCode: env.VITE_STELLAR_PAYMENT_ASSET_CODE || 'USDC',
  paymentAssetIssuer: env.VITE_STELLAR_PAYMENT_ASSET_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

export const IS_READY = Boolean(ACTIVE_NETWORK.contractAddress);
