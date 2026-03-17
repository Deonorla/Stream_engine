import { getApiBaseUrl } from './apiBase';

const DEFAULT_API_BASE_URL = getApiBaseUrl();

function buildUrl(path) {
  return `${DEFAULT_API_BASE_URL.replace(/\/$/, '')}${path}`;
}

export async function callRoute(path, { streamId, txHash } = {}) {
  const headers = {};

  if (streamId) {
    headers['X-FlowPay-Stream-ID'] = String(streamId);
  }

  if (txHash) {
    headers['X-FlowPay-Tx-Hash'] = txHash;
  }

  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return {
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

