const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const STELLAR_MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

function normalizeNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function createRuntimeConfig(overrides = {}) {
    const networkName =
        overrides.networkName
        || process.env.STELLAR_NETWORK_NAME
        || process.env.STREAM_ENGINE_NETWORK_NAME
        || "Stellar Testnet";
    const networkPassphrase =
        overrides.networkPassphrase
        || process.env.STELLAR_NETWORK_PASSPHRASE
        || (String(networkName).toLowerCase().includes("public")
            ? STELLAR_MAINNET_PASSPHRASE
            : STELLAR_TESTNET_PASSPHRASE);
    const horizonUrl =
        overrides.horizonUrl
        || process.env.STELLAR_HORIZON_URL
        || "https://horizon-testnet.stellar.org";
    const sorobanRpcUrl =
        overrides.sorobanRpcUrl
        || process.env.STELLAR_SOROBAN_RPC_URL
        || "https://soroban-testnet.stellar.org";
    const paymentTokenAddress =
        overrides.paymentTokenAddress
        || process.env.STELLAR_USDC_SAC_ADDRESS
        || process.env.STREAM_ENGINE_PAYMENT_TOKEN_ADDRESS
        || "stellar:usdc-sac";

    return {
        kind: "stellar",
        chainId: normalizeNumber(
            overrides.chainId ?? process.env.STELLAR_CHAIN_ID ?? process.env.STREAM_ENGINE_CHAIN_ID,
            0
        ),
        rpcUrl: sorobanRpcUrl,
        sorobanRpcUrl,
        horizonUrl,
        networkPassphrase,
        blockExplorerUrl:
            overrides.blockExplorerUrl
            || process.env.STELLAR_BLOCK_EXPLORER_URL
            || process.env.STREAM_ENGINE_BLOCK_EXPLORER_URL
            || "https://stellar.expert/explorer/testnet",
        networkName,
        nativeCurrency: {
            name: "Stellar Lumens",
            symbol: "XLM",
            decimals: 7,
        },
        paymentAssetId: 0,
        paymentTokenAddress,
        paymentTokenSymbol:
            overrides.paymentTokenSymbol
            || process.env.STELLAR_ASSET_CODE
            || process.env.STREAM_ENGINE_PAYMENT_TOKEN_SYMBOL
            || "USDC",
        paymentTokenDecimals: normalizeNumber(
            overrides.paymentTokenDecimals
                ?? process.env.STELLAR_ASSET_DECIMALS
                ?? process.env.STREAM_ENGINE_PAYMENT_TOKEN_DECIMALS,
            7
        ),
        paymentAssetCode:
            overrides.paymentAssetCode
            || process.env.STELLAR_ASSET_CODE
            || "USDC",
        paymentAssetIssuer:
            overrides.paymentAssetIssuer
            || process.env.STELLAR_ASSET_ISSUER
            || "",
        settlement: "soroban-sac",
    };
}

module.exports = {
    STELLAR_TESTNET_PASSPHRASE,
    STELLAR_MAINNET_PASSPHRASE,
    createRuntimeConfig,
    createStellarRuntimeConfig: createRuntimeConfig,
};
