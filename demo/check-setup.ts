/**
 * Quick setup verification script
 * Run: npx ts-node --project demo/tsconfig.json demo/check-setup.ts
 */
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createFlowPayRuntimeConfig } = require('../utils/polkadot');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createSubstrateApi, loadSubstrateSigner } = require('../utils/substrate');

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function getAssetBalance(api: any, assetId: number, account: string) {
  const assetAccount = await api.query.assets.account(assetId, account);
  if (assetAccount.isNone) {
    return 0n;
  }
  return BigInt(assetAccount.unwrap().balance.toString());
}

async function checkSetup() {
  const runtime = createFlowPayRuntimeConfig();
  const provider = new ethers.JsonRpcProvider(runtime.rpcUrl);
  const isWestendAssetHub = Number(runtime.chainId) === 420420421 || runtime.networkName === 'Westend Asset Hub';

  console.log('Stream Engine demo setup check\n');

  console.log('1. Environment');
  console.log(`   FLOWPAY_CONTRACT_ADDRESS: ${process.env.FLOWPAY_CONTRACT_ADDRESS ? 'Found' : 'Missing'}`);
  console.log(`   FLOWPAY_PAYMENT_TOKEN_ADDRESS: ${process.env.FLOWPAY_PAYMENT_TOKEN_ADDRESS ? 'Found' : 'Missing'}`);
  console.log(`   FLOWPAY_RECIPIENT_ADDRESS: ${process.env.FLOWPAY_RECIPIENT_ADDRESS ? 'Found' : 'Missing'}`);
  console.log(`   SUBSTRATE_PASSWORD: ${process.env.SUBSTRATE_PASSWORD ? 'Found' : 'Missing'}`);
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'Found' : 'Missing (fallback heuristics only)'}`);

  requireEnv('FLOWPAY_CONTRACT_ADDRESS');
  requireEnv('FLOWPAY_PAYMENT_TOKEN_ADDRESS');
  requireEnv('FLOWPAY_RECIPIENT_ADDRESS');
  requireEnv('SUBSTRATE_PASSWORD');

  console.log('\n2. Network');
  const network = await provider.getNetwork();
  console.log(`   Connected to: ${runtime.networkName}`);
  console.log(`   Chain ID: ${network.chainId}`);
  console.log(`   RPC URL: ${runtime.rpcUrl}`);

  console.log('\n3. Contracts');
  const contractCode = await provider.getCode(process.env.FLOWPAY_CONTRACT_ADDRESS!);
  const tokenCode = await provider.getCode(process.env.FLOWPAY_PAYMENT_TOKEN_ADDRESS!);
  console.log(`   Stream contract deployed: ${contractCode !== '0x' ? 'Yes' : 'No'}`);
  console.log(`   Payment token reachable: ${tokenCode !== '0x' ? 'Yes' : 'No'}`);

  console.log('\n4. Substrate signer');
  const { api } = await createSubstrateApi();
  try {
    const { pair, evmAddress } = await loadSubstrateSigner();
    const systemAccount = await api.query.system.account(pair.address);
    const usdcBalance = await getAssetBalance(api, runtime.paymentAssetId, pair.address);
    console.log(`   Substrate account: ${pair.address}`);
    console.log(`   Mapped EVM alias: ${evmAddress}`);
    console.log(`   WND balance: ${ethers.formatUnits(systemAccount.data.free.toString(), 18)} WND`);
    console.log(`   ${runtime.paymentTokenSymbol} balance: ${ethers.formatUnits(usdcBalance, runtime.paymentTokenDecimals)} ${runtime.paymentTokenSymbol}`);
    if (isWestendAssetHub) {
      console.log('   Recommended CLI demo mode: substrate');
      console.log('   Note: the Westend ETH-RPC path is not reliable for native Circle USDC precompile calls in this demo.');
    }
  } finally {
    await api.disconnect();
  }

  console.log('\n5. Demo commands');
  console.log('   Terminal 1: npx ts-node --project demo/tsconfig.json demo/provider.ts');
  console.log('   Terminal 2: npx ts-node --project demo/tsconfig.json demo/consumer.ts');
}

checkSetup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
