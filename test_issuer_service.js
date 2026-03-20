const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { RWAChainService } = require("./server/services/rwaChainService");
const { accountIdToEvmAddress } = require("./utils/substrate");

async function main() {
    console.log(`[TEST] Creating RWAChainService...`);
    const chainService = new RWAChainService();
    await chainService.init();

    console.log(`[TEST] Hub Address: ${chainService.hubAddress}`);
    console.log(`[TEST] Compliance Guard: ${chainService.complianceGuardAddress}`);
    
    // Simulate the walletAddress from the frontend
    // If the user's wallet is "5D4tEa37uS2xT7p8qVzUeHhMh8BwJ9K3Zk2X1g4V5J9XvRwK"
    const ss58Wallet = "5D4tEa37uS2xT7p8qVzUeHhMh8BwJ9K3Zk2X1g4V5J9XvRwK"
    const evmAlias = accountIdToEvmAddress(ss58Wallet);
    console.log(`[TEST] Testing for issuer (EVM alias for ${ss58Wallet}): ${evmAlias}`);

    try {
        console.log(`[TEST] Calling ensureIssuerApproved...`);
        const result = await chainService.ensureIssuerApproved(evmAlias, "test from diag script");
        console.log(`[TEST] Result:`, result);
    } catch (err) {
        console.error(`[TEST] Error:`, err);
    }
}

main().catch(console.error);
