const crypto = require("crypto");
const { Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } = require("@stellar/stellar-sdk");
const fileStore = require("./agentWalletFileStore");

const ALGORITHM = "aes-256-gcm";

function encrypt(plaintext, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, "hex"), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(ciphertext, key) {
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, "hex"), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

class AgentWalletService {
    constructor(config = {}) {
        this.encryptionKey = config.encryptionKey || "";
        this.store = config.store || null;
        this.chainService = config.chainService || null;

        // Single-operator fallback (env secret key)
        this._fallbackKeypair = config.agentSecret ? Keypair.fromSecret(config.agentSecret) : null;
    }

    isConfigured() {
        return Boolean((this.encryptionKey || this._fallbackKeypair) && this.chainService);
    }

    /** Get or create the agent keypair for a given owner public key */
    async resolveKeypair(ownerPublicKey) {
        // Single-operator mode
        if (this._fallbackKeypair) return this._fallbackKeypair;

        if (!this.encryptionKey) throw Object.assign(new Error("AGENT_ENCRYPTION_KEY is not configured."), { status: 503 });

        // Try primary store, then file store fallback
        let record = null;
        if (this.store && typeof this.store.getAgentWallet === "function") {
            record = await this.store.getAgentWallet(ownerPublicKey);
        }
        if (!record) record = fileStore.getAgentWallet(ownerPublicKey);
        if (record) return Keypair.fromSecret(decrypt(record.encryptedSecret, this.encryptionKey));
        const kp = Keypair.random();
        const newRecord = {
            ownerPublicKey,
            agentPublicKey: kp.publicKey(),
            encryptedSecret: encrypt(kp.secret(), this.encryptionKey),
        };
        if (this.store && typeof this.store.upsertAgentWallet === "function") {
            await this.store.upsertAgentWallet(newRecord);
        }
        fileStore.upsertAgentWallet(newRecord); // always persist to file as backup
        return kp;
    }

    async getOrCreateWallet(ownerPublicKey) {
        const kp = await this.resolveKeypair(ownerPublicKey);
        return { publicKey: kp.publicKey() };
    }

    async getWallet(ownerPublicKey) {
        if (this._fallbackKeypair) return { publicKey: this._fallbackKeypair.publicKey() };
        // Try primary store first, then always fall back to file store
        let record = null;
        if (this.store && typeof this.store.getAgentWallet === "function") {
            record = await this.store.getAgentWallet(ownerPublicKey);
        }
        if (!record) record = fileStore.getAgentWallet(ownerPublicKey);
        if (!record) return null;
        return { publicKey: record.agentPublicKey };
    }

    async getBalances({ owner }) {
        const kp = await this.resolveKeypair(owner);
        const cs = this.chainService.contractService;
        if (!cs.horizonServer) {
            throw Object.assign(new Error("Horizon not configured."), { status: 503 });
        }

        const account = await cs.horizonServer.loadAccount(kp.publicKey());
        return {
            publicKey: kp.publicKey(),
            balances: (account.balances || []).map((balance) => ({
                type: balance.asset_type === "native" ? "native" : "credit_alphanum",
                assetCode: balance.asset_code || "XLM",
                assetIssuer: balance.asset_issuer || "",
                balance: balance.balance || "0",
                buyingLiabilities: balance.buying_liabilities || "0",
                sellingLiabilities: balance.selling_liabilities || "0",
            })),
            sequence: account.sequence,
        };
    }

    async getBalanceForAsset({ owner, assetCode = "XLM", assetIssuer = "" }) {
        const snapshot = await this.getBalances({ owner });
        const normalizedCode = String(assetCode || "XLM").toUpperCase();
        const match = snapshot.balances.find((balance) => {
            if (normalizedCode === "XLM") {
                return balance.type === "native";
            }
            return (
                String(balance.assetCode || "").toUpperCase() === normalizedCode
                && String(balance.assetIssuer || "") === String(assetIssuer || "")
            );
        });
        return match?.balance || "0";
    }

