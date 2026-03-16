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
} = require("../utils/substrate");

const DEFAULT_DEPLOY_WEIGHT_LIMIT = {
    refTime: process.env.WESTMINT_DEPLOY_WEIGHT_LIMIT_REF_TIME || "1300000000000",
    proofSize: process.env.WESTMINT_DEPLOY_WEIGHT_LIMIT_PROOF_SIZE || "7000000",
};

function readArtifact(relativePath) {
    return JSON.parse(
        fs.readFileSync(path.join(process.cwd(), relativePath), "utf8")
    );
}

async function deployArtifact(api, pair, artifactPath, constructorArgs = []) {
    const artifact = readArtifact(artifactPath);
    const iface = new ethers.Interface(artifact.abi);
    const encodedConstructor = iface.encodeDeploy(constructorArgs);
    const bytecode = artifact.bytecode?.object ?? artifact.bytecode;
    const deployCode = `${bytecode}${encodedConstructor.slice(2)}`;

    return instantiateWithCode(api, pair, {
        code: deployCode,
        data: "0x",
        weightLimit: DEFAULT_DEPLOY_WEIGHT_LIMIT,
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

        console.log("Deploying FlowPayStream...");
        const deployment = await deployArtifact(
            api,
            pair,
            "artifacts-pvm/contracts/FlowPayStream.sol/FlowPayStream.json",
            [runtime.paymentTokenAddress]
        );

        if (!deployment.contractAddress) {
            throw new Error("Deployment completed without an Instantiated event");
        }

        console.log("FlowPayStream deployed on Westend Asset Hub:");
        console.log(`FLOWPAY_CONTRACT_ADDRESS=${deployment.contractAddress}`);
        console.log(`WESTMINT_CHAIN_ID=${runtime.chainId}`);
        console.log(`WESTMINT_PAYMENT_ASSET_ID=${runtime.paymentAssetId}`);
        console.log(`WESTMINT_PAYMENT_TOKEN_ADDRESS=${runtime.paymentTokenAddress}`);
        console.log(`TX_HASH=${deployment.txHash}`);
    } finally {
        await api.disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
