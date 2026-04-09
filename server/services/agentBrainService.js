const SUPPORTED_ACTIONS = new Set([
    "analyze",
    "bid",
    "settle_auction",
    "claim_yield",
    "route_yield",
    "rebalance_treasury",
    "watch",
    "hold",
]);

async function retryWithBackoff(fn, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            const isRetryable = String(err?.message || '').includes('503') || String(err?.message || '').includes('429');
            if (!isRetryable || i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, delayMs * 2 ** i));
        }
    }
}

function friendlyLlmError(error) {
    const msg = String(error?.message || '');
    if (msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests')) {
        const retryMatch = msg.match(/retry in ([\d.]+)s/i);
        const retryHint = retryMatch ? ` Try again in ${Math.ceil(Number(retryMatch[1]))} seconds.` : '';
        return `AI rate limit reached — the free tier quota is exhausted.${retryHint}`;
    }
    if (msg.includes('503') || msg.includes('Service Unavailable')) {
        return 'AI service is temporarily overloaded. The agent will retry automatically.';
    }
    if (msg.includes('404') || msg.includes('not found')) {
        return 'AI model not found. Check AGENT_LLM_MODEL in your .env file.';
    }
    if (msg.includes('API key') || msg.includes('403')) {
        return 'Invalid or missing Gemini API key. Check GEMINI_API_KEY in your .env file.';
    }
    return `AI planning unavailable: ${msg.split('\n')[0].slice(0, 120)}`;
}

function normalizeText(value = "") {
    return String(value || "").trim();
}

function parseJsonObject(text = "") {
    const cleaned = String(text || "").trim();
    if (!cleaned) return null;
    try {
        return JSON.parse(cleaned);
    } catch {}
    const fenced = cleaned.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        try {
            return JSON.parse(fenced[1]);
        } catch {}
    }
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
        try {
            return JSON.parse(objectMatch[0]);
        } catch {}
    }
    return null;
}

