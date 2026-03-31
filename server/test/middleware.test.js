const request = require('supertest');
const { expect } = require('chai');
const createApp = require('../index');

describe('x402 Middleware Integration', function () {
    let app;
    let sessions;

    beforeEach(() => {
        sessions = {
            "100": {
                id: "100",
                sender: "GTESTSENDER11111111111111111111111111111111111111111111111",
                recipient: "GSERVICERECIPIENT11111111111111111111111111111111111111",
                isActive: true,
                isFrozen: false,
            },
            "99": {
                id: "99",
                sender: "GTESTSENDER11111111111111111111111111111111111111111111111",
                recipient: "GSERVICERECIPIENT11111111111111111111111111111111111111",
                isActive: false,
                isFrozen: false,
            },
            "101": {
                id: "101",
                sender: "GTESTSENDER11111111111111111111111111111111111111111111111",
                recipient: "GOTHERRECIPIENT1111111111111111111111111111111111111111",
                isActive: true,
                isFrozen: false,
            },
            "102": {
                id: "102",
                sender: "GTESTSENDER11111111111111111111111111111111111111111111111",
                recipient: "GSERVICERECIPIENT11111111111111111111111111111111111111",
                isActive: true,
                isFrozen: true,
            },
        };

        const testConfig = {
            runtimeKind: "stellar",
            sorobanRpcUrl: "https://soroban-testnet.stellar.org",
            streamEngineContractAddress: "stellar:session-meter",
            paymentTokenAddress: "stellar:usdc-sac",
            tokenSymbol: "USDC",
            tokenDecimals: 7,
            recipientAddress: "GSERVICERECIPIENT11111111111111111111111111111111111111",
            settlement: "soroban-sac",
            sessionApiUrl: "http://localhost:3001",
            services: {
                chainService: {
                    async getSessionSnapshot(id) {
                        const normalizedId = String(id);
                        if (normalizedId === "0") {
                            throw new Error("RPC Error");
                        }
                        return sessions[normalizedId] || null;
                    },
                },
            },
            routes: {
                '/api/free': {
                    price: '0',
                    mode: 'free'
                },
                '/api/weather': {
                    price: '0.0001',
                    mode: 'streaming'
                },
                '/api/premium': {
                    price: '1.0',
                    mode: 'per-request'
                }
            }
        };

        app = createApp(testConfig);
    });

    describe('Public Routes', function () {
        it('should allow access to public routes without payment', async function () {
            const res = await request(app).get('/api/free');
            expect(res.status).to.equal(200);
            expect(res.body.message).to.equal("This is free content.");
        });
    });

    describe('Protected Routes (No Payment)', function () {
        it('should return 402 for protected route without headers', async function () {
            const res = await request(app).get('/api/weather');
            expect(res.status).to.equal(402);
            expect(res.header['x-payment-required']).to.equal('true');
            expect(res.header['x-stream-mode']).to.equal('streaming');
            expect(res.header['x-stream-rate']).to.equal('0.0001');
            expect(res.header['x-stream-token']).to.equal('stellar:usdc-sac');
            expect(res.header['x-payment-currency']).to.equal('USDC');
            expect(res.header['x-stream-recipient']).to.equal('GSERVICERECIPIENT11111111111111111111111111111111111111');
            expect(res.header['x-stream-settlement']).to.equal('soroban-sac');
            expect(res.body.requirements).to.exist;
            expect(res.body.requirements.recipient).to.equal('GSERVICERECIPIENT11111111111111111111111111111111111111');
            expect(res.body.requirements.currency).to.equal('USDC');
        });

        it('should return 402 for premium route with correct pricing', async function () {
            const res = await request(app).get('/api/premium');
            expect(res.status).to.equal(402);
            expect(res.header['x-stream-mode']).to.equal('per-request');
            expect(res.header['x-stream-rate']).to.equal('1.0');
        });
    });

    describe('Protected Routes (With Payment)', function () {
        it('should return 200 for valid active stream', async function () {
            const res = await request(app)
                .get('/api/weather')
                .set('X-Stream-Stream-ID', '100');

            expect(res.status).to.equal(200);
            expect(res.body.paidWithStream).to.equal('100');
        });

        it('should return 402 for inactive stream', async function () {
            const res = await request(app)
                .get('/api/weather')
                .set('X-Stream-Stream-ID', '99');

            expect(res.status).to.equal(402);
            expect(res.body.error).to.equal("Session is inactive");
            expect(res.body.code).to.equal("session_not_active");
        });

        it('should return 402 for frozen session', async function () {
            const res = await request(app)
                .get('/api/weather')
                .set('X-Stream-Stream-ID', '102');

            expect(res.status).to.equal(402);
            expect(res.body.error).to.equal("Session is frozen");
            expect(res.body.code).to.equal("session_frozen");
        });

        it('should return 402 for recipient mismatch', async function () {
            const res = await request(app)
                .get('/api/weather')
                .set('X-Stream-Stream-ID', '101');

            expect(res.status).to.equal(402);
            expect(res.body.error).to.equal("Session recipient mismatch");
            expect(res.body.code).to.equal("session_recipient_mismatch");
        });

        it('should fallback to 402/Requirements on system error', async function () {
            const res = await request(app)
                .get('/api/weather')
                .set('X-Stream-Stream-ID', '0'); // triggers throw in mock

            expect(res.status).to.equal(402);
            expect(res.body.requirements).to.exist;
        });
    });
});
