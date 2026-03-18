require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { createWestmintRuntimeConfig } = require("../utils/polkadot");
const {
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    instantiateWithCode,
    reviveCall,
} = require("../utils/substrate");

const DEFAULT_DEPLOY_WEIGHT_LIMIT = {
    refTime: process.env.WESTMINT_DEPLOY_WEIGHT_LIMIT_REF_TIME || "1300000000000",
    proofSize: process.env.WESTMINT_DEPLOY_WEIGHT_LIMIT_PROOF_SIZE || "7000000",
};

const DEFAULT_CALL_WEIGHT_LIMIT = {
    refTime: process.env.WESTMINT_CALL_WEIGHT_LIMIT_REF_TIME || "500000000000",
    proofSize: process.env.WESTMINT_CALL_WEIGHT_LIMIT_PROOF_SIZE || "2000000",
};

function readArtifact(relativePath) {
    return JSON.parse(
        fs.readFileSync(path.join(process.cwd(), relativePath), "utf8")
    );
}

function parseOperatorAddresses(value) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

async function deployArtifact(api, pair, artifactPath, constructorArgs = []) {
    const artifact = readArtifact(artifactPath);
    const iface = new ethers.Interface(artifact.abi);
    const encodedConstructor = iface.encodeDeploy(constructorArgs);
    const bytecode = artifact.bytecode?.object ?? artifact.bytecode;
    const deployCode = `${bytecode}${encodedConstructor.slice(2)}`;

    return {
        artifact,
        ...(await instantiateWithCode(api, pair, {
            code: deployCode,
            data: "0x",
            weightLimit: DEFAULT_DEPLOY_WEIGHT_LIMIT,
            storageDepositLimit: process.env.WESTMINT_DEPLOY_STORAGE_DEPOSIT_LIMIT || "5000000000000000000",
        })),
    };
}

async function callContract(api, pair, artifact, address, functionName, args = []) {
    const iface = new ethers.Interface(artifact.abi);
    return reviveCall(api, pair, {
        dest: address,
        data: iface.encodeFunctionData(functionName, args),
        weightLimit: DEFAULT_CALL_WEIGHT_LIMIT,
        storageDepositLimit: process.env.WESTMINT_DEPLOY_STORAGE_DEPOSIT_LIMIT || "5000000000000000000",
    });
}

