const crypto = require("crypto");

function normalizeCid(input) {
    if (!input) {
        return "";
    }

    if (input.startsWith("ipfs://")) {
        return input.slice("ipfs://".length);
    }

    const gatewayMatch = input.match(/\/ipfs\/([^/?#]+)/i);
    if (gatewayMatch) {
        return gatewayMatch[1];
    }

    return input;
}

class IPFSService {
    constructor(config = {}) {
        this.pinataJwt = config.pinataJwt || process.env.PINATA_JWT || "";
        this.gatewayBase =
            config.gatewayBase ||
            process.env.IPFS_GATEWAY_URL ||
            "https://gateway.pinata.cloud/ipfs";
        this.fetchImpl = config.fetchImpl || global.fetch?.bind(global);
        this.localPins = config.localPins || new Map();
    }

    async pinJSON(metadata) {
        const serialized = JSON.stringify(metadata);

        if (this.pinataJwt && this.fetchImpl) {
            const response = await this.fetchImpl("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.pinataJwt}`,
                    "Content-Type": "application/json",
                },
                body: serialized,
            });

            if (!response.ok) {
                const message = await response.text();
                throw new Error(`Pinata pin failed: ${response.status} ${message}`);
            }

            const data = await response.json();
            const cid = data.IpfsHash;
            const uri = `ipfs://${cid}`;
            this.localPins.set(cid, metadata);
            return { cid, uri, pinned: true };
        }

        const digest = crypto.createHash("sha256").update(serialized).digest("hex");
        const cid = `bafystella${digest.slice(0, 48)}`;
        const uri = `ipfs://${cid}`;
        this.localPins.set(cid, metadata);
        return { cid, uri, pinned: false };
    }

    async fetchJSON(uriOrCid) {
        const cid = normalizeCid(uriOrCid);
        if (!cid) {
            throw new Error("IPFSService: CID is required");
        }

        if (this.localPins.has(cid)) {
            return {
                cid,
                uri: `ipfs://${cid}`,
                metadata: this.localPins.get(cid),
                source: "local-cache",
            };
        }

        if (!this.fetchImpl) {
            throw new Error("IPFSService: fetch is unavailable");
        }

        const response = await this.fetchImpl(`${this.gatewayBase.replace(/\/$/, "")}/${cid}`);
        if (!response.ok) {
            throw new Error(`IPFSService: failed to fetch metadata for ${cid}`);
        }

        const metadata = await response.json();
        this.localPins.set(cid, metadata);
        return {
            cid,
            uri: `ipfs://${cid}`,
            metadata,
            source: "gateway",
        };
    }
}

module.exports = {
    IPFSService,
    normalizeCid,
};
