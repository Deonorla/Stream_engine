import { ACTIVE_NETWORK } from './networkConfig.js';

const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};

function resolveContractId(value, fallback) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.startsWith('stellar:') && fallback ? fallback : normalized;
}

export const appName = "Stella's Stream Engine";
export const streamContractName = 'SessionMeter';
export const contractAddress = ACTIVE_NETWORK.contractAddress;
export const paymentTokenAddress = ACTIVE_NETWORK.paymentTokenAddress;
export const paymentTokenSymbol = env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_SYMBOL || ACTIVE_NETWORK.paymentAssetCode || 'USDC';
export const paymentTokenDisplayName =
  env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_NAME
  || `${paymentTokenSymbol} on Stellar`;
export const paymentTokenDecimals = Number(
  env.VITE_STREAM_ENGINE_PAYMENT_TOKEN_DECIMALS
  || 7,
);
export const paymentAssetCode = ACTIVE_NETWORK.paymentAssetCode || paymentTokenSymbol;
export const paymentAssetIssuer = ACTIVE_NETWORK.paymentAssetIssuer || '';
export const nativeTokenAddress = resolveContractId(
  env.VITE_STELLAR_NATIVE_TOKEN_ADDRESS,
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
);
export const rwaRegistryAddress = resolveContractId(
  env.VITE_STREAM_ENGINE_RWA_ASSET_REGISTRY_ADDRESS
  || env.VITE_STREAM_ENGINE_RWA_HUB_ADDRESS,
  'CCQ7RAHNLTGH2CF5BNNWAGFJLCB6EUV76K5ZQ4CWU42VF3FGZ5PJHNYK',
);
export const rwaAttestationRegistryAddress = resolveContractId(
  env.VITE_STREAM_ENGINE_RWA_ATTESTATION_REGISTRY_ADDRESS,
  'CCSNBJYDCM546LAUAVUFXABRWRCAP7U77TTEU4CKHNXYQMU7BEWTYCGJ',
);
export const rwaYieldVaultAddress = resolveContractId(
  env.VITE_STREAM_ENGINE_RWA_ASSET_STREAM_ADDRESS,
  'CBBAIM4NMQEZ5RX3ZIII7SLTZSG5GYZ6DOCEPTQV6N37NYPCYLBL6ZQO',
);
export const settlementRecipientAddress = env.VITE_STREAM_ENGINE_RECIPIENT_ADDRESS || '';
export const supportedPaymentAssets = [
  {
    symbol: paymentAssetCode || 'USDC',
    name: paymentTokenDisplayName,
    decimals: paymentTokenDecimals,
    tokenAddress: paymentTokenAddress,
    assetCode: paymentAssetCode || 'USDC',
    assetIssuer: paymentAssetIssuer,
    isNative: false,
  },
  {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    decimals: 7,
    tokenAddress: nativeTokenAddress,
    assetCode: 'XLM',
    assetIssuer: '',
    isNative: true,
  },
].filter((asset, index, all) => all.findIndex((entry) => entry.symbol === asset.symbol) === index);
