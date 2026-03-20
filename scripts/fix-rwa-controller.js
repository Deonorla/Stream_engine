#!/usr/bin/env node
/**
 * Fix RWA contract controller relationships.
 * Calls setController(hubAddress) on ComplianceGuard (and optionally other contracts)
 * if they are not already pointing to the Hub.
 *
 * Usage: node scripts/fix-rwa-controller.js [--dry-run]
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

const DRY_RUN = process.argv.includes("--dry-run");

const CONTROLLER_ABI = [
    "function controller() external view returns (address)",
    "function setController(address controller_) external",
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

async function writeContract(api, pair, config, address, abi, fn, args = []) {
    const iface = new ethers.Interface(abi);
    const data = iface.encodeFunctionData(fn, args);
    return reviveCall(api, pair, {
        dest: address,
        data,
        weightLimit: config.weightLimit,
        storageDepositLimit: config.storageDepositLimit,
    });
}

async function fixController(api, pair, config, label, contractAddress) {
    if (!contractAddress) {
        console.log(`  ${label}: address not set, skipping`);
        return;
    }

    let current;
    try {
        current = String(await readContract(api, pair, config, contractAddress, CONTROLLER_ABI, "controller", [])).toLowerCase();
    } catch (err) {
        console.log(`  ${label}: could not read controller (${err.message}), skipping`);
        return;
    }

    const expected = HUB_ADDRESS.toLowerCase();
    if (current === expected) {
        console.log(`  ${label}: controller already correct ✓`);
        return;
    }

    console.log(`  ${label}: controller is ${current}, expected ${expected}`);
    if (DRY_RUN) {
        console.log(`  ${label}: [DRY RUN] would call setController(${HUB_ADDRESS})`);
        return;
    }

    console.log(`  ${label}: calling setController(${HUB_ADDRESS})...`);
    const result = await writeContract(api, pair, config, contractAddress, CONTROLLER_ABI, "setController", [HUB_ADDRESS]);
    console.log(`  ${label}: ✓ fixed — txHash=${result.txHash}`);
}

async function main() {
    console.log("\n=== Fix RWA Controller Relationships ===\n");
    if (DRY_RUN) console.log("DRY RUN — no transactions will be sent\n");

    console.log(`Hub:                  ${HUB_ADDRESS}`);
    console.log(`ComplianceGuard:      ${GUARD_ADDRESS}`);
    console.log(`AssetNFT:             ${NFT_ADDRESS}`);
    console.log(`AssetRegistry:        ${REGISTRY_ADDRESS}`);
    console.log(`AttestationRegistry:  ${ATTESTATION_ADDRESS}`);
    console.log("\nConnecting to substrate...");

    const { api, config } = await createSubstrateApi();
    const { pair, evmAddress } = await loadSubstrateSigner();
    await ensureMapped(api, pair, evmAddress);

    console.log(`Signer EVM address: ${evmAddress}\n`);
    console.log("Checking and fixing controllers...\n");

    await fixController(api, pair, config, "ComplianceGuard", GUARD_ADDRESS);
    await fixController(api, pair, config, "AssetNFT", NFT_ADDRESS);
    await fixController(api, pair, config, "AssetRegistry", REGISTRY_ADDRESS);
    await fixController(api, pair, config, "AttestationRegistry", ATTESTATION_ADDRESS);

    console.log("\n=== Done ===\n");
    await api.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error("Fix script failed:", err.message);
    process.exit(1);
});
