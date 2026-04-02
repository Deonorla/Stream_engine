import { useEffect, useState } from 'react';
import { ACTIVE_NETWORK } from '../networkConfig.js';

async function fetchXlm(address: string): Promise<string> {
  if (!address || !ACTIVE_NETWORK.horizonUrl) return '0.00';
  const r = await fetch(`${String(ACTIVE_NETWORK.horizonUrl).replace(/\/$/, '')}/accounts/${encodeURIComponent(address)}`);
  if (!r.ok) return '0.00';
  const data = await r.json();
  const entry = Array.isArray(data?.balances) ? data.balances.find((b: any) => b?.asset_type === 'native') : null;
  return entry?.balance || '0.00';
}

async function fetchUsdc(address: string): Promise<string> {
  if (!address || !ACTIVE_NETWORK.horizonUrl || !ACTIVE_NETWORK.paymentAssetCode || !ACTIVE_NETWORK.paymentAssetIssuer) return '0.00';
  const r = await fetch(`${String(ACTIVE_NETWORK.horizonUrl).replace(/\/$/, '')}/accounts/${encodeURIComponent(address)}`);
  if (!r.ok) return '0.00';
  const data = await r.json();
  const entry = Array.isArray(data?.balances)
    ? data.balances.find((b: any) => b?.asset_code === ACTIVE_NETWORK.paymentAssetCode && b?.asset_issuer === ACTIVE_NETWORK.paymentAssetIssuer)
    : null;
  return entry?.balance || '0.00';
}

export function useAgentBalances(publicKey: string | null | undefined) {
  const [xlm, setXlm] = useState('0.00');
  const [usdc, setUsdc] = useState('0.00');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicKey) { setXlm('0.00'); setUsdc('0.00'); return; }
    setLoading(true);
    Promise.all([fetchXlm(publicKey), fetchUsdc(publicKey)])
      .then(([x, u]) => { setXlm(parseFloat(x).toFixed(2)); setUsdc(parseFloat(u).toFixed(2)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey]);

  return { xlm, usdc, loading };
}
