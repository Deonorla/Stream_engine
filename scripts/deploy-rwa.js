const hre = require("hardhat");
const { ethers } = hre;
const { createFlowPayRuntimeConfig, createWestmintRuntimeConfig } = require("../utils/polkadot");

function parseOperatorAddresses(value) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

async function main() {
    const runtimeConfig =
        hre.network.name === "westmint"
            ? createWestmintRuntimeConfig()
            : createFlowPayRuntimeConfig();
    const paymentTokenAddress = runtimeConfig.paymentTokenAddress;
    if (!paymentTokenAddress) {
        throw new Error("A payment token address or asset ID is required to deploy the RWA suite");
    }

    const [deployer] = await ethers.getSigners();
    console.log(`Deploying FlowPay RWA suite with ${deployer.address}`);
    console.log(`Using ${runtimeConfig.paymentTokenSymbol}: ${paymentTokenAddress}`);
    console.log(`Payment asset ID: ${runtimeConfig.paymentAssetId}`);

    const AssetNFT = await ethers.getContractFactory("FlowPayAssetNFT");
    const assetNFT = await AssetNFT.deploy("FlowPay Rental Asset", "FPRA");
    await assetNFT.waitForDeployment();

    const AssetRegistry = await ethers.getContractFactory("FlowPayAssetRegistry");
    const assetRegistry = await AssetRegistry.deploy();
    await assetRegistry.waitForDeployment();

    const AssetAttestationRegistry = await ethers.getContractFactory("FlowPayAssetAttestationRegistry");
    const attestationRegistry = await AssetAttestationRegistry.deploy();
    await attestationRegistry.waitForDeployment();

    const ComplianceGuard = await ethers.getContractFactory("FlowPayComplianceGuard");
    const complianceGuard = await ComplianceGuard.deploy();
    await complianceGuard.waitForDeployment();

    const AssetStream = await ethers.getContractFactory("FlowPayAssetStream");
    const assetStream = await AssetStream.deploy(paymentTokenAddress, await assetNFT.getAddress());
    await assetStream.waitForDeployment();

    const RWAHub = await ethers.getContractFactory("FlowPayRWAHub");
    const rwaHub = await RWAHub.deploy(
        await assetNFT.getAddress(),
        await assetRegistry.getAddress(),
        await complianceGuard.getAddress(),
        await assetStream.getAddress(),
        await attestationRegistry.getAddress()
    );
    await rwaHub.waitForDeployment();

    await (await assetNFT.setController(await rwaHub.getAddress())).wait();
    await (await assetRegistry.setController(await rwaHub.getAddress())).wait();
    await (await attestationRegistry.setController(await rwaHub.getAddress())).wait();
    await (await complianceGuard.setController(await rwaHub.getAddress())).wait();
    await (await assetStream.setHub(await rwaHub.getAddress())).wait();
    await (await assetStream.setComplianceGuard(await complianceGuard.getAddress())).wait();

    const operatorAddresses = parseOperatorAddresses(process.env.FLOWPAY_RWA_OPERATOR_ADDRESSES);
    for (const operatorAddress of operatorAddresses) {
        if (!ethers.isAddress(operatorAddress)) {
            throw new Error(`Invalid FLOWPAY_RWA_OPERATOR_ADDRESSES entry: ${operatorAddress}`);
        }
        if (operatorAddress.toLowerCase() === deployer.address.toLowerCase()) {
            continue;
        }
        await (await rwaHub.setOperator(operatorAddress, true)).wait();
        console.log(`Granted RWA hub operator access to ${operatorAddress}`);
    }

    console.log("FlowPay RWA suite deployed:");
    console.log(`FLOWPAY_RWA_ASSET_NFT_ADDRESS=${await assetNFT.getAddress()}`);
    console.log(`FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS=${await assetRegistry.getAddress()}`);
    console.log(`FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS=${await attestationRegistry.getAddress()}`);
    console.log(`FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS=${await complianceGuard.getAddress()}`);
    console.log(`FLOWPAY_RWA_ASSET_STREAM_ADDRESS=${await assetStream.getAddress()}`);
    console.log(`FLOWPAY_RWA_HUB_ADDRESS=${await rwaHub.getAddress()}`);
    console.log(`FLOWPAY_PAYMENT_TOKEN_ADDRESS=${paymentTokenAddress}`);
    console.log(`FLOWPAY_PAYMENT_ASSET_ID=${runtimeConfig.paymentAssetId}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
