const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};

const chainId = Number(
  env.VITE_POLKADOT_CHAIN_ID
  || env.VITE_FLOWPAY_CHAIN_ID
  || 420420421,
);

const chainIdHex = env.VITE_POLKADOT_CHAIN_ID_HEX
  || `0x${chainId.toString(16)}`;

export const ACTIVE_NETWORK = {
  key: 'westend-asset-hub',
  name: env.VITE_POLKADOT_NETWORK_NAME || env.VITE_FLOWPAY_NETWORK_NAME || 'Westend Asset Hub',
  chainId,
  chainIdHex,
  rpcUrl: env.VITE_POLKADOT_RPC_URL || env.VITE_FLOWPAY_RPC_URL || 'https://westend-asset-hub-eth-rpc.polkadot.io',
  substrateRpcUrl:
    env.VITE_POLKADOT_SUBSTRATE_RPC_URL
    || env.VITE_SUBSTRATE_RPC_URL
    || 'wss://westend-asset-hub-rpc.polkadot.io',
  explorerUrl: env.VITE_POLKADOT_EXPLORER_URL || env.VITE_FLOWPAY_BLOCK_EXPLORER_URL || 'https://westmint.subscan.io',
  nativeCurrency: { name: 'Westend', symbol: 'WND', decimals: 18 },
  contractAddress: env.VITE_POLKADOT_CONTRACT_ADDRESS || env.VITE_CONTRACT_ADDRESS || '0x75edbf3d9857521f5fb2f581c896779f5110a8a0',
  paymentTokenAddress:
    env.VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS
    || env.VITE_POLKADOT_MNEE_TOKEN_ADDRESS
    || env.VITE_MNEE_TOKEN_ADDRESS
    || '0x00007a6900000000000000000000000001200000',
};

export const IS_POLKADOT = true;
export const IS_READY = !!ACTIVE_NETWORK.contractAddress && !!ACTIVE_NETWORK.chainId;
