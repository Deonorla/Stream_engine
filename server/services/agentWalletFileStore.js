/**
 * Minimal file-based persistence for agent wallets.
 * Used as fallback when Postgres is unavailable.
 * Stores encrypted secrets only — safe to keep on disk.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(process.env.AGENT_WALLET_FILE || path.join(__dirname, "../../.agent-wallets.json"));

function load() {
    try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}

function save(data) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

module.exports = {
    getAgentWallet(ownerPublicKey) {
        const data = load();
        return data[ownerPublicKey.toUpperCase()] || null;
    },
    upsertAgentWallet(record) {
        const data = load();
        const key = record.ownerPublicKey.toUpperCase();
        if (!data[key]) { // never overwrite existing
            data[key] = record;
            save(data);
        }
    },
};
