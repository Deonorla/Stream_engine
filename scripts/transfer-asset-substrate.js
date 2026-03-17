require("dotenv").config();

const { ethers } = require("ethers");
const { encodeAddress } = require("@polkadot/util-crypto");
const { createWestmintRuntimeConfig } = require("../utils/polkadot");
const {
    createSubstrateApi,
    loadSubstrateSigner,
    signAndSend,
    resolveAccountIdHex,
} = require("../utils/substrate");

function usage() {
    console.log(
        [
            "Usage:",
            "  node scripts/transfer-asset-substrate.js --to <address> --amount <amount>",
            "",
            "Supported recipient formats:",
            "  - 0x... EVM address",
            "  - 0x... 32-byte AccountId",
            "  - SS58 address",
            "",
            "Optional flags:",
            "  --asset-id <id>     Defaults to Westend USDC asset id 31337",
            "  --ws <url>          Override substrate websocket endpoint",
            "",
            "Examples:",
            "  node scripts/transfer-asset-substrate.js --to 0x1234...abcd --amount 5",
            "  node scripts/transfer-asset-substrate.js --to 5F...abc --amount 0.25 --asset-id 31337",
        ].join("\n")
    );
}

function readArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1) {
        return "";
    }
    return process.argv[index + 1] || "";
}

function normalizeRecipient(recipient) {
    if (!recipient) {
        throw new Error("Missing recipient address");
    }

    if (recipient.startsWith("0x") && recipient.length === 42) {
        const accountIdHex = `0x${recipient.slice(2)}${"ee".repeat(12)}`.toLowerCase();
        return {
            original: recipient,
            evmAddress: recipient.toLowerCase(),
            accountIdHex,
            ss58: encodeAddress(accountIdHex),
        };
    }

    const accountIdHex = resolveAccountIdHex(recipient);
    return {
        original: recipient,
        evmAddress: accountIdHex.endsWith("ee".repeat(12))
            ? `0x${accountIdHex.slice(2, 42)}`
            : null,
        accountIdHex,
        ss58: encodeAddress(accountIdHex),
    };
}

async function getAssetBalance(api, assetId, account) {
    const assetAccount = await api.query.assets.account(assetId, account);
    if (assetAccount.isNone) {
        return 0n;
    }

    return BigInt(assetAccount.unwrap().balance.toString());
}

async function main() {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
        usage();
        return;
    }

    const runtime = createWestmintRuntimeConfig();
    const to = readArg("--to");
    const amount = readArg("--amount");
    const assetId = Number(readArg("--asset-id") || runtime.paymentAssetId);
    const wsUrl = readArg("--ws") || process.env.WESTMINT_WS_URL || process.env.SUBSTRATE_RPC_URL || process.env.POLKADOT_SUBSTRATE_RPC_URL;

    if (!to || !amount) {
        usage();
        throw new Error("--to and --amount are required");
    }

    const recipient = normalizeRecipient(to);
    const transferAmount = ethers.parseUnits(String(amount), runtime.paymentTokenDecimals);

    const { api } = await createSubstrateApi(wsUrl ? { rpcUrl: wsUrl } : {});
    const { pair } = await loadSubstrateSigner();

    try {
        const [senderBefore, recipientBefore] = await Promise.all([
            getAssetBalance(api, assetId, pair.address),
            getAssetBalance(api, assetId, recipient.accountIdHex),
        ]);

        if (senderBefore < transferAmount) {
            throw new Error(
                `Insufficient balance. Sender has ${ethers.formatUnits(senderBefore, runtime.paymentTokenDecimals)} ${runtime.paymentTokenSymbol}`
            );
        }

        const tx = api.tx.assets.transferKeepAlive(assetId, recipient.accountIdHex, transferAmount.toString());
        const result = await signAndSend(api, pair, tx);

        const [senderAfter, recipientAfter] = await Promise.all([
            getAssetBalance(api, assetId, pair.address),
            getAssetBalance(api, assetId, recipient.accountIdHex),
        ]);

        console.log(JSON.stringify({
            network: runtime.networkName,
            assetId,
            tokenSymbol: runtime.paymentTokenSymbol,
            decimals: runtime.paymentTokenDecimals,
            sender: pair.address,
            recipient: {
                input: recipient.original,
                evmAddress: recipient.evmAddress,
                accountIdHex: recipient.accountIdHex,
                ss58: recipient.ss58,
            },
            amount,
            txHash: result.txHash,
            blockHash: result.blockHash,
            senderBalanceBefore: ethers.formatUnits(senderBefore, runtime.paymentTokenDecimals),
            senderBalanceAfter: ethers.formatUnits(senderAfter, runtime.paymentTokenDecimals),
            recipientBalanceBefore: ethers.formatUnits(recipientBefore, runtime.paymentTokenDecimals),
            recipientBalanceAfter: ethers.formatUnits(recipientAfter, runtime.paymentTokenDecimals),
        }, null, 2));
    } finally {
        await api.disconnect();
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
