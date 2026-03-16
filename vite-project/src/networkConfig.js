// ─── Network Configuration ────────────────────────────────────────────────────
// To switch to Polkadot EVM:
//   1. Set VITE_ACTIVE_NETWORK=polkadot in your .env
//   2. Fill in the Polkadot contract addresses below (or via env vars)
//   That's it — no other files need to change.

const NETWORKS = {
  sepolia: {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    rpcUrl: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS   || '0x155A00fBE3D290a8935ca4Bf5244283685Bb0035',
    mneeTokenAddress: import.meta.env.VITE_MNEE_TOKEN_ADDRESS || '0x96B1FE54Ee89811f46ecE4a347950E0D682D3896',
  },
  polkadot: {
    name: 'Polkadot EVM',
    // ⬇ Fill these in once contracts are deployed on Polkadot EVM
    chainId: import.meta.env.VITE_POLKADOT_CHAIN_ID        ? Number(import.meta.env.VITE_POLKADOT_CHAIN_ID) : null,
    chainIdHex: import.meta.env.VITE_POLKADOT_CHAIN_ID_HEX || null,
    rpcUrl: import.meta.env.VITE_POLKADOT_RPC_URL           || null,
    explorerUrl: import.meta.env.VITE_POLKADOT_EXPLORER_URL || null,
    nativeCurrency: { name: 'DOT', symbol: 'DOT', decimals: 18 },
    contractAddress: import.meta.env.VITE_POLKADOT_CONTRACT_ADDRESS    || null,
    mneeTokenAddress: import.meta.env.VITE_POLKADOT_MNEE_TOKEN_ADDRESS || null,
  },
};

const active = import.meta.env.VITE_ACTIVE_NETWORK || 'sepolia';

export const ACTIVE_NETWORK = NETWORKS[active] || NETWORKS.sepolia;
export const IS_POLKADOT    = active === 'polkadot';
export const IS_READY       = !!ACTIVE_NETWORK.contractAddress && !!ACTIVE_NETWORK.chainId;
