const { expect } = require("chai");

const { checkCompliance } = require("../services/complianceChecker");

describe("Compliance Checker", function () {
    const originalStrictTradeEnv = process.env.AGENT_TRADE_REQUIRE_WALLET_COMPLIANCE;

    afterEach(() => {
        if (originalStrictTradeEnv == null) {
            delete process.env.AGENT_TRADE_REQUIRE_WALLET_COMPLIANCE;
        } else {
            process.env.AGENT_TRADE_REQUIRE_WALLET_COMPLIANCE = originalStrictTradeEnv;
        }
    });

    it("does not block trade actions on missing wallet compliance by default", async () => {
        delete process.env.AGENT_TRADE_REQUIRE_WALLET_COMPLIANCE;
        const result = await checkCompliance(
            {
                isConfigured() {
                    return true;
                },
                async getCompliance() {
                    return {
                        approved: false,
                        currentlyValid: false,
                        reason: "not_onboarded",
                    };
                },
            },
            {
                walletAddress: "GA123",
                asset: {
                    tokenId: 7,
                    assetType: 1,
                    verificationStatusLabel: "verified",
                    attestationPolicies: [],
                    attestations: [],
                },
                action: "bid",
            }
        );

        expect(result.allowed).to.equal(true);
        const walletCheck = result.checks.find((entry) => entry.name === "wallet_compliance");
        expect(walletCheck).to.exist;
        expect(walletCheck.passed).to.equal(true);
        expect(walletCheck.detail).to.match(/advisory/i);
    });

    it("blocks claim actions when wallet compliance is not approved", async () => {
        const result = await checkCompliance(
            {
                isConfigured() {
                    return true;
                },
                contractService: {
                    async invokeView() {
                        return false;
                    },
                },
                assetRegistryAddress: "stellar:rwa-registry",
                async getCompliance() {
                    return {
                        approved: false,
                        currentlyValid: false,
                        reason: "not_onboarded",
                    };
                },
            },
            {
                walletAddress: "GA123",
                asset: {
                    tokenId: 7,
                    assetType: 1,
                    verificationStatusLabel: "verified",
                    attestationPolicies: [],
                    attestations: [],
                },
                action: "claim_yield",
            }
        );

        expect(result.allowed).to.equal(false);
        expect(result.reasons.join(" ")).to.match(/Wallet not approved/i);
    });

    it("supports strict trade compliance mode when explicitly enabled", async () => {
        process.env.AGENT_TRADE_REQUIRE_WALLET_COMPLIANCE = "true";
        const result = await checkCompliance(
            {
                isConfigured() {
                    return true;
                },
                async getCompliance() {
                    return {
                        approved: false,
                        currentlyValid: false,
                        reason: "not_onboarded",
                    };
                },
            },
            {
                walletAddress: "GA123",
                asset: {
                    tokenId: 7,
                    assetType: 1,
                    verificationStatusLabel: "verified",
                    attestationPolicies: [],
                    attestations: [],
                },
                action: "bid",
            }
        );

        expect(result.allowed).to.equal(false);
        expect(result.reasons.join(" ")).to.match(/Wallet not approved/i);
    });
});
