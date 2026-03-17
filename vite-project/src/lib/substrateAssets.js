import { blake2b } from '@noble/hashes/blake2b';
import { ACTIVE_NETWORK } from '../networkConfig.js';

let rpcMessageId = 1;

const U64 = 0xffffffffffffffffn;
const P64_1 = 11400714785074694791n;
const P64_2 = 14029467366897019727n;
const P64_3 = 1609587929392839161n;
const P64_4 = 9650029242287828579n;
const P64_5 = 2870177450012600261n;

function isHexAddress(value, length) {
  return typeof value === 'string' && value.startsWith('0x') && value.length === length;
}

function hexToU8a(hex) {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error(`Invalid hex input: ${hex}`);
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function u8aToHex(u8a) {
  return `0x${Array.from(u8a, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function stringToU8a(value) {
  return new TextEncoder().encode(value);
}

function evmToMappedAccountU8a(evmAddress) {
  return hexToU8a(`0x${evmAddress.slice(2).toLowerCase()}${'ee'.repeat(12)}`);
}

function toSubstrateAccountU8a(address) {
  if (!isHexAddress(address, 42)) {
    throw new Error('Expected a connected EVM wallet address');
  }

  return evmToMappedAccountU8a(address);
}

function encodeU32(value) {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, Number(value), true);
  return buffer;
}

function rotl(value, bits) {
  const shift = BigInt(bits);
  const masked = value & U64;
  return ((masked << shift) | (masked >> (64n - shift))) & U64;
}

function fromU8a(u8a, start, count) {
  let result = 0n;
  for (let index = count - 1; index >= 0; index -= 1) {
    const offset = start + index * 2;
    const part = BigInt(u8a[offset] | (u8a[offset + 1] << 8));
    result = (result << 16n) + part;
  }
  return result;
}

function xxhash64(input, seed) {
  const data = input instanceof Uint8Array ? input : stringToU8a(input);
  let p = 0;
  let v1 = seed + P64_1 + P64_2;
  let v2 = seed + P64_2;
  let v3 = seed;
  let v4 = seed - P64_1;
  const remaining = new Uint8Array(32);
  let remainingSize = 0;

  if (data.length >= 32) {
    const limit = data.length - 32;
    do {
      v1 = P64_1 * rotl(v1 + P64_2 * fromU8a(data, p, 4), 31);
      p += 8;
      v2 = P64_1 * rotl(v2 + P64_2 * fromU8a(data, p, 4), 31);
      p += 8;
      v3 = P64_1 * rotl(v3 + P64_2 * fromU8a(data, p, 4), 31);
      p += 8;
      v4 = P64_1 * rotl(v4 + P64_2 * fromU8a(data, p, 4), 31);
      p += 8;
    } while (p <= limit);
  }

  if (p < data.length) {
    remaining.set(data.subarray(p));
    remainingSize = data.length - p;
  }

  let hash = BigInt(data.length) + (data.length >= 32
    ? (((((((((rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18))
      ^ (P64_1 * rotl(v1 * P64_2, 31))) * P64_1 + P64_4)
      ^ (P64_1 * rotl(v2 * P64_2, 31))) * P64_1 + P64_4)
      ^ (P64_1 * rotl(v3 * P64_2, 31))) * P64_1 + P64_4)
      ^ (P64_1 * rotl(v4 * P64_2, 31))) * P64_1 + P64_4)
    : seed + P64_5);
  hash &= U64;

  p = 0;
  while (p <= remainingSize - 8) {
    hash = (P64_4 + P64_1 * rotl(hash ^ (P64_1 * rotl(P64_2 * fromU8a(remaining, p, 4), 31)), 27)) & U64;
    p += 8;
  }

  if (p + 4 <= remainingSize) {
    hash = (P64_3 + P64_2 * rotl(hash ^ (P64_1 * fromU8a(remaining, p, 2)), 23)) & U64;
    p += 4;
  }

  while (p < remainingSize) {
    hash = (P64_1 * rotl(hash ^ (P64_5 * BigInt(remaining[p])), 11)) & U64;
    p += 1;
  }

  hash = (P64_2 * (hash ^ (hash >> 33n))) & U64;
  hash = (P64_3 * (hash ^ (hash >> 29n))) & U64;
  hash = (hash ^ (hash >> 32n)) & U64;

  const result = new Uint8Array(8);
  let value = hash;
  for (let index = 7; index >= 0; index -= 1) {
    result[index] = Number(value % 256n);
    value /= 256n;
  }
  return result;
}

function xxhashAsHex(input, bitLength = 64) {
  const rounds = Math.ceil(bitLength / 64);
  const result = new Uint8Array(rounds * 8);
  for (let seed = 0; seed < rounds; seed += 1) {
    result.set(xxhash64(input, BigInt(seed)).reverse(), seed * 8);
  }
  return u8aToHex(result);
}

function blake2AsHex(input, bitLength = 128) {
  const digest = blake2b(input, { dkLen: Math.ceil(bitLength / 8) });
  return u8aToHex(digest);
}

function blake2ConcatKey(inputU8a) {
  return `${blake2AsHex(inputU8a, 128)}${u8aToHex(inputU8a).slice(2)}`;
}

function buildAssetsAccountStorageKey(assetId, address) {
  const prefix = `${xxhashAsHex('Assets', 128)}${xxhashAsHex('Account', 128).slice(2)}`;
  const assetKey = blake2ConcatKey(encodeU32(assetId));
  const accountKey = blake2ConcatKey(toSubstrateAccountU8a(address));
  return `${prefix}${assetKey.slice(2)}${accountKey.slice(2)}`;
}

function u8aToBigIntLE(u8a) {
  let value = 0n;
  for (let index = u8a.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(u8a[index]);
  }
  return value;
}

function decodeAssetBalance(storageHex) {
  if (!storageHex || storageHex === '0x') {
    return 0n;
  }

  const bytes = hexToU8a(storageHex);
  if (bytes.length < 16) {
    throw new Error('Unexpected asset storage payload');
  }

  return u8aToBigIntLE(bytes.slice(0, 16));
}

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(ACTIVE_NETWORK.substrateRpcUrl);
    const requestId = rpcMessageId++;
    const timeoutHandle = window.setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out calling ${method}`));
    }, 15000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: requestId,
        jsonrpc: '2.0',
        method,
        params,
      }));
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.id !== requestId) {
          return;
        }

        window.clearTimeout(timeoutHandle);
        socket.close();

        if (payload.error) {
          reject(new Error(payload.error.message || `RPC error calling ${method}`));
          return;
        }

        resolve(payload.result);
      } catch (error) {
        window.clearTimeout(timeoutHandle);
        socket.close();
        reject(error);
      }
    });

    socket.addEventListener('error', () => {
      window.clearTimeout(timeoutHandle);
      socket.close();
      reject(new Error(`Failed to connect to ${ACTIVE_NETWORK.substrateRpcUrl}`));
    });
  });
}

