import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const streamEngineMiddleware = require('../server/middleware/streamEngineMiddleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRuntimeConfig } = require('../utils/runtimeConfig');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the demo provider`);
  }
  return value;
}

const runtime = createRuntimeConfig();
const STELLASTREAM_ADDRESS =
  process.env.STREAM_ENGINE_CONTRACT_ADDRESS
  || process.env.STREAM_ENGINE_SESSION_METER_ADDRESS
  || runtime.contractAddress
  || 'stellar:session-meter';
const PAYMENT_TOKEN_ADDRESS =
  process.env.STREAM_ENGINE_PAYMENT_TOKEN_ADDRESS
  || runtime.paymentTokenAddress
  || 'stellar:usdc-sac';
const RECIPIENT_ADDRESS = requireEnv('STREAM_ENGINE_RECIPIENT_ADDRESS');
const SESSION_API_URL = process.env.STREAM_ENGINE_SESSION_API_URL || 'http://127.0.0.1:3001';
const PORT = Number(process.env.DEMO_PROVIDER_PORT || 3005);
const HOST = process.env.DEMO_PROVIDER_HOST || '127.0.0.1';

/**
 * Demo Provider: x402 paywall + stream validation
 *
 * This is the gatekeeper service:
 * 1. exposes protected API routes
 * 2. returns machine-readable HTTP 402 responses when payment is required
 * 3. validates active payment sessions before serving premium content
 */
const app = express();

app.use(cors());
app.use(express.json());

const config = {
  paymentTokenAddress: PAYMENT_TOKEN_ADDRESS,
  recipientAddress: RECIPIENT_ADDRESS,
  streamEngineContractAddress: STELLASTREAM_ADDRESS,
  runtimeKind: runtime.kind,
  sessionApiUrl: SESSION_API_URL,
  rpcUrl: runtime.rpcUrl,
  settlement: runtime.settlement,
  tokenSymbol: runtime.paymentTokenSymbol,
  tokenDecimals: runtime.paymentTokenDecimals,
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
console.log(`   Session meter: ${STELLASTREAM_ADDRESS}`);
console.log(`   Payment token: ${PAYMENT_TOKEN_ADDRESS}`);
console.log(`   Recipient: ${RECIPIENT_ADDRESS}`);
console.log(`   RPC URL: ${runtime.rpcUrl}`);
console.log(`   Token symbol: ${runtime.paymentTokenSymbol}`);
console.log(`   Session API: ${SESSION_API_URL}`);

app.use(streamEngineMiddleware(config));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), network: runtime.networkName });
});

app.get('/api/premium', (req: any, res) => {
  const streamId = req.streamEngine?.streamId || 'unknown';

  console.log(`Serving premium content for session #${streamId}`);

  res.json({
    success: true,
    data: `Premium content delivered through ${runtime.paymentTokenSymbol} payment sessions.`,
    streamId,
    timestamp: Date.now(),
    message: 'x402 signaled the paywall, and Stella\'s Stream Engine reused an active session to unlock this response.',
  });
});

app.get('/api/ai-insight', (req: any, res) => {
  const streamId = req.streamEngine?.streamId || 'unknown';
  const txHash = req.streamEngine?.txHash;

  console.log(`Serving AI insight for session #${streamId}`);

  res.json({
    success: true,
    insight: 'Paid access verified. Agent can continue without opening a new session for every request.',
    confidence: 0.87,
    streamId,
    paidWith: txHash || `session:${streamId}`,
    timestamp: Date.now(),
  });
});

app.get('/api/info', (_req, res) => {
  res.json({
    name: 'Stream Engine Demo Provider',
    version: '1.0.0',
    network: runtime.networkName,
    contracts: {
      stellaStream: STELLASTREAM_ADDRESS,
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
