import { getApiBaseUrl } from './apiBase';
import { getPreferredAgentAuthToken } from '../lib/agentAuthStorage';
import { ACTIVE_NETWORK } from '../networkConfig.js';

const DEFAULT_RWA_API_URL = getApiBaseUrl();

function buildUrl(path, query = {}) {
  const url = new URL(path, `${DEFAULT_RWA_API_URL.replace(/\/$/, '')}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function request(path, options = {}, query) {
  const { headers: optHeaders, ...restOptions } = options;
  const response = await fetch(buildUrl(path, query), {
    headers: {
      'Content-Type': 'application/json',
      ...(optHeaders || {}),
    },
    ...restOptions,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function getAgentToken() {
  return getPreferredAgentAuthToken();
}

function agentHeaders() {
  const token = getAgentToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchRwaAssets(owner) {
  const response = await request('/api/rwa/assets', { method: 'GET' }, { owner });
  return response.assets || [];
}

export async function fetchRwaAsset(tokenId) {
  const response = await request(`/api/rwa/assets/${tokenId}`, { method: 'GET' });
  return response.asset || null;
}

export async function fetchRwaActivity(tokenId) {
  const response = await request(`/api/rwa/assets/${tokenId}/activity`, { method: 'GET' });
  return response.activity || [];
}

export async function mintRwaAsset(payload) {
  return request('/api/rwa/assets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function storeRwaEvidence(payload) {
  return request('/api/rwa/evidence', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitRwaAttestation(payload) {
  if (ACTIVE_NETWORK.kind === 'stellar') {
    throw new Error('Direct wallet attestation required on Stellar. Use the Freighter/Soroban attestation path instead of the backend relay.');
  }
  return request('/api/rwa/attestations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function revokeRwaAttestation(payload) {
  if (ACTIVE_NETWORK.kind === 'stellar') {
    throw new Error('Direct wallet attestation revocation required on Stellar. Use the Freighter/Soroban revocation path instead of the backend relay.');
  }
  return request('/api/rwa/attestations', {
    method: 'POST',
    body: JSON.stringify({
      action: 'revoke',
      ...payload,
    }),
  });
}

export async function verifyRwaAsset(payload) {
  return request('/api/rwa/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function pinRwaMetadata(metadata) {
  return request('/api/rwa/ipfs/metadata', {
    method: 'POST',
    body: JSON.stringify({ metadata }),
  });
}

export function getRwaApiBaseUrl() {
  return DEFAULT_RWA_API_URL;
}

export async function rwaAdminAction(payload) {
  return request('/api/rwa/admin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchAssetAnalytics(tokenId, sessionId) {
  return request(`/api/rwa/assets/${tokenId}/analytics`, {
    method: 'GET',
    headers: sessionId ? { 'x-stream-stream-id': String(sessionId) } : {},
  });
}

export async function placeBid(tokenId, payload) {
  return request(`/api/rwa/assets/${tokenId}/bid`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function rwaRelayAction(payload) {
  if (ACTIVE_NETWORK.kind === 'stellar') {
    throw new Error('Direct wallet Soroban write required on Stellar. Use the active signer or managed agent path instead of the backend relay.');
  }
  return request('/api/rwa/relay', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function openPaymentSession(payload) {
  return request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelPaymentSession(sessionId, payload = {}) {
  return request(`/api/sessions/${sessionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function claimPaymentSession(sessionId, payload = {}) {
  return request(`/api/sessions/${sessionId}/claim`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchPaymentSessions(owner) {
  const response = await request('/api/sessions', { method: 'GET' }, { owner });
  return response.sessions || [];
}

export async function fetchPaymentSession(sessionId) {
  const response = await request(`/api/sessions/${sessionId}`, { method: 'GET' });
  return response.session || null;
}

export async function syncPaymentSessionMetadata(sessionId, payload) {
  const response = await request(`/api/sessions/${sessionId}/metadata`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.session || null;
}

export async function fetchMarketAssets(query = {}) {
  const response = await request('/api/market/assets', { method: 'GET' }, query);
  return response.assets || [];
}

export async function fetchMarketCatalog(query = {}) {
  return request('/api/market/assets', { method: 'GET' }, query);
}

export async function fetchMarketAsset(assetId) {
  return request(`/api/market/assets/${assetId}`, { method: 'GET' });
}

export async function fetchMarketAnalytics(assetId, sessionId) {
  return request(`/api/market/assets/${assetId}/analytics`, {
    method: 'GET',
    headers: sessionId ? { 'x-stream-stream-id': String(sessionId) } : {},
  });
}

export async function createMarketAuction(assetId, payload) {
  return request(`/api/market/assets/${assetId}/auctions`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function fetchAuction(auctionId) {
  const response = await request(`/api/market/auctions/${auctionId}`, { method: 'GET' });
  return response.auction || null;
}

export async function placeAuctionBid(auctionId, payload) {
  return request(`/api/market/auctions/${auctionId}/bids`, {
    method: 'POST',
    headers: {
      ...agentHeaders(),
      ...(payload?.sessionId ? { 'x-stream-stream-id': String(payload.sessionId) } : {}),
    },
    body: JSON.stringify(payload),
  });
}

export async function settleAuction(auctionId) {
  return request(`/api/market/auctions/${auctionId}/settle`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({}),
  });
}

export async function fetchMarketPositions() {
  const response = await request('/api/market/positions', {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.positions || null;
}

export async function claimMarketYield(tokenId, sessionId) {
  return request('/api/market/yield/claim', {
    method: 'POST',
    headers: {
      ...agentHeaders(),
      ...(sessionId ? { 'x-stream-stream-id': String(sessionId) } : {}),
    },
    body: JSON.stringify({ tokenId }),
  });
}

export async function routeMarketYield(payload = {}, sessionId) {
  return request('/api/market/yield/route', {
    method: 'POST',
    headers: {
      ...agentHeaders(),
      ...(sessionId ? { 'x-stream-stream-id': String(sessionId) } : {}),
    },
    body: JSON.stringify(payload),
  });
}

export async function rebalanceMarketTreasury(sessionId) {
  return request('/api/market/treasury/rebalance', {
    method: 'POST',
    headers: {
      ...agentHeaders(),
      ...(sessionId ? { 'x-stream-stream-id': String(sessionId) } : {}),
    },
    body: JSON.stringify({}),
  });
}

export async function ensureManagedAgent(ownerPublicKey) {
  return request('/api/agents', {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({ ownerPublicKey }),
  });
}

export async function fetchAgentState(agentId) {
  const response = await request(`/api/agents/${agentId}/state`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.state || null;
}

export async function fetchAgentObjective(agentId) {
  const response = await request(`/api/agents/${agentId}/objective`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.objective || null;
}

export async function saveAgentObjective(agentId, payload) {
  const response = await request(`/api/agents/${agentId}/objective`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
  return response.objective || null;
}

export async function fetchAgentJournal(agentId, limit = 40) {
  const response = await request(`/api/agents/${agentId}/journal`, {
    method: 'GET',
    headers: agentHeaders(),
  }, { limit });
  return {
    journal: response.journal || [],
    memorySummary: response.memorySummary || null,
  };
}

export async function chatWithAgent(agentId, message) {
  return request(`/api/agents/${agentId}/chat`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({ message }),
  });
}

export async function openAgentPaymentSession(agentId, payload) {
  return request(`/api/agents/${agentId}/sessions`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function cancelAgentPaymentSession(agentId, sessionId) {
  return request(`/api/agents/${agentId}/sessions/${sessionId}/cancel`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({}),
  });
}

export async function fetchAgentRuntime(agentId) {
  const response = await request(`/api/agents/${agentId}/runtime`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.runtime || null;
}

export async function fetchAgentPerformance(agentId) {
  const response = await request(`/api/agents/${agentId}/performance`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.performance || null;
}

export async function fetchAgentMandate(agentId) {
  const response = await request(`/api/agents/${agentId}/mandate`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.mandate || null;
}

export async function saveAgentMandate(agentId, payload) {
  const response = await request(`/api/agents/${agentId}/mandate`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
  return response.mandate || null;
}

export async function fetchAgentWalletState(agentId) {
  const response = await request(`/api/agents/${agentId}/wallet`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.wallet || null;
}

export async function fetchAgentScreens(agentId) {
  const response = await request(`/api/agents/${agentId}/screens`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.screens || [];
}

export async function saveAgentScreen(agentId, payload) {
  const response = await request(`/api/agents/${agentId}/screens`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
  return response.screen || null;
}

export async function deleteAgentScreen(agentId, screenId) {
  return request(`/api/agents/${agentId}/screens/${screenId}`, {
    method: 'DELETE',
    headers: agentHeaders(),
  });
}

export async function fetchAgentWatchlist(agentId) {
  const response = await request(`/api/agents/${agentId}/watchlist`, {
    method: 'GET',
    headers: agentHeaders(),
  });
  return response.watchlist || [];
}

export async function addAgentWatchAsset(agentId, payload) {
  const response = await request(`/api/agents/${agentId}/watchlist`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
  return response.asset || null;
}

export async function removeAgentWatchAsset(agentId, assetId) {
  return request(`/api/agents/${agentId}/watchlist/${assetId}`, {
    method: 'DELETE',
    headers: agentHeaders(),
  });
}

export async function startAgentRuntime(agentId, payload = {}) {
  const response = await request(`/api/agents/${agentId}/runtime/start`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
  return response.runtime || null;
}

export async function pauseAgentRuntime(agentId) {
  const response = await request(`/api/agents/${agentId}/runtime/pause`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({}),
  });
  return response.runtime || null;
}

export async function tickAgentRuntime(agentId) {
  const response = await request(`/api/agents/${agentId}/runtime/tick`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({}),
  });
  return response.runtime || null;
}
