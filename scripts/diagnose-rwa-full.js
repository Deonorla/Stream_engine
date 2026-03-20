#!/usr/bin/env node
/**
 * Full RWA diagnostic — checks all controller relationships and simulates
 * the exact server mint flow to find where ContractReverted occurs.
 *
 * Usage: node scripts/diagnose-rwa-full.js <issuerAddress>
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
const GUARD_ADDRESS = process.env.FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS;
const NFT_ADDRESS = process.env.FLOWPAY_RWA_ASSET_NFT_ADDRESS;
const REGISTRY_ADDRESS = process.env.FLOWPAY_RWA_ASSET_REGISTRY_ADDRESS;
const ATTESTATION_ADDRESS = process.env.FLOWPAY_RWA_ATTESTATION_REGISTRY_ADDRESS;
const ISSUER = process.argv[2];

if (!ISSUER) {
    console.error("Usage: node scripts/diagnose-rwa-full.js <issuerAddress>");
    process.exit(1);
}

const CONTROLLER_ABI = [
    "function controller() external view returns (address)",
    "function owner() external view returns (address)",
];
const HUB_ABI = [
    "function owner() external view returns (address)",
    "function operators(address) external view returns (bool)",
    "function setIssuerApproval(address issuer, bool approved, string note) external",
    "function mintAsset(string publicMetadataURI, uint8 assetType, uint8 rightsModel, bytes32 publicMetadataHash, bytes32 evidenceRoot, bytes32 evidenceManifestHash, bytes32 propertyRefHash, string jurisdiction, bytes32 cidHash, bytes32 tagHash, address issuer, string statusReason) external returns (uint256 tokenId)",
];
const GUARD_ABI = [
    "function controller() external view returns (address)",
    "function owner() external view returns (address)",
    "function isIssuerApproved(address) external view returns (bool)",
    "function getIssuerApproval(address) external view returns (bool approved, uint64 updatedAt, address updatedBy, string note)",
];
const NFT_ABI = [
    "function nextTokenId() external view returns (uint256)",
    "function controller() external view returns (address)",
    "function owner() external view returns (address)",
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

async function tryRead(api, pair, config, label, address, abi, fn, args = []) {
    try {
        const result = await readContract(api, pair, config, address, abi, fn, args);
        return result;
    } catch (err) {
        console.log(`  ${label}: READ FAILED — ${err.message}`);
        return null;
    }
}

async function main() {
    console.log(`\n=== Full RWA Diagnostic for issuer: ${ISSUER} ===\n`);

    const { api, config } = await createSubstrateApi();
    const { pair, evmAddress } = await loadSubstrateSigner();
    await ensureMapped(api, pair, evmAddress);

    console.log(`Signer EVM: ${evmAddress}\n`);

    // Check all controllers
    console.log("--- Controller Relationships ---");
    const guardController = String(await tryRead(api, pair, config, "guard.controller", GUARD_ADDRESS, GUARD_ABI, "controller", []) || "").toLowerCase();
    const nftController = String(await tryRead(api, pair, config, "nft.controller", NFT_ADDRESS, NFT_ABI, "controller", []) || "").toLowerCase();

    let registryController = "";
    let attestationController = "";
    try {
        registryController = String(await readContract(api, pair, config, REGISTRY_ADDRESS, CONTROLLER_ABI, "controller", [])).toLowerCase();
    } catch (e) { registryController = `ERROR: ${e.message}`; }
    try {
        attestationController = String(await readContract(api, pair, config, ATTESTATION_ADDRESS, CONTROLLER_ABI, "controller", [])).toLowerCase();
    } catch (e) { attestationController = `ERROR: ${e.message}`; }

    const hubLower = HUB_ADDRESS.toLowerCase();
    console.log(`  ComplianceGuard.controller: ${guardController} ${guardController === hubLower ? "✓" : "✗ WRONG"}`);
    console.log(`  AssetNFT.controller:        ${nftController} ${nftController === hubLower ? "✓" : "✗ WRONG"}`);
    console.log(`  AssetRegistry.controller:   ${registryController} ${registryController === hubLower ? "✓" : "✗ WRONG"}`);
    console.log(`  AttestationReg.controller:  ${attestationController} ${attestationController === hubLower ? "✓" : "✗ WRONG"}`);

    // Check issuer approval
    console.log("\n--- Issuer Approval ---");
    const isApproved = await tryRead(api, pair, config, "isIssuerApproved", GUARD_ADDRESS, GUARD_ABI, "isIssuerApproved", [ISSUER]);
    console.log(`  isIssuerApproved(${ISSUER}): ${isApproved}`);

    if (!isApproved) {
        console.log("\n  Issuer NOT approved. Testing setIssuerApproval...");
        const iface = new ethers.Interface(HUB_ABI);
        const data = iface.encodeFunctionData("setIssuerApproval", [ISSUER, true, "diagnostic test"]);
        try {
            const result = await reviveCall(api, pair, {
                dest: HUB_ADDRESS,
                data,
                weightLimit: config.weightLimit,
                storageDepositLimit: config.storageDepositLimit,
            });
            console.log(`  setIssuerApproval SUCCEEDED: txHash=${result.txHash}`);
        } catch (err) {
            console.log(`  setIssuerApproval FAILED: ${err.message}`);
        }
    }

    // Check nextTokenId
    const nextTokenId = await tryRead(api, pair, config, "nextTokenId", NFT_ADDRESS, NFT_ABI, "nextTokenId", []);
    console.log(`\n--- NFT State ---`);
    console.log(`  nextTokenId: ${nextTokenId}`);

    // Try mintAsset
    console.log("\n--- Testing mintAsset ---");
    const publicMetadataURI = "ipfs://QmDiagnosticTest" + Date.now();
    const publicMetadataHash = ethers.keccak256(ethers.toUtf8Bytes("diag-metadata-" + Date.now()));
    const evidenceRoot = ethers.keccak256(ethers.toUtf8Bytes("diag-evidence-" + Date.now()));
    const evidenceManifestHash = ethers.keccak256(ethers.toUtf8Bytes("diag-manifest-" + Date.now()));
    const propertyRefHash = ethers.keccak256(ethers.toUtf8Bytes("DIAG-PROP-" + Date.now()));
    const cidHash = ethers.keccak256(ethers.toUtf8Bytes(publicMetadataURI));
    const tagHash = ethers.keccak256(ethers.toUtf8Bytes(`${ISSUER}:DIAG:${publicMetadataURI}`));

    const mintArgs = [
        publicMetadataURI, 1, 1,
        publicMetadataHash, evidenceRoot, evidenceManifestHash,
        propertyRefHash, "US", cidHash, tagHash,
        ISSUER, "Diagnostic test",
    ];

    const mintIface = new ethers.Interface(HUB_ABI);
    const mintData = mintIface.encodeFunctionData("mintAsset", mintArgs);

    try {
        const result = await reviveCall(api, pair, {
            dest: HUB_ADDRESS,
            data: mintData,
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log(`  mintAsset SUCCEEDED: txHash=${result.txHash}`);
    } catch (err) {
        console.log(`  mintAsset FAILED: ${err.message}`);
        console.log("\n  This is the ContractReverted. Possible causes:");
        console.log("  - isIssuerApproved returned false (state not updated yet?)");
        console.log("  - assetNFT.mintTo reverted (controller not set?)");
        console.log("  - assetRegistry.registerAsset reverted (controller not set?)");
    }

    console.log("\n=== Done ===\n");
    await api.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error("Diagnostic failed:", err.message);
    process.exit(1);
});
