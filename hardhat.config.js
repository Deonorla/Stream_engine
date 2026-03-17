require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { createFlowPayRuntimeConfig, createWestendRuntimeConfig } = require("./utils/polkadot");

const usePolkadotToolchain = process.env.FLOWPAY_USE_POLKADOT_SOLIDITY_TOOLCHAIN === "true";
if (usePolkadotToolchain) {
  require("@parity/hardhat-polkadot");
}
const solidityVersion = usePolkadotToolchain
  ? process.env.FLOWPAY_POLKADOT_SOLC_VERSION || "0.8.28"
  : "0.8.20";

const flowPayRuntime = createFlowPayRuntimeConfig();
const westendRuntime = createWestendRuntimeConfig();

const baseNetworks = {
  polkadot: {
    url: flowPayRuntime.rpcUrl,
    accounts:
      process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    chainId: flowPayRuntime.chainId,
  },
  westend: {
    url: westendRuntime.rpcUrl,
    accounts:
      process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    chainId: westendRuntime.chainId,
  },
};

baseNetworks.westmint = baseNetworks.westend;

const networks = usePolkadotToolchain
  ? {
      polkadot: {
        ...baseNetworks.polkadot,
        polkadot: {
          target: "evm",
        },
      },
      westend: {
        ...baseNetworks.westend,
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
