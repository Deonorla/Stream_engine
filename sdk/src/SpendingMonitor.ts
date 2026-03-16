import { PaymentTokenConfig, formatPaymentAmount, resolvePaymentTokenConfig } from './tokenConfig';

export interface SpendingLimits {
    dailyLimit: bigint;
    totalLimit: bigint;
}

export class SpendingMonitor {
    private dailyLimit: bigint;
    private totalLimit: bigint;
    private tokenSymbol: string;
    private tokenDecimals: number;

    private dailySpent: bigint = 0n;
    private totalSpent: bigint = 0n;
    private lastResetTime: number = Date.now();

    // Safety: Track renewals for suspicious activity
    private renewalTimestamps: number[] = [];
    private MAX_RENEWALS_PER_MINUTE = 5;

    constructor(limits: SpendingLimits, tokenConfig: PaymentTokenConfig = {}) {
        this.dailyLimit = limits.dailyLimit;
        this.totalLimit = limits.totalLimit;
        const resolvedToken = resolvePaymentTokenConfig(tokenConfig);
        this.tokenSymbol = resolvedToken.symbol;
        this.tokenDecimals = resolvedToken.decimals;
    }

    /**
     * Checks/updates limits before a spend. Throws if exceeded.
     */
    public checkAndRecordSpend(amount: bigint) {
        this.resetDailyIfNeeded();

        if (this.dailySpent + amount > this.dailyLimit) {
            throw new Error(
                `Daily spending limit exceeded. Spent: ${formatPaymentAmount(this.dailySpent, this.tokenDecimals)} / Limit: ${formatPaymentAmount(this.dailyLimit, this.tokenDecimals)} ${this.tokenSymbol}`
            );
        }

        if (this.totalSpent + amount > this.totalLimit) {
            throw new Error(
                `Total spending limit exceeded. Spent: ${formatPaymentAmount(this.totalSpent, this.tokenDecimals)} / Limit: ${formatPaymentAmount(this.totalLimit, this.tokenDecimals)} ${this.tokenSymbol}`
            );
        }

        this.dailySpent += amount;
        this.totalSpent += amount;
    }

    /**
     * Checks for suspicious renewal activity (frequency)
     */
    public checkSuspiciousActivity(): boolean {
        const now = Date.now();
        // Clean up old timestamps (> 60s ago)
        this.renewalTimestamps = this.renewalTimestamps.filter(t => now - t < 60000);

        // Record this new event
        this.renewalTimestamps.push(now);

        if (this.renewalTimestamps.length > this.MAX_RENEWALS_PER_MINUTE) {
            return true; // Suspicious!
        }
        return false;
    }

    private resetDailyIfNeeded() {
        const now = Date.now();
        // Reset if 24 hours (86400000 ms) have passed
        if (now - this.lastResetTime > 86400000) {
            this.dailySpent = 0n;
            this.lastResetTime = now;
            console.log("[SpendingMonitor] Daily limit reset.");
        }
    }

    public getStatus() {
        return {
            dailySpent: this.dailySpent,
            totalSpent: this.totalSpent,
            dailyLimit: this.dailyLimit,
            totalLimit: this.totalLimit
        };
    }
}
