export function getApiBaseUrl() {
  if (typeof import.meta !== 'undefined') {
    const env = import.meta.env || {};
    if (env.VITE_API_BASE_URL) {
      return env.VITE_API_BASE_URL;
    }
    if (env.VITE_RWA_API_URL) {
      return env.VITE_RWA_API_URL;
    }
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3001`;
  }

  return 'http://localhost:3001';
}
