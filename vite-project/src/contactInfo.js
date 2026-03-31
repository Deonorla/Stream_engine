const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};

export const appName = "Stella's Stream Engine";
export const streamContractName = "SessionMeter";

export const contractAddress =
  env.VITE_STREAM_ENGINE_CONTRACT_ADDRESS
  || 'stellar:session-meter';

export const paymentTokenAddress =
  env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_ADDRESS
  || 'stellar:usdc-sac';

export const paymentTokenSymbol = env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_SYMBOL || 'USDC';
export const paymentTokenDisplayName =
  env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_NAME
  || 'USDC on Stellar';
export const paymentTokenDecimals = Number(
  env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_DECIMALS || 7,
);
export const paymentAssetCode = env.VITE_STELLAR_PAYMENT_ASSET_CODE || env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_SYMBOL || 'USDC';
export const paymentAssetIssuer = env.VITE_STELLAR_PAYMENT_ASSET_ISSUER || '';
export const rwaApiBaseUrl = env.VITE_RWA_API_URL || 'http://localhost:3001';
