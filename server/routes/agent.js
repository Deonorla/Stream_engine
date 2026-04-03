const express = require("express");
const { Keypair, StrKey } = require("@stellar/stellar-sdk");
const { screenAssets, parseGoal } = require("../services/assetScreener");
const { generateDueDiligence, aggregateMarketIntel, monitorRisks } = require("../services/assetIntelligence");
const { createBid, getBid, respondToBid, listBidsForAsset, indexBid } = require("../services/bidEngine");
const { buildPortfolio, computeRebalanceActions } = require("../services/portfolioManager");
const { checkCompliance } = require("../services/complianceChecker");
const { createMandate, matchMandate } = require("../services/mandateProtocol");
const router = express.Router();

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

async function getAgentAuth(req) {
    const services = await req.app.locals.ready;
    return req.app.locals.agentAuth || services.agentAuth;
}

const requireJwt = asyncHandler(async (req, _res, next) => {
    req.agentSession = await (await getAgentAuth(req)).verifyRequest(req);
    next();
});

async function resolveOwner(req, { requireAuth = false } = {}) {
    return (await getAgentAuth(req)).resolveOwnerPublicKey(req, { requireAuth });
}

function getAgent(req) {
    return req.app.locals.agentWallet;
}

// ── Activation (one-time Freighter signature) ────────────────────────────────

// POST /api/agent/wallet-restore — silent restore on login, never creates a new wallet
router.post("/wallet-restore", asyncHandler(async (req, res) => {
    const { ownerPublicKey, session } = await resolveOwner(req);
    const agent = getAgent(req);
    const wallet = await agent.getWallet(ownerPublicKey);
    if (!wallet) return res.status(404).json({ error: "No agent wallet found." });
    if (req.app.locals.services?.agentState) {
        await req.app.locals.services.agentState.ensureAgentProfile({
            ownerPublicKey,
            agentPublicKey: wallet.publicKey,
        });
    }
    const token = (await getAgentAuth(req)).signLocalSession({
        ownerPublicKey,
        authProvider: session?.authProvider || "local",
        authSubject: session?.authSubject || "",
    });
    res.json({ token, agentPublicKey: wallet.publicKey, agentId: wallet.publicKey, authProvider: session?.authProvider || "local" });
}));

// POST /api/agent/activate
router.post("/activate", asyncHandler(async (req, res) => {
    const { ownerPublicKey, session } = await resolveOwner(req);
    const agent = getAgent(req);
    if (!agent?.isConfigured()) {
        return res.status(503).json({ error: "Agent wallet not configured. Set AGENT_ENCRYPTION_KEY in .env." });
    }
    const wallet = await agent.getOrCreateWallet(ownerPublicKey);
    if (req.app.locals.services?.agentState) {
        await req.app.locals.services.agentState.ensureAgentProfile({
            ownerPublicKey,
            agentPublicKey: wallet.publicKey,
        });
    }

    // Trustline is set up separately via POST /api/agent/trustline
    // (requires XLM on the account first — can't be done at creation time)

    const token = (await getAgentAuth(req)).signLocalSession({
        ownerPublicKey,
        authProvider: session?.authProvider || "local",
        authSubject: session?.authSubject || "",
    });
    res.json({ token, agentPublicKey: wallet.publicKey, agentId: wallet.publicKey, authProvider: session?.authProvider || "local" });
}));

