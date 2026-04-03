import { useState, useEffect, useCallback, useRef } from 'react';
import { ACTIVE_NETWORK } from '../networkConfig';

async function fetchUsdc(address: string): Promise<string> {
  const res = await fetch(`${ACTIVE_NETWORK.horizonUrl}/accounts/${encodeURIComponent(address)}`);
  if (!res.ok) return '0';
  const data = await res.json();
  const entry = (data.balances || []).find(
    (b: any) => b.asset_code === ACTIVE_NETWORK.paymentAssetCode && b.asset_issuer === ACTIVE_NETWORK.paymentAssetIssuer
  );
  return entry?.balance || '0';
}

async function fetchXlm(address: string): Promise<string> {
  const res = await fetch(`${ACTIVE_NETWORK.horizonUrl}/accounts/${encodeURIComponent(address)}`);
  if (!res.ok) return '0';
  const data = await res.json();
  const entry = (data.balances || []).find((b: any) => b.asset_type === 'native');
  return entry?.balance || '0';
}

export function useAgentBalances(publicKey: string | null | undefined, pollInterval = 15000) {
  const [xlm, setXlm] = useState('0.00');
  const [usdc, setUsdc] = useState('0.00');
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey) { setXlm('0.00'); setUsdc('0.00'); return; }
    setLoading(true);
    try {
      const [x, u] = await Promise.all([fetchXlm(publicKey), fetchUsdc(publicKey)]);
      setXlm(parseFloat(x).toFixed(4));
      setUsdc(parseFloat(u).toFixed(4));
    } catch {}
    setLoading(false);
  }, [publicKey]);

  useEffect(() => {
    refresh();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(refresh, pollInterval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh, pollInterval]);

  return { xlm, usdc, loading, refresh };
}
