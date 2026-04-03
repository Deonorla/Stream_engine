const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { expect } = require("chai");
const { Keypair } = require("@stellar/stellar-sdk");

const { AgentAuthService } = require("../services/agentAuthService");

describe("AgentAuthService", function () {
    it("signs and verifies local managed-agent session tokens", async function () {
        const ownerPublicKey = Keypair.random().publicKey();
        const service = new AgentAuthService({
            jwtSecret: "test-local-secret",
        });

        const token = service.signLocalSession({
            ownerPublicKey,
            authProvider: "local",
        });
        const session = await service.verifyBearerToken(token);

        expect(session.ownerPublicKey).to.equal(ownerPublicKey);
        expect(session.authProvider).to.equal("local");
    });

    it("verifies Auth0-style RS256 tokens and extracts the Stellar owner claim", async function () {
        const ownerPublicKey = Keypair.random().publicKey();
        const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
        });
        const jwk = publicKey.export({ format: "jwk" });
        jwk.kid = "test-kid";
        jwk.use = "sig";
        jwk.alg = "RS256";

        const service = new AgentAuthService({
            auth0Domain: "tenant.example.auth0.com",
            auth0Audience: "continuum-api",
            auth0Issuer: "https://tenant.example.auth0.com/api/v2/",
            fetch: async () => ({
                ok: true,
                async json() {
                    return { keys: [jwk] };
                },
            }),
        });

        const token = jwt.sign({
            sub: "auth0|user-123",
            aud: "continuum-api",
            iss: "https://tenant.example.auth0.com/",
            "https://continuum.app/owner_public_key": ownerPublicKey,
        }, privateKey, {
            algorithm: "RS256",
            keyid: "test-kid",
            expiresIn: "1h",
        });

        const session = await service.verifyBearerToken(token);

        expect(session.ownerPublicKey).to.equal(ownerPublicKey);
        expect(session.authProvider).to.equal("auth0");
        expect(session.authSubject).to.equal("auth0|user-123");
    });
});
