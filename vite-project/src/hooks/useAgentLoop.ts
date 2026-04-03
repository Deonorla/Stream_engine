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

export type TokenPreference = 'XLM' | 'USDC';

/** Pick the token the agent should prefer based on available balances. */
export function resolvePreferredToken(xlmBalance: string, usdcBalance: string): TokenPreference {
  const xlm = parseFloat(xlmBalance) || 0;
  const usdc = parseFloat(usdcBalance) || 0;
  // Prefer USDC for settled value; fall back to XLM if USDC is negligible
  return usdc >= 1 ? 'USDC' : xlm > 0 ? 'XLM' : 'USDC';
}

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

async function runAutoClaimRule(sessions: any[], threshold: number, addLog: AddLog, token: TokenPreference) {
  const claimable = sessions.filter(s =>
    s.sessionStatus === 'active' &&
    parseFloat(s.claimableAmount || s.consumedAmount || '0') >= threshold
  );
  for (const s of claimable) {
    addLog({ type: 'decision', message: `Auto-claim triggered on Session #${s.id}`, detail: `Claimable: ${parseFloat(s.claimableAmount || '0').toFixed(4)} ${token}` });
    // Compliance pre-check if asset is known
    if (s.tokenId) {
      try {
        const compliance = await agentFetch(`/api/agent/compliance/check`, {
          method: 'POST', body: JSON.stringify({ tokenId: s.tokenId, action: 'claim' }),
        });
        if (!compliance.allowed) {
          addLog({ type: 'error', message: `Claim blocked by compliance on Session #${s.id}`, detail: compliance.reasons?.join(', ') });
          continue;
        }
      } catch { /* non-critical — proceed */ }
    }
    try {
      const result = await agentFetch(`/api/agent/sessions/${s.id}/claim`, { method: 'POST', body: JSON.stringify({}) });
      addLog({ type: 'profit', message: `Claimed Session #${s.id}`, detail: `tx: ${String(result.txHash || '').slice(0, 12)}…`, amount: `+${parseFloat(result.amount || '0').toFixed(4)} ${token}` });
    } catch (err: any) {
      addLog({ type: 'error', message: `Claim failed on Session #${s.id}`, detail: err.message });
    }
  }
  if (claimable.length === 0) {
    addLog({ type: 'decision', message: 'Auto-claim scan complete', detail: `${sessions.length} sessions checked — nothing above threshold` });
  }
}

async function runScreeningRule(minYield: number, addLog: AddLog) {
  try {
    const result = await agentFetch('/api/agent/screen', {
      method: 'POST',
      body: JSON.stringify({ criteria: { minYield, limit: 5 } }),
    });
    if (result.matched === 0) {
      addLog({ type: 'decision', message: 'Screening complete — no assets match criteria', detail: `Min yield: ${minYield}% · Scanned: ${result.total}` });
    } else {
      const top = result.assets[0];
      addLog({ type: 'decision', message: `Found ${result.matched} asset(s) above ${minYield}% yield`, detail: `Top match: Asset #${top.tokenId} · ${top.yieldRate}% yield · Risk: ${top.riskScore}` });
    }
  } catch (err: any) {
    addLog({ type: 'error', message: 'Screening failed', detail: err.message });
  }
}

export function useAgentLoop(agentPublicKey: string | null | undefined) {
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((rules: Rule[], addLog: AddLog, onSessionsUpdate: (s: any[]) => void, token: TokenPreference = 'USDC') => {
    if (loopRef.current) return;

    const tick = async () => {
      if (!agentPublicKey) return;
      try {
        const sessions = await fetchAgentSessions(agentPublicKey);
        onSessionsUpdate(sessions);

        const autoClaimRule = rules.find(r => r.id === 'auto_claim' && r.enabled);
        if (autoClaimRule) {
          await runAutoClaimRule(sessions, parseFloat(autoClaimRule.value) || 1, addLog, token);
        }

        const minYieldRule = rules.find(r => r.id === 'min_yield' && r.enabled);
        if (minYieldRule) {
          await runScreeningRule(parseFloat(minYieldRule.value) || 5, addLog);
        }

        // Risk monitoring — check for alerts on every tick
        try {
          const riskData = await agentFetch('/api/agent/risk-monitor');
          for (const alert of (riskData.alerts || [])) {
            addLog({ type: 'error', message: `Risk alert: ${alert.message}`, detail: `Severity: ${alert.severity} · Type: ${alert.type}` });
          }
        } catch { /* non-critical */ }

        // Rebalance check — compute actions against active rules
        const maxBudgetRule = rules.find(r => r.id === 'max_budget' && r.enabled);
        const minYieldForRebalance = rules.find(r => r.id === 'min_yield' && r.enabled);
        if (maxBudgetRule || minYieldForRebalance) {
          try {
            const mandate = {
              maxBudgetPerPosition: parseFloat(maxBudgetRule?.value || '50'),
              minYield: parseFloat(minYieldForRebalance?.value || '0'),
            };
            const rebalance = await agentFetch('/api/agent/rebalance', { method: 'POST', body: JSON.stringify({ mandate }) });
            if ((rebalance.actions || []).length > 0) {
              addLog({ type: 'decision', message: `Rebalance: ${rebalance.actions.length} action(s) suggested`, detail: rebalance.actions.map((a: any) => `${a.type} #${a.tokenId || a.sessionId}`).join(' · ') });
            }
          } catch { /* non-critical */ }
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
