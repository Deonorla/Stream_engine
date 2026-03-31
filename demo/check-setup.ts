/**
 * Quick setup verification script
 * Run: npx ts-node --project demo/tsconfig.json demo/check-setup.ts
 */
import * as dotenv from 'dotenv';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRuntimeConfig } = require('../utils/runtimeConfig');

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function checkSetup() {
  const runtime = createRuntimeConfig();

  console.log("Stella's Stream Engine demo setup check\n");

  console.log('1. Environment');
  console.log(`   STREAM_ENGINE_RECIPIENT_ADDRESS: ${process.env.STREAM_ENGINE_RECIPIENT_ADDRESS ? 'Found' : 'Missing'}`);
  console.log(`   DEMO_STELLAR_SENDER: ${process.env.DEMO_STELLAR_SENDER ? 'Found' : 'Missing'}`);
  console.log(`   STELLAR_HORIZON_URL: ${process.env.STELLAR_HORIZON_URL ? 'Found' : 'Missing'}`);
  console.log(`   STELLAR_SOROBAN_RPC_URL: ${process.env.STELLAR_SOROBAN_RPC_URL ? 'Found' : 'Missing'}`);
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'Found' : 'Missing (fallback heuristics only)'}`);

  requireEnv('STREAM_ENGINE_RECIPIENT_ADDRESS');
  requireEnv('DEMO_STELLAR_SENDER');

  console.log('\n2. Network');
  console.log(`   Connected to: ${runtime.networkName}`);
  console.log(`   Horizon URL: ${runtime.horizonUrl}`);
  console.log(`   Soroban RPC URL: ${runtime.sorobanRpcUrl}`);
  console.log(`   Settlement asset: ${runtime.paymentAssetCode}:${runtime.paymentAssetIssuer || 'issuer-not-set'}`);

  console.log('\n3. Session path');
  console.log(`   Session meter: ${runtime.contractAddress}`);
  console.log(`   Session API: ${process.env.STREAM_ENGINE_SESSION_API_URL || 'http://127.0.0.1:3001'}`);
  console.log(`   Stellar sender: ${process.env.DEMO_STELLAR_SENDER}`);

  console.log('\n4. Demo commands');
  console.log('   Terminal 1: npx ts-node --project demo/tsconfig.json demo/provider.ts');
  console.log('   Terminal 2: npx ts-node --project demo/tsconfig.json demo/consumer.ts');
}

checkSetup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
