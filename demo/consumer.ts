import fs from 'fs';
import path from 'path';
import { FlowPaySDK } from '../sdk/src/FlowPaySDK';
import { FlowPaySubstrateAdapter } from '../sdk/src/FlowPaySubstrateAdapter';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createFlowPayRuntimeConfig } = require('../utils/polkadot');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createSubstrateApi, loadSubstrateSigner } = require('../utils/substrate');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the demo consumer`);
  }
  return value;
}

async function getSubstrateUsdcBalance(assetId: number, account: string): Promise<bigint> {
  const { api } = await createSubstrateApi();
  try {
    const assetAccount = await api.query.assets.account(assetId, account);
    if (assetAccount.isNone) {
      return 0n;
    }
    return BigInt(assetAccount.unwrap().balance.toString());
  } finally {
    await api.disconnect();
  }
}

function resolveAccountJson() {
  const jsonPath = process.env.SUBSTRATE_JSON_PATH || './substrate.json';
  const absolutePath = path.isAbsolute(jsonPath) ? jsonPath : path.resolve(process.cwd(), jsonPath);
  return fs.readFileSync(absolutePath, 'utf8');
}

function hasSubstrateSignerConfig() {
  return Boolean(process.env.SUBSTRATE_SURI)
    || Boolean(process.env.SUBSTRATE_JSON_PATH)
    || fs.existsSync(path.resolve(process.cwd(), 'substrate.json'));
}

function isWestendAssetHub(runtime: any) {
  return Number(runtime.chainId) === 420420421 || runtime.networkName === 'Westend Asset Hub';
}

async function resolveSignerMode(runtime: any, hasPrivateKey: boolean): Promise<'substrate' | 'evm'> {
  const requestedMode = (process.env.DEMO_SIGNER_MODE || '').trim().toLowerCase();
  const substrateAvailable = hasSubstrateSignerConfig();

  if (requestedMode === 'substrate') {
    return 'substrate';
  }
  if (requestedMode === 'evm') {
    return 'evm';
  }

  if (process.env.DEMO_USE_SUBSTRATE_ADAPTER === 'true') {
    return 'substrate';
  }
  if (process.env.DEMO_USE_SUBSTRATE_ADAPTER === 'false') {
    return 'evm';
  }

  if (!substrateAvailable) {
    return 'evm';
  }
  if (!hasPrivateKey) {
    return 'substrate';
  }

  if (isWestendAssetHub(runtime)) {
    return 'substrate';
  }

  const { api } = await createSubstrateApi();
  try {
    const { pair } = await loadSubstrateSigner();
    const systemAccount = await api.query.system.account(pair.address);
    const assetAccount = await api.query.assets.account(runtime.paymentAssetId, pair.address);
    const wndBalance = BigInt(systemAccount.data.free.toString());
    const usdcBalance = assetAccount.isNone ? 0n : BigInt(assetAccount.unwrap().balance.toString());

    if (wndBalance > 0n && usdcBalance > 0n) {
      return 'substrate';
    }
    return 'evm';
  } finally {
    await api.disconnect();
  }
}

/**
 * Demo Consumer: agentic x402 client
 *
 * This demonstrates an AI agent that:
 * 1. calls a protected API route
 * 2. receives HTTP 402 with payment terms
 * 3. opens a reusable stream if needed
 * 4. retries automatically against the paid route
 * 5. reuses the stream on subsequent requests
 */
async function runDemo() {
  const runtime = createFlowPayRuntimeConfig();
  const targetUrl = process.env.DEMO_TARGET_URL || 'http://127.0.0.1:3005/api/premium';
  const privateKey = process.env.PRIVATE_KEY || '';
  const signerMode = await resolveSignerMode(runtime, Boolean(privateKey));
  const useSubstrateAdapter = signerMode === 'substrate';

  console.log('Starting Stream Engine demo consumer...\n');
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Network: ${runtime.networkName}`);
  console.log(`Payment token: ${runtime.paymentTokenSymbol}`);
  console.log(`Signer mode: ${signerMode}`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not found. The SDK will use fallback heuristics for payment strategy.');
  }

  let sdk: FlowPaySDK;

  if (useSubstrateAdapter) {
    const adapter = new FlowPaySubstrateAdapter({
      substrateRpcUrl: process.env.POLKADOT_SUBSTRATE_RPC_URL || process.env.SUBSTRATE_RPC_URL || 'wss://westend-asset-hub-rpc.polkadot.io',
      accountJson: resolveAccountJson(),
      password: requireEnv('SUBSTRATE_PASSWORD'),
    });

    const { pair, evmAddress } = await loadSubstrateSigner();
    const usdcBalance = await getSubstrateUsdcBalance(runtime.paymentAssetId, pair.address);

    console.log(`Substrate signer: ${pair.address}`);
    console.log(`Mapped EVM alias: ${evmAddress}`);
    console.log(`Current ${runtime.paymentTokenSymbol} balance: ${ethers.formatUnits(usdcBalance, runtime.paymentTokenDecimals)} ${runtime.paymentTokenSymbol}`);

    if (usdcBalance <= 0n) {
      throw new Error(
        `Selected substrate signer has 0 ${runtime.paymentTokenSymbol}. Fund the substrate signer used by substrate.json (or SUBSTRATE_JSON_PATH / SUBSTRATE_SURI). On Westend Asset Hub, this CLI demo must use the native substrate signer path because the ETH-RPC path does not reliably support the Circle USDC asset precompile.`
      );
    }

    sdk = new FlowPaySDK({
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
  } else {
    if (!privateKey) {
      throw new Error('Set PRIVATE_KEY or provide substrate signer env vars for the demo consumer.');
    }

    if (isWestendAssetHub(runtime)) {
      throw new Error(
        'EVM signer mode is not supported for this CLI demo on Westend Asset Hub. The current ETH-RPC path rejects native Circle USDC precompile calls and raw approve transactions. Fund a substrate signer and run with DEMO_SIGNER_MODE=substrate instead.'
      );
    }

    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(runtime.rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);
    const tokenContract = new ethers.Contract(
      runtime.paymentTokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    console.log(`EVM signer: ${wallet.address}`);
    try {
      const balance = await tokenContract.balanceOf(wallet.address);
      console.log(`Current ${runtime.paymentTokenSymbol} balance: ${ethers.formatUnits(balance, runtime.paymentTokenDecimals)} ${runtime.paymentTokenSymbol}`);
    } catch (error: any) {
      console.warn(`Unable to read ${runtime.paymentTokenSymbol} balance through ETH RPC on this network. Continuing with EVM signer.`);
      console.warn(`Balance read error: ${error?.shortMessage || error?.message || error}`);
    }

    sdk = new FlowPaySDK({
      privateKey: normalizedKey,
      rpcUrl: runtime.rpcUrl,
      agentId: 'stream-engine-demo-agent',
      token: {
        symbol: runtime.paymentTokenSymbol,
        decimals: runtime.paymentTokenDecimals,
      },
      spendingLimits: {
        dailyLimit: ethers.parseUnits('100', runtime.paymentTokenDecimals),
        totalLimit: ethers.parseUnits('1000', runtime.paymentTokenDecimals),
      },
    });
  }

  console.log('\n[Step 1] Initial paid request');
  console.log('This should trigger the x402 flow, create or reuse a stream, then retry automatically.\n');

  try {
    const response = await sdk.makeRequest(targetUrl);
    console.log('Request succeeded.');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (e: any) {
    if (e.message?.includes('ECONNREFUSED')) {
      console.error('Connection refused. Start the provider first:');
      console.error('   npx ts-node --project demo/tsconfig.json demo/provider.ts');
      return;
    }

    throw e;
  }

  console.log('\n[Step 2] Rapid follow-up requests');
  console.log('These should reuse the existing stream instead of opening a new one.\n');

  for (let i = 1; i <= 3; i += 1) {
    const response = await sdk.makeRequest(targetUrl);
    console.log(`Request ${i}: success`);
    console.log(`   paidWith: ${response.data?.paidWith || `stream:${response.data?.streamId}`}`);
  }

  const metrics = sdk.getMetrics();
  console.log('\nEfficiency report:');
  console.log(`   Total requests made: ${metrics.requestsSent}`);
  console.log(`   Payment negotiations / signers triggered: ${metrics.signersTriggered}`);
  console.log(`   Reuse wins: ${metrics.requestsSent - metrics.signersTriggered}`);

  console.log('\nDemo complete.');
}

if (require.main === module) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export default runDemo;