    async openSession({ owner, recipient, totalAmount, durationSeconds, metadata, assetCode, assetIssuer }) {
        const kp = await this.resolveKeypair(owner);
        const paymentAssetCode = String(
            assetCode || this.chainService.runtime?.paymentAssetCode || "USDC"
        ).toUpperCase();
        const paymentAssetIssuer = paymentAssetCode === "XLM"
            ? ""
            : String(assetIssuer || this.chainService.runtime?.paymentAssetIssuer || "");
        const tokenAddress = paymentAssetCode === "XLM"
            ? this.chainService.nativeTokenAddress
            : this.chainService.runtime?.paymentTokenAddress;

        if (
            this.chainService.sessionMeterAddress
            && this.chainService.contractService?.isConfigured?.()
            && tokenAddress
        ) {
            const startTime = Math.floor(Date.now() / 1000);
            const stopTime = startTime + Math.max(1, Number(durationSeconds || 1));
            const metadataHash = crypto.createHash("sha256").update(String(metadata || "{}")).digest("hex");
            const chainWrite = await this.chainService.contractService.invokeWrite({
                contractId: this.chainService.sessionMeterAddress,
                method: "open_session",
                args: [
                    { type: "address", value: kp.publicKey() },
                    { type: "address", value: recipient },
                    { type: "address", value: tokenAddress },
                    { type: "string", value: paymentAssetCode },
                    { type: "string", value: paymentAssetIssuer },
                    { type: "i128", value: BigInt(String(totalAmount)) },
                    { type: "u64", value: BigInt(startTime) },
                    { type: "u64", value: BigInt(stopTime) },
                    { type: "bytes32", value: `0x${metadataHash}` },
                ],
                sourceAccount: kp.publicKey(),
                signerSecret: kp.secret(),
            });
            const sessionId = Number(chainWrite.result || 0);
            const synced = await this.chainService.syncSessionMetadata({
                sessionId,
                metadata: metadata || "{}",
                txHash: chainWrite.txHash,
                fundingTxHash: chainWrite.txHash,
                sender: kp.publicKey(),
                recipient,
                assetCode: paymentAssetCode,
                assetIssuer: paymentAssetIssuer,
            });
            return {
                streamId: String(sessionId),
                startTime: synced.startTime,
                txHash: chainWrite.txHash,
            };
        }

        return this.chainService.openSession({
            sender: kp.publicKey(),
            recipient,
            duration: Number(durationSeconds),
            totalAmount: BigInt(String(totalAmount)),
            metadata: metadata || "{}",
            assetCode: assetCode || "",
            assetIssuer: assetIssuer || "",
        });
    }

    async claimSession({ owner, sessionId }) {
        const kp = await this.resolveKeypair(owner);
        if (this.chainService.sessionMeterAddress && this.chainService.contractService?.isConfigured?.()) {
            const chainWrite = await this.chainService.contractService.invokeWrite({
                contractId: this.chainService.sessionMeterAddress,
                method: "claim",
                args: [
                    { type: "address", value: kp.publicKey() },
                    { type: "u64", value: BigInt(Number(sessionId)) },
                ],
                sourceAccount: kp.publicKey(),
                signerSecret: kp.secret(),
            });
            const session = await this.chainService.getSessionSnapshot(sessionId);
            return {
                txHash: chainWrite.txHash,
                amount: String(chainWrite.result || session?.claimableInitial || "0"),
            };
        }
        return this.chainService.claimSession({ sessionId: Number(sessionId), claimer: kp.publicKey() });
    }

    async cancelSession({ owner, sessionId }) {
        const kp = await this.resolveKeypair(owner);
        if (this.chainService.sessionMeterAddress && this.chainService.contractService?.isConfigured?.()) {
            const chainWrite = await this.chainService.contractService.invokeWrite({
                contractId: this.chainService.sessionMeterAddress,
                method: "cancel",
                args: [
                    { type: "address", value: kp.publicKey() },
                    { type: "u64", value: BigInt(Number(sessionId)) },
                ],
                sourceAccount: kp.publicKey(),
                signerSecret: kp.secret(),
            });
            const session = await this.chainService.getSessionSnapshot(sessionId);
            return {
                txHash: chainWrite.txHash,
                refundableAmount: String(chainWrite.result?.refundable_amount || session?.refundableAmount || "0"),
                claimableAmount: String(chainWrite.result?.claimable_amount || session?.claimableInitial || "0"),
            };
        }
        return this.chainService.cancelSession({ sessionId: Number(sessionId), cancelledBy: kp.publicKey() });
    }