// GET /api/agent/wallet — fetch agent public key (requires JWT)
router.get("/wallet", requireJwt, asyncHandler(async (req, res) => {
    const agent = getAgent(req);
    const wallet = await agent.getWallet(req.agentSession.ownerPublicKey);
    if (!wallet) return res.status(404).json({ error: "No agent wallet found." });
    res.json({ publicKey: wallet.publicKey, agentId: wallet.publicKey });
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

// POST /api/agent/screen — screen marketplace assets against criteria or a natural-language goal
router.post("/screen", asyncHandler(async (req, res) => {
    const { goal, criteria = {} } = req.body || {};
    const services = req.app.locals.services;
    if (!services) return res.status(503).json({ error: "Services not ready." });

    const resolvedCriteria = goal ? { ...parseGoal(goal), ...criteria } : criteria;

    const rawAssets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ limit: 200 })
        : await services.store.listAssets();

    const results = screenAssets(rawAssets, resolvedCriteria);

    res.json({
        code: "screen_complete",
        goal: goal || null,
        criteria: resolvedCriteria,
        total: rawAssets.length,
        matched: results.length,
        assets: results.map(({ asset: _a, ...r }) => r),
    });
}));

router.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
});

// POST /api/agent/diligence/:tokenId — Gemini-powered due diligence on a single asset
router.post("/diligence/:tokenId", asyncHandler(async (req, res) => {
    const services = req.app.locals.services;
    const asset = await services.chainService?.getAssetSnapshot(Number(req.params.tokenId))
        || await services.store.getAsset(req.params.tokenId);
    if (!asset) return res.status(404).json({ error: "Asset not found." });
    const report = await generateDueDiligence(asset, process.env.GEMINI_API_KEY);
    res.json({ code: "diligence_complete", tokenId: Number(req.params.tokenId), ...report });
}));

// GET /api/agent/market-intel — aggregated market intelligence
router.get("/market-intel", asyncHandler(async (req, res) => {
    const services = req.app.locals.services;
    const assets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ limit: 200 })
        : await services.store.listAssets();
    const intel = aggregateMarketIntel(assets);
    const alerts = monitorRisks(assets);
    res.json({ code: "market_intel", ...intel, alerts });
}));

// GET /api/agent/risk-monitor — risk alerts across all assets
router.get("/risk-monitor", asyncHandler(async (req, res) => {
    const services = req.app.locals.services;
    const assets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ limit: 200 })
        : await services.store.listAssets();
    const alerts = monitorRisks(assets);
    res.json({ code: "risk_monitor", alerts, scanned: assets.length });
}));

// ── Bids ─────────────────────────────────────────────────────────────────────

// POST /api/agent/bids — place a bid on an asset
router.post("/bids", asyncHandler(async (req, res) => {
    const { tokenId, amount, assetCode, expiresIn, note } = req.body;
    if (!tokenId || !amount) return res.status(400).json({ error: "tokenId and amount are required" });
    const services = req.app.locals.services;
    const bid = await createBid(services.store, { tokenId, bidder: owner(req), amount, assetCode, expiresIn, note });
    await indexBid(services.store, tokenId, bid.bidId);
    res.status(201).json({ code: "bid_placed", bid });
}));

// GET /api/agent/bids/:tokenId — list bids for an asset
router.get("/bids/:tokenId", asyncHandler(async (req, res) => {
    const services = req.app.locals.services;
    const bids = await listBidsForAsset(services.store, req.params.tokenId);
    res.json({ code: "bids_listed", bids });
}));

// POST /api/agent/bids/:bidId/respond — accept, reject, or counter a bid
router.post("/bids/:bidId/respond", asyncHandler(async (req, res) => {
    const { action, counterAmount, note } = req.body;
    if (!action) return res.status(400).json({ error: "action is required (accept|reject|counter)" });
    const services = req.app.locals.services;
    const bid = await respondToBid(services.store, req.params.bidId, { responder: owner(req), action, counterAmount, note });
    res.json({ code: `bid_${action}ed`, bid });
}));

// ── Portfolio ─────────────────────────────────────────────────────────────────

// GET /api/agent/portfolio — current portfolio snapshot
router.get("/portfolio", asyncHandler(async (req, res) => {
    const services = req.app.locals.services;
    const sessions = await services.chainService.listSessions({ owner: owner(req) });
    const ownedAssets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ owner: owner(req) })
        : await services.store.listAssets({ owner: owner(req) });
    const portfolio = buildPortfolio(sessions, ownedAssets);
    res.json({ code: "portfolio_snapshot", ...portfolio });
}));

