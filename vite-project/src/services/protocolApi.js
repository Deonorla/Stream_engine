import { getApiBaseUrl } from './apiBase';

const DEFAULT_API_BASE_URL = getApiBaseUrl();

async function request(path) {
  const response = await fetch(`${DEFAULT_API_BASE_URL.replace(/\/$/, '')}${path}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function fetchProtocolCatalog() {
  return request('/api/engine/catalog');
}

export function getProtocolApiBaseUrl() {
  return DEFAULT_API_BASE_URL;
}