    async claimYield({ owner, tokenId }) {
        const kp = await this.resolveKeypair(owner);
        if (this.chainService.assetStreamAddress && this.chainService.contractService?.isConfigured?.()) {
            const chainWrite = await this.chainService.contractService.invokeWrite({
                contractId: this.chainService.assetStreamAddress,
                method: "claim",
                args: [
                    { type: "address", value: kp.publicKey() },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                ],
                sourceAccount: kp.publicKey(),
                signerSecret: kp.secret(),
            });
            const refreshed = await this.chainService.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.chainService.store.upsertAsset(refreshed);
            }
            return { txHash: chainWrite.txHash, amount: String(chainWrite.result || "0") };
        }
        return this.chainService.claimYield({ tokenId: Number(tokenId) });
    }

    async flashAdvance({ owner, tokenId, amount }) {
        const kp = await this.resolveKeypair(owner);
        if (this.chainService.assetStreamAddress && this.chainService.contractService?.isConfigured?.()) {
            const chainWrite = await this.chainService.contractService.invokeWrite({
                contractId: this.chainService.assetStreamAddress,
                method: "flash_advance",
                args: [
                    { type: "address", value: kp.publicKey() },
                    { type: "u64", value: BigInt(Number(tokenId)) },
                    { type: "i128", value: BigInt(String(amount)) },
                ],
                sourceAccount: kp.publicKey(),
                signerSecret: kp.secret(),
            });
            const refreshed = await this.chainService.getAssetSnapshot(tokenId);
            if (refreshed) {
                await this.chainService.store.upsertAsset(refreshed);
            }
            return { txHash: chainWrite.txHash, amount: String(chainWrite.result || amount) };
        }
        return this.chainService.flashAdvance({ tokenId: Number(tokenId), amount: BigInt(String(amount)) });
    }

    async transferAsset({ owner, tokenId, to }) {
        const kp = await this.resolveKeypair(owner);
        return this.chainService.contractService.invokeWrite({
            contractId: this.chainService.assetRegistryAddress,
            method: "transfer_asset",
            args: [
                { type: "address", value: kp.publicKey() },
                { type: "u64", value: BigInt(tokenId) },
                { type: "address", value: to },
            ],
            signerSecret: kp.secret(),
        });
    }

    async setupTrustline({ owner, assetCode, assetIssuer }) {
        const kp = await this.resolveKeypair(owner);
        const cs = this.chainService.contractService;
        if (!cs.horizonServer || !cs.networkPassphrase) {
            throw Object.assign(new Error("Horizon not configured."), { status: 503 });
        }
        const account = await cs.horizonServer.loadAccount(kp.publicKey());
        const tx = new TransactionBuilder(account, {
            fee: String(BASE_FEE),
            networkPassphrase: cs.networkPassphrase,
        })
            .addOperation(Operation.changeTrust({ asset: new Asset(assetCode, assetIssuer) }))
            .setTimeout(30)
            .build();
        tx.sign(kp);
        const result = await cs.horizonServer.submitTransaction(tx);
        return { txHash: result.hash };
    }

    async withdraw({ owner, destination, assetCode, assetIssuer, amount }) {
        const kp = await this.resolveKeypair(owner);
        const cs = this.chainService.contractService;
        if (!cs.horizonServer || !cs.networkPassphrase) {
            throw Object.assign(new Error("Horizon not configured."), { status: 503 });
        }
        const account = await cs.horizonServer.loadAccount(kp.publicKey());
        const asset = assetCode === "XLM" ? Asset.native() : new Asset(assetCode, assetIssuer);
        const tx = new TransactionBuilder(account, {
            fee: String(BASE_FEE),
            networkPassphrase: cs.networkPassphrase,
        })
            .addOperation(Operation.payment({ destination, asset, amount: String(amount) }))
            .setTimeout(30)
            .build();
        tx.sign(kp);
        const result = await cs.horizonServer.submitTransaction(tx);
        return { txHash: result.hash };
    }

    async sendAssetPayment({ owner, destination, assetCode, assetIssuer, amount, memoText = "" }) {
        const kp = await this.resolveKeypair(owner);
        const cs = this.chainService.contractService;
        if (!cs.horizonServer || !cs.networkPassphrase) {
            throw Object.assign(new Error("Horizon not configured."), { status: 503 });
        }

        const account = await cs.horizonServer.loadAccount(kp.publicKey());
        const asset = assetCode === "XLM" ? Asset.native() : new Asset(assetCode, assetIssuer);
        const builder = new TransactionBuilder(account, {
            fee: String(BASE_FEE),
            networkPassphrase: cs.networkPassphrase,
        }).addOperation(Operation.payment({
            destination,
            asset,
            amount: String(amount),
        }));

        if (memoText) {
            builder.addMemo(require("@stellar/stellar-sdk").Memo.text(String(memoText).slice(0, 28)));
        }

        const tx = builder
            .setTimeout(30)
            .build();
        tx.sign(kp);
        const result = await cs.horizonServer.submitTransaction(tx);
        return { txHash: result.hash, source: kp.publicKey(), destination, amount: String(amount) };
    }
}

module.exports = { AgentWalletService };
