import { StreamEngineSDK } from '../sdk/src/StreamEngineSDK';
import { StreamEngineStellarAdapter } from '../sdk/src/StreamEngineStellarAdapter';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRuntimeConfig } = require('../utils/runtimeConfig');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the demo consumer`);
  }
  return value;
}

async function runDemo() {
  const runtime = createRuntimeConfig();
  const targetUrl = process.env.DEMO_TARGET_URL || 'http://127.0.0.1:3005/api/premium';
  const senderAddress = requireEnv('DEMO_STELLAR_SENDER');
  const sessionApiUrl = process.env.STREAM_ENGINE_SESSION_API_URL || 'http://127.0.0.1:3001';

  console.log('Starting Stella\'s Stream Engine demo consumer...\n');
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Network: ${runtime.networkName}`);
  console.log(`Payment token: ${runtime.paymentTokenSymbol}`);
  console.log(`Stellar sender: ${senderAddress}`);
  console.log(`Session API: ${sessionApiUrl}`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not found. The SDK will use fallback heuristics for payment strategy.');
  }

  const adapter = new StreamEngineStellarAdapter({
    apiBaseUrl: sessionApiUrl,
    senderAddress,
  });

  const sdk = new StreamEngineSDK({
    rpcUrl: runtime.rpcUrl,
    agentId: 'stream-engine-demo-agent',
    adapter,
    token: {
      symbol: runtime.paymentTokenSymbol,
      decimals: runtime.paymentTokenDecimals,
    },
    spendingLimits: {
      dailyLimit: ethers.parseUnits('100', runtime.paymentTokenDecimals),
      totalLimit: ethers.parseUnits('1000', runtime.paymentTokenDecimals),
    },
  });

  console.log('\n[Step 1] Initial paid request');
  console.log('This should trigger the x402 flow, create or reuse a session, then retry automatically.\n');

  const firstResponse = await sdk.makeRequest(targetUrl);
  console.log('Request succeeded.');
  console.log(JSON.stringify(firstResponse.data, null, 2));

  const firstSessions = await sdk.listSessions(senderAddress);
  const latestSession = Array.isArray(firstSessions) && firstSessions.length > 0
    ? firstSessions[firstSessions.length - 1]
    : null;
  if (latestSession) {
    console.log('\nLive session snapshot after first request:');
    console.log(JSON.stringify(latestSession, null, 2));
  }

  console.log('\n[Step 2] Follow-up paid request');
  console.log('This should reuse the active session instead of opening a new one.\n');

  const secondResponse = await sdk.makeRequest(targetUrl);
  console.log('Second request succeeded.');
  console.log(JSON.stringify(secondResponse.data, null, 2));

  if (latestSession && (latestSession as any).id) {
    const refreshedSession = await sdk.getSession(String((latestSession as any).id));
    console.log('\nRefreshed session snapshot after reuse:');
    console.log(JSON.stringify(refreshedSession, null, 2));
    console.log('\nCached SDK view of the same session:');
    console.log(JSON.stringify(sdk.getStreamDetails(String((latestSession as any).id)), null, 2));
  }

  console.log('\nDemo complete.');
}

runDemo().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
