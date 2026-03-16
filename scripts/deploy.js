const hre = require("hardhat");
const { createFlowPayRuntimeConfig, createWestmintRuntimeConfig } = require("../utils/polkadot");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const runtimeConfig =
    hre.network.name === "westmint"
      ? createWestmintRuntimeConfig()
      : createFlowPayRuntimeConfig();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Target network:", hre.network.name);

  let paymentTokenAddress;

  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    console.log("Deploying MockUSDC for local development...");
    const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    paymentTokenAddress = await mockUSDC.getAddress();
    console.log("MockUSDC deployed to:", paymentTokenAddress);
  } else {
    paymentTokenAddress = runtimeConfig.paymentTokenAddress;
  }

  if (!paymentTokenAddress) {
    throw new Error("Payment token address is required for this network");
  }

  console.log(
    `Deploying FlowPayStream with ${runtimeConfig.paymentTokenSymbol} address:`,
    paymentTokenAddress
  );
  const FlowPayStream = await hre.ethers.getContractFactory("FlowPayStream");
  const flowPayStream = await FlowPayStream.deploy(paymentTokenAddress);

  await flowPayStream.waitForDeployment();

  console.log("FlowPayStream deployed to:", await flowPayStream.getAddress());
  if (hre.network.name === "polkadot" || hre.network.name === "westmint") {
    console.log(`POLKADOT_CHAIN_ID=${runtimeConfig.chainId}`);
    console.log(`FLOWPAY_PAYMENT_ASSET_ID=${runtimeConfig.paymentAssetId}`);
    console.log(`FLOWPAY_PAYMENT_TOKEN_ADDRESS=${paymentTokenAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
