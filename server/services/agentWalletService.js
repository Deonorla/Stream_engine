const crypto = require("crypto");
const { Keypair } = require("@stellar/stellar-sdk");

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
        if (!this.store) throw Object.assign(new Error("Store not available."), { status: 503 });

        const record = await this.store.getAgentWallet(ownerPublicKey);
        if (record) return Keypair.fromSecret(decrypt(record.encryptedSecret, this.encryptionKey));

        // Auto-create
        const kp = Keypair.random();
        await this.store.upsertAgentWallet({
            ownerPublicKey,
            agentPublicKey: kp.publicKey(),
            encryptedSecret: encrypt(kp.secret(), this.encryptionKey),
        });
        return kp;
    }

    async getOrCreateWallet(ownerPublicKey) {
        const kp = await this.resolveKeypair(ownerPublicKey);
        return { publicKey: kp.publicKey() };
    }

    async openSession({ owner, recipient, totalAmount, durationSeconds, metadata, assetCode, assetIssuer }) {
        const kp = await this.resolveKeypair(owner);
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
        return this.chainService.claimSession({ sessionId: Number(sessionId), claimer: kp.publicKey() });
    }

    async cancelSession({ owner, sessionId }) {
        const kp = await this.resolveKeypair(owner);
        return this.chainService.cancelSession({ sessionId: Number(sessionId), cancelledBy: kp.publicKey() });
    }

    async claimYield({ owner, tokenId }) {
        await this.resolveKeypair(owner); // auth check
        return this.chainService.claimYield({ tokenId: Number(tokenId) });
    }

    async flashAdvance({ owner, tokenId, amount }) {
        await this.resolveKeypair(owner);
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
}

module.exports = { AgentWalletService };
