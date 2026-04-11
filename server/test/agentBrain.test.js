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
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    const originalOpenAiModel = process.env.OPENAI_MODEL;

    afterEach(() => {
        if (originalOpenAiKey == null) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalOpenAiKey;

        if (originalOpenAiModel == null) delete process.env.OPENAI_MODEL;
        else process.env.OPENAI_MODEL = originalOpenAiModel;
    });

    it("creates an OpenAI provider when configured in priority order", async () => {
        process.env.OPENAI_API_KEY = "sk-test-openai";
        process.env.OPENAI_MODEL = "gpt-4.1-mini";

        const brain = new AgentBrainService({
            enabled: true,
            providerName: "openai,groq",
        });

        const status = brain.getProviderStatus();

        expect(brain.providerNames).to.deep.equal(["openai", "groq"]);
        expect(status.provider).to.equal("openai");
        expect(status.model).to.equal("gpt-4.1-mini");
        expect(status.available).to.equal(true);
        expect(status.degradedMode).to.equal(false);
    });

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

    it("reports cooldown-based degraded status when configured providers are temporarily cooling down", async () => {
        const brain = new AgentBrainService({
            enabled: true,
            providers: [
                stubProvider({ name: "groq", available: true, modelName: "llama-3.3-70b-versatile" }),
                stubProvider({ name: "gemini", available: true, modelName: "gemini-2.5-flash" }),
            ],
        });

        brain.cooldowns.set("groq", Date.now() + 45_000);
        brain.cooldowns.set("gemini", Date.now() + 30_000);

        const status = brain.getProviderStatus();

        expect(status.available).to.equal(false);
        expect(status.degradedMode).to.equal(true);
        expect(status.degradedReason).to.include("temporarily cooling down after recent failures");
        expect(status.degradedReason).to.include("groq");
        expect(status.degradedReason).to.include("gemini");
        expect(status.degradedReason).to.match(/retry in \d+s/i);
    });

    it("reports missing-credential degraded status when no provider is configured", async () => {
        const brain = new AgentBrainService({
            enabled: true,
            providers: [
                stubProvider({ name: "groq", available: false }),
                stubProvider({ name: "gemini", available: false }),
            ],
        });

        const status = brain.getProviderStatus();

        expect(status.available).to.equal(false);
        expect(status.degradedMode).to.equal(true);
        expect(status.degradedReason).to.equal(
            "No configured agent LLM provider with valid credentials is currently available, so the agent is using deterministic fallback planning.",
        );
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
