const DEFAULT_CHAIN_ID = 420420421;
const DEFAULT_RPC_URL = "https://westend-asset-hub-eth-rpc.polkadot.io";
const DEFAULT_BLOCK_EXPLORER_URL = "https://westmint.subscan.io";
const DEFAULT_NETWORK_NAME = "Westend Asset Hub";
const DEFAULT_NATIVE_CURRENCY_NAME = "Westend";
const DEFAULT_NATIVE_CURRENCY_SYMBOL = "WND";
const DEFAULT_NATIVE_CURRENCY_DECIMALS = 18;
const WESTEND_CHAIN_ID = 420420421;
const WESTEND_RPC_URL = "https://westend-asset-hub-eth-rpc.polkadot.io";
const WESTEND_BLOCK_EXPLORER_URL = "https://westmint.subscan.io";
const WESTEND_NETWORK_NAME = "Westend Asset Hub";
const WESTEND_NATIVE_CURRENCY_NAME = "Westend";
const WESTEND_NATIVE_CURRENCY_SYMBOL = "WND";
const WESTEND_NATIVE_CURRENCY_DECIMALS = 18;
const DEFAULT_PAYMENT_ASSET_ID = 31337;
const DEFAULT_PAYMENT_TOKEN_SYMBOL = "USDC";
const DEFAULT_PAYMENT_TOKEN_DECIMALS = 6;
const DEFAULT_ASSET_PRECOMPILE_SUFFIX = "01200000";

function normalizeNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function resolvePaymentAssetId(value) {
    return normalizeNumber(value, DEFAULT_PAYMENT_ASSET_ID);
}

function toPolkadotAssetPrecompileAddress(assetId, suffix = DEFAULT_ASSET_PRECOMPILE_SUFFIX) {
    const normalizedAssetId = resolvePaymentAssetId(assetId);
    const assetHex = BigInt(normalizedAssetId).toString(16).padStart(8, "0");
    return `0x${assetHex}${"0".repeat(24)}${suffix}`.toLowerCase();
}

function resolvePaymentTokenAddress(explicitAddress, assetId) {
    if (explicitAddress) {
        return explicitAddress;
    }
    return toPolkadotAssetPrecompileAddress(assetId);
}

function createFlowPayRuntimeConfig(overrides = {}) {
    const paymentAssetId = resolvePaymentAssetId(
        overrides.paymentAssetId
            ?? process.env.FLOWPAY_PAYMENT_ASSET_ID
            ?? process.env.VITE_FLOWPAY_PAYMENT_ASSET_ID
            ?? process.env.POLKADOT_USDC_ASSET_ID
    );

    const paymentTokenAddress = resolvePaymentTokenAddress(
        overrides.paymentTokenAddress
            ?? process.env.FLOWPAY_PAYMENT_TOKEN_ADDRESS
            ?? process.env.VITE_FLOWPAY_PAYMENT_TOKEN_ADDRESS,
        paymentAssetId
    );

    return {
        chainId: normalizeNumber(
            overrides.chainId ?? process.env.POLKADOT_CHAIN_ID ?? process.env.FLOWPAY_CHAIN_ID,
            DEFAULT_CHAIN_ID
        ),
        rpcUrl: overrides.rpcUrl ?? process.env.POLKADOT_RPC_URL ?? process.env.FLOWPAY_RPC_URL ?? DEFAULT_RPC_URL,
        blockExplorerUrl:
            overrides.blockExplorerUrl
            ?? process.env.POLKADOT_BLOCK_EXPLORER_URL
            ?? process.env.FLOWPAY_BLOCK_EXPLORER_URL
            ?? DEFAULT_BLOCK_EXPLORER_URL,
        networkName:
            overrides.networkName
            ?? process.env.POLKADOT_NETWORK_NAME
            ?? process.env.FLOWPAY_NETWORK_NAME
            ?? DEFAULT_NETWORK_NAME,
        nativeCurrency: {
            name:
                overrides.nativeCurrencyName
                ?? process.env.POLKADOT_NATIVE_CURRENCY_NAME
                ?? process.env.FLOWPAY_NATIVE_CURRENCY_NAME
                ?? DEFAULT_NATIVE_CURRENCY_NAME,
            symbol:
                overrides.nativeCurrencySymbol
                ?? process.env.POLKADOT_NATIVE_CURRENCY_SYMBOL
                ?? process.env.FLOWPAY_NATIVE_CURRENCY_SYMBOL
                ?? DEFAULT_NATIVE_CURRENCY_SYMBOL,
            decimals: normalizeNumber(
                overrides.nativeCurrencyDecimals
                    ?? process.env.POLKADOT_NATIVE_CURRENCY_DECIMALS
                    ?? process.env.FLOWPAY_NATIVE_CURRENCY_DECIMALS,
                DEFAULT_NATIVE_CURRENCY_DECIMALS
            ),
        },
        paymentAssetId,
        paymentTokenAddress,
        paymentTokenSymbol:
            overrides.paymentTokenSymbol
            ?? process.env.FLOWPAY_PAYMENT_TOKEN_SYMBOL
            ?? process.env.VITE_FLOWPAY_PAYMENT_TOKEN_SYMBOL
            ?? DEFAULT_PAYMENT_TOKEN_SYMBOL,
        paymentTokenDecimals: normalizeNumber(
            overrides.paymentTokenDecimals
                ?? process.env.FLOWPAY_PAYMENT_TOKEN_DECIMALS
                ?? process.env.VITE_FLOWPAY_PAYMENT_TOKEN_DECIMALS,
            DEFAULT_PAYMENT_TOKEN_DECIMALS
        ),
    };
}

