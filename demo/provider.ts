import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const flowPayMiddleware = require('../server/middleware/flowPayMiddleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createFlowPayRuntimeConfig } = require('../utils/polkadot');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the demo provider`);
  }
  return value;
}

const runtime = createFlowPayRuntimeConfig();
const FLOWPAYSTREAM_ADDRESS = requireEnv('FLOWPAY_CONTRACT_ADDRESS');
const PAYMENT_TOKEN_ADDRESS = requireEnv('FLOWPAY_PAYMENT_TOKEN_ADDRESS');
const RECIPIENT_ADDRESS = requireEnv('FLOWPAY_RECIPIENT_ADDRESS');
const PORT = Number(process.env.DEMO_PROVIDER_PORT || 3005);
const HOST = process.env.DEMO_PROVIDER_HOST || '127.0.0.1';

/**
 * Demo Provider: x402 paywall + stream validation
 *
 * This is the gatekeeper service:
 * 1. exposes protected API routes
 * 2. returns machine-readable HTTP 402 responses when payment is required
 * 3. validates active streams onchain before serving premium content
 */
const app = express();

app.use(cors());
app.use(express.json());

const config = {
  paymentTokenAddress: PAYMENT_TOKEN_ADDRESS,
  recipientAddress: RECIPIENT_ADDRESS,
  flowPayContractAddress: FLOWPAYSTREAM_ADDRESS,
  rpcUrl: runtime.rpcUrl,
  tokenSymbol: runtime.paymentTokenSymbol,
  tokenDecimals: runtime.paymentTokenDecimals,
  useSubstrateReads:
    process.env.FLOWPAY_USE_SUBSTRATE_READS === 'true'
    || process.env.FLOWPAY_USE_SUBSTRATE_WRITES === 'true',
  routes: {
    '/api/premium': {
      mode: 'streaming',
      price: process.env.DEMO_PREMIUM_RATE || '0.0001',
    },
    '/api/ai-insight': {
      mode: 'streaming',
      price: process.env.DEMO_AI_INSIGHT_RATE || '0.001',
    },
  },
};

console.log('Provider configuration:');
console.log(`   Network: ${runtime.networkName}`);
console.log(`   Stream contract: ${FLOWPAYSTREAM_ADDRESS}`);
console.log(`   Payment token: ${PAYMENT_TOKEN_ADDRESS}`);
console.log(`   Recipient: ${RECIPIENT_ADDRESS}`);
console.log(`   RPC URL: ${runtime.rpcUrl}`);
console.log(`   Token symbol: ${runtime.paymentTokenSymbol}`);

app.use(flowPayMiddleware(config));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), network: runtime.networkName });
});

app.get('/api/premium', (req: any, res) => {
  const streamId = req.flowPay?.streamId || 'unknown';

  console.log(`Serving premium content for stream #${streamId}`);

  res.json({
    success: true,
    data: `Premium content delivered through ${runtime.paymentTokenSymbol} payment streaming.`,
    streamId,
    timestamp: Date.now(),
    message: 'x402 signaled the paywall, and Stream Engine reused an active stream to unlock this response.',
  });
});

app.get('/api/ai-insight', (req: any, res) => {
  const streamId = req.flowPay?.streamId || 'unknown';
  const txHash = req.flowPay?.txHash;

  console.log(`Serving AI insight for stream #${streamId}`);

  res.json({
    success: true,
    insight: 'Paid access verified. Agent can continue without opening a new stream for every request.',
    confidence: 0.87,
    streamId,
    paidWith: txHash || `stream:${streamId}`,
    timestamp: Date.now(),
  });
});

app.get('/api/info', (_req, res) => {
  res.json({
    name: 'Stream Engine Demo Provider',
    version: '1.0.0',
    network: runtime.networkName,
    contracts: {
      flowPayStream: FLOWPAYSTREAM_ADDRESS,
      paymentToken: PAYMENT_TOKEN_ADDRESS,
    },
    protectedRoutes: [
      { path: '/api/premium', price: `${config.routes['/api/premium'].price} ${runtime.paymentTokenSymbol}/sec`, mode: 'streaming' },
      { path: '/api/ai-insight', price: `${config.routes['/api/ai-insight'].price} ${runtime.paymentTokenSymbol}/sec`, mode: 'streaming' },
    ],
    model: {
      x402: 'HTTP 402 paywall signaling and payment terms',
      settlement: 'Stream Engine reusable stream authorization',
    },
  });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`\nStream Engine demo provider running on http://${HOST}:${PORT}`);
    console.log('\nAvailable endpoints:');
    console.log('   GET /health          - Health check (free)');
    console.log('   GET /api/info        - API info (free)');
    console.log(`   GET /api/premium     - Premium content (${config.routes['/api/premium'].price} ${runtime.paymentTokenSymbol}/sec)`);
    console.log(`   GET /api/ai-insight  - AI insights (${config.routes['/api/ai-insight'].price} ${runtime.paymentTokenSymbol}/sec)`);
    console.log('\nTo test, run the consumer in another terminal:');
    console.log('   npx ts-node --project demo/tsconfig.json demo/consumer.ts');
  });
}

export default app;
