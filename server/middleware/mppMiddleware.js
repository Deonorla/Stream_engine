'use strict';

/**
 * MPP (Machine Payments Protocol) middleware for Continuum.
 * Uses @stellar/mpp/charge/server to gate premium API routes.
 *
 * This is the official Stellar MPP implementation — agents that call
 * these routes must pay via a Soroban SAC transfer (USDC on testnet).
 *
 * Compatible with the existing streamEngineMiddleware — both can coexist.
 * MPP takes precedence when MPP_SECRET_KEY is configured.
 */

let mppMiddlewareInstance = null;

function buildMppMiddleware(config = {}) {
    const secretKey = config.mppSecretKey || process.env.MPP_SECRET_KEY;
    const recipient = config.recipientAddress || process.env.STELLAR_OPERATOR_PUBLIC_KEY || process.env.STELLAR_PLATFORM_ADDRESS;
    const network = config.network || process.env.STELLAR_NETWORK || 'stellar:testnet';

    // Disable in test environment to avoid interfering with existing test suites
    if (process.env.NODE_ENV === 'test' || !secretKey || !recipient) {
        return (req, res, next) => next();
    }

    try {
        const { Mppx } = require('mppx/server');
        const { stellar } = require('@stellar/mpp/charge/server');
        const { USDC_SAC_TESTNET, USDC_SAC_MAINNET } = require('@stellar/mpp');

        const currency = network === 'stellar:mainnet' ? USDC_SAC_MAINNET : USDC_SAC_TESTNET;

        const mppx = Mppx.create({
            secretKey,
            methods: [
                stellar.charge({
                    recipient,
                    currency,
                    network,
                }),
            ],
        });

        console.log(`[MPP] Middleware active — recipient ${recipient.slice(0, 8)}... network ${network}`);

        // Routes and their prices (in USDC)
        const MPP_ROUTES = {
            '/api/rwa/assets/analytics': '0.10',
            '/api/market/assets': '0.05',
            '/api/rwa/relay': '0.05',
            '/api/market/treasury/rebalance': '0.02',
        };

        return async (req, res, next) => {
            const price = MPP_ROUTES[req.path]
                || Object.entries(MPP_ROUTES).find(([k]) => req.path.startsWith(k))?.[1];

            if (!price) return next();

            // Convert Node IncomingMessage → Web Request for mppx
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
                if (value == null) continue;
                if (Array.isArray(value)) {
                    for (const v of value) headers.append(key, v);
                } else {
                    headers.set(key, value);
                }
            }
            const webReq = new Request(`http://localhost${req.url}`, {
                method: req.method,
                headers,
            });

            try {
                const result = await mppx.charge({
                    amount: price,
                    description: `Continuum premium: ${req.path}`,
                })(webReq);

                if (result.status === 402) {
                    // If the request already has a stream session header, let it through
                    // (existing streamEngineMiddleware will validate it)
                    if (req.headers['x-stream-stream-id'] || req.headers['x-stream-tx-hash']) {
                        return next();
                    }
                    const challenge = result.challenge;
                    challenge.headers.forEach((value, key) => res.setHeader(key, value));
                    return res.status(402).send(await challenge.text());
                }

                // Payment verified — attach receipt info and continue
                req.mppPayment = { verified: true, amount: price, path: req.path };
                return next();
            } catch (err) {
                console.error('[MPP] Middleware error:', err?.message);
                return next(); // fail open — don't block on MPP errors
            }
        };
    } catch (err) {
        console.warn('[MPP] Could not load @stellar/mpp — falling back to streamEngineMiddleware:', err?.message);
        return (req, res, next) => next();
    }
}

function getMppMiddleware(config = {}) {
    if (!mppMiddlewareInstance) {
        mppMiddlewareInstance = buildMppMiddleware(config);
    }
    return mppMiddlewareInstance;
}

module.exports = { getMppMiddleware, buildMppMiddleware };