// POST /api/agent/rebalance — compute rebalance actions against a mandate
router.post("/rebalance", asyncHandler(async (req, res) => {
    const { mandate = {} } = req.body || {};
    const services = req.app.locals.services;
    const [sessions, allAssets, ownedAssets] = await Promise.all([
        services.chainService.listSessions({ owner: owner(req) }),
        services.chainService?.isConfigured?.()
            ? services.chainService.listAssetSnapshots({ limit: 200 })
            : services.store.listAssets(),
        services.chainService?.isConfigured?.()
            ? services.chainService.listAssetSnapshots({ owner: owner(req) })
            : services.store.listAssets({ owner: owner(req) }),
    ]);
    const portfolio = buildPortfolio(sessions, ownedAssets);
    const actions = computeRebalanceActions(portfolio, allAssets, mandate);
    res.json({ code: "rebalance_computed", portfolio: portfolio.summary, actions });
}));

// ── Compliance ────────────────────────────────────────────────────────────────

// POST /api/agent/compliance/check — pre-execution compliance gate
router.post("/compliance/check", asyncHandler(async (req, res) => {
    const { tokenId, action = 'trade' } = req.body || {};
    if (!tokenId) return res.status(400).json({ error: "tokenId is required" });
    const services = req.app.locals.services;
    const asset = await services.chainService?.getAssetSnapshot(Number(tokenId))
        || await services.store.getAsset(tokenId);
    if (!asset) return res.status(404).json({ error: "Asset not found." });
    const result = await checkCompliance(services.chainService, {
        walletAddress: owner(req),
        asset,
        action,
    });
    res.json({ code: "compliance_checked", ...result });
}));

// ── Mandates ──────────────────────────────────────────────────────────────────

// POST /api/agent/mandates — publish a buy or sell mandate
router.post("/mandates", asyncHandler(async (req, res) => {
    const { type, criteria, priceRange, maxDuration, note, ttl } = req.body || {};
    if (!type || !['buy', 'sell'].includes(type)) {
        return res.status(400).json({ error: "type must be 'buy' or 'sell'" });
    }
    const services = req.app.locals.services;
    const mandate = createMandate({ agentPublicKey: owner(req), type, criteria, priceRange, maxDuration, note, ttl });
    await services.store.upsertRecord(`mandate:${mandate.mandateId}`, mandate);
    // Index by agent
    const idx = await services.store.getRecord(`mandate-index:${owner(req)}`) || { ids: [] };
    idx.ids.push(mandate.mandateId);
    await services.store.upsertRecord(`mandate-index:${owner(req)}`, idx);
    res.status(201).json({ code: "mandate_published", mandate });
}));

// GET /api/agent/mandates/match — find assets and counterpart agents matching your buy mandate
router.get("/mandates/match", asyncHandler(async (req, res) => {
    const services = req.app.locals.services;
    // Get caller's active buy mandate (most recent)
    const idx = await services.store.getRecord(`mandate-index:${owner(req)}`) || { ids: [] };
    const mandates = (await Promise.all(idx.ids.map(id => services.store.getRecord(`mandate:${id}`)))).filter(Boolean);
    const buyMandate = mandates.filter(m => m.type === 'buy' && m.status === 'active').pop();
    if (!buyMandate) return res.status(404).json({ error: "No active buy mandate found. Create one first." });

    const assets = services.chainService?.isConfigured?.()
        ? await services.chainService.listAssetSnapshots({ limit: 200 })
        : await services.store.listAssets();

    // Gather all sell mandates from other agents (simple scan — production would use an index)
    const result = matchMandate(buyMandate, assets, []);
    res.json({ code: "mandate_matched", mandate: buyMandate, ...result });
}));

router.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
});

module.exports = router;
