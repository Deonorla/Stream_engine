require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { createFlowPayRuntimeConfig, createWestmintRuntimeConfig } = require("./utils/polkadot");

const usePolkadotToolchain = process.env.FLOWPAY_USE_POLKADOT_SOLIDITY_TOOLCHAIN === "true";
if (usePolkadotToolchain) {
  require("@parity/hardhat-polkadot");
}
const solidityVersion = usePolkadotToolchain
  ? process.env.FLOWPAY_POLKADOT_SOLC_VERSION || "0.8.28"
  : "0.8.20";

const flowPayRuntime = createFlowPayRuntimeConfig();
const westmintRuntime = createWestmintRuntimeConfig();

const baseNetworks = {
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
    accounts:
      process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    chainId: 11155111,
  },
  polkadot: {
    url: flowPayRuntime.rpcUrl,
    accounts:
      process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    chainId: flowPayRuntime.chainId,
  },
  westmint: {
    url: westmintRuntime.rpcUrl,
    accounts:
      process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    chainId: westmintRuntime.chainId,
  },
};

const networks = usePolkadotToolchain
  ? {
      sepolia: baseNetworks.sepolia,
      polkadot: {
        ...baseNetworks.polkadot,
        polkadot: {
          target: "evm",
        },
      },
      westmint: {
        ...baseNetworks.westmint,
        polkadot: {
          target: "evm",
        },
      },
    }
  : baseNetworks;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: solidityVersion,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  ...(usePolkadotToolchain
    ? {
        resolc: {
          compilerSource: "npm",
        },
        paths: {
          artifacts: "./artifacts-pvm",
          cache: "./cache-pvm",
        },
      }
    : {}),
  networks,
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
