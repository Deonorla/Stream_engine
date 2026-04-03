import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bot,
  Copy,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Store,
  Target,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { useWallet } from '../context/WalletContext';
import { useAgentWallet } from '../hooks/useAgentWallet';
import {
  fetchAgentMandate,
  fetchAgentState,
  fetchMarketAssets,
  pauseAgentRuntime,
  rebalanceMarketTreasury,
  saveAgentMandate,
  startAgentRuntime,
  tickAgentRuntime,
} from '../services/rwaApi.js';

type AgentStatus = 'running' | 'paused' | 'idle';

type LogEntry = {
  id: number | string;
  ts: number;
  type: 'action' | 'decision' | 'info' | 'error' | 'profit';
  message: string;
  detail?: string;
  amount?: string;
};

type MandateDraft = {
  targetReturnMinPct: string;
  approvalThreshold: string;
  liquidityFloorPct: string;
  rebalanceCadenceMinutes: string;
};

function formatShortAddress(value?: string | null) {
  if (!value) return 'Not connected';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatMoney(value: string | number | undefined, suffix = 'USDC') {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(2)} ${suffix}`;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const icons = {
    action: { Icon: Target, color: 'text-primary', bg: 'bg-blue-50' },
    decision: { Icon: Bot, color: 'text-purple-600', bg: 'bg-purple-50' },
    info: { Icon: Activity, color: 'text-slate-500', bg: 'bg-slate-100' },
    error: { Icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    profit: { Icon: TrendingUp, color: 'text-secondary', bg: 'bg-emerald-50' },
  };
  const iconConfig = icons[entry.type] || icons.info;
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconConfig.bg}`}>
        <iconConfig.Icon size={13} className={iconConfig.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 font-medium leading-snug">{entry.message}</p>
        {entry.detail && <p className="text-xs text-slate-400 mt-0.5">{entry.detail}</p>}
      </div>
      <div className="text-right shrink-0">
        {entry.amount && (
          <p className={`text-xs font-bold ${entry.amount.startsWith('+') ? 'text-secondary' : 'text-red-500'}`}>{entry.amount}</p>
        )}
        <p className="text-[10px] text-slate-300 mt-0.5">{time}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-slate-900' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
      <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-headline font-black ${color}`}>{value}</p>
    </div>
  );
}

export default function AgentConsolePage() {
  const { walletAddress } = useWallet();
  const { agentPublicKey, loading, error, activate } = useAgentWallet(walletAddress);

  const [showSettings, setShowSettings] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [state, setState] = useState<any>(null);
  const [marketAssets, setMarketAssets] = useState<any[]>([]);
  const [mandateDraft, setMandateDraft] = useState<MandateDraft>({
    targetReturnMinPct: '8',
    approvalThreshold: '250',
    liquidityFloorPct: '10',
    rebalanceCadenceMinutes: '60',
  });
  const [savingMandate, setSavingMandate] = useState(false);
  const [runtimeActionError, setRuntimeActionError] = useState('');
  const [treasurySessionId, setTreasurySessionId] = useState('');
  const [treasuryActionStatus, setTreasuryActionStatus] = useState<'idle' | 'loading' | 'ok' | '402' | 'err'>('idle');
  const [treasuryActionError, setTreasuryActionError] = useState('');
  const runtime = state?.runtime || {};
  const agentStatus: AgentStatus = runtime?.running
    ? 'running'
    : runtime?.status === 'paused'
      ? 'paused'
      : 'idle';

  const refreshState = useCallback(async () => {
    if (!agentPublicKey) {
      setState(null);
      return;
    }
    try {
      const [agentState, assets, mandate] = await Promise.all([
        fetchAgentState(agentPublicKey),
        fetchMarketAssets(),
        fetchAgentMandate(agentPublicKey),
      ]);
      setState(agentState);
      setMarketAssets(assets || []);
      if (mandate) {
        setMandateDraft({
          targetReturnMinPct: String(mandate.targetReturnMinPct ?? 8),
          approvalThreshold: String(mandate.approvalThreshold ?? 250),
          liquidityFloorPct: String(mandate.liquidityFloorPct ?? 10),
          rebalanceCadenceMinutes: String(mandate.rebalanceCadenceMinutes ?? 60),
        });
      }
    } catch (loadError) {
      console.error(loadError);
    }
  }, [agentPublicKey]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    if (!agentPublicKey || agentStatus !== 'running') return undefined;
    const interval = setInterval(() => {
      void refreshState();
    }, 10000);
    return () => clearInterval(interval);
  }, [agentPublicKey, agentStatus, refreshState]);

  const startAgent = useCallback(async () => {
    if (!agentPublicKey) return;
    setRuntimeActionError('');
    try {
      await startAgentRuntime(agentPublicKey, {
        executeTreasury: true,
        executeClaims: true,
      });
      await refreshState();
    } catch (runtimeError: any) {
      setRuntimeActionError(runtimeError.message || 'Failed to start the managed runtime.');
    }
  }, [agentPublicKey, mandateDraft, refreshState]);

  const pauseAgent = useCallback(async () => {
    if (!agentPublicKey) return;
    setRuntimeActionError('');
    try {
      await pauseAgentRuntime(agentPublicKey);
      await refreshState();
    } catch (runtimeError: any) {
      setRuntimeActionError(runtimeError.message || 'Failed to pause the managed runtime.');
    }
  }, [agentPublicKey, refreshState]);

  const runSingleTick = useCallback(async () => {
    if (!agentPublicKey) return;
    setRuntimeActionError('');
    try {
      await tickAgentRuntime(agentPublicKey);
      await refreshState();
    } catch (runtimeError: any) {
      setRuntimeActionError(runtimeError.message || 'Failed to run a managed tick.');
    }
  }, [agentPublicKey, refreshState]);

  const saveMandate = useCallback(async () => {
    if (!agentPublicKey) return;
    setSavingMandate(true);
    try {
      await saveAgentMandate(agentPublicKey, {
        targetReturnMinPct: Number(mandateDraft.targetReturnMinPct || 8),
        approvalThreshold: mandateDraft.approvalThreshold,
        liquidityFloorPct: Number(mandateDraft.liquidityFloorPct || 10),
        rebalanceCadenceMinutes: Number(mandateDraft.rebalanceCadenceMinutes || 60),
      });
      await refreshState();
    } finally {
      setSavingMandate(false);
    }
  }, [agentPublicKey, mandateDraft, refreshState]);

  const runTreasuryOptimization = useCallback(async () => {
    if (!agentPublicKey) return;
    setTreasuryActionStatus('loading');
    setTreasuryActionError('');
    try {
      await rebalanceMarketTreasury(treasurySessionId || undefined);
      setTreasuryActionStatus('ok');
      await refreshState();
    } catch (rebalanceError: any) {
      const message = rebalanceError?.message || 'Treasury optimization failed.';
      setTreasuryActionError(message);
      if (String(message).includes('402') || String(message).includes('Payment')) {
        setTreasuryActionStatus('402');
      } else {
        setTreasuryActionStatus('err');
      }
    }
  }, [agentPublicKey, refreshState, treasurySessionId]);

  const mergedLogs = useMemo<LogEntry[]>(() => (
    Array.isArray(state?.decisionLog) ? state.decisionLog.map((entry: any) => ({
      id: entry.id,
      ts: entry.ts,
      type: entry.type,
      message: entry.message,
      detail: entry.detail,
      amount: entry.amount,
    })) : []
  ), [state?.decisionLog]);

  const performance = state?.performance || {};
  const performanceAttribution = performance.attribution || {};
  const performanceEvents = Array.isArray(performance.recentEvents) ? [...performance.recentEvents].reverse() : [];
  const treasury = state?.treasury || { positions: [], summary: {} };
  const treasurySummary = treasury.summary || {};
  const treasuryHealth = treasurySummary.health || {};
  const treasuryOptimization = treasury.optimization || null;
  const reservations = state?.reservations || [];
  const savedScreens = state?.savedScreens || [];
  const watchlist = state?.watchlist || [];
  const positions = state?.positions || { assets: [], sessions: [] };
  const walletState = state?.wallet || { balances: [] };
  const screenHighlights = Array.isArray(runtime.lastSummary?.screenHighlights) ? runtime.lastSummary.screenHighlights : [];
  const watchlistHighlights = Array.isArray(runtime.lastSummary?.watchlistHighlights) ? runtime.lastSummary.watchlistHighlights : [];
  const runtimeStatusLabel = agentStatus === 'running'
    ? 'Running'
    : agentStatus === 'paused'
      ? 'Paused'
      : 'Idle';
  const totalAssets = Number(positions.assets?.length || 0);
  const totalReservations = reservations.reduce((sum: number, reservation: any) => sum + Number(reservation.reservedAmount || 0) / 1e7, 0);

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">Continuum</p>
          <h2 className="text-4xl font-headline font-bold tracking-tight text-on-surface">Agent Console</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            One autonomous market agent with a live mandate, wallet, treasury, and auction state.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => void refreshState()}
            className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={16} />
          </button>
          {agentPublicKey && (
            <button
              onClick={() => void runSingleTick()}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Run Tick
            </button>
          )}
          {!agentPublicKey ? (
            <button
              onClick={activate}
              disabled={loading || !walletAddress}
              className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-40"
            >
              {loading ? 'Preparing Agent...' : 'Create Managed Agent'}
            </button>
          ) : agentStatus === 'running' ? (
            <button onClick={pauseAgent} className="px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold">
              <Pause size={14} className="inline mr-2" />
              Pause Agent
            </button>
          ) : (
            <button onClick={startAgent} className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold">
              <Play size={14} className="inline mr-2" />
              Run Agent
            </button>
          )}
        </div>
      </div>

      {runtimeActionError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {runtimeActionError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Managed Wallet" value={formatShortAddress(agentPublicKey)} color="text-primary" />
        <StatCard label="Realized Yield" value={formatMoney(performance.realizedYield ? Number(performance.realizedYield) / 1e7 : 0)} color="text-secondary" />
        <StatCard label="Bid Reserves" value={formatMoney(totalReservations)} color="text-purple-600" />
        <StatCard label="Auction Wins" value={String(performance.auctionWins || 0)} color="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8">
        <div className="space-y-6">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-primary" />
                <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Live Mandate</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettings((value) => !value)}
                  className="text-xs font-bold text-slate-400 hover:text-primary"
                >
                  {showSettings ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={() => void saveMandate()}
                  disabled={!agentPublicKey || savingMandate}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {savingMandate ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {showSettings && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {[
                  { id: 'targetReturnMinPct', label: 'Target Return Floor', unit: '%' },
                  { id: 'approvalThreshold', label: 'Approval Threshold', unit: 'USDC' },
                  { id: 'liquidityFloorPct', label: 'Liquidity Floor', unit: '%' },
                  { id: 'rebalanceCadenceMinutes', label: 'Rebalance Cadence', unit: 'min' },
                ].map((field) => (
                  <div key={field.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-2">{field.label}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={mandateDraft[field.id as keyof MandateDraft]}
                        onChange={(event) => setMandateDraft((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))}
                        className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <span className="text-xs text-slate-400">{field.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Capital Base', value: `${state?.mandate?.capitalBase || '1000'} USDC` },
                { label: 'Liquidity Floor', value: `${state?.mandate?.liquidityFloorPct || mandateDraft.liquidityFloorPct}%` },
                { label: 'Approval Threshold', value: `${state?.mandate?.approvalThreshold || mandateDraft.approvalThreshold} USDC` },
                { label: 'Rebalance', value: `${state?.mandate?.rebalanceCadenceMinutes || mandateDraft.rebalanceCadenceMinutes} min` },
              ].map((item) => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                  <p className="text-sm font-bold text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={16} className="text-primary" />
              <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Wallet And Treasury</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Wallet Balances</p>
                {(walletState.balances || []).length === 0 ? (
                  <p className="text-sm text-slate-400">Activate the managed wallet to load live balances.</p>
                ) : (
                  (walletState.balances || []).map((balance: any) => (
                    <div key={`${balance.assetCode}-${balance.assetIssuer || 'native'}`} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{balance.assetCode}</span>
                      <span className="font-bold text-slate-800">{balance.balance}</span>
                    </div>
                  ))
                )}
                {agentPublicKey && (
                  <button
                    onClick={() => setShowFundModal(true)}
                    className="w-full py-2.5 rounded-xl border border-primary text-primary text-xs font-bold hover:bg-blue-50"
                  >
                    Fund Managed Wallet
                  </button>
                )}
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Treasury Positions</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={treasurySessionId}
                    onChange={(event) => setTreasurySessionId(event.target.value)}
                    placeholder="Optional Continuum payment session ID"
                    className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    onClick={() => void runTreasuryOptimization()}
                    disabled={!agentPublicKey || treasuryActionStatus === 'loading'}
                    className="w-full py-2.5 rounded-xl border border-primary text-primary text-xs font-bold hover:bg-blue-50 disabled:opacity-50"
                  >
                    {treasuryActionStatus === 'loading' ? 'Optimizing...' : 'Optimize Treasury · 0.02 USDC'}
                  </button>
                  {treasuryActionStatus === '402' && (
                    <p className="text-xs text-amber-700">Treasury optimization is paid. Reuse or enter a valid Continuum payment session first.</p>
                  )}
                  {treasuryActionStatus === 'err' && (
                    <p className="text-xs text-red-500">{treasuryActionError || 'Treasury optimization failed.'}</p>
                  )}
                  {treasuryActionStatus === 'ok' && (
                    <p className="text-xs text-secondary">Treasury optimization completed and refreshed the live state.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Deployed', value: formatMoney(Number(treasurySummary.deployed || 0) / 1e7) },
                    { label: 'Projected Return', value: formatMoney(Number(treasurySummary.projectedAnnualReturn || 0) / 1e7) },
                    { label: 'Weighted APY', value: `${Number(treasurySummary.weightedProjectedNetApy || 0).toFixed(2)}%` },
                    { label: 'Liquid Balance', value: formatMoney(Number(treasurySummary.liquidBalance || 0) / 1e7) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                      <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                      <p className="text-xs font-bold text-slate-800">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Safe Yield', ok: Boolean(treasuryHealth.safeYield?.ok) },
                    { label: 'Blend', ok: Boolean(treasuryHealth.blendLending?.ok) },
                    { label: 'Stellar AMM', ok: Boolean(treasuryHealth.stellarAmm?.ok) },
                  ].map((entry) => (
                    <span
                      key={entry.label}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                        entry.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {entry.label}
                    </span>
                  ))}
                </div>
                {(treasury.positions || []).length === 0 ? (
                  <p className="text-sm text-slate-400">No treasury deployments yet. Rebalance from the Marketplace flow after opening a payment session.</p>
                ) : (
                  (treasury.positions || []).map((position: any) => (
                    <div key={position.positionId} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold text-slate-800">{position.strategyFamily}</span>
                        <span className="text-secondary font-bold">{Number(position.projectedNetApy || 0).toFixed(2)}% APY</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{position.venueId}</p>
                      <p className="text-xs text-slate-400 mt-1">{formatMoney(Number(position.allocatedAmount || 0) / 1e7)}</p>
                    </div>
                  ))
                )}
                {treasuryOptimization && (
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400">Last Optimization</p>
                        <p className="text-sm font-bold text-slate-800">{treasuryOptimization.objective?.replaceAll('_', ' ') || 'highest approved return first'}</p>
                      </div>
                      <span className="rounded-full bg-purple-50 text-purple-600 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">
                        {String(treasuryOptimization.reason || 'rebalanced').replaceAll('_', ' ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Deployable', value: formatMoney(Number(treasuryOptimization.deployableAmount || 0) / 1e7) },
                        { label: 'Target Reserve', value: formatMoney(Number(treasuryOptimization.targetReserve || 0) / 1e7) },
                        { label: 'Deployments', value: String(treasuryOptimization.execution?.deploymentCount || 0) },
                        { label: 'Reserved', value: formatMoney(Number(treasuryOptimization.reservedAmount || 0) / 1e7) },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                          <p className="text-xs font-bold text-slate-800">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Selected Venues</p>
                      <div className="space-y-2">
                        {(treasuryOptimization.execution?.deployedVenues || []).length ? (
                          (treasuryOptimization.execution?.deployedVenues || []).map((venue: any) => (
                            <div key={`${venue.strategyFamily}-${venue.venueId}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-bold text-slate-800">{venue.venueId}</span>
                                <span className="text-xs font-bold text-secondary">{Number(venue.projectedNetApy || 0).toFixed(2)}% APY</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {venue.strategyFamily} · {formatMoney(Number(venue.allocatedAmount || 0) / 1e7)}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-400">No new treasury deployments were executed on the last optimization.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Eligible Venues</p>
                      <div className="space-y-2">
                        {(treasuryOptimization.candidates || []).map((candidate: any) => (
                          <div key={`${candidate.strategyFamily}-${candidate.venueId}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-bold text-slate-800">{candidate.label || candidate.venueId}</span>
                              <span className={`text-[10px] font-bold uppercase tracking-widest ${candidate.selected ? 'text-secondary' : 'text-slate-500'}`}>
                                {candidate.selected ? 'selected' : 'eligible'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {candidate.strategyFamily} · {Number(candidate.projectedNetApy || 0).toFixed(2)}% APY · cap room {formatMoney(Number(candidate.remainingCap || 0) / 1e7)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">
                      Recall order when liquidity is needed: {(treasuryOptimization.recallOrder || []).join(' → ')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-primary" />
              <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Decision Log</h3>
            </div>
            <div className="max-h-[30rem] overflow-y-auto">
              {mergedLogs.length === 0 ? (
                <p className="text-sm text-slate-400">The managed runtime hasn’t made any decisions yet.</p>
              ) : (
                mergedLogs.map((entry) => <LogRow key={`${entry.id}-${entry.ts}`} entry={entry} />)
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-primary" />
                <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Performance</h3>
              </div>
              <span className={cn(
                'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest',
                agentStatus === 'running'
                  ? 'bg-emerald-50 text-emerald-600'
                  : agentStatus === 'paused'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-slate-100 text-slate-500',
              )}>
                {runtimeStatusLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Last Tick</p>
                <p className="text-sm font-bold text-slate-800">
                  {runtime.lastTickAt ? new Date(Number(runtime.lastTickAt) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Heartbeat</p>
                <p className="text-sm font-bold text-slate-800">{String(runtime.heartbeatCount || 0)}</p>
              </div>
            </div>
            <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              Last loop: {String(runtime.lastSummary?.opportunities || 0)} opportunities · {String(runtime.lastSummary?.screenMatches || 0)} screen matches · {String(runtime.lastSummary?.watchlistSignals || 0)} watchlist signals · {String(runtime.lastSummary?.autoBids || 0)} auto bids
            </div>
            {runtime.lastError && (
              <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                {runtime.lastError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Net P&L', value: formatMoney(performance.netPnL ? Number(performance.netPnL) / 1e7 : 0), color: 'text-secondary' },
                { label: 'Gross Positive', value: formatMoney(performanceAttribution.grossPositivePnL ? Number(performanceAttribution.grossPositivePnL) / 1e7 : 0), color: 'text-primary' },
                { label: 'Fees Paid', value: formatMoney(performance.paidActionFees ? Number(performance.paidActionFees) / 1e7 : 0), color: 'text-amber-600' },
                { label: 'Realized Yield', value: formatMoney(performance.realizedYield ? Number(performance.realizedYield) / 1e7 : 0), color: 'text-secondary' },
                { label: 'Treasury Return', value: formatMoney(performance.treasuryReturn ? Number(performance.treasuryReturn) / 1e7 : 0), color: 'text-purple-600' },
                { label: 'Auction Win Rate', value: `${Number(performanceAttribution.winRatePct || 0).toFixed(1)}%`, color: 'text-slate-700' },
              ].map((item) => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400">Attribution</p>
                  <p className="text-sm font-bold text-slate-800">How yield, treasury, fees, and auctions are shaping this book</p>
                </div>
                <span className="rounded-full bg-white border border-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {String(performanceAttribution.totalAuctionOutcomes || 0)} outcomes
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Yield Contribution', value: formatMoney(performanceAttribution.yieldContribution ? Number(performanceAttribution.yieldContribution) / 1e7 : 0) },
                  { label: 'Treasury Contribution', value: formatMoney(performanceAttribution.treasuryContribution ? Number(performanceAttribution.treasuryContribution) / 1e7 : 0) },
                  { label: 'Fee Drag', value: formatMoney(performanceAttribution.feeDrag ? Number(performanceAttribution.feeDrag) / 1e7 : 0) },
                  { label: 'Auction Record', value: `${String(performanceAttribution.auctionWins || 0)}W / ${String(performanceAttribution.auctionLosses || 0)}L` },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                    <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                    <p className="text-xs font-bold text-slate-800">{item.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Recent Performance Events</p>
                <div className="space-y-2">
                  {performanceEvents.length === 0 ? (
                    <p className="text-sm text-slate-400">No realized performance events yet.</p>
                  ) : (
                    performanceEvents.slice(0, 6).map((event: any) => (
                      <div key={event.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{event.label}</p>
                            <p className="text-xs text-slate-500 mt-1">{String(event.category || 'event').toUpperCase()}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-bold ${
                              event.direction === 'inflow'
                                ? 'text-secondary'
                                : event.direction === 'outflow'
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                            }`}>
                              {event.amount ? formatMoney(Number(event.amount || 0) / 1e7) : 'Tracked'}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {event.ts ? new Date(Number(event.ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-primary" />
              <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Active Bid Reserves</h3>
            </div>
            {reservations.length === 0 ? (
              <p className="text-sm text-slate-400">No active auction reservations yet.</p>
            ) : (
              <div className="space-y-3">
                {reservations.map((reservation: any) => (
                  <div key={reservation.bidId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-800">Auction #{reservation.auctionId}</p>
                      <span className="text-xs font-bold text-purple-600">{formatMoney(Number(reservation.reservedAmount || 0) / 1e7)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Bid #{reservation.bidId} · issuer {formatShortAddress(reservation.issuer)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Store size={16} className="text-purple-600" />
                <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Continuum Market</h3>
              </div>
              <Link to="/app/marketplace" className="text-[10px] font-bold text-slate-400 hover:text-primary">
                Open Marketplace
              </Link>
            </div>
            <div className="space-y-3">
              {marketAssets.slice(0, 5).map((asset: any) => (
                <motion.div
                  key={asset.tokenId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{asset.publicMetadata?.name || asset.name || `Asset #${asset.tokenId}`}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {asset.market?.activeAuction ? `Auction #${asset.market.activeAuction.auctionId}` : 'No active auction'}
                      </p>
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full',
                      asset.market?.hasActiveAuction ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500',
                    )}>
                      {asset.market?.hasActiveAuction ? 'Live Auction' : 'Browse'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-primary" />
                <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Shortlist Signals</h3>
              </div>
              <Link to="/app/marketplace" className="text-[10px] font-bold text-slate-400 hover:text-primary">
                Manage In Marketplace
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Saved Screens</p>
                <p className="text-lg font-bold text-slate-800">{String(savedScreens.length)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Watchlist Twins</p>
                <p className="text-lg font-bold text-slate-800">{String(watchlist.length)}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Saved Screen Matches</p>
                <div className="space-y-2">
                  {screenHighlights.length === 0 ? (
                    <p className="text-sm text-slate-400">No saved-screen shortlist matches on the last runtime loop.</p>
                  ) : (
                    screenHighlights.map((entry: any) => (
                      <div key={entry.screenId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{entry.name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {String(entry.matches)} matches · top twin #{entry.topTokenId}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                            score {Number(entry.topScore || 0).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Watchlist Signals</p>
                <div className="space-y-2">
                  {watchlistHighlights.length === 0 ? (
                    <p className="text-sm text-slate-400">No live watchlist signals on the last runtime loop.</p>
                  ) : (
                    watchlistHighlights.map((entry: any) => (
                      <div key={entry.tokenId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{entry.name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Twin #{entry.tokenId} · {Array.isArray(entry.reasons) ? entry.reasons.join(' · ') : 'signal'}
                            </p>
                          </div>
                          <span className={cn(
                            'text-[10px] font-bold uppercase tracking-widest',
                            entry.severity === 'high'
                              ? 'text-red-500'
                              : entry.severity === 'medium'
                                ? 'text-amber-600'
                                : 'text-primary',
                          )}>
                            {entry.hasLiveAuction ? 'live auction' : entry.severity || 'info'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Bot size={16} className="text-primary" />
              <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Positions</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Owned Twins</p>
                <p className="text-lg font-bold text-slate-800">{totalAssets}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Payment Sessions</p>
                <p className="text-lg font-bold text-slate-800">{positions.sessions?.length || 0}</p>
              </div>
            </div>
            <div className="space-y-3">
              {(positions.assets || []).slice(0, 4).map((asset: any) => (
                <div key={asset.tokenId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800">Twin #{asset.tokenId}</p>
                  <span className="text-xs font-bold text-secondary">{formatMoney(Number(asset.claimableYield || 0) / 1e7)}</span>
                </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {(asset.verificationStatusLabel || asset.verificationStatus)} · platform/economic ownership only
                  </p>
                </div>
              ))}
              {totalAssets === 0 && <p className="text-sm text-slate-400">No asset twins acquired yet.</p>}
            </div>
          </div>
        </div>
      </div>

      {showFundModal && agentPublicKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-primary" />
                <p className="text-sm font-bold text-slate-900">Fund Managed Agent</p>
              </div>
              <button onClick={() => setShowFundModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-2">
              <p className="text-[9px] uppercase tracking-widest text-slate-400">Agent Address</p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-slate-700 truncate flex-1">{agentPublicKey}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(agentPublicKey)}
                  className="text-slate-400 hover:text-primary"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <button
              onClick={() => window.open(`https://friendbot.stellar.org/?addr=${agentPublicKey}`, '_blank', 'noopener')}
              className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:opacity-90"
            >
              Get Testnet XLM
            </button>
            <p className="text-xs text-slate-500">
              Send USDC directly to the managed agent address after trustline setup so it can bid, settle, and rebalance treasury on your behalf.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
