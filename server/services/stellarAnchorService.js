const crypto = require("crypto");
const {
    Asset,
    BASE_FEE,
    Horizon,
    Keypair,
    Memo,
    Networks,
    Operation,
    TransactionBuilder,
} = require("@stellar/stellar-sdk");

function stableHash(payload) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(payload || {}))
        .digest("hex");
}

function normalizeStellarAmount(value, decimals = 7) {
    const [wholePartRaw, fractionalRaw = ""] = String(value ?? "0").trim().split(".");
    const wholePart = wholePartRaw || "0";
    const fractional = fractionalRaw.padEnd(decimals, "0").slice(0, decimals);
    const normalized = `${wholePart}${fractional}`.replace(/^(-?)0+(?=\d)/, "$1");
    return BigInt(normalized || "0");
}

function formatStellarAmount(value, decimals = 7) {
    const amount = BigInt(String(value ?? "0"));
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const scale = 10n ** BigInt(decimals);
    const whole = absolute / scale;
    const fractional = (absolute % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
    const rendered = fractional ? `${whole}.${fractional}` : `${whole}`;
    return negative ? `-${rendered}` : rendered;
}

function resolveAsset(assetCode = "XLM", assetIssuer = "") {
    if (!assetCode || String(assetCode).toUpperCase() === "XLM" || !assetIssuer) {
        return Asset.native();
    }
    return new Asset(String(assetCode).toUpperCase(), assetIssuer);
}

class StellarAnchorService {
    constructor(config = {}) {
        this.horizonUrl = config.horizonUrl || "";
        this.networkPassphrase = config.networkPassphrase || Networks.TESTNET;
        this.operatorSecret = config.operatorSecret || "";
        this.operatorPublicKey = config.operatorPublicKey || "";
        this.anchorMode = String(config.anchorMode || process.env.STELLAR_ANCHOR_MODE || "simulated").toLowerCase();
        this.server = this.horizonUrl ? new Horizon.Server(this.horizonUrl) : null;
    }

    isConfigured() {
        return Boolean(this.horizonUrl && (this.operatorSecret || this.operatorPublicKey));
    }

    async verifyPayment({
        txHash,
        source,
        destination,
        amount,
        assetCode = "XLM",
        assetIssuer = "",
    }) {
        if (!this.server) {
            throw new Error("Stellar Horizon is not configured for payment verification.");
        }

        const operations = await this.server.operations().forTransaction(txHash).call();
        const targetAmount = normalizeStellarAmount(amount);
        const normalizedSource = String(source || "").toLowerCase();
        const normalizedDestination = String(destination || "").toLowerCase();
        const normalizedAssetCode = String(assetCode || "XLM").toUpperCase();

        const matchingOperation = (operations.records || []).find((operation) => {
            if (operation.type !== "payment") {
                return false;
            }

            const sourceMatches = String(operation.from || "").toLowerCase() === normalizedSource;
            const destinationMatches = String(operation.to || "").toLowerCase() === normalizedDestination;
            if (!sourceMatches || !destinationMatches) {
                return false;
            }

            const amountMatches = normalizeStellarAmount(operation.amount || "0") === targetAmount;
            if (!amountMatches) {
                return false;
            }

            if (normalizedAssetCode === "XLM") {
                return operation.asset_type === "native";
            }

            return (
                String(operation.asset_code || "").toUpperCase() === normalizedAssetCode
                && String(operation.asset_issuer || "") === String(assetIssuer || "")
            );
        });

        if (!matchingOperation) {
            throw new Error(
                `Transaction ${txHash} does not contain the expected ${normalizedAssetCode} payment from ${source} to ${destination}.`
            );
        }

        return {
            txHash,
            amount: matchingOperation.amount,
            assetCode: normalizedAssetCode,
            assetIssuer: normalizedAssetCode === "XLM" ? "" : String(assetIssuer || ""),
            operationId: matchingOperation.id,
        };
    }

    async submitPayment({
        destination,
        amount,
        assetCode = "XLM",
        assetIssuer = "",
        memoText = "",
    }) {
        if (!this.operatorSecret || !this.server) {
            throw new Error("Stellar operator credentials are required to submit payout transactions.");
        }

        const keypair = Keypair.fromSecret(this.operatorSecret);
        const account = await this.server.loadAccount(keypair.publicKey());
        const txBuilder = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        }).addOperation(
            Operation.payment({
                destination,
                asset: resolveAsset(assetCode, assetIssuer),
                amount: String(amount),
            })
        );

        if (memoText) {
            txBuilder.addMemo(Memo.text(String(memoText).slice(0, 28)));
        }

        const tx = txBuilder
            .setTimeout(30)
            .build();

        tx.sign(keypair);
        const result = await this.server.submitTransaction(tx);
        return {
            txHash: result.hash,
            simulated: false,
        };
    }

    async submitAnchor(action, payload = {}) {
        const hash = stableHash({ action, payload });
        if (this.anchorMode !== "manage_data" || !this.operatorSecret || !this.server) {
            return {
                txHash: `sim_${hash.slice(0, 40)}`,
                simulated: true,
                anchorHash: hash,
            };
        }

        const keypair = Keypair.fromSecret(this.operatorSecret);
        const account = await this.server.loadAccount(keypair.publicKey());
        const dataKey = `se:${String(action || "evt").slice(0, 12)}:${Date.now()}`;
        const dataValue = Buffer.from(hash, "hex");

        const tx = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(
                Operation.manageData({
                    name: dataKey,
                    value: dataValue,
                })
            )
            .setTimeout(30)
            .build();

        tx.sign(keypair);
        const result = await this.server.submitTransaction(tx);
        return {
            txHash: result.hash,
            simulated: false,
            anchorHash: hash,
        };
    }
}

module.exports = {
    StellarAnchorService,
    formatStellarAmount,
    normalizeStellarAmount,
};
