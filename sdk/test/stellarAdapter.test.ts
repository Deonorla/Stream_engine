import { expect } from 'chai';
import express from 'express';
import { Server } from 'http';
import { StreamEngineStellarAdapter } from '../src/StreamEngineStellarAdapter';

describe('StreamEngineStellarAdapter', function () {
    this.timeout(5000);

    const sender = 'GDAPF45OAUCQTA2274ZKGBCUIZGG44CJPOHXDFJEM6FAOOTFRZZXAGTK';
    const recipient = 'GCI4OKCKDRFMYEB2J4KGC25ZH3NGNQDVCUIJFCZTTFYUKYHMANQYZ5QF';
    const assetIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    const port = 3017;
    const baseUrl = `http://127.0.0.1:${port}`;

    let server: Server;
    let syncedPayload: any = null;

    before((done) => {
        const app = express();
        app.use(express.json());

        app.post('/api/sessions', (req, res) => {
            res.status(201).json({
                code: 'session_opened',
                streamId: '42',
                txHash: 'stellar-open-42',
                session: {
                    id: 42,
                    sender: req.body.sender,
                    recipient: req.body.recipient,
                    startTime: 1712000000,
                    stopTime: 1712003600,
                    sessionStatus: 'active',
                    sessionStatusLabel: 'Active',
                },
            });
        });

        app.post('/api/sessions/42/metadata', (req, res) => {
            syncedPayload = req.body;
            res.json({
                code: 'session_metadata_synced',
                session: {
                    id: 42,
                    sender: req.body.sender,
                    recipient: req.body.recipient,
                    startTime: 1712000000,
                    stopTime: 1712003600,
                    sessionStatus: 'active',
                    sessionStatusLabel: 'Active',
                    refundableAmount: '9000000',
                    consumedAmount: '1000000',
                    linkedAssetTokenId: 7,
                    linkedAssetName: 'Lagos Rental Asset',
                    linkedAssetType: 'real_estate',
                    assetCode: req.body.assetCode,
                    assetIssuer: req.body.assetIssuer,
                },
            });
        });

        app.get('/api/sessions', (_req, res) => {
            res.json({
                sessions: [
                    {
                        id: 42,
                        sender,
                        recipient,
                        sessionStatus: 'active',
                        sessionStatusLabel: 'Active',
                        refundableAmount: '9000000',
                        consumedAmount: '1000000',
                        linkedAssetTokenId: 7,
                    },
                ],
            });
        });

        app.get('/api/sessions/42', (_req, res) => {
            res.json({
                session: {
                    id: 42,
                    sender,
                    recipient,
                    sessionStatus: 'active',
                    sessionStatusLabel: 'Active',
                    refundableAmount: '9000000',
                    consumedAmount: '1000000',
                    linkedAssetTokenId: 7,
                },
            });
        });

        server = app.listen(port, done);
    });

    after((done) => {
        server.close(done);
    });

    beforeEach(() => {
        syncedPayload = null;
    });

    it('syncs session metadata after opening and exposes session inspection helpers', async () => {
        const adapter = new StreamEngineStellarAdapter({
            apiBaseUrl: baseUrl,
            senderAddress: sender,
        });

        const metadata = JSON.stringify({
            type: 'SDK_AUTO',
            target: 'http://example.com/api/premium',
            paymentAssetCode: 'USDC',
            paymentAssetIssuer: assetIssuer,
            assetTokenId: 7,
        });

        const result = await adapter.createStream(
            'stellar:session-meter',
            recipient,
            3600,
            10_000_000n,
            metadata,
            [],
        );

        expect(result.streamId).to.equal('42');
        expect(result.txHash).to.equal('stellar-open-42');
        expect((result.session as any)?.sessionStatus).to.equal('active');
        expect(syncedPayload).to.include({
            sender,
            recipient,
            assetCode: 'USDC',
            assetIssuer,
            txHash: 'stellar-open-42',
            fundingTxHash: 'stellar-open-42',
        });

        const sessions = await adapter.listSessions!(sender);
        expect(sessions).to.have.length(1);
        expect((sessions[0] as any).linkedAssetTokenId).to.equal(7);

        const session = await adapter.getSession!('42');
        expect((session as any)?.refundableAmount).to.equal('9000000');
        expect((session as any)?.consumedAmount).to.equal('1000000');
    });
});
