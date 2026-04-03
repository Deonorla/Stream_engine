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

// POST /api/agent/wallet-restore — silent restore on login, never creates a new wallet
router.post("/wallet-restore", asyncHandler(async (req, res) => {
    const { ownerPublicKey } = req.body || {};
    if (!ownerPublicKey || !StrKey.isValidEd25519PublicKey(String(ownerPublicKey))) {
        return res.status(400).json({ error: "Valid ownerPublicKey is required." });
    }
    const agent = getAgent(req);
    const wallet = await agent.getWallet(ownerPublicKey);
    if (!wallet) return res.status(404).json({ error: "No agent wallet found." });
    const token = jwt.sign({ ownerPublicKey }, JWT_SECRET, { expiresIn: JWT_TTL });
    res.json({ token, agentPublicKey: wallet.publicKey });
}));

// POST /api/agent/activate
router.post("/activate", asyncHandler(async (req, res) => {
    const { ownerPublicKey } = req.body || {};
    if (!ownerPublicKey || !StrKey.isValidEd25519PublicKey(String(ownerPublicKey))) {
        return res.status(400).json({ error: "Valid ownerPublicKey is required." });
    }
    const agent = getAgent(req);
    if (!agent?.isConfigured()) {
        return res.status(503).json({ error: "Agent wallet not configured. Set AGENT_ENCRYPTION_KEY in .env." });
    }
    const wallet = await agent.getOrCreateWallet(ownerPublicKey);

    // Trustline is set up separately via POST /api/agent/trustline
    // (requires XLM on the account first — can't be done at creation time)

    const token = jwt.sign({ ownerPublicKey }, JWT_SECRET, { expiresIn: JWT_TTL });
    res.json({ token, agentPublicKey: wallet.publicKey });
}));

// GET /api/agent/wallet — fetch agent public key (requires JWT)
router.get("/wallet", requireJwt, asyncHandler(async (req, res) => {
    const agent = getAgent(req);
    const wallet = await agent.getWallet(req.agentSession.ownerPublicKey);
    if (!wallet) return res.status(404).json({ error: "No agent wallet found." });
    res.json({ publicKey: wallet.publicKey });
}));

// ── All action routes require JWT only — no Freighter ────────────────────────

router.use(requireJwt);

const owner = (req) => req.agentSession.ownerPublicKey;

// POST /api/agent/trustline
router.post("/trustline", asyncHandler(async (req, res) => {
    const { assetCode, assetIssuer } = req.body;
    if (!assetCode || !assetIssuer) return res.status(400).json({ error: "assetCode and assetIssuer are required" });
    const result = await getAgent(req).setupTrustline({ owner: owner(req), assetCode, assetIssuer });
    res.json({ code: "trustline_created", ...result });
}));

// POST /api/agent/withdraw — send funds from agent wallet back to owner
router.post("/withdraw", asyncHandler(async (req, res) => {
    const { assetCode, assetIssuer, amount } = req.body;
    if (!assetCode || !amount) return res.status(400).json({ error: "assetCode and amount are required" });
    // destination is always the authenticated owner's Freighter address
    const destination = owner(req);
    const result = await getAgent(req).withdraw({ owner: destination, destination, assetCode, assetIssuer: assetIssuer || "", amount });
    res.json({ code: "agent_withdrawal_complete", txHash: result.txHash, destination, amount, assetCode });
}));

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