async function main() {
    const runtime = createWestmintRuntimeConfig();
    console.log(`Connecting to Westend Asset Hub WS: ${process.env.WESTMINT_WS_URL || "wss://westmint-rpc.polkadot.io"}`);
    const { api } = await createSubstrateApi({
        rpcUrl: process.env.WESTMINT_WS_URL || "wss://westmint-rpc.polkadot.io",
    });
    console.log("Loading Substrate signer...");
    const { pair, evmAddress } = await loadSubstrateSigner();

    try {
        console.log(`Ensuring EVM mapping for ${pair.address}...`);
        const mapping = await ensureMapped(api, pair, evmAddress);
        console.log(`Mapped EVM alias: ${evmAddress} (${mapping.alreadyMapped ? "already mapped" : "mapped now"})`);

        console.log("Deploying FlowPayAssetNFT...");
        const assetNFT = await deployArtifact(
            api,
            pair,
            "artifacts-pvm/contracts/FlowPayAssetNFT.sol/FlowPayAssetNFT.json",
            ["FlowPay Rental Asset", "FPRA"]
        );
        console.log("Deploying FlowPayAssetRegistry...");
        const assetRegistry = await deployArtifact(
            api,
            pair,
            "artifacts-pvm/contracts/FlowPayAssetRegistry.sol/FlowPayAssetRegistry.json"
        );
        console.log("Deploying FlowPayAssetAttestationRegistry...");
        const attestationRegistry = await deployArtifact(
            api,
            pair,
            "artifacts-pvm/contracts/FlowPayAssetAttestationRegistry.sol/FlowPayAssetAttestationRegistry.json"
        );
        console.log("Deploying FlowPayComplianceGuard...");
        const complianceGuard = await deployArtifact(
            api,
            pair,
            "artifacts-pvm/contracts/FlowPayComplianceGuard.sol/FlowPayComplianceGuard.json"
        );
        console.log("Deploying FlowPayAssetStream...");
        const assetStream = await deployArtifact(
            api,
            pair,
            "artifacts-pvm/contracts/FlowPayAssetStream.sol/FlowPayAssetStream.json",
            [runtime.paymentTokenAddress, assetNFT.contractAddress]
        );
        console.log("Deploying FlowPayRWAHub...");
        const rwaHub = await deployArtifact(
            api,
            pair,
            "artifacts-pvm/contracts/FlowPayRWAHub.sol/FlowPayRWAHub.json",
            [
                assetNFT.contractAddress,
                assetRegistry.contractAddress,
                complianceGuard.contractAddress,
                assetStream.contractAddress,
                attestationRegistry.contractAddress,
            ]
        );

        if (
            !assetNFT.contractAddress
            || !assetRegistry.contractAddress
            || !attestationRegistry.contractAddress
            || !complianceGuard.contractAddress
            || !assetStream.contractAddress
            || !rwaHub.contractAddress
        ) {
            throw new Error("One or more RWA contracts failed to emit Instantiated");
        }

        console.log("Configuring controller relationships...");
        await callContract(api, pair, assetNFT.artifact, assetNFT.contractAddress, "setController", [rwaHub.contractAddress]);
        await callContract(api, pair, assetRegistry.artifact, assetRegistry.contractAddress, "setController", [rwaHub.contractAddress]);
        await callContract(api, pair, attestationRegistry.artifact, attestationRegistry.contractAddress, "setController", [rwaHub.contractAddress]);
        await callContract(api, pair, complianceGuard.artifact, complianceGuard.contractAddress, "setController", [rwaHub.contractAddress]);
        await callContract(api, pair, assetStream.artifact, assetStream.contractAddress, "setHub", [rwaHub.contractAddress]);
        await callContract(api, pair, assetStream.artifact, assetStream.contractAddress, "setComplianceGuard", [complianceGuard.contractAddress]);

        const operatorAddresses = parseOperatorAddresses(process.env.FLOWPAY_RWA_OPERATOR_ADDRESSES);
        for (const operatorAddress of operatorAddresses) {
            if (!ethers.isAddress(operatorAddress)) {
                throw new Error(`Invalid FLOWPAY_RWA_OPERATOR_ADDRESSES entry: ${operatorAddress}`);
            }
            if (operatorAddress.toLowerCase() === evmAddress.toLowerCase()) {
                continue;
            }
            await callContract(api, pair, rwaHub.artifact, rwaHub.contractAddress, "setOperator", [operatorAddress, true]);
            console.log(`Granted RWA hub operator access to ${operatorAddress}`);
        }

        console.log("FlowPay RWA suite deployed on Westend Asset Hub:");
        console.log(`FLOWPAY_RWA_ASSET_NFT_ADDRESS=${assetNFT.contractAddress}`);
        console.log(`FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS=${assetRegistry.contractAddress}`);
        console.log(`FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS=${attestationRegistry.contractAddress}`);
        console.log(`FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS=${complianceGuard.contractAddress}`);
        console.log(`FLOWPAY_RWA_ASSET_STREAM_ADDRESS=${assetStream.contractAddress}`);
        console.log(`FLOWPAY_RWA_HUB_ADDRESS=${rwaHub.contractAddress}`);
        console.log(`WESTMINT_PAYMENT_TOKEN_ADDRESS=${runtime.paymentTokenAddress}`);
        console.log(`WESTMINT_PAYMENT_ASSET_ID=${runtime.paymentAssetId}`);
    } finally {
        await api.disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
