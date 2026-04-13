/**
 * MppAgentClient — wraps ContinuumAgentClient with @stellar/mpp auto-payment.
 *
 * When a premium Continuum API route returns 402, this client automatically
 * builds and signs a Soroban SAC USDC transfer and retries the request.
 * No manual payment session management needed.
 *
 * Usage:
 *   const client = new MppAgentClient({
 *     apiBaseUrl: 'http://localhost:3001',
 *     stellarSecretKey: 'S...',
 *   });
 *   await client.ensureAgent('G...');
 *   const assets = await client.listMarketAssets(); // auto-pays 402 if needed
 */

import { ContinuumAgentClient, ContinuumAgentClientConfig } from './ContinuumAgentClient';

export interface MppAgentClientConfig extends ContinuumAgentClientConfig {
    /** Stellar secret key (S...) used to sign MPP payments */
    stellarSecretKey: string;
    /** MPP payment mode: 'pull' (server broadcasts) or 'push' (client broadcasts) */
    mppMode?: 'pull' | 'push';
    /** Progress callback for MPP payment events */
    onMppPayment?: (event: { type: string; amount?: string; path?: string }) => void;
}

export class MppAgentClient extends ContinuumAgentClient {
    private mppEnabled = false;
    private mppConfig: MppAgentClientConfig;

    constructor(config: MppAgentClientConfig) {
        super(config);
        this.mppConfig = config;
        this.initMpp();
    }

    private initMpp() {
        const secretKey = this.mppConfig.stellarSecretKey;
        if (!secretKey) {
            console.warn('[MppAgentClient] No stellarSecretKey provided — MPP auto-payment disabled');
            return;
        }

        try {
            // Dynamic require so this works in Node.js environments
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { Mppx } = require('mppx/client');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { stellar } = require('@stellar/mpp/charge/client');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { Keypair } = require('@stellar/stellar-sdk');

            const keypair = Keypair.fromSecret(secretKey);

            // Polyfill global fetch with MPP auto-payment handling.
            // Any fetch() call that receives a 402 will automatically:
            // 1. Parse the MPP challenge from response headers
            // 2. Build and sign a Soroban SAC USDC transfer
            // 3. Retry the original request with the signed credential
            Mppx.create({
                methods: [
                    stellar.charge({
                        keypair,
                        mode: this.mppConfig.mppMode || 'pull',
                        onProgress: (event: { type: string }) => {
                            this.mppConfig.onMppPayment?.({
                                type: event.type,
                            });
                        },
                    }),
                ],
            });

            this.mppEnabled = true;
            console.log(`[MppAgentClient] MPP auto-payment enabled for ${keypair.publicKey().slice(0, 8)}...`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[MppAgentClient] Could not initialize MPP client:', msg);
        }
    }

    isMppEnabled(): boolean {
        return this.mppEnabled;
    }
}
