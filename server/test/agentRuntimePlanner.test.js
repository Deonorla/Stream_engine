const { expect } = require("chai");

const { buildPlannerHealthDecision } = require("../services/agentRuntimeService");

describe("AgentRuntime planner health decisions", function () {
    it("records a degraded fallback event when the planner drops out of live LLM mode", function () {
        const entry = buildPlannerHealthDecision(
            {
                provider: "groq",
                model: "llama-3.3-70b-versatile",
                degradedMode: false,
                degradedReason: "",
            },
            {
                provider: "gemini",
                model: "gemini-2.5-flash",
                degradedMode: true,
                degradedReason: "Quota exhausted",
            },
            "start",
        );

        expect(entry).to.deep.equal({
            type: "info",
            message: "Planner fell back to deterministic mode",
            detail: "gemini · gemini-2.5-flash · wake start · Quota exhausted",
        });
    });

    it("records a recovery event when the planner resumes live reasoning", function () {
        const entry = buildPlannerHealthDecision(
            {
                provider: "gemini",
                model: "gemini-2.5-flash",
                degradedMode: true,
                degradedReason: "Quota exhausted",
            },
            {
                provider: "groq",
                model: "llama-3.3-70b-versatile",
                degradedMode: false,
                degradedReason: "",
            },
            "manual_verification",
        );

        expect(entry).to.deep.equal({
            type: "decision",
            message: "Planner recovered with groq",
            detail: "Model llama-3.3-70b-versatile · wake manual verification",
        });
    });

    it("returns null when planner health did not change", function () {
        const entry = buildPlannerHealthDecision(
            {
                provider: "groq",
                model: "llama-3.3-70b-versatile",
                degradedMode: false,
                degradedReason: "",
            },
            {
                provider: "groq",
                model: "llama-3.3-70b-versatile",
                degradedMode: false,
                degradedReason: "",
            },
            "scheduled",
        );

        expect(entry).to.equal(null);
    });
});
