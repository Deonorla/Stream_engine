const express = require("express");
const jwt = require("jsonwebtoken");
const { Keypair, StrKey } = require("@stellar/stellar-sdk");
const router = express.Router();

const JWT_SECRET = process.env.AGENT_JWT_SECRET || process.env.AGENT_ENCRYPTION_KEY || "change-me";
const JWT_TTL = "7d";

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function verifyFreighterSignature(ownerPublicKey, signature) {
    if (!ownerPublicKey || !signature) return false;
    if (!StrKey.isValidEd25519PublicKey(ownerPublicKey)) return false;
    try {
        const message = `agent-auth:${ownerPublicKey.toUpperCase()}`;
        const kp = Keypair.fromPublicKey(ownerPublicKey);
        return kp.verify(Buffer.from(message), Buffer.from(signature, "base64"));
    } catch {
        return false;
    }
}

function requireJwt(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing agent session token." });
    try {
        req.agentSession = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired agent session token." });
    }
}

function getAgent(req) {
    return req.app.locals.agentWallet;
}

// ── Activation (one-time Freighter signature) ────────────────────────────────

// POST /api/agent/activate
// Body: { ownerPublicKey, signature }
// Returns: { token, agentPublicKey }
router.post("/activate", asyncHandler(async (req, res) => {
    const { ownerPublicKey, signature } = req.body || {};
    if (!verifyFreighterSignature(ownerPublicKey, signature)) {
        return res.status(401).json({ error: "Invalid Freighter signature." });
    }
    const agent = getAgent(req);
    if (!agent?.isConfigured()) {
        return res.status(503).json({ error: "Agent wallet not configured. Set AGENT_ENCRYPTION_KEY in .env." });
    }
    const wallet = await agent.getOrCreateWallet(ownerPublicKey);
    const token = jwt.sign({ ownerPublicKey }, JWT_SECRET, { expiresIn: JWT_TTL });
    res.json({ token, agentPublicKey: wallet.publicKey });
}));

// GET /api/agent/wallet — fetch agent public key (requires JWT)
router.get("/wallet", requireJwt, asyncHandler(async (req, res) => {
    const agent = getAgent(req);
    const wallet = await agent.getOrCreateWallet(req.agentSession.ownerPublicKey);
    res.json({ publicKey: wallet.publicKey });
}));

// ── All action routes require JWT only — no Freighter ────────────────────────

router.use(requireJwt);

const owner = (req) => req.agentSession.ownerPublicKey;

router.post("/sessions", asyncHandler(async (req, res) => {
    const { recipient, totalAmount, durationSeconds, metadata, assetCode, assetIssuer } = req.body;
    if (!recipient || !totalAmount || !durationSeconds) {
        return res.status(400).json({ error: "recipient, totalAmount, durationSeconds are required" });
    }
    const result = await getAgent(req).openSession({ owner: owner(req), recipient, totalAmount, durationSeconds, metadata, assetCode, assetIssuer });
    res.status(201).json({ code: "agent_session_opened", ...result });
}));

router.post("/sessions/:sessionId/claim", asyncHandler(async (req, res) => {
    const result = await getAgent(req).claimSession({ owner: owner(req), sessionId: req.params.sessionId });
    res.json({ code: "agent_session_claimed", ...result });
}));

router.post("/sessions/:sessionId/cancel", asyncHandler(async (req, res) => {
    const result = await getAgent(req).cancelSession({ owner: owner(req), sessionId: req.params.sessionId });
    res.json({ code: "agent_session_cancelled", ...result });
}));

router.post("/yield/claim", asyncHandler(async (req, res) => {
    const { tokenId } = req.body;
    if (!tokenId) return res.status(400).json({ error: "tokenId is required" });
    const result = await getAgent(req).claimYield({ owner: owner(req), tokenId });
    res.json({ code: "agent_yield_claimed", ...result });
}));

router.post("/yield/advance", asyncHandler(async (req, res) => {
    const { tokenId, amount } = req.body;
    if (!tokenId || !amount) return res.status(400).json({ error: "tokenId and amount are required" });
    const result = await getAgent(req).flashAdvance({ owner: owner(req), tokenId, amount });
    res.json({ code: "agent_yield_advanced", ...result });
}));

router.post("/assets/transfer", asyncHandler(async (req, res) => {
    const { tokenId, to } = req.body;
    if (!tokenId || !to) return res.status(400).json({ error: "tokenId and to are required" });
    const result = await getAgent(req).transferAsset({ owner: owner(req), tokenId, to });
    res.json({ code: "agent_asset_transferred", ...result });
}));

router.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
});

module.exports = router;
