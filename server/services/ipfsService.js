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
        this.gatewayFallbacks = (
            config.gatewayFallbacks
            || process.env.IPFS_GATEWAY_FALLBACKS
            || "https://ipfs.io/ipfs,https://cloudflare-ipfs.com/ipfs"
        )
            .split(",")
            .map((value) => String(value || "").trim())
            .filter(Boolean);
        this.fetchImpl = config.fetchImpl || global.fetch?.bind(global);
        this.localPins = config.localPins || new Map();
    }

    async fetchFromGateway(base, cid, timeoutMs) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        let timeoutHandle = null;
        if (controller) {
            timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        }
        try {
            const response = await this.fetchImpl(
                `${String(base || "").replace(/\/$/, "")}/${cid}`,
                controller ? { signal: controller.signal } : undefined
            );
            if (!response.ok) {
                throw new Error(`IPFSService: failed to fetch metadata for ${cid}`);
            }

            const raw = await response.json();
            const metadata = raw && typeof raw === "object" && raw.metadata && typeof raw.metadata === "object"
                ? raw.metadata
                : raw;

            return {
                cid,
                uri: `ipfs://${cid}`,
                metadata,
                source: "gateway",
            };
        } catch (error) {
            if (error?.name === "AbortError") {
                throw new Error(`IPFSService: metadata fetch timed out for ${cid}`);
            }
            throw error;
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        }
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

    async pinFile(buffer, filename, mimeType) {
        if (this.pinataJwt && this.fetchImpl) {
            const form = new FormData();
            const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
            form.append("file", blob, filename || "file");

            const response = await this.fetchImpl("https://api.pinata.cloud/pinning/pinFileToIPFS", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.pinataJwt}`,
                },
                body: form,
            });

            if (!response.ok) {
                const message = await response.text();
                throw new Error(`Pinata pinFile failed: ${response.status} ${message}`);
            }

            const data = await response.json();
            const cid = data.IpfsHash;
            const uri = `ipfs://${cid}`;
            this.localPins.set(cid, { filename, mimeType });
            return { cid, uri, pinned: true };
        }

        const digest = crypto.createHash("sha256").update(buffer).digest("hex");
        const cid = `bafyfile${digest.slice(0, 48)}`;
        const uri = `ipfs://${cid}`;
        this.localPins.set(cid, { filename, mimeType });
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

        const timeoutMs = Math.max(250, Number(process.env.IPFS_FETCH_TIMEOUT_MS || 4000));
        const candidateGateways = [
            this.gatewayBase,
            ...this.gatewayFallbacks,
        ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .filter((value, index, self) => self.indexOf(value) === index);

        try {
            const result = await Promise.any(
                candidateGateways.map((gateway) => this.fetchFromGateway(gateway, cid, timeoutMs))
            );
            this.localPins.set(cid, result.metadata);
            return result;
        } catch (error) {
            const reasons = Array.isArray(error?.errors)
                ? error.errors.map((reason) => String(reason?.message || reason)).filter(Boolean)
                : [];
            if (reasons.length > 0) {
                throw new Error(`IPFSService: failed to fetch metadata for ${cid}. ${reasons.join(" | ")}`);
            }
            throw error;
        }
    }
}

module.exports = {
    IPFSService,
    normalizeCid,
};
