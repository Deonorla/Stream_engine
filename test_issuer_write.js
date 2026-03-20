const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { RWAChainService } = require("./server/services/rwaChainService");

async function main() {
    console.log(`[TEST] Creating RWAChainService...`);
    const chainService = new RWAChainService();
    await chainService.init();

    // Use a random test issuer
    const evmAlias = "0x0000000000000000000000000000000000000002";
    console.log(`[TEST] Executing Substrate Write for: ${evmAlias}`);

    try {
        const result = await chainService.ensureIssuerApproved(evmAlias, "test real execution");
        console.log(`[TEST] Result:`, result);
    } catch (err) {
        console.error(`[TEST] Error:`, err);
    }
    
    process.exit(0);
}

main().catch(console.error);
