const { expect } = require("chai");

const { AgentBrainService } = require("../services/agentBrainService");

function stubProvider({
    name,
    modelName = "test-model",
    available = true,
    decide,
    chat,
    summarize,
}) {
    return {
        name,
        modelName,
        isAvailable() {
            return available;
        },
        async decide(args) {
            if (decide) return decide(args);
            return {
                actionType: "hold",
                actionArgs: {},
                thesis: `${name} hold`,
                rationale: `${name} fallback`,
                confidence: 50,
                blockedBy: "",
                requiresHuman: false,
            };
        },
        async chat(args) {
            if (chat) return chat(args);
            return {
                reply: `${name} reply`,
                objectivePatch: null,
                wakeReason: "chat_message",
            };
        },
        async summarize(args) {
            if (summarize) return summarize(args);
            return `${name} summary`;
        },
    };
}

describe("AgentBrainService provider fallback", function () {
    it("uses the next configured provider when the primary provider is unavailable", async () => {
        const brain = new AgentBrainService({
            enabled: true,
            providers: [
                stubProvider({ name: "gemini", available: false }),
                stubProvider({
                    name: "groq",
                    decide: async () => ({
                        actionType: "hold",
                        actionArgs: {},
                        thesis: "Groq planned a hold",
                        rationale: "No action yet",
                        confidence: 62,
                        blockedBy: "",
                        requiresHuman: false,
                    }),
                }),
            ],
        });

        const result = await brain.decide({
            objective: { goal: "Protect capital", style: "balanced" },
            context: {},
            memorySummary: "",
            wakeReason: "start",
        });

        expect(result.degradedMode).to.equal(false);
        expect(result.provider).to.equal("groq");
        expect(result.proposal.thesis).to.equal("Groq planned a hold");
    });

    it("cools down a rate-limited provider and avoids reusing it on the next call", async () => {
        let primaryCalls = 0;
        let secondaryCalls = 0;

        const brain = new AgentBrainService({
            enabled: true,
            providerCooldownMs: 60_000,
            providers: [
                stubProvider({
                    name: "gemini",
                    decide: async () => {
                        primaryCalls += 1;
                        const error = new Error("Rate limit exceeded");
                        error.status = 429;
                        throw error;
                    },
                }),
                stubProvider({
                    name: "openrouter",
                    decide: async () => {
                        secondaryCalls += 1;
                        return {
                            actionType: "hold",
                            actionArgs: {},
                            thesis: "Secondary provider picked hold",
                            rationale: "Fallback provider succeeded",
                            confidence: 58,
                            blockedBy: "",
                            requiresHuman: false,
                        };
                    },
                }),
            ],
        });

        const first = await brain.decide({
            objective: { goal: "Protect capital", style: "balanced" },
            context: {},
            memorySummary: "",
            wakeReason: "start",
        });
        const second = await brain.decide({
            objective: { goal: "Protect capital", style: "balanced" },
            context: {},
            memorySummary: "",
            wakeReason: "scheduled",
        });

        expect(first.provider).to.equal("openrouter");
        expect(second.provider).to.equal("openrouter");
        expect(first.degradedMode).to.equal(false);
        expect(second.degradedMode).to.equal(false);
        expect(primaryCalls).to.equal(1);
        expect(secondaryCalls).to.equal(2);
    });

    it("prioritizes eligible live bids ahead of treasury rebalance in deterministic fallback mode", async () => {
        const brain = new AgentBrainService({
            enabled: false,
        });

        const result = await brain.decide({
            objective: { goal: "Grow capital safely through productive RWA opportunities.", style: "balanced" },
            context: {
                shouldRebalanceTreasury: true,
                bidFocus: {
                    eligible: true,
                    auctionId: 12,
                    nextBidDisplay: "250.0000000",
                    confidence: 84,
                    prioritySource: ["watchlist"],
                },
                opportunities: [{ tokenId: 7 }],
            },
            memorySummary: "",
            wakeReason: "scheduled",
        });

        expect(result.proposal.actionType).to.equal("bid");
        expect(Number(result.proposal.actionArgs.auctionId)).to.equal(12);
    });
});
