#!/usr/bin/env node
/**
 * Test mintAsset directly via substrate to isolate the ContractReverted.
 * Uses minimal valid parameters to find which require() fails.
 *
 * Usage: node scripts/test-mint-asset.js <issuerAddress>
 */

require("dotenv").config({ path: "./.env" });

const { ethers } = require("ethers");
const {
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    reviveRead,
    reviveCall,
} = require("../utils/substrate");

const HUB_ADDRESS = process.env.FLOWPAY_RWA_HUB_ADDRESS;
const NFT_ADDRESS = process.env.FLOWPAY_RWA_ASSET_NFT_ADDRESS;
const ISSUER = process.argv[2] || "0x506e724d7FDdbF91B6607d5Af0700d385D952f8a";

const HUB_ABI = [
    "function mintAsset(string publicMetadataURI, uint8 assetType, uint8 rightsModel, bytes32 publicMetadataHash, bytes32 evidenceRoot, bytes32 evidenceManifestHash, bytes32 propertyRefHash, string jurisdiction, bytes32 cidHash, bytes32 tagHash, address issuer, string statusReason) external returns (uint256 tokenId)",
    "function owner() external view returns (address)",
];
const NFT_ABI = [
    "function nextTokenId() external view returns (uint256)",
];

async function readContract(api, pair, config, address, abi, fn, args = []) {
    const iface = new ethers.Interface(abi);
    const data = iface.encodeFunctionData(fn, args);
    const result = await reviveRead(api, pair.address, {
        dest: address,
        data,
        weightLimit: config.weightLimit,
        storageDepositLimit: config.storageDepositLimit,
    });
    const decoded = iface.decodeFunctionResult(fn, result.data);
    return decoded.length === 1 ? decoded[0] : decoded;
}

async function main() {
    console.log(`\nTesting mintAsset for issuer: ${ISSUER}\n`);

    const { api, config } = await createSubstrateApi();
    const { pair, evmAddress } = await loadSubstrateSigner();
    await ensureMapped(api, pair, evmAddress);

    console.log(`Signer EVM: ${evmAddress}`);

    const nextTokenId = await readContract(api, pair, config, NFT_ADDRESS, NFT_ABI, "nextTokenId", []);
    console.log(`Next token ID will be: ${nextTokenId}\n`);

    // Build minimal valid args
    const publicMetadataURI = "ipfs://QmTestDiagnosticMetadata123456789";
    const assetType = 1;
    const rightsModel = 1;
    const publicMetadataHash = ethers.keccak256(ethers.toUtf8Bytes("test-metadata"));
    const evidenceRoot = ethers.keccak256(ethers.toUtf8Bytes("test-evidence-root"));
    const evidenceManifestHash = ethers.keccak256(ethers.toUtf8Bytes("test-manifest"));
    const propertyRefHash = ethers.keccak256(ethers.toUtf8Bytes("TEST-PROP-001"));
    const jurisdiction = "US";
    const cidHash = ethers.keccak256(ethers.toUtf8Bytes(publicMetadataURI));
    const tagHash = ethers.keccak256(ethers.toUtf8Bytes(`${ISSUER}:TEST-PROP-001:${publicMetadataURI}`));
    const statusReason = "Awaiting attestation review";

    const args = [
        publicMetadataURI,
        assetType,
        rightsModel,
        publicMetadataHash,
        evidenceRoot,
        evidenceManifestHash,
        propertyRefHash,
        jurisdiction,
        cidHash,
        tagHash,
        ISSUER,
        statusReason,
    ];

    console.log("Mint args:");
    console.log(`  publicMetadataURI:    ${publicMetadataURI}`);
    console.log(`  assetType:            ${assetType}`);
    console.log(`  rightsModel:          ${rightsModel}`);
    console.log(`  publicMetadataHash:   ${publicMetadataHash}`);
    console.log(`  evidenceRoot:         ${evidenceRoot}`);
    console.log(`  evidenceManifestHash: ${evidenceManifestHash}`);
    console.log(`  propertyRefHash:      ${propertyRefHash}`);
    console.log(`  jurisdiction:         ${jurisdiction}`);
    console.log(`  cidHash:              ${cidHash}`);
    console.log(`  tagHash:              ${tagHash}`);
    console.log(`  issuer:               ${ISSUER}`);
    console.log(`  statusReason:         ${statusReason}`);

    const iface = new ethers.Interface(HUB_ABI);
    const data = iface.encodeFunctionData("mintAsset", args);

    console.log("\nCalling hub.mintAsset via substrate...");
    try {
        const result = await reviveCall(api, pair, {
            dest: HUB_ADDRESS,
            data,
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log(`\nmintAsset SUCCEEDED! txHash=${result.txHash}`);
        console.log(`Token ID: ${nextTokenId}`);
    } catch (err) {
        console.error(`\nmintAsset FAILED: ${err.message}`);
        console.log("\nThis is the ContractReverted. Check which require() in mintAsset failed.");
        console.log("Requires in mintAsset:");
        console.log("  1. issuer != address(0)");
        console.log("  2. publicMetadataURI.length > 0");
        console.log("  3. publicMetadataHash != bytes32(0)");
        console.log("  4. evidenceRoot != bytes32(0)");
        console.log("  5. complianceGuard.isIssuerApproved(issuer)");
        console.log("  6. assetNFT.mintTo(issuer, publicMetadataURI) — controller check");
        console.log("  7. assetRegistry.registerAsset(...) — controller check");
    }

    await api.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error("Script failed:", err.message);
    process.exit(1);
});
