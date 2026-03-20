#!/usr/bin/env node
/**
 * Simulate the exact server mint flow:
 * 1. ensureIssuerApproved
 * 2. mintAsset
 *
 * Usage: node scripts/test-full-mint-flow.js <issuerAddress>
 */

require("dotenv").config({ path: "./.env" });

const { RWAChainService } = require("../server/services/rwaChainService");
const { ethers } = require("ethers");

const ISSUER = process.argv[2];
if (!ISSUER) {
    console.error("Usage: node scripts/test-full-mint-flow.js <issuerAddress>");
    process.exit(1);
}

async function main() {
    console.log(`\nSimulating full server mint flow for issuer: ${ISSUER}\n`);

    const svc = new RWAChainService();

    console.log("Step 1: ensureIssuerApproved...");
    try {
        const approvalResult = await svc.ensureIssuerApproved(ISSUER, "Full flow test");
        console.log(`  Result: approved=${approvalResult.approved} alreadyApproved=${approvalResult.alreadyApproved} txHash=${approvalResult.txHash || "n/a"}`);
    } catch (err) {
        console.error(`  FAILED: ${err.message}`);
        process.exit(1);
    }

    console.log("\nStep 2: mintAsset...");
    const publicMetadataURI = "ipfs://QmFullFlowTest" + Date.now();
    const publicMetadataHash = ethers.keccak256(ethers.toUtf8Bytes("full-flow-metadata-" + Date.now()));
    const evidenceRoot = ethers.keccak256(ethers.toUtf8Bytes("full-flow-evidence-" + Date.now()));
    const evidenceManifestHash = ethers.keccak256(ethers.toUtf8Bytes("full-flow-manifest-" + Date.now()));
    const propertyRefHash = ethers.keccak256(ethers.toUtf8Bytes("FULL-FLOW-PROP-" + Date.now()));
    const cidHash = ethers.keccak256(ethers.toUtf8Bytes(publicMetadataURI));
    const tagHash = ethers.keccak256(ethers.toUtf8Bytes(`${ISSUER}:FULL-FLOW:${publicMetadataURI}`));

    try {
        const mintResult = await svc.mintAsset({
            publicMetadataURI,
            assetType: 1,
            rightsModel: 1,
            publicMetadataHash,
            evidenceRoot,
            evidenceManifestHash,
            propertyRefHash,
            jurisdiction: "US",
            cidHash,
            tagHash,
            issuer: ISSUER,
            statusReason: "Full flow test",
        });
        console.log(`  SUCCEEDED: tokenId=${mintResult.tokenId} txHash=${mintResult.txHash}`);
    } catch (err) {
        console.error(`  FAILED: ${err.message}`);
    }

    console.log("\n=== Done ===\n");
    process.exit(0);
}

main().catch((err) => {
    console.error("Script failed:", err.message);
    process.exit(1);
});
