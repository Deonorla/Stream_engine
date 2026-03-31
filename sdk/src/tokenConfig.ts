import { ethers } from "ethers";

export interface PaymentTokenConfig {
    symbol?: string;
    decimals?: number;
}

export function resolvePaymentTokenConfig(config: PaymentTokenConfig = {}) {
    return {
        symbol: config.symbol || process.env.STREAM_ENGINE_PAYMENT_TOKEN_SYMBOL || "USDC",
        decimals: Number.isFinite(Number(config.decimals))
            ? Number(config.decimals)
            : Number(process.env.STREAM_ENGINE_PAYMENT_TOKEN_DECIMALS || 6),
    };
}

export function parsePaymentAmount(value: string | number, decimals = 6) {
    return ethers.parseUnits(String(value), decimals);
}

export function formatPaymentAmount(value: bigint, decimals = 6) {
    return ethers.formatUnits(value, decimals);
}
