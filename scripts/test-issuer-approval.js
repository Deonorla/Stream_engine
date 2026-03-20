#!/usr/bin/env node
/**
 * Test setIssuerApproval directly via substrate to isolate the ContractReverted.
 * Usage: node scripts/test-issuer-approval.js <issuerAddress>
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
const ISSUER = process.argv[2];

if (!ISSUER) {
    console.error("Usage: node scripts/test-issuer-approval.js <issuerAddress>");
    process.exit(1);
}

const HUB_ABI = [
    "function setIssuerApproval(address issuer, bool approved, string note) external",
    "function owner() external view returns (address)",
    "function operators(address) external view returns (bool)",
];
const GUARD_ABI = [
    "function getIssuerApproval(address) external view returns (bool approved, uint64 updatedAt, address updatedBy, string note)",
    "function isIssuerApproved(address) external view returns (bool)",
    "function controller() external view returns (address)",
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
    console.log(`\nTesting setIssuerApproval for issuer: ${ISSUER}\n`);

    const { api, config } = await createSubstrateApi();
    const { pair, evmAddress } = await loadSubstrateSigner();
    await ensureMapped(api, pair, evmAddress);

    console.log(`Signer EVM: ${evmAddress}`);

    // Pre-checks
    const guardController = String(await readContract(api, pair, config, GUARD_ADDRESS, GUARD_ABI, "controller", [])).toLowerCase();
    const isApproved = await readContract(api, pair, config, GUARD_ADDRESS, GUARD_ABI, "isIssuerApproved", [ISSUER]);
    console.log(`Guard controller: ${guardController}`);
    console.log(`Hub address:      ${HUB_ADDRESS.toLowerCase()}`);
    console.log(`Controller == Hub: ${guardController === HUB_ADDRESS.toLowerCase()}`);
    console.log(`Issuer currently approved: ${isApproved}`);

    if (isApproved) {
        console.log("\nIssuer is already approved — skipping setIssuerApproval call.");
        console.log("The ContractReverted must be coming from mintAsset itself.\n");
        console.log("Possible causes:");
        console.log("  1. publicMetadataHash is bytes32(0)");
        console.log("  2. evidenceRoot is bytes32(0)");
        console.log("  3. publicMetadataURI is empty");
        console.log("  4. issuer address is zero");
        await api.disconnect();
        return;
    }

    console.log("\nCalling hub.setIssuerApproval via substrate...");
    const iface = new ethers.Interface(HUB_ABI);
    const data = iface.encodeFunctionData("setIssuerApproval", [ISSUER, true, "test approval"]);

    try {
        const result = await reviveCall(api, pair, {
            dest: HUB_ADDRESS,
            data,
            weightLimit: config.weightLimit,
            storageDepositLimit: config.storageDepositLimit,
        });
        console.log(`\nsetIssuerApproval succeeded! txHash=${result.txHash}`);

        // Verify
        const nowApproved = await readContract(api, pair, config, GUARD_ADDRESS, GUARD_ABI, "isIssuerApproved", [ISSUER]);
        console.log(`Issuer now approved: ${nowApproved}`);
    } catch (err) {
        console.error(`\nsetIssuerApproval FAILED: ${err.message}`);
    }

    await api.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error("Script failed:", err.message);
    process.exit(1);
});
