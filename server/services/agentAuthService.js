const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { StrKey } = require("@stellar/stellar-sdk");

function normalizeAddress(value = "") {
    return String(value || "").trim().toUpperCase();
}

function parseClaimList(value) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeIssuer(input = "") {
    const trimmed = String(input || "").trim();
    if (!trimmed) return "";
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function deriveAuth0Issuers(domain = "", configuredIssuer = "") {
    const issuers = new Set();
    const normalizedConfigured = normalizeIssuer(configuredIssuer);
    if (normalizedConfigured) {
        issuers.add(normalizedConfigured);
        const apiV2Variant = normalizedConfigured.replace(/api\/v2\/$/i, "");
        if (apiV2Variant && apiV2Variant !== normalizedConfigured) {
            issuers.add(normalizeIssuer(apiV2Variant));
        }
    }
    const normalizedDomain = String(domain || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (normalizedDomain) {
        issuers.add(`https://${normalizedDomain}/`);
    }
    return Array.from(issuers).filter(Boolean);
}

class AgentAuthService {
    constructor(config = {}) {
        this.jwtSecret = config.jwtSecret || process.env.AGENT_JWT_SECRET || process.env.AGENT_ENCRYPTION_KEY || "change-me";
        this.jwtTtl = config.jwtTtl || "7d";
        this.auth0Domain = String(config.auth0Domain || process.env.AUTH0_DOMAIN || "").trim();
        this.auth0Audience = String(config.auth0Audience || process.env.AUTH0_AUDIENCE || "").trim();
        this.auth0Issuer = String(config.auth0Issuer || process.env.AUTH0_ISSUER || "").trim();
        this.auth0JwksUri = String(
            config.auth0JwksUri
            || process.env.AUTH0_JWKS_URI
            || (this.auth0Domain ? `https://${this.auth0Domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}/.well-known/jwks.json` : "")
        ).trim();
        this.fetch = config.fetch || global.fetch;
        this.jwksCache = new Map();
        this.ownerClaimNames = [
            ...parseClaimList(config.ownerClaimNames || process.env.AUTH0_OWNER_PUBLIC_KEY_CLAIMS || ""),
            ...(process.env.AUTH0_OWNER_PUBLIC_KEY_CLAIM ? [process.env.AUTH0_OWNER_PUBLIC_KEY_CLAIM] : []),
            "https://continuum.app/owner_public_key",
            "https://stream-engine.app/owner_public_key",
            "ownerPublicKey",
            "stellar_public_key",
            "wallet_address",
        ];
        this.acceptedIssuers = deriveAuth0Issuers(this.auth0Domain, this.auth0Issuer);
    }

    isAuth0Configured() {
        return Boolean(this.auth0JwksUri && this.auth0Audience && this.acceptedIssuers.length > 0);
    }

    signLocalSession(payload = {}) {
        const ownerPublicKey = normalizeAddress(payload.ownerPublicKey);
        return jwt.sign({
            ownerPublicKey,
            authProvider: payload.authProvider || "local",
            authSubject: payload.authSubject || "",
        }, this.jwtSecret, { expiresIn: this.jwtTtl });
    }

    async verifyBearerToken(token) {
        try {
            const payload = jwt.verify(token, this.jwtSecret, { algorithms: ["HS256"] });
            const ownerPublicKey = this.extractOwnerPublicKey(payload);
            if (!ownerPublicKey) {
                throw Object.assign(new Error("Local session token is missing ownerPublicKey."), {
                    status: 401,
                    code: "auth_owner_claim_missing",
                });
            }
            return {
                ownerPublicKey,
                authProvider: payload.authProvider || "local",
                authSubject: payload.authSubject || "",
                claims: payload,
            };
        } catch (localError) {
            if (!this.isAuth0Configured()) {
                throw Object.assign(new Error("Invalid or expired agent session token."), {
                    status: 401,
                    code: "invalid_auth_token",
                    cause: localError,
                });
            }
        }

        return this.verifyAuth0Token(token);
    }

    async verifyAuth0Token(token) {
        const decoded = jwt.decode(token, { complete: true });
        const kid = decoded?.header?.kid;
        if (!kid) {
            throw Object.assign(new Error("Auth token is missing a key id."), {
                status: 401,
                code: "auth_kid_missing",
            });
        }

        const publicKey = await this.getJwksPublicKey(kid);
        const payload = jwt.verify(token, publicKey, {
            algorithms: ["RS256"],
            audience: this.auth0Audience,
            issuer: this.acceptedIssuers,
        });
        const ownerPublicKey = this.extractOwnerPublicKey(payload);
        if (!ownerPublicKey) {
            throw Object.assign(new Error("Auth token is missing the configured Stellar owner public key claim."), {
                status: 401,
                code: "auth_owner_claim_missing",
            });
        }
        return {
            ownerPublicKey,
            authProvider: "auth0",
            authSubject: String(payload.sub || ""),
            claims: payload,
        };
    }

    async verifyRequest(req, { optional = false } = {}) {
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) {
            if (optional) return null;
            throw Object.assign(new Error("Missing agent session token."), {
                status: 401,
                code: "missing_auth_token",
            });
        }
        return this.verifyBearerToken(token);
    }

    async resolveOwnerPublicKey(req, { allowBody = true, requireAuth = false } = {}) {
        const session = await this.verifyRequest(req, { optional: !requireAuth });
        const sessionOwner = normalizeAddress(session?.ownerPublicKey || "");
        const bodyOwner = allowBody ? normalizeAddress(req.body?.ownerPublicKey || req.query?.ownerPublicKey || "") : "";

        if (sessionOwner && bodyOwner && sessionOwner !== bodyOwner) {
            throw Object.assign(new Error("Authenticated owner does not match the requested owner public key."), {
                status: 403,
                code: "auth_owner_mismatch",
            });
        }

        const ownerPublicKey = sessionOwner || bodyOwner;
        if (!ownerPublicKey || !StrKey.isValidEd25519PublicKey(ownerPublicKey)) {
            throw Object.assign(new Error("Valid ownerPublicKey is required."), {
                status: 400,
                code: "owner_public_key_required",
            });
        }

        return {
            ownerPublicKey,
            session,
        };
    }

    extractOwnerPublicKey(payload = {}) {
        for (const claimName of this.ownerClaimNames) {
            const value = payload?.[claimName];
            if (typeof value === "string" && StrKey.isValidEd25519PublicKey(value)) {
                return normalizeAddress(value);
            }
        }
        if (typeof payload?.sub === "string" && StrKey.isValidEd25519PublicKey(payload.sub)) {
            return normalizeAddress(payload.sub);
        }
        return "";
    }

    async getJwksPublicKey(kid) {
        if (this.jwksCache.has(kid)) {
            return this.jwksCache.get(kid);
        }
        if (!this.fetch) {
            throw Object.assign(new Error("Fetch is not available for JWKS resolution."), {
                status: 503,
                code: "jwks_fetch_unavailable",
            });
        }
        const response = await this.fetch(this.auth0JwksUri);
        if (!response?.ok) {
            throw Object.assign(new Error("Could not fetch Auth0 JWKS."), {
                status: 503,
                code: "jwks_fetch_failed",
            });
        }
        const payload = await response.json();
        const jwk = Array.isArray(payload?.keys)
            ? payload.keys.find((entry) => entry.kid === kid)
            : null;
        if (!jwk) {
            throw Object.assign(new Error("Auth0 signing key was not found in JWKS."), {
                status: 401,
                code: "jwks_key_not_found",
            });
        }
        const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
        this.jwksCache.set(kid, publicKey);
        return publicKey;
    }
}

module.exports = {
    AgentAuthService,
};
