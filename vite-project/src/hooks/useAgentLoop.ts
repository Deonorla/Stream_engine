import { useCallback, useRef } from 'react';
import { agentAuthHeaders } from './useAgentWallet';
import { getRwaApiBaseUrl } from '../services/rwaApi';

export type LogEntry = {
  id: number; ts: number;
  type: 'action' | 'decision' | 'info' | 'error' | 'profit';
  message: string; detail?: string; amount?: string;
};

type Rule = { id: string; enabled: boolean; value: string };
type AddLog = (e: Omit<LogEntry, 'id' | 'ts'>) => void;

let _id = 0;
export function makeLogEntry(e: Omit<LogEntry, 'id' | 'ts'>): LogEntry {
  return { ...e, id: ++_id, ts: Date.now() };
}

async function agentFetch(path: string, options: RequestInit = {}) {
  const base = getRwaApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...agentAuthHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function fetchAgentSessions(agentPublicKey: string) {
  const data = await agentFetch(`/api/sessions?owner=${encodeURIComponent(agentPublicKey)}`);
  return (data.sessions || []) as any[];
}

async function runAutoClaimRule(sessions: any[], threshold: number, addLog: AddLog) {
  const claimable = sessions.filter(s =>
    s.sessionStatus === 'active' &&
    parseFloat(s.claimableAmount || s.consumedAmount || '0') >= threshold
  );
  for (const s of claimable) {
    addLog({ type: 'decision', message: `Auto-claim triggered on Session #${s.id}`, detail: `Claimable: ${parseFloat(s.claimableAmount || '0').toFixed(4)} USDC` });
    try {
      const result = await agentFetch(`/api/agent/sessions/${s.id}/claim`, { method: 'POST', body: JSON.stringify({}) });
      addLog({ type: 'profit', message: `Claimed Session #${s.id}`, detail: `tx: ${String(result.txHash || '').slice(0, 12)}…`, amount: `+${parseFloat(result.amount || '0').toFixed(4)} USDC` });
    } catch (err: any) {
      addLog({ type: 'error', message: `Claim failed on Session #${s.id}`, detail: err.message });
    }
  }
  if (claimable.length === 0) {
    addLog({ type: 'decision', message: 'Auto-claim scan complete', detail: `${sessions.length} sessions checked — nothing above threshold` });
  }
}

export function useAgentLoop(agentPublicKey: string | null | undefined) {
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((rules: Rule[], addLog: AddLog, onSessionsUpdate: (s: any[]) => void) => {
    if (loopRef.current) return;

    const tick = async () => {
      if (!agentPublicKey) return;
      try {
        const sessions = await fetchAgentSessions(agentPublicKey);
        onSessionsUpdate(sessions);

        const autoClaimRule = rules.find(r => r.id === 'auto_claim' && r.enabled);
        if (autoClaimRule) {
          await runAutoClaimRule(sessions, parseFloat(autoClaimRule.value) || 1, addLog);
        }
      } catch (err: any) {
        addLog({ type: 'error', message: 'Agent loop error', detail: err.message });
      }
    };

    tick(); // run immediately
    loopRef.current = setInterval(tick, 15000); // then every 15s
  }, [agentPublicKey]);

  const stop = useCallback(() => {
    if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
  }, []);

  return { start, stop };
}
