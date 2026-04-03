import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import {
  fetchAgentState,
  startAgentRuntime,
  pauseAgentRuntime,
} from '../services/rwaApi.js';

export type LogEntry = {
  id: number | string;
  ts: number;
  type: 'action' | 'decision' | 'info' | 'error' | 'profit';
  message: string;
  detail?: string;
  amount?: string;
};

type AgentStatus = 'idle' | 'running' | 'paused';

interface AgentLoopCtx {
  logs: LogEntry[];
  agentStatus: AgentStatus;
  agentState: any;
  refreshState: (key: string) => Promise<void>;
  startAgent: (agentPublicKey: string) => Promise<void>;
  pauseAgent: (agentPublicKey: string) => Promise<void>;
}

const AgentLoopContext = createContext<AgentLoopCtx | null>(null);

export function AgentLoopProvider({ children }: { children: ReactNode }) {
  const [agentState, setAgentState] = useState<any>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const logs: LogEntry[] = Array.isArray(agentState?.decisionLog)
    ? agentState.decisionLog.map((e: any) => ({
        id: e.id,
        ts: e.ts,
        type: e.type,
        message: e.message,
        detail: e.detail,
        amount: e.amount,
      }))
    : [];

  const refreshState = useCallback(async (agentPublicKey: string) => {
    if (!agentPublicKey) return;
    try {
      const s = await fetchAgentState(agentPublicKey);
      setAgentState(s);
      const running = s?.runtime?.running;
      const status = s?.runtime?.status;
      setAgentStatus(running ? 'running' : status === 'paused' ? 'paused' : 'idle');
    } catch { /* non-critical */ }
  }, []);

  const startAgent = useCallback(async (agentPublicKey: string) => {
    await startAgentRuntime(agentPublicKey, { executeTreasury: true, executeClaims: true });
    await refreshState(agentPublicKey);
    // poll every 10s while running
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => refreshState(agentPublicKey), 10000);
  }, [refreshState]);

  const pauseAgent = useCallback(async (agentPublicKey: string) => {
    await pauseAgentRuntime(agentPublicKey);
    await refreshState(agentPublicKey);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, [refreshState]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  return (
    <AgentLoopContext.Provider value={{ logs, agentStatus, agentState, refreshState, startAgent, pauseAgent }}>
      {children}
    </AgentLoopContext.Provider>
  );
}

export function useAgentLoopContext() {
  const ctx = useContext(AgentLoopContext);
  if (!ctx) throw new Error('useAgentLoopContext must be used inside AgentLoopProvider');
  return ctx;
}
