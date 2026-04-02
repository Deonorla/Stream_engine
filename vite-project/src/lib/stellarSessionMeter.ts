import { Buffer } from 'buffer';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { signTransaction as signFreighterTransaction } from '@stellar/freighter-api';
import { ACTIVE_NETWORK } from '../networkConfig.js';
import {
  Client as SessionMeterClient,
  type SessionRecord,
} from '../../../sdk/generated/stellar/session-meter/src/index.ts';

const SESSION_STATUS_OPEN = 1;

function getSessionMeterContractId() {
  return String(ACTIVE_NETWORK.contractAddress || '').trim();
}

/** Sign with a raw Stellar Keypair (agent wallet) instead of Freighter */
function makeKeypairSigner(keypair: Keypair) {
  return async (xdr: string) => {
    const tx = TransactionBuilder.fromXDR(xdr, ACTIVE_NETWORK.passphrase);
    tx.sign(keypair);
    return tx.toXDR();
  };
}

function createSessionMeterClient(publicKey?: string, keypair?: Keypair) {
  const contractId = getSessionMeterContractId();
  if (!contractId || !contractId.startsWith('C')) {
    throw new Error('Session meter contract ID is not configured for Stellar.');
  }

  return new SessionMeterClient({
    contractId,
    rpcUrl: ACTIVE_NETWORK.rpcUrl,
    networkPassphrase: ACTIVE_NETWORK.passphrase,
    publicKey,
    signTransaction: keypair ? makeKeypairSigner(keypair) : signFreighterTransaction,
  });
}

async function sha256Buffer(input: string) {
  const encoded = new TextEncoder().encode(String(input || ''));
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Buffer.from(digest);
}

function bigintToNumber(value: bigint | number | string | undefined, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeSessionRecord(record: SessionRecord) {
  const startTime = bigintToNumber(record.start_time);
  const stopTime = bigintToNumber(record.stop_time);
  const durationSeconds = Math.max(1, stopTime - startTime);
  const totalAmount = BigInt(record.total_amount || 0n);
  const claimedAmount = BigInt(record.claimed_amount || 0n);
  const flowRate = totalAmount / BigInt(durationSeconds);
  const now = Math.floor(Date.now() / 1000);
  const effectiveNow = Math.max(startTime, Math.min(now, stopTime));
  const elapsed = Math.max(0, effectiveNow - startTime);
  const streamedAmount = (totalAmount * BigInt(elapsed)) / BigInt(durationSeconds);
  const claimable = streamedAmount > claimedAmount ? streamedAmount - claimedAmount : 0n;
  const refundableAmount = totalAmount > streamedAmount ? totalAmount - streamedAmount : 0n;
  const status = bigintToNumber(record.status);

  return {
    id: bigintToNumber(record.session_id),
    sender: record.payer,
    recipient: record.recipient,
    totalAmount: totalAmount.toString(),
    flowRate: flowRate.toString(),
    durationSeconds,
    startTime,
    stopTime,
    amountWithdrawn: claimedAmount.toString(),
    isActive: status === SESSION_STATUS_OPEN,
    isFrozen: Boolean(record.frozen),
    metadata: '',
    txHash: '',
    paymentTokenSymbol: record.asset_code || 'USDC',
    assetCode: record.asset_code || '',
    assetIssuer: record.asset_issuer || '',
    claimableInitial: claimable.toString(),
    refundableAmount: refundableAmount.toString(),
    sessionKind: 'stellar',
  };
}

export async function listStellarSessionsForAddress(address: string) {
  const normalizedAddress = String(address || '').trim();
  if (!normalizedAddress) {
    return [];
  }

  const client = createSessionMeterClient();
  const [{ result: payerIds = [] }, { result: recipientIds = [] }] = await Promise.all([
    client.list_payer_sessions({ payer: normalizedAddress }),
    client.list_recipient_sessions({ recipient: normalizedAddress }),
  ]);

  const uniqueIds = Array.from(
    new Set(
      [...payerIds, ...recipientIds]
        .map((value) => bigintToNumber(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  const records = await Promise.all(
    uniqueIds.map(async (sessionId) => {
      const { result } = await client.get_session({ session_id: BigInt(sessionId) });
      return normalizeSessionRecord(result);
    }),
  );

  return records.sort((left, right) => right.id - left.id);
}

export async function getStellarSession(sessionId: number | string) {
  const resolvedSessionId = bigintToNumber(sessionId);
  if (!resolvedSessionId) {
    return null;
  }

  const client = createSessionMeterClient();
  const { result } = await client.get_session({ session_id: BigInt(resolvedSessionId) });
  return normalizeSessionRecord(result);
}

export async function openStellarSession({
  payer,
  recipient,
  token,
  assetCode,
  assetIssuer,
  totalAmount,
  durationSeconds,
  metadata,
  keypair,
}: {
  payer: string;
  recipient: string;
  token: string;
  assetCode: string;
  assetIssuer?: string;
  totalAmount: bigint;
  durationSeconds: number;
  metadata: string;
  keypair?: Keypair;
}) {
  const client = createSessionMeterClient(payer, keypair);
  const startTime = BigInt(Math.floor(Date.now() / 1000));
  const stopTime = startTime + BigInt(Math.max(1, Number(durationSeconds || 0)));
  const metadataHash = await sha256Buffer(metadata);

  const assembled = await client.open_session({
    payer,
    recipient,
    token,
    asset_code: String(assetCode || '').toUpperCase(),
    asset_issuer: assetIssuer || '',
    total_amount: BigInt(totalAmount),
    start_time: startTime,
    stop_time: stopTime,
    metadata_hash: metadataHash,
  });
  const sent = await assembled.signAndSend();
  return {
    streamId: bigintToNumber(sent.result),
    txHash: sent.sendTransactionResponse?.hash || sent.getTransactionResponse?.txHash || '',
  };
}

export async function claimStellarSession({
  recipient,
  sessionId,
}: {
  recipient: string;
  sessionId: number | string;
}) {
  const client = createSessionMeterClient(recipient);
  const assembled = await client.claim({
    recipient,
    session_id: BigInt(bigintToNumber(sessionId)),
  });
  const sent = await assembled.signAndSend();
  return {
    amount: BigInt(sent.result || 0n),
    txHash: sent.sendTransactionResponse?.hash || sent.getTransactionResponse?.txHash || '',
  };
}

export async function cancelStellarSession({
  payer,
  sessionId,
  keypair,
}: {
  payer: string;
  sessionId: number | string;
  keypair?: Keypair;
}) {
  const client = createSessionMeterClient(payer, keypair);
  const assembled = await client.cancel({
    payer,
    session_id: BigInt(bigintToNumber(sessionId)),
  });
  const sent = await assembled.signAndSend();
  return {
    settlement: sent.result,
    txHash: sent.sendTransactionResponse?.hash || sent.getTransactionResponse?.txHash || '',
  };
}
