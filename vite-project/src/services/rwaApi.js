import { getApiBaseUrl } from './apiBase';

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
  const response = await fetch(buildUrl(path, query), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
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
