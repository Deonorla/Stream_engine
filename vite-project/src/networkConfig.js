const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};

export const ACTIVE_NETWORK = {
  key: 'stellar-testnet',
  kind: 'stellar',
  name: env.VITE_FLOWPAY_NETWORK_NAME || 'Stellar Testnet',
  chainId: Number(env.VITE_FLOWPAY_CHAIN_ID || 0),
  rpcUrl: env.VITE_FLOWPAY_RPC_URL || 'https://soroban-testnet.stellar.org',
  horizonUrl: env.VITE_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  passphrase: env.VITE_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  explorerUrl: env.VITE_FLOWPAY_BLOCK_EXPLORER_URL || 'https://stellar.expert/explorer/testnet',
  nativeCurrency: { name: 'Stellar Lumens', symbol: 'XLM', decimals: 7 },
  contractAddress:
    env.VITE_CONTRACT_ADDRESS
    || env.VITE_FLOWPAY_CONTRACT_ADDRESS
    || 'stellar:session-meter',
  paymentTokenAddress:
    env.VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS
    || 'stellar:usdc-sac',
  paymentAssetCode: env.VITE_STELLAR_PAYMENT_ASSET_CODE || 'USDC',
  paymentAssetIssuer: env.VITE_STELLAR_PAYMENT_ASSET_ISSUER || '',
};

export const IS_READY = Boolean(ACTIVE_NETWORK.contractAddress);
