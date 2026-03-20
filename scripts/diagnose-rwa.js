#!/usr/bin/env node
/**
 * Diagnose RWA hub on-chain state.
 * Checks: hub owner, signer operator status, complianceGuard controller,
 * and whether the issuer is already approved.
 *
 * Usage: node scripts/diagnose-rwa.js [issuerAddress]
 */

require("dotenv").config({ path: "./.env" });

const { ethers } = require("ethers");
const {
    createSubstrateApi,
    loadSubstrateSigner,
    ensureMapped,
    reviveRead,
} = require("../utils/substrate");

const HUB_ADDRESS = process.env.FLOWPAY_RWA_HUB_ADDRESS;
const GUARD_ADDRESS = process.env.FLOWPAY_RWA_COMPLIANCE_GUARD_ADDRESS;
const ISSUER = process.argv[2] || "";

const HUB_ABI = [
    "function owner() external view returns (address)",
    "function operators(address) external view returns (bool)",
];
const GUARD_ABI = [
    "function owner() external view returns (address)",
    "function controller() external view returns (address)",
    "function getIssuerApproval(address) external view returns (bool approved, uint64 updatedAt, address updatedBy, string note)",
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
    console.log("\n=== RWA On-Chain Diagnostic ===\n");
    console.log(`Hub:            ${HUB_ADDRESS}`);
    console.log(`ComplianceGuard: ${GUARD_ADDRESS}`);
    if (ISSUER) console.log(`Issuer to check: ${ISSUER}`);
    console.log("\nConnecting to substrate...");

    const { api, config } = await createSubstrateApi();
    const { pair, evmAddress } = await loadSubstrateSigner();
    await ensureMapped(api, pair, evmAddress);

    console.log(`Substrate signer EVM address: ${evmAddress}\n`);

    // --- Hub checks ---
    const hubOwner = String(await readContract(api, pair, config, HUB_ADDRESS, HUB_ABI, "owner", [])).toLowerCase();
    const signerIsOperator = Boolean(await readContract(api, pair, config, HUB_ADDRESS, HUB_ABI, "operators", [evmAddress]));

    console.log("--- Hub ---");
    console.log(`  owner:              ${hubOwner}`);
    console.log(`  signer is operator: ${signerIsOperator}`);
    console.log(`  signer == owner:    ${hubOwner === evmAddress.toLowerCase()}`);

    // --- ComplianceGuard checks ---
    const guardOwner = String(await readContract(api, pair, config, GUARD_ADDRESS, GUARD_ABI, "owner", [])).toLowerCase();
    const guardController = String(await readContract(api, pair, config, GUARD_ADDRESS, GUARD_ABI, "controller", [])).toLowerCase();

    console.log("\n--- ComplianceGuard ---");
    console.log(`  owner:      ${guardOwner}`);
    console.log(`  controller: ${guardController}`);
    console.log(`  controller == hub: ${guardController === HUB_ADDRESS.toLowerCase()}`);

    if (guardController !== HUB_ADDRESS.toLowerCase()) {
        console.log("\n  ⚠️  PROBLEM: ComplianceGuard controller is NOT set to the Hub!");
        console.log(`     Expected: ${HUB_ADDRESS.toLowerCase()}`);
        console.log(`     Got:      ${guardController}`);
        console.log("     Fix: call complianceGuard.setController(hubAddress) from the owner account");
    }

    // --- Issuer check ---
    if (ISSUER) {
        const approval = await readContract(api, pair, config, GUARD_ADDRESS, GUARD_ABI, "getIssuerApproval", [ISSUER]);
        console.log("\n--- Issuer Approval ---");
        console.log(`  issuer:   ${ISSUER}`);
        console.log(`  approved: ${approval[0]}`);
        console.log(`  updatedBy: ${approval[2]}`);
        console.log(`  note:     ${approval[3]}`);
    }

    console.log("\n=== Done ===\n");
    await api.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error("Diagnostic failed:", err.message);
    process.exit(1);
});