function createWestendRuntimeConfig(overrides = {}) {
    const paymentAssetId = resolvePaymentAssetId(
        overrides.paymentAssetId
            ?? process.env.WESTMINT_PAYMENT_ASSET_ID
            ?? process.env.FLOWPAY_PAYMENT_ASSET_ID
            ?? DEFAULT_PAYMENT_ASSET_ID
    );

    const paymentTokenAddress = resolvePaymentTokenAddress(
        overrides.paymentTokenAddress
            ?? process.env.WESTMINT_PAYMENT_TOKEN_ADDRESS
            ?? process.env.FLOWPAY_PAYMENT_TOKEN_ADDRESS,
        paymentAssetId
    );

    return {
        chainId: normalizeNumber(
            overrides.chainId ?? process.env.WESTMINT_CHAIN_ID,
            WESTEND_CHAIN_ID
        ),
        rpcUrl: overrides.rpcUrl ?? process.env.WESTMINT_RPC_URL ?? WESTEND_RPC_URL,
        blockExplorerUrl:
            overrides.blockExplorerUrl
            ?? process.env.WESTMINT_BLOCK_EXPLORER_URL
            ?? WESTEND_BLOCK_EXPLORER_URL,
        networkName:
            overrides.networkName
            ?? process.env.WESTMINT_NETWORK_NAME
            ?? WESTEND_NETWORK_NAME,
        nativeCurrency: {
            name:
                overrides.nativeCurrencyName
                ?? process.env.WESTMINT_NATIVE_CURRENCY_NAME
                ?? WESTEND_NATIVE_CURRENCY_NAME,
            symbol:
                overrides.nativeCurrencySymbol
                ?? process.env.WESTMINT_NATIVE_CURRENCY_SYMBOL
                ?? WESTEND_NATIVE_CURRENCY_SYMBOL,
            decimals: normalizeNumber(
                overrides.nativeCurrencyDecimals
                    ?? process.env.WESTMINT_NATIVE_CURRENCY_DECIMALS,
                WESTEND_NATIVE_CURRENCY_DECIMALS
            ),
        },
        paymentAssetId,
        paymentTokenAddress,
        paymentTokenSymbol:
            overrides.paymentTokenSymbol
            ?? process.env.WESTMINT_PAYMENT_TOKEN_SYMBOL
            ?? process.env.FLOWPAY_PAYMENT_TOKEN_SYMBOL
            ?? DEFAULT_PAYMENT_TOKEN_SYMBOL,
        paymentTokenDecimals: normalizeNumber(
            overrides.paymentTokenDecimals
                ?? process.env.WESTMINT_PAYMENT_TOKEN_DECIMALS
                ?? process.env.FLOWPAY_PAYMENT_TOKEN_DECIMALS,
            DEFAULT_PAYMENT_TOKEN_DECIMALS
        ),
    };
}

function createWestmintRuntimeConfig(overrides = {}) {
    return createWestendRuntimeConfig(overrides);
}

module.exports = {
    DEFAULT_CHAIN_ID,
    DEFAULT_RPC_URL,
    DEFAULT_BLOCK_EXPLORER_URL,
    DEFAULT_NETWORK_NAME,
    WESTEND_CHAIN_ID,
    WESTEND_RPC_URL,
    WESTEND_BLOCK_EXPLORER_URL,
    WESTEND_NETWORK_NAME,
    WESTMINT_CHAIN_ID: WESTEND_CHAIN_ID,
    WESTMINT_RPC_URL: WESTEND_RPC_URL,
    WESTMINT_BLOCK_EXPLORER_URL: WESTEND_BLOCK_EXPLORER_URL,
    WESTMINT_NETWORK_NAME: WESTEND_NETWORK_NAME,
    DEFAULT_PAYMENT_ASSET_ID,
    DEFAULT_PAYMENT_TOKEN_SYMBOL,
    DEFAULT_PAYMENT_TOKEN_DECIMALS,
    DEFAULT_ASSET_PRECOMPILE_SUFFIX,
    resolvePaymentAssetId,
    toPolkadotAssetPrecompileAddress,
    resolvePaymentTokenAddress,
    createFlowPayRuntimeConfig,
    createWestendRuntimeConfig,
    createWestmintRuntimeConfig,
};