export async function readNativeAssetBalance(address, assetId) {
  const storageKey = buildAssetsAccountStorageKey(assetId, address);
  const storageHex = await rpcCall('state_getStorage', [storageKey]);
  return decodeAssetBalance(storageHex);
}

/**
 * Convert a 20-byte EVM address to the 32-byte mapped Substrate AccountId
 * used by Westend Asset Hub (H160 padded with 0xEE bytes).
 */
function evmToSubstrateAccountId(evmAddress) {
  const hex = evmAddress.slice(2).toLowerCase();
  return `0x${hex}${'ee'.repeat(12)}`;
}

/**
 * Approve a spender to transfer a native Substrate asset on behalf of the signer.
 * Uses assets.approveTransfer extrinsic via the Talisman/polkadot.js Substrate extension.
 */
export async function substrateApproveTransfer(evmAddress, assetId, spenderEvmAddress, amount) {
  const { ApiPromise, WsProvider } = await import('@polkadot/api');
  const { web3Enable, web3FromAddress, web3Accounts } = await import('@polkadot/extension-dapp');

  await web3Enable('Stream Engine');

  const api = await ApiPromise.create({ provider: new WsProvider(ACTIVE_NETWORK.substrateRpcUrl) });

  const accounts = await web3Accounts();
  const account = accounts.find(
    (a) => a.meta?.ethereum?.toLowerCase() === evmAddress.toLowerCase()
      || a.address?.toLowerCase() === evmAddress.toLowerCase()
  ) || accounts[0];

  if (!account) throw new Error('No Substrate account found for this EVM address');

  const injector = await web3FromAddress(account.address);

  // Convert 20-byte EVM spender address to 32-byte AccountId
  const spenderAccountId = evmToSubstrateAccountId(spenderEvmAddress);

  const tx = api.tx.assets.approveTransfer(assetId, spenderAccountId, amount);
  await new Promise((resolve, reject) => {
    tx.signAndSend(account.address, { signer: injector.signer }, ({ status, dispatchError }) => {
      if (dispatchError) {
        reject(new Error(dispatchError.toString()));
      } else if (status.isInBlock || status.isFinalized) {
        resolve();
      }
    }).catch(reject);
  });

  await api.disconnect();
}
