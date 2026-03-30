const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};
const runtimeKind = (env.VITE_FLOWPAY_RUNTIME_KIND || 'stellar').toLowerCase();

const chainId = Number(
  env.VITE_POLKADOT_CHAIN_ID
  || env.VITE_FLOWPAY_CHAIN_ID
  || (runtimeKind === 'stellar' ? 0 : 420420421),
);

const chainIdHex = env.VITE_POLKADOT_CHAIN_ID_HEX
  || `0x${chainId.toString(16)}`;

export const ACTIVE_NETWORK = {
  key: runtimeKind === 'stellar' ? 'stellar-testnet' : 'westend-asset-hub',
  kind: runtimeKind,
  name:
    env.VITE_POLKADOT_NETWORK_NAME
    || env.VITE_FLOWPAY_NETWORK_NAME
    || (runtimeKind === 'stellar' ? 'Stellar Testnet' : 'Westend Asset Hub'),
  chainId,
  chainIdHex,
  rpcUrl:
    env.VITE_POLKADOT_RPC_URL
    || env.VITE_FLOWPAY_RPC_URL
    || (runtimeKind === 'stellar'
      ? 'https://soroban-testnet.stellar.org'
      : 'https://westend-asset-hub-eth-rpc.polkadot.io'),
  horizonUrl: env.VITE_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  passphrase: env.VITE_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  substrateRpcUrl:
    env.VITE_POLKADOT_SUBSTRATE_RPC_URL
    || env.VITE_SUBSTRATE_RPC_URL
    || 'wss://westend-asset-hub-rpc.polkadot.io',
  explorerUrl:
    env.VITE_POLKADOT_EXPLORER_URL
    || env.VITE_FLOWPAY_BLOCK_EXPLORER_URL
    || (runtimeKind === 'stellar'
      ? 'https://stellar.expert/explorer/testnet'
      : 'https://westmint.subscan.io'),
  nativeCurrency:
    runtimeKind === 'stellar'
      ? { name: 'Stellar Lumens', symbol: 'XLM', decimals: 7 }
      : { name: 'Westend', symbol: 'WND', decimals: 18 },
  contractAddress:
    env.VITE_POLKADOT_CONTRACT_ADDRESS
    || env.VITE_CONTRACT_ADDRESS
    || (runtimeKind === 'stellar'
      ? 'stellar:session-meter'
      : '0x75edbf3d9857521f5fb2f581c896779f5110a8a0'),
  paymentTokenAddress:
    env.VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS
    || (runtimeKind === 'stellar'
      ? 'stellar:usdc-sac'
      : '0x00007a6900000000000000000000000001200000'),
  paymentAssetCode: env.VITE_STELLAR_PAYMENT_ASSET_CODE || 'USDC',
  paymentAssetIssuer: env.VITE_STELLAR_PAYMENT_ASSET_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

export const IS_POLKADOT = runtimeKind === 'polkadot';
export const IS_READY = !!ACTIVE_NETWORK.contractAddress && (ACTIVE_NETWORK.kind === 'stellar' || !!ACTIVE_NETWORK.chainId);