function normalizeConfidence(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeProposal(raw = {}, wakeReason = "") {
    const actionType = String(raw.actionType || raw.action || "hold").trim().toLowerCase();
    const supportedAction = SUPPORTED_ACTIONS.has(actionType) ? actionType : "hold";
    return {
        actionType: supportedAction,
        actionArgs: typeof raw.actionArgs === "object" && raw.actionArgs ? raw.actionArgs : {},
        thesis: normalizeText(raw.thesis || raw.summary || ""),
        rationale: normalizeText(raw.rationale || raw.reasoning || ""),
        confidence: normalizeConfidence(raw.confidence, supportedAction === "hold" ? 40 : 65),
        blockedBy: normalizeText(raw.blockedBy || ""),
        requiresHuman: Boolean(raw.requiresHuman),
        wakeReason: normalizeText(raw.wakeReason || wakeReason),
    };
}

function detectObjectivePatch(message = "", currentObjective = {}) {
    const text = normalizeText(message);
    if (!text) return null;
    const lower = text.toLowerCase();
    const patch = {};

    if (/\baggressive\b/.test(lower)) {
        patch.style = "aggressive";
    } else if (/\bconservative\b/.test(lower)) {
        patch.style = "conservative";
    } else if (/\bbalanced\b/.test(lower)) {
        patch.style = "balanced";
    }

    const goalMatch = text.match(/(?:goal|objective)\s*(?:is|should be|:)\s*(.+)$/i);
    if (goalMatch?.[1]) {
        patch.goal = goalMatch[1].trim();
    } else if (/\bfocus on\b/i.test(text)) {
        patch.goal = text;
    }

    if (
        /\b(prefer|avoid|focus|target|only|priorit|shift|rebalance toward|make the agent)\b/i.test(text)
        || patch.style
        || patch.goal
    ) {
        patch.instructions = text;
    }

    const next = {
        goal: patch.goal ?? currentObjective.goal,
        style: patch.style ?? currentObjective.style,
        instructions: patch.instructions ?? currentObjective.instructions,
    };

    if (
        next.goal === currentObjective.goal
        && next.style === currentObjective.style
        && next.instructions === currentObjective.instructions
    ) {
        return null;
    }

    return patch;
}

function buildFallbackDecision({ objective = {}, context = {}, wakeReason = "" }) {
    const readySettlements = Array.isArray(context.readySettlements) ? context.readySettlements : [];
    const claimableAssets = Array.isArray(context.claimableAssets) ? context.claimableAssets : [];
    const bidFocus = context.bidFocus || null;
    const opportunities = Array.isArray(context.opportunities) ? context.opportunities : [];
    const shouldRebalanceTreasury = Boolean(context.shouldRebalanceTreasury);
    const objectiveGoal = normalizeText(objective.goal || "Grow capital safely through productive RWA opportunities.");

    if (readySettlements.length > 0) {
        const ready = readySettlements[0];
        return normalizeProposal({
            actionType: "settle_auction",
            actionArgs: { auctionId: Number(ready.auctionId) },
            thesis: `Settle closed auction #${Number(ready.auctionId)} and realize the market outcome.`,
            rationale: `Auction #${Number(ready.auctionId)} is ready for settlement, which keeps the book current and unlocks the next trade.`,
            confidence: 86,
            wakeReason,
        }, wakeReason);
    }

    if (claimableAssets.length > 0 && shouldRebalanceTreasury) {
        const claimable = claimableAssets[0];
        return normalizeProposal({
            actionType: "route_yield",
            actionArgs: { tokenId: Number(claimable.tokenId) },
            thesis: `Harvest yield from twin #${Number(claimable.tokenId)} and route it straight into the treasury plan.`,
            rationale: "Claimable yield is available and treasury reserves are outside the target band, so a combined route keeps capital productive in one move.",
            confidence: 84,
            wakeReason,
        }, wakeReason);
    }

    if (claimableAssets.length > 0) {
        const claimable = claimableAssets[0];
        return normalizeProposal({
            actionType: "claim_yield",
            actionArgs: { tokenId: Number(claimable.tokenId) },
            thesis: `Harvest yield from twin #${Number(claimable.tokenId)} before redeploying capital.`,
            rationale: `Claimable yield is available and fits the treasury mandate without increasing market exposure.`,
            confidence: 78,
            wakeReason,
        }, wakeReason);
    }

    if (shouldRebalanceTreasury) {
        return normalizeProposal({
            actionType: "rebalance_treasury",
            actionArgs: {},
            thesis: "Restore the treasury reserve band and redeploy idle funds.",
            rationale: "Liquid reserves are outside the target band, so treasury optimization should run before the next paid market action.",
            confidence: 82,
            wakeReason,
        }, wakeReason);
    }

    if (bidFocus?.eligible) {
        return normalizeProposal({
            actionType: "bid",
            actionArgs: {
                auctionId: Number(bidFocus.auctionId),
                amount: String(bidFocus.nextBidDisplay || bidFocus.nextBidAmountDisplay || ""),
            },
            thesis: `${objectiveGoal} The strongest live opportunity is auction #${Number(bidFocus.auctionId)}.`,
            rationale: `${bidFocus.prioritySource?.length ? `Priority signal: ${bidFocus.prioritySource.join(" + ")}. ` : ""}The next valid bid fits the current mandate and liquidity envelope.`,
            confidence: Math.max(55, normalizeConfidence(bidFocus.confidence || 72)),
            wakeReason,
        }, wakeReason);
    }

    const blockedBy = normalizeText(
        bidFocus?.blockedReason
        || context.noActionReason
        || (
            opportunities.length > 0
                ? "No live auction currently clears the current mandate and liquidity thresholds."
                : "No approved assets currently clear the active mandate floor."
        )
    );

    return normalizeProposal({
        actionType: "hold",
        actionArgs: {},
        thesis: `${objectiveGoal} The agent is waiting for a cleaner entry or a treasury trigger.`,
        rationale: blockedBy,
        blockedBy,
        confidence: 48,
        wakeReason,
    }, wakeReason);
}

function buildFallbackChat({ message = "", objective = {}, brainState = {}, context = {} }) {
    const text = normalizeText(message);
    const lower = text.toLowerCase();
    const objectivePatch = detectObjectivePatch(text, objective);
    const nextAction = brainState?.nextAction?.actionType || "hold";
    const nextActionLabel = String(nextAction).replace(/_/g, " ");
    const blockedBy = normalizeText(brainState?.blockedBy || context?.noActionReason || "");
    const thesis = normalizeText(brainState?.currentThesis || "");
    let reply = "";

    if (objectivePatch) {
        reply = `I updated the objective${objectivePatch.style ? ` to a ${objectivePatch.style} style` : ""}${objectivePatch.goal ? ` with goal "${objectivePatch.goal}"` : ""}. I’ll re-evaluate the market using the new mandate and strategy context.`;
    } else if (/\bwhy\b.*\bbid\b/i.test(lower)) {
        reply = blockedBy
            ? `I did not bid because ${blockedBy.toLowerCase()}`
            : `I have not found a bid that clears the current mandate, liquidity, and approval thresholds.`;
    } else if (/\bwhat\b.*\bdoing\b/i.test(lower) || /\bwhat\b.*\bplan\b/i.test(lower)) {
        reply = thesis
            ? `Current thesis: ${thesis} Next planned action: ${nextActionLabel}.`
            : `I am scanning the market, treasury state, and live auctions before taking the next action.`;
    } else {
        reply = thesis
            ? `Current thesis: ${thesis} My next action is ${nextActionLabel}${blockedBy ? `, but I am blocked because ${blockedBy.toLowerCase()}` : ""}.`
            : `I am tracking the current mandate, liquidity runway, live auctions, and treasury state before acting.`;
    }

    return {
        reply,
        objectivePatch,
        wakeReason: objectivePatch ? "chat_objective_update" : "chat_message",
    };
}

function buildFallbackSummary({ objective = {}, journal = [], recentMessages = [] }) {
    const parts = [];
    if (objective?.goal) {
        parts.push(`Goal: ${objective.goal}`);
    }
    if (objective?.style) {
        parts.push(`Style: ${objective.style}`);
    }
    const recentJournal = (Array.isArray(journal) ? journal : []).slice(-3).map((entry) => entry.message).filter(Boolean);
    const recentChat = (Array.isArray(recentMessages) ? recentMessages : []).slice(-2).map((entry) => `${entry.role}: ${entry.content}`).filter(Boolean);
    if (recentJournal.length > 0) {
        parts.push(`Journal: ${recentJournal.join(" | ")}`);
    }
    if (recentChat.length > 0) {
        parts.push(`Chat: ${recentChat.join(" | ")}`);
    }
    return parts.join(" · ").slice(0, 1200);
}

class GeminiAgentModelProvider {
    constructor(config = {}) {
        this.apiKey = normalizeText(config.apiKey || "");
        this.modelName = normalizeText(config.modelName || "gemini-2.5-flash");
    }

    isAvailable() {
        return Boolean(this.apiKey && this.apiKey !== "your_gemini_api_key_here");
    }

    async generateJson(prompt) {
        if (!this.isAvailable()) {
            throw new Error("Gemini API key is not configured.");
        }
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(this.apiKey);
        const model = genAI.getGenerativeModel({ model: this.modelName });
        const result = await retryWithBackoff(() => model.generateContent(prompt));
        const text = (await result.response).text();
        const parsed = parseJsonObject(text);
        if (!parsed) {
            throw new Error("Gemini did not return valid JSON.");
        }
        return parsed;
    }

    async decide({ objective, context, memorySummary, wakeReason }) {
        const prompt = `You are the autonomous market planner for Continuum, an agent-first RWA marketplace.
Return JSON only.

Rules:
- Choose exactly one next action.
- Allowed actions: analyze, bid, settle_auction, claim_yield, route_yield, rebalance_treasury, watch, hold.
- Never propose minting, physical rental actions, or anything outside trade + treasury scope.
- If an action is blocked by guardrails, return hold with blockedBy.
- Keep rationale concise and operator-readable.

Objective:
${JSON.stringify(objective || {}, null, 2)}

Wake reason: ${wakeReason || "scheduled"}

Memory summary:
${memorySummary || "No memory summary yet."}

Runtime context:
${JSON.stringify(context || {}, null, 2)}

Response shape:
{
  "actionType": "bid",
  "actionArgs": {},
  "thesis": "short thesis",
  "rationale": "why",
  "confidence": 0,
  "blockedBy": "",
  "requiresHuman": false,
  "wakeReason": "${wakeReason || "scheduled"}"
}`;
        return normalizeProposal(await this.generateJson(prompt), wakeReason);
    }

    async chat({ message, objective, brainState, context, recentMessages, memorySummary }) {
        const prompt = `You are the live autonomous agent for Continuum.
Reply in JSON only.

Rules:
- Explain your real current thesis, blocker, liquidity, and next action.
- You may update the objective only if the human is clearly changing strategy or goals.
- Do not promise actions outside the mandate or outside trade + treasury scope.

Current objective:
${JSON.stringify(objective || {}, null, 2)}

Current brain state:
${JSON.stringify(brainState || {}, null, 2)}

Memory summary:
${memorySummary || "No memory summary yet."}

Recent chat:
${JSON.stringify(recentMessages || [], null, 2)}

Runtime context:
${JSON.stringify(context || {}, null, 2)}

User message:
${message}

Response shape:
{
  "reply": "assistant reply",
  "objectivePatch": {
    "goal": "",
    "style": "",
    "instructions": ""
  },
  "wakeReason": "chat_message"
}`;
        const parsed = await this.generateJson(prompt);
        return {
            reply: normalizeText(parsed.reply || ""),
            objectivePatch: parsed.objectivePatch && typeof parsed.objectivePatch === "object"
                ? parsed.objectivePatch
                : null,
            wakeReason: normalizeText(parsed.wakeReason || "chat_message"),
        };
    }

    async summarize({ objective, journal, recentMessages }) {
        const prompt = `Summarize this autonomous agent memory into 5 concise sentences max.
Focus on current objective, strategy, recent wins/losses, blockers, and next likely action.

Objective:
${JSON.stringify(objective || {}, null, 2)}

Journal:
${JSON.stringify(journal || [], null, 2)}

Recent chat:
${JSON.stringify(recentMessages || [], null, 2)}
`;
        if (!this.isAvailable()) {
            return buildFallbackSummary({ objective, journal, recentMessages });
        }
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(this.apiKey);
        const model = genAI.getGenerativeModel({ model: this.modelName });
        const result = await retryWithBackoff(() => model.generateContent(prompt));
        return normalizeText((await result.response).text());
    }
}

class AgentBrainService {
    constructor(config = {}) {
        this.enabled = config.enabled ?? String(process.env.AGENT_LLM_ENABLED || "true").toLowerCase() !== "false";
        this.providerName = normalizeText(config.providerName || process.env.AGENT_LLM_PROVIDER || "gemini") || "gemini";
        this.modelName = normalizeText(config.modelName || process.env.AGENT_LLM_MODEL || "gemini-2.5-flash") || "gemini-2.5-flash";
        this.provider = config.provider || this.createProvider();
    }

    createProvider() {
        if (this.providerName === "gemini") {
            return new GeminiAgentModelProvider({
                apiKey: process.env.GEMINI_API_KEY || "",
                modelName: this.modelName,
            });
        }
        return null;
    }

    getProviderStatus() {
        const available = Boolean(this.enabled && this.provider?.isAvailable?.());
        return {
            enabled: Boolean(this.enabled),
            provider: this.providerName,
            model: this.modelName,
            available,
            degradedMode: Boolean(this.enabled && !available),
            degradedReason: this.enabled && !available
                ? "Platform LLM is unavailable, so the agent is using deterministic fallback planning."
                : "",
        };
    }

    async decide({ objective, context, memorySummary, wakeReason }) {
        const fallback = buildFallbackDecision({ objective, context, wakeReason });
        const status = this.getProviderStatus();
        if (!status.enabled || !status.available) {
            return {
                proposal: fallback,
                degradedMode: status.degradedMode,
                degradedReason: status.degradedReason,
                provider: status.provider,
                model: status.model,
            };
        }

        try {
            const proposal = normalizeProposal(
                await this.provider.decide({ objective, context, memorySummary, wakeReason }),
                wakeReason,
            );
            return {
                proposal,
                degradedMode: false,
                degradedReason: "",
                provider: status.provider,
                model: status.model,
            };
        } catch (error) {
            return {
                proposal: fallback,
                degradedMode: true,
                degradedReason: `Platform LLM planning failed: ${friendlyLlmError(error)}`,
                provider: status.provider,
                model: status.model,
            };
        }
    }

    async chat({ message, objective, brainState, context, recentMessages, memorySummary }) {
        const fallback = buildFallbackChat({ message, objective, brainState, context });
        const status = this.getProviderStatus();
        if (!status.enabled || !status.available) {
            return {
                ...fallback,
                degradedMode: status.degradedMode,
                degradedReason: status.degradedReason,
                provider: status.provider,
                model: status.model,
            };
        }

        try {
            const response = await this.provider.chat({
                message,
                objective,
                brainState,
                context,
                recentMessages,
                memorySummary,
            });
            return {
                reply: normalizeText(response.reply || fallback.reply),
                objectivePatch: response.objectivePatch || null,
                wakeReason: normalizeText(response.wakeReason || fallback.wakeReason),
                degradedMode: false,
                degradedReason: "",
                provider: status.provider,
                model: status.model,
            };
        } catch (error) {
            return {
                ...fallback,
                degradedMode: true,
                degradedReason: `Platform LLM chat failed: ${friendlyLlmError(error)}`,
                provider: status.provider,
                model: status.model,
            };
        }
    }

    async summarize({ objective, journal, recentMessages }) {
        const status = this.getProviderStatus();
        if (!status.enabled || !status.available) {
            return buildFallbackSummary({ objective, journal, recentMessages });
        }
        try {
            return await this.provider.summarize({ objective, journal, recentMessages });
        } catch {
            return buildFallbackSummary({ objective, journal, recentMessages });
        }
    }
}

module.exports = {
    AgentBrainService,
    SUPPORTED_ACTIONS,
    normalizeProposal,
};
