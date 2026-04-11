import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart2, Bot, Copy, Pause, Play,
  RefreshCw, Settings, Store, Target, TrendingUp, Wallet, X,
  Zap, ChevronDown, ChevronUp, ArrowUpRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/cn';
import { useWallet } from '../context/WalletContext';
import { useAgentWallet } from '../hooks/useAgentWallet';
import { useAgentLoopContext } from '../context/AgentLoopContext';
import { paymentTokenSymbol, settlementRecipientAddress } from '../contactInfo.js';
import {
  cancelAgentPaymentSession,
  chatWithAgent,
  claimMarketYield,
  fetchAgentMandate,
  fetchAgentState,
  fetchAgentWalletState,
  fetchMarketAssets,
  openAgentPaymentSession,
  placeAuctionBid,
  rebalanceMarketTreasury,
  routeMarketYield,
  saveAgentMandate,
  saveAgentObjective,
  settleAuction,
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
  capitalBase: string;
  approvedAssetClasses: string[];
  issuerCapPct: string;
  assetCapPct: string;
  targetReturnMinPct: string;
  targetReturnMaxPct: string;
  approvalThreshold: string;
  liquidityFloorPct: string;
  allowedTreasuryStrategies: string[];
  maxDrawdownPct: string;
  rebalanceCadenceMinutes: string;
};

type ObjectiveDraft = {
  goal: string;
  style: string;
  instructions: string;
};

const ASSET_CLASS_OPTIONS = [
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'land',        label: 'Land' },
];

const TREASURY_STRATEGY_OPTIONS = [
  { value: 'safe_yield',    label: 'Safe Yield' },
  { value: 'blend_lending', label: 'Blend Lending' },
  { value: 'stellar_amm',   label: 'Stellar AMM' },
];

function toggleListValue(current: string[], value: string) {
  if (current.includes(value)) return current.length === 1 ? current : current.filter(e => e !== value);
  return [...current, value];
}

function formatOptionList(values: string[], options: { value: string; label: string }[]) {
  if (!Array.isArray(values) || values.length === 0) return 'Not set';
  return values.map(v => options.find(o => o.value === v)?.label || v).filter(Boolean).join(' · ');
}

function formatCountdown(endTime?: number) {
  if (!endTime) return 'Not scheduled';
  const seconds = Math.max(0, Number(endTime) - Math.floor(Date.now() / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0 && minutes <= 0) return 'Ready to settle';
  if (hours <= 0) return `${minutes}m left`;
  return `${hours}h ${minutes}m left`;
}

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
    action:   { Icon: Zap,           color: 'text-blue-500',   bg: 'bg-blue-50',    dot: 'bg-blue-400' },
    decision: { Icon: Bot,           color: 'text-purple-500', bg: 'bg-purple-50',  dot: 'bg-purple-400' },
    info:     { Icon: Activity,      color: 'text-slate-400',  bg: 'bg-slate-100',  dot: 'bg-slate-300' },
    error:    { Icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50',     dot: 'bg-red-400' },
    profit:   { Icon: TrendingUp,    color: 'text-emerald-500',bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
  };
  const cfg = icons[entry.type] || icons.info;
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 group">
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
        <cfg.Icon size={13} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 font-medium leading-snug">{entry.message}</p>
        {entry.detail && <p className="text-xs text-slate-400 mt-0.5">{entry.detail}</p>}
      </div>
      <div className="text-right shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {entry.amount && (
          <p className={`text-xs font-bold ${entry.amount.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}>{entry.amount}</p>
        )}
        <p className="text-[10px] text-slate-300 mt-0.5">{time}</p>
      </div>
    </motion.div>
  );
}

function SectionCard({ title, icon: Icon, iconColor = 'text-primary', children, action, collapsible = false }: {
  title: string; icon: any; iconColor?: string; children: React.ReactNode;
  action?: React.ReactNode; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className={cn('flex items-center justify-between px-5 py-4 border-b border-slate-50', collapsible && 'cursor-pointer')}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center`}>
            <Icon size={14} className={iconColor} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-600">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {action}
          {collapsible && (open ? <ChevronUp size={14} className="text-slate-300" /> : <ChevronDown size={14} className="text-slate-300" />)}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {(!collapsible || open) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}>
            <div className="p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KV({ label, value, color = 'text-slate-800' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function AgentConsolePage() {
  const { walletAddress } = useWallet();
  const { agentPublicKey, loading, error, activate } = useAgentWallet(walletAddress);
  const { logs: contextLogs, agentStatus: contextStatus, agentState: contextState, refreshState: refreshLoopState, startAgent: ctxStart, pauseAgent: ctxPause } = useAgentLoopContext();

  const [showSettings, setShowSettings] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [state, setState] = useState<any>(null);
  const [walletSnapshot, setWalletSnapshot] = useState<any>(null);
  const [marketAssets, setMarketAssets] = useState<any[]>([]);
  const [mandateDraft, setMandateDraft] = useState<MandateDraft>({
    capitalBase: '1000',
    approvedAssetClasses: ['real_estate', 'land'],
    issuerCapPct: '40',
    assetCapPct: '25',
    targetReturnMinPct: '8',
    targetReturnMaxPct: '18',
    approvalThreshold: '250',
    liquidityFloorPct: '10',
    allowedTreasuryStrategies: ['safe_yield', 'blend_lending', 'stellar_amm'],
    maxDrawdownPct: '20',
    rebalanceCadenceMinutes: '60',
  });
  const [objectiveDraft, setObjectiveDraft] = useState<ObjectiveDraft>({
    goal: 'Grow capital safely through productive RWA opportunities.',
    style: 'balanced',
    instructions: '',
  });
  const [savingMandate, setSavingMandate] = useState(false);
  const [savingObjective, setSavingObjective] = useState(false);
  const [runtimeActionError, setRuntimeActionError] = useState('');
  const [settlePendingAuctionId, setSettlePendingAuctionId] = useState<number | null>(null);
  const [rebidPendingAuctionId, setRebidPendingAuctionId] = useState<number | null>(null);
  const [reserveActionStatus, setReserveActionStatus] = useState<'idle' | 'ok' | '402' | 'err'>('idle');
  const [reserveActionMessage, setReserveActionMessage] = useState('');
  const [treasurySessionId, setTreasurySessionId] = useState('');
  const [managedSessionBudget, setManagedSessionBudget] = useState('5');
  const [managedSessionStatus, setManagedSessionStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [managedSessionError, setManagedSessionError] = useState('');
  const [managedSessionMessage, setManagedSessionMessage] = useState('');
  const [treasuryActionStatus, setTreasuryActionStatus] = useState<'idle' | 'loading' | 'ok' | '402' | 'err'>('idle');
  const [treasuryActionError, setTreasuryActionError] = useState('');
  const [yieldRouteTokenId, setYieldRouteTokenId] = useState('');
  const [yieldClaimStatus, setYieldClaimStatus] = useState<'idle' | 'loading' | 'ok' | '402' | 'err'>('idle');
  const [yieldClaimError, setYieldClaimError] = useState('');
  const [yieldRouteStatus, setYieldRouteStatus] = useState<'idle' | 'loading' | 'ok' | '402' | 'err'>('idle');
  const [yieldRouteError, setYieldRouteError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [startingAgent, setStartingAgent] = useState(false);

  const activeState = contextState || state;
  const runtime = activeState?.runtime || {};
  const agentStatus: AgentStatus = contextStatus !== 'idle' ? contextStatus : (
    runtime?.running ? 'running' : runtime?.status === 'paused' ? 'paused' : 'idle'
  );

  const doRefreshState = useCallback(async () => {
    if (!agentPublicKey) { setState(null); setWalletSnapshot(null); return; }
    await refreshLoopState(agentPublicKey);
    try {
      const [agentState, assets, mandate, wallet] = await Promise.all([
        fetchAgentState(agentPublicKey),
        fetchMarketAssets(),
        fetchAgentMandate(agentPublicKey),
        fetchAgentWalletState(agentPublicKey),
      ]);
      setState(agentState);
      setWalletSnapshot(wallet);
      setMarketAssets(assets || []);
      if (mandate) {
        setMandateDraft({
          capitalBase: String(mandate.capitalBase ?? 1000),
          approvedAssetClasses: Array.isArray(mandate.approvedAssetClasses) && mandate.approvedAssetClasses.length ? mandate.approvedAssetClasses : ['real_estate', 'land'],
          issuerCapPct: String(mandate.issuerCapPct ?? 40),
          assetCapPct: String(mandate.assetCapPct ?? 25),
          targetReturnMinPct: String(mandate.targetReturnMinPct ?? 8),
          targetReturnMaxPct: String(mandate.targetReturnMaxPct ?? 18),
          approvalThreshold: String(mandate.approvalThreshold ?? 250),
          liquidityFloorPct: String(mandate.liquidityFloorPct ?? 10),
          allowedTreasuryStrategies: Array.isArray(mandate.allowedTreasuryStrategies) && mandate.allowedTreasuryStrategies.length ? mandate.allowedTreasuryStrategies : ['safe_yield', 'blend_lending', 'stellar_amm'],
          maxDrawdownPct: String(mandate.maxDrawdownPct ?? 20),
          rebalanceCadenceMinutes: String(mandate.rebalanceCadenceMinutes ?? 60),
        });
      }
      if (agentState?.objective) {
        setObjectiveDraft({
          goal: String(agentState.objective.goal || 'Grow capital safely through productive RWA opportunities.'),
          style: String(agentState.objective.style || 'balanced'),
          instructions: String(agentState.objective.instructions || ''),
        });
      }
    } catch (loadError) { console.error(loadError); }
  }, [agentPublicKey, refreshLoopState]);

  useEffect(() => { void doRefreshState(); }, [doRefreshState]);

  const startAgent = useCallback(async () => {
    if (!agentPublicKey) return;
    setRuntimeActionError('');
    setStartingAgent(true);
    try {
      await ctxStart(agentPublicKey);
    } catch (runtimeError: any) {
      setRuntimeActionError(runtimeError.message || 'Failed to start the managed runtime.');
    } finally {
      setStartingAgent(false);
    }
  }, [agentPublicKey, ctxStart]);

  const pauseAgent = useCallback(async () => {
    if (!agentPublicKey) return;
    setRuntimeActionError('');
    try {
      await ctxPause(agentPublicKey);
    } catch (runtimeError: any) {
      setRuntimeActionError(runtimeError.message || 'Failed to pause the managed runtime.');
    }
  }, [agentPublicKey, ctxPause]);

  const runSingleTick = useCallback(async () => {
    if (!agentPublicKey) return;
    setRuntimeActionError('');
    try {
      await tickAgentRuntime(agentPublicKey);
      await doRefreshState();
    } catch (runtimeError: any) {
      setRuntimeActionError(runtimeError.message || 'Failed to run a managed tick.');
    }
  }, [agentPublicKey, doRefreshState]);

  const saveMandate = useCallback(async () => {
    if (!agentPublicKey) return;
    setSavingMandate(true);
    try {
      await saveAgentMandate(agentPublicKey, {
        capitalBase: mandateDraft.capitalBase,
        approvedAssetClasses: mandateDraft.approvedAssetClasses,
        issuerCapPct: Number(mandateDraft.issuerCapPct || 40),
        assetCapPct: Number(mandateDraft.assetCapPct || 25),
        targetReturnMinPct: Number(mandateDraft.targetReturnMinPct || 8),
        targetReturnMaxPct: Number(mandateDraft.targetReturnMaxPct || 18),
        approvalThreshold: mandateDraft.approvalThreshold,
        liquidityFloorPct: Number(mandateDraft.liquidityFloorPct || 10),
        allowedTreasuryStrategies: mandateDraft.allowedTreasuryStrategies,
        maxDrawdownPct: Number(mandateDraft.maxDrawdownPct || 20),
        rebalanceCadenceMinutes: Number(mandateDraft.rebalanceCadenceMinutes || 60),
      });
      await doRefreshState();
    } finally {
      setSavingMandate(false);
    }
  }, [agentPublicKey, mandateDraft, doRefreshState]);

  const saveObjective = useCallback(async () => {
    if (!agentPublicKey) return;
    setSavingObjective(true);
    setChatError('');
    try {
      await saveAgentObjective(agentPublicKey, objectiveDraft);
      await doRefreshState();
    } catch (objectiveError: any) {
      setChatError(objectiveError?.message || 'Could not save the agent objective.');
    } finally {
      setSavingObjective(false);
    }
  }, [agentPublicKey, objectiveDraft, doRefreshState]);

  const runTreasuryOptimization = useCallback(async () => {
    if (!agentPublicKey) return;
    setTreasuryActionStatus('loading');
    setTreasuryActionError('');
    try {
      await rebalanceMarketTreasury(treasurySessionId || undefined);
      setTreasuryActionStatus('ok');
      await doRefreshState();
    } catch (rebalanceError: any) {
      const message = rebalanceError?.message || 'Treasury optimization failed.';
      setTreasuryActionError(message);
      if (String(message).includes('402') || String(message).includes('Payment')) {
        setTreasuryActionStatus('402');
      } else {
        setTreasuryActionStatus('err');
      }
    }
  }, [agentPublicKey, doRefreshState, treasurySessionId]);

  const routeYieldIntoTreasury = useCallback(async () => {
    if (!agentPublicKey) return;
    setYieldRouteStatus('loading'); setYieldRouteError('');
    try {
      await routeMarketYield(yieldRouteTokenId ? { tokenId: Number(yieldRouteTokenId) } : {}, treasurySessionId || undefined);
      setYieldRouteStatus('ok'); await doRefreshState();
    } catch (e: any) {
      const msg = e?.message || 'Yield routing failed.';
      setYieldRouteError(msg);
      setYieldRouteStatus(String(msg).includes('402') || String(msg).includes('Payment') ? '402' : 'err');
    }
  }, [agentPublicKey, doRefreshState, treasurySessionId, yieldRouteTokenId]);

  const claimYieldDirect = useCallback(async () => {
    if (!agentPublicKey || !yieldRouteTokenId) return;
    setYieldClaimStatus('loading'); setYieldClaimError('');
    try {
      await claimMarketYield(Number(yieldRouteTokenId), treasurySessionId || undefined);
      setYieldClaimStatus('ok'); await doRefreshState();
    } catch (e: any) {
      const msg = e?.message || 'Yield claim failed.';
      setYieldClaimError(msg);
      setYieldClaimStatus(String(msg).includes('402') || String(msg).includes('Payment') ? '402' : 'err');
    }
  }, [agentPublicKey, doRefreshState, treasurySessionId, yieldRouteTokenId]);

  const openManagedSession = useCallback(async () => {
    if (!agentPublicKey) return;
    setManagedSessionStatus('loading'); setManagedSessionError(''); setManagedSessionMessage('');
    try {
      const response = await openAgentPaymentSession(agentPublicKey, {
        amount: managedSessionBudget || '5',
        durationSeconds: 3 * 60 * 60,
        metadata: { lane: 'continuum_console', purpose: 'managed_paid_actions', product: 'continuum' },
      });
      setManagedSessionStatus('ok');
      if (response?.session?.id) setTreasurySessionId(String(response.session.id));
      await doRefreshState();
      setManagedSessionMessage('Managed payment session opened and selected for reuse.');
    } catch (e: any) {
      setManagedSessionStatus('err');
      setManagedSessionError(e?.message || 'Could not open a managed payment session.');
    }
  }, [agentPublicKey, managedSessionBudget, doRefreshState]);

  const cancelManagedSession = useCallback(async (sessionId: string | number) => {
    if (!agentPublicKey) return;
    setManagedSessionStatus('loading'); setManagedSessionError(''); setManagedSessionMessage('');
    try {
      const response = await cancelAgentPaymentSession(agentPublicKey, sessionId);
      await doRefreshState();
      setManagedSessionStatus('ok');
      const refundable = Number(response?.refundableAmount || 0) / 1e7;
      setManagedSessionMessage(`Session #${sessionId} ended. ${formatMoney(refundable)} returned.`);
    } catch (e: any) {
      setManagedSessionStatus('err');
      setManagedSessionError(e?.message || 'Could not end the selected session.');
    }
  }, [agentPublicKey, doRefreshState]);

  const settleReservedAuction = useCallback(async (auctionId: number) => {
    if (!agentPublicKey) return;
    setSettlePendingAuctionId(auctionId); setReserveActionStatus('idle'); setReserveActionMessage('');
    try {
      await settleAuction(auctionId);
      setReserveActionStatus('ok');
      setReserveActionMessage(`Auction #${auctionId} settled.`);
      await doRefreshState();
    } catch (e: any) {
      setReserveActionStatus('err');
      setReserveActionMessage(e?.message || 'Could not settle the auction.');
    } finally { setSettlePendingAuctionId(null); }
  }, [agentPublicKey, doRefreshState]);

  const rebidReservedAuction = useCallback(async (auctionId: number, nextBidAmount: string) => {
    if (!agentPublicKey) return;
    setRebidPendingAuctionId(auctionId); setReserveActionStatus('idle'); setReserveActionMessage('');
    try {
      await placeAuctionBid(auctionId, { amount: nextBidAmount, sessionId: treasurySessionId || undefined });
      setReserveActionStatus('ok');
      setReserveActionMessage(`Rebid placed at ${nextBidAmount} USDC.`);
      await doRefreshState();
    } catch (e: any) {
      const msg = e?.message || 'Could not place the rebid.';
      setReserveActionStatus(String(msg).includes('402') || String(msg).includes('Payment') ? '402' : 'err');
      setReserveActionMessage(msg);
    } finally { setRebidPendingAuctionId(null); }
  }, [agentPublicKey, doRefreshState, treasurySessionId]);

  const sendAgentChat = useCallback(async () => {
    if (!agentPublicKey || !chatInput.trim()) return;
    setChatPending(true);
    setChatError('');
    try {
      const response = await chatWithAgent(agentPublicKey, chatInput.trim());
      setChatInput('');
      if (response?.objective) {
        setObjectiveDraft({
          goal: String(response.objective.goal || objectiveDraft.goal),
          style: String(response.objective.style || objectiveDraft.style),
          instructions: String(response.objective.instructions || objectiveDraft.instructions),
        });
      }
      await doRefreshState();
    } catch (chatFailure: any) {
      setChatError(chatFailure?.message || 'Could not send the message to the agent.');
    } finally {
      setChatPending(false);
    }
  }, [agentPublicKey, chatInput, doRefreshState, objectiveDraft]);

  // Use shared context logs (sourced from server decisionLog) — fall back to local state
  const mergedLogs = useMemo<LogEntry[]>(() => {
    if (contextLogs.length > 0) return contextLogs;
    return Array.isArray(activeState?.decisionLog) ? activeState.decisionLog.map((entry: any) => ({
      id: entry.id, ts: entry.ts, type: entry.type,
      message: entry.message, detail: entry.detail, amount: entry.amount,
    })) : [];
  }, [contextLogs, activeState?.decisionLog]);

  const performance = activeState?.performance || {};
  const defiMetrics = performance.defiMetrics || {};
  const objective = activeState?.objective || {};
  const brain = activeState?.brain || {};
  const performanceAttribution = performance.attribution || {};
  const performanceEvents = Array.isArray(performance.recentEvents) ? [...performance.recentEvents].reverse() : [];
  const journalPreview = Array.isArray(activeState?.journalPreview) ? activeState.journalPreview : [];
  const chatPreview = Array.isArray(activeState?.chatPreview) ? activeState.chatPreview : [];
  const treasury = activeState?.treasury || { positions: [], summary: {} };
  const treasurySummary = treasury.summary || {};
  const treasuryHealth = treasurySummary.health || {};
  const treasuryOptimization = treasury.optimization || null;
  const reservations = activeState?.reservations || [];
  const reservationExposure = Array.isArray(activeState?.reservationExposure) ? activeState.reservationExposure : [];
  const liquidity = activeState?.liquidity || null;
  const savedScreens = activeState?.savedScreens || [];
  const watchlist = activeState?.watchlist || [];
  const positions = activeState?.positions || { assets: [], sessions: [] };
  const walletState = walletSnapshot || activeState?.wallet || { balances: [] };
  const walletSummary = walletSnapshot?.summary || null;
  const managedPaymentSessions = useMemo(
    () => (Array.isArray(positions.sessions) ? positions.sessions : []).filter((s: any) => {
      const target = String(settlementRecipientAddress || '').toUpperCase();
      const recipient = String(s?.recipient || '').toUpperCase();
      return target ? recipient === target && Boolean(s?.isActive) : Boolean(s?.isActive);
    }),
    [positions.sessions],
  );
  const selectedManagedSession = useMemo(
    () => managedPaymentSessions.find((s: any) => String(s.id) === String(treasurySessionId)) || null,
    [managedPaymentSessions, treasurySessionId],
  );
  const screenHighlights = Array.isArray(runtime.lastSummary?.screenHighlights) ? runtime.lastSummary.screenHighlights : [];
  const watchlistHighlights = Array.isArray(runtime.lastSummary?.watchlistHighlights) ? runtime.lastSummary.watchlistHighlights : [];
  const bidFocus = runtime.lastSummary?.bidFocus || null;
  const currentThesis = String(brain.currentThesis || '').trim() || 'The agent has not formed a visible thesis yet.';
  const nextPlannedAction = String(brain?.nextAction?.actionType || runtime.lastSummary?.plannedAction?.actionType || 'hold').replace(/_/g, ' ');
  const blockedBy = String(brain.blockedBy || runtime.lastSummary?.blockedBy || '').trim();
  const wakeReason = String(brain.wakeReason || runtime.lastSummary?.wakeReason || 'scheduled').replace(/_/g, ' ');
  const degradedMode = Boolean(brain.degradedMode);
  const degradedReason = String(brain.degradedReason || '').trim();
  const reservationSummary = useMemo(() => ({
    leading: reservationExposure.filter((e: any) => e.isLeading).length,
    outbid: reservationExposure.filter((e: any) => e.status === 'outbid').length,
    readyToSettle: reservationExposure.filter((e: any) => e.readyToSettle && e.isLeading).length,
  }), [reservationExposure]);
  const managedSessionSummary = useMemo(() => ({
    active: managedPaymentSessions.length,
    refundable: managedPaymentSessions.reduce((s: number, x: any) => s + Number(x?.refundableAmount || 0) / 1e7, 0),
    claimable: managedPaymentSessions.reduce((s: number, x: any) => s + Number(x?.claimableInitial || 0) / 1e7, 0),
  }), [managedPaymentSessions]);

  useEffect(() => {
    if (!managedPaymentSessions.length) { if (treasurySessionId) setTreasurySessionId(''); return; }
    if (!treasurySessionId || !managedPaymentSessions.some((s: any) => String(s.id) === String(treasurySessionId))) {
      setTreasurySessionId(String(managedPaymentSessions[0].id));
    }
  }, [managedPaymentSessions, treasurySessionId]);
  const totalAssets = Number(positions.assets?.length || 0);
  const totalReservations = reservations.reduce((sum: number, reservation: any) => sum + Number(reservation.reservedAmount || 0) / 1e7, 0);

  return (
    <div className="min-h-screen bg-slate-50/50">

      {/* ── Hero header ── */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl ethereal-gradient flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Bot size={20} className="text-white" />
              </div>
              <span className={cn('absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white',
                agentStatus === 'running' ? 'bg-emerald-400 animate-pulse' :
                agentStatus === 'paused'  ? 'bg-amber-400' : 'bg-slate-300')} />
            </div>
            <div>
              <h1 className="text-lg font-headline font-bold text-slate-900">Agent Console</h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {agentPublicKey ? `${agentPublicKey.slice(0,8)}…${agentPublicKey.slice(-6)}` : 'No agent wallet'}
                <span className={cn('ml-2 font-sans font-bold',
                  agentStatus === 'running' ? 'text-emerald-500' :
                  agentStatus === 'paused'  ? 'text-amber-500' : 'text-slate-400')}>
                  · {agentStatus === 'running' ? 'Running' : agentStatus === 'paused' ? 'Paused' : 'Idle'}
                </span>
              </p>
            </div>
          </div>

          {/* KPI strip */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Net P&L',      value: formatMoney(performance.netPnL ? Number(performance.netPnL)/1e7 : 0),   color: 'text-emerald-600' },
              { label: 'Yield',        value: formatMoney(performance.realizedYield ? Number(performance.realizedYield)/1e7 : 0), color: 'text-blue-600' },
              { label: 'Bid Reserves', value: formatMoney(totalReservations),                                           color: 'text-purple-600' },
              { label: 'Wins',         value: String(performance.auctionWins || 0),                                     color: 'text-amber-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                  <p className={`text-sm font-headline font-bold ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button onClick={() => void doRefreshState()}
              className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50 transition-all">
              <RefreshCw size={15} />
            </button>
            {agentPublicKey && (
              <button onClick={() => void runSingleTick()}
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
                Run Tick
              </button>
            )}
            {!agentPublicKey ? (
              <button onClick={activate} disabled={loading || !walletAddress}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/20 hover:scale-105 transition-all disabled:opacity-40">
                <Bot size={14} /> {loading ? 'Preparing…' : 'Create Agent'}
              </button>
            ) : agentStatus === 'running' ? (
              <button onClick={pauseAgent}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:scale-105 transition-all">
                <Pause size={14} /> Pause
              </button>
            ) : (
              <button onClick={startAgent} disabled={startingAgent}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/20 hover:scale-105 transition-all disabled:opacity-60">
                {startingAgent ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Starting…</> : <><Play size={14} /> Run Agent</>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {(runtimeActionError || error) && (
        <div className="max-w-[1400px] mx-auto px-6 pt-4">
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle size={14} /> {runtimeActionError || error}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">

        {/* ── Left column ── */}
        <div className="space-y-5">

          {/* Decision Log */}
          <SectionCard title="Decision Log" icon={Activity} iconColor="text-blue-500"
            action={
              <span className="text-[10px] font-bold text-slate-400">{mergedLogs.length} entries</span>
            }>
            <div className="max-h-80 overflow-y-auto -mx-1 px-1">
              {mergedLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Activity size={28} className="text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">No decisions yet — run the agent to start.</p>
                </div>
              ) : mergedLogs.map(e => <LogRow key={`${e.id}-${e.ts}`} entry={e} />)}
            </div>
          </SectionCard>

          <SectionCard title="Objective & Chat" icon={Bot} iconColor="text-primary" collapsible
            action={
              <button onClick={() => void saveObjective()} disabled={!agentPublicKey || savingObjective}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-[10px] font-bold hover:opacity-90 disabled:opacity-40 transition-all">
                {savingObjective ? 'Saving…' : 'Save'}
              </button>
            }>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Goal</p>
                  <textarea value={objectiveDraft.goal}
                    onChange={e => setObjectiveDraft(c => ({ ...c, goal: e.target.value }))}
                    rows={3}
                    className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Style</p>
                    <div className="flex gap-2 flex-wrap">
                      {['conservative', 'balanced', 'aggressive'].map(style => (
                        <button key={style} type="button"
                          onClick={() => setObjectiveDraft(c => ({ ...c, style }))}
                          className={cn('rounded-full border px-3 py-1 text-xs font-bold transition-all',
                            objectiveDraft.style === style ? 'border-blue-200 bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100')}>
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Instructions</p>
                    <textarea value={objectiveDraft.instructions}
                      onChange={e => setObjectiveDraft(c => ({ ...c, instructions: e.target.value }))}
                      rows={4}
                      placeholder="Prefer income-producing land and real estate, avoid high-risk twins..."
                      className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-3">
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Agent Chat</p>
                    <span className={cn('text-[10px] font-bold uppercase tracking-widest',
                      degradedMode ? 'text-amber-600' : 'text-emerald-600')}>
                      {degradedMode ? 'Degraded' : 'Healthy'}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {chatPreview.length === 0 ? (
                      <p className="text-sm text-slate-400">Ask the agent what it plans to do, why it held, or how you want it to trade.</p>
                    ) : chatPreview.map((message: any) => (
                      <div key={message.id} className={cn('rounded-xl border px-3 py-2',
                        message.role === 'assistant' ? 'bg-white border-blue-100' : 'bg-white border-slate-100')}>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{message.role}</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{message.content}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <textarea value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      rows={3}
                      placeholder="Why didn’t you bid? Focus more on land. Tighten risk."
                      className="flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <button onClick={() => void sendAgentChat()} disabled={!agentPublicKey || chatPending || !chatInput.trim()}
                      className="self-end rounded-xl bg-primary text-white text-xs font-bold px-3 py-2.5 hover:opacity-90 disabled:opacity-50 transition-all">
                      {chatPending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {chatError && <p className="text-xs text-red-500">{chatError}</p>}
                </div>

                <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Objective Snapshot</p>
                  <KV label="Current Style" value={String(objective.style || objectiveDraft.style || 'balanced')} />
                  <div className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Current Goal</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{String(objective.goal || objectiveDraft.goal || 'No goal set yet.')}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Instructions</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{String(objective.instructions || objectiveDraft.instructions || 'No extra strategy instructions yet.')}</p>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Mandate */}
          <SectionCard title="Live Mandate" icon={Settings} iconColor="text-primary" collapsible
            action={
              <button onClick={() => void saveMandate()} disabled={!agentPublicKey || savingMandate}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-[10px] font-bold hover:opacity-90 disabled:opacity-40 transition-all">
                {savingMandate ? 'Saving…' : 'Save'}
              </button>
            }>
            {showSettings && (
              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'capitalBase',            label: 'Capital Base',     unit: 'USDC' },
                    { id: 'approvalThreshold',       label: 'Approval Cap',     unit: 'USDC' },
                    { id: 'issuerCapPct',            label: 'Issuer Cap',       unit: '%' },
                    { id: 'assetCapPct',             label: 'Asset Cap',        unit: '%' },
                    { id: 'liquidityFloorPct',       label: 'Liquidity Floor',  unit: '%' },
                    { id: 'maxDrawdownPct',          label: 'Max Drawdown',     unit: '%' },
                    { id: 'targetReturnMinPct',      label: 'Return Floor',     unit: '%' },
                    { id: 'targetReturnMaxPct',      label: 'Return Ceiling',   unit: '%' },
                    { id: 'rebalanceCadenceMinutes', label: 'Rebalance',        unit: 'min' },
                  ].map(f => (
                    <div key={f.id} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">{f.label}</p>
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={mandateDraft[f.id as keyof MandateDraft] as string}
                          onChange={e => setMandateDraft(c => ({ ...c, [f.id]: e.target.value }))}
                          className="w-full bg-white border border-slate-100 rounded-lg px-2 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                        <span className="text-[10px] text-slate-400 shrink-0">{f.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Approved Asset Classes</p>
                    <div className="flex flex-wrap gap-2">
                      {ASSET_CLASS_OPTIONS.map(opt => {
                        const active = mandateDraft.approvedAssetClasses.includes(opt.value);
                        return (
                          <button key={opt.value} type="button"
                            onClick={() => setMandateDraft(c => ({ ...c, approvedAssetClasses: toggleListValue(c.approvedAssetClasses, opt.value) }))}
                            className={cn('rounded-full border px-3 py-1 text-xs font-bold transition-all',
                              active ? 'border-blue-200 bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100')}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Treasury Strategies</p>
                    <div className="flex flex-wrap gap-2">
                      {TREASURY_STRATEGY_OPTIONS.map(opt => {
                        const active = mandateDraft.allowedTreasuryStrategies.includes(opt.value);
                        return (
                          <button key={opt.value} type="button"
                            onClick={() => setMandateDraft(c => ({ ...c, allowedTreasuryStrategies: toggleListValue(c.allowedTreasuryStrategies, opt.value) }))}
                            className={cn('rounded-full border px-3 py-1 text-xs font-bold transition-all',
                              active ? 'border-emerald-200 bg-emerald-50 text-secondary' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100')}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[
                { label: 'Capital Base',    value: `${activeState?.mandate?.capitalBase || mandateDraft.capitalBase} USDC` },
                { label: 'Target Return',   value: `${activeState?.mandate?.targetReturnMinPct || mandateDraft.targetReturnMinPct}–${activeState?.mandate?.targetReturnMaxPct || mandateDraft.targetReturnMaxPct}%` },
                { label: 'Liquidity Floor', value: `${activeState?.mandate?.liquidityFloorPct || mandateDraft.liquidityFloorPct}%` },
                { label: 'Approval Cap',    value: `${activeState?.mandate?.approvalThreshold || mandateDraft.approvalThreshold} USDC` },
                { label: 'Rebalance',       value: `${activeState?.mandate?.rebalanceCadenceMinutes || mandateDraft.rebalanceCadenceMinutes} min` },
                { label: 'Issuer Cap',      value: `${activeState?.mandate?.issuerCapPct || mandateDraft.issuerCapPct}%` },
                { label: 'Asset Cap',       value: `${activeState?.mandate?.assetCapPct || mandateDraft.assetCapPct}%` },
                { label: 'Max Drawdown',    value: `${activeState?.mandate?.maxDrawdownPct || mandateDraft.maxDrawdownPct}%` },
              ].map(i => <KV key={i.label} label={i.label} value={i.value} />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <KV label="Asset Classes" value={formatOptionList(activeState?.mandate?.approvedAssetClasses || mandateDraft.approvedAssetClasses, ASSET_CLASS_OPTIONS)} />
              <KV label="Treasury Strategies" value={formatOptionList(activeState?.mandate?.allowedTreasuryStrategies || mandateDraft.allowedTreasuryStrategies, TREASURY_STRATEGY_OPTIONS)} />
            </div>
            <button onClick={() => setShowSettings(v => !v)} className="mt-3 text-xs font-bold text-slate-400 hover:text-primary transition-colors">
              {showSettings ? 'Hide fields' : 'Edit fields'}
            </button>
          </SectionCard>

          {/* Wallet + Treasury */}
          <SectionCard title="Wallet & Treasury" icon={Wallet} iconColor="text-primary" collapsible>
            {liquidity && (
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 mb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Liquidity Runway</p>
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest',
                    liquidity.status === 'below_floor' ? 'text-rose-600' :
                    liquidity.status === 'near_floor'  ? 'text-amber-600' : 'text-emerald-600')}>
                    {liquidity.statusLabel || 'Waiting for agent'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Liquid USDC',      value: `${liquidity.walletBalanceDisplay || '0'} USDC` },
                    { label: 'Bid Headroom',      value: `${liquidity.immediateBidHeadroomDisplay || '0'} USDC` },
                    { label: 'Reserve Floor',     value: `${liquidity.liquidityFloorAmountDisplay || '0'} USDC` },
                    { label: 'Treasury Deployed', value: `${liquidity.treasuryDeployedDisplay || '0'} USDC` },
                  ].map(i => <KV key={i.label} label={i.label} value={i.value} />)}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Wallet */}
              <div className="space-y-3">
                {walletSummary && (
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Wallet Readiness</p>
                    <span className={cn('text-[10px] font-bold uppercase tracking-widest',
                      walletSummary.status === 'ready' ? 'text-emerald-600' :
                      walletSummary.status === 'needs_trustline' ? 'text-amber-600' : 'text-rose-600')}>
                      {walletSummary.statusLabel || 'Checking…'}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Account', value: formatShortAddress(walletState.publicKey || agentPublicKey) },
                    { label: 'Asset',   value: walletSummary?.paymentAssetCode || 'USDC' },
                    { label: 'XLM',     value: `${walletSummary?.nativeBalanceDisplay || '0'} XLM` },
                    { label: 'USDC',    value: `${walletSummary?.paymentBalanceDisplay || '0'} USDC` },
                  ].map(i => <KV key={i.label} label={i.label} value={i.value} />)}
                </div>
                {(walletState.balances || []).map((b: any) => (
                  <div key={`${b.assetCode}-${b.assetIssuer || 'native'}`}
                    className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5">
                    <span className="text-xs font-bold text-slate-500">{b.assetCode}</span>
                    <span className="text-sm font-bold text-slate-800">{b.balance}</span>
                  </div>
                ))}
                {agentPublicKey && (
                  <button onClick={() => setShowFundModal(true)}
                    className="w-full py-2.5 rounded-xl border border-primary text-primary text-xs font-bold hover:bg-blue-50 transition-all">
                    Fund Managed Wallet
                  </button>
                )}
              </div>

              {/* Treasury */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Treasury</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Deployed',     value: formatMoney(Number(treasurySummary.deployed || 0)/1e7) },
                    { label: 'Liquid',       value: formatMoney(Number(treasurySummary.liquidBalance || 0)/1e7) },
                    { label: 'Weighted APY', value: `${Number(treasurySummary.weightedProjectedNetApy || 0).toFixed(2)}%` },
                    { label: 'Proj. Return', value: formatMoney(Number(treasurySummary.projectedAnnualReturn || 0)/1e7) },
                  ].map(i => <KV key={i.label} label={i.label} value={i.value} />)}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: 'Safe Yield', ok: Boolean(treasuryHealth.safeYield?.ok) },
                    { label: 'Blend',      ok: Boolean(treasuryHealth.blendLending?.ok) },
                    { label: 'AMM',        ok: Boolean(treasuryHealth.stellarAmm?.ok) },
                  ].map(v => (
                    <span key={v.label} className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
                      v.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                      {v.ok ? '✓' : '!'} {v.label}
                    </span>
                  ))}
                </div>

                {/* Session rail */}
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Session Rail</p>
                    <span className="text-[10px] font-bold text-slate-400">
                      {selectedManagedSession ? `Using #${selectedManagedSession.id}` : managedPaymentSessions.length ? 'Select session' : 'No session'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Active',     value: String(managedSessionSummary.active),          color: 'text-primary' },
                      { label: 'Refundable', value: formatMoney(managedSessionSummary.refundable), color: 'text-emerald-600' },
                      { label: 'Claimable',  value: formatMoney(managedSessionSummary.claimable),  color: 'text-purple-600' },
                    ].map(i => <KV key={i.label} label={i.label} value={i.value} color={i.color} />)}
                  </div>
                  <div className="flex gap-2">
                    <input type="number" min="0.1" step="0.1" value={managedSessionBudget}
                      onChange={e => setManagedSessionBudget(e.target.value)} placeholder="Budget"
                      className="w-20 shrink-0 bg-white border border-slate-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <button onClick={() => void openManagedSession()} disabled={!agentPublicKey || managedSessionStatus === 'loading'}
                      className="flex-1 rounded-xl border border-primary text-primary text-xs font-bold hover:bg-blue-50 disabled:opacity-50 px-2 py-2">
                      {managedSessionStatus === 'loading' ? 'Opening…' : `Open ${paymentTokenSymbol} Session`}
                    </button>
                    <button onClick={() => void cancelManagedSession(treasurySessionId)} disabled={!selectedManagedSession || managedSessionStatus === 'loading'}
                      className="rounded-xl border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50 disabled:opacity-50 px-2 py-2">
                      End
                    </button>
                  </div>
                  {managedPaymentSessions.slice(0, 3).map((s: any) => (
                    <button key={s.id} onClick={() => setTreasurySessionId(String(s.id))}
                      className={cn('w-full rounded-xl border px-3 py-2 text-left text-xs transition-all',
                        String(s.id) === String(treasurySessionId) ? 'border-blue-200 bg-blue-50 font-bold text-primary' : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50')}>
                      Session #{s.id} · {formatMoney(Number(s.refundableAmount || 0)/1e7)} refundable
                    </button>
                  ))}
                  {managedSessionStatus === 'err' && <p className="text-xs text-red-500">{managedSessionError}</p>}
                  {managedSessionStatus === 'ok'  && <p className="text-xs text-emerald-600">{managedSessionMessage}</p>}
                </div>

                <button onClick={() => void runTreasuryOptimization()} disabled={!agentPublicKey || treasuryActionStatus === 'loading'}
                  className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all">
                  {treasuryActionStatus === 'loading' ? 'Optimizing…' : 'Optimize Treasury · 0.02 USDC'}
                </button>
                <div className="flex gap-2">
                  <input type="number" min="0" step="1" value={yieldRouteTokenId} onChange={e => setYieldRouteTokenId(e.target.value)}
                    placeholder="Token ID" className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <button onClick={() => void claimYieldDirect()} disabled={!agentPublicKey || !yieldRouteTokenId || yieldClaimStatus === 'loading'}
                    className="rounded-xl border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-50 disabled:opacity-50 px-3 py-2">
                    {yieldClaimStatus === 'loading' ? '…' : 'Claim'}
                  </button>
                  <button onClick={() => void routeYieldIntoTreasury()} disabled={!agentPublicKey || yieldRouteStatus === 'loading'}
                    className="rounded-xl border border-purple-200 text-purple-700 text-xs font-bold hover:bg-purple-50 disabled:opacity-50 px-3 py-2">
                    {yieldRouteStatus === 'loading' ? '…' : 'Route'}
                  </button>
                </div>
                {treasuryActionStatus === '402' && <p className="text-xs text-amber-600">Paid — open a session first.</p>}
                {treasuryActionStatus === 'err'  && <p className="text-xs text-red-500">{treasuryActionError}</p>}
                {treasuryActionStatus === 'ok'   && <p className="text-xs text-emerald-600">✓ Optimization complete.</p>}
                {yieldClaimStatus === 'err'  && <p className="text-xs text-red-500">{yieldClaimError}</p>}
                {yieldClaimStatus === 'ok'   && <p className="text-xs text-emerald-600">✓ Yield claimed.</p>}
                {yieldRouteStatus === 'err'  && <p className="text-xs text-red-500">{yieldRouteError}</p>}
                {yieldRouteStatus === 'ok'   && <p className="text-xs text-emerald-600">✓ Yield routed.</p>}
              </div>
            </div>

            {/* Treasury positions */}
            {(treasury.positions || []).length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Positions</p>
                {(treasury.positions || []).map((p: any) => (
                  <div key={p.positionId} className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{p.strategyFamily} · {p.venueId}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{formatMoney(Number(p.allocatedAmount || 0)/1e7)}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-600">{Number(p.projectedNetApy || 0).toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Last optimization */}
            {treasuryOptimization && (
              <div className="mt-4 bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">{(treasuryOptimization.objective || 'highest approved return first').replace(/_/g, ' ')}</p>
                  <span className="rounded-full bg-purple-50 text-purple-600 text-[10px] font-bold px-2.5 py-1">
                    {String(treasuryOptimization.reason || 'rebalanced').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Deployable',   value: formatMoney(Number(treasuryOptimization.deployableAmount || 0)/1e7) },
                    { label: 'Target Rsv',   value: formatMoney(Number(treasuryOptimization.targetReserve || 0)/1e7) },
                    { label: 'Deployments',  value: String(treasuryOptimization.execution?.deploymentCount || 0) },
                    { label: 'Reserved',     value: formatMoney(Number(treasuryOptimization.reservedAmount || 0)/1e7) },
                  ].map(i => <KV key={i.label} label={i.label} value={i.value} />)}
                </div>
                {(treasuryOptimization.recallOrder || []).length > 0 && (
                  <p className="text-[10px] text-slate-400">Recall order: {(treasuryOptimization.recallOrder || []).join(' → ')}</p>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          <SectionCard title="Autonomous Brain" icon={Bot} iconColor="text-primary">
            <div className="space-y-3">
              <div className={cn('rounded-xl border px-3 py-2.5 text-xs',
                degradedMode ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700')}>
                {degradedMode
                  ? (degradedReason || 'Platform LLM is unavailable, so the agent is using deterministic fallback planning.')
                  : 'Planner is healthy. The agent is reasoning with the current objective, memory, liquidity, and live market state.'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <KV label="Next Action" value={nextPlannedAction} color="text-primary" />
                <KV label="Wake Reason" value={wakeReason || 'scheduled'} />
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Current Thesis</p>
                <p className="text-sm text-slate-700 leading-relaxed">{currentThesis}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Why No Action / Blocker</p>
                <p className="text-sm text-slate-600 leading-relaxed">{blockedBy || 'No blocker recorded. The planner has an executable path.'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <KV label="Confidence" value={`${Number(brain.confidence || 0)}%`} />
                <KV label="Planner" value={String(brain.provider || 'fallback')} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Journal</p>
                {journalPreview.length === 0 ? (
                  <p className="text-sm text-slate-400">No journal entries yet. The next tick will persist the planner’s thesis here.</p>
                ) : journalPreview.map((entry: any) => (
                  <div key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold text-slate-800">{entry.message}</p>
                      <span className="text-[10px] text-slate-300">
                        {entry.ts ? new Date(Number(entry.ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    {(entry.detail || entry.blockedBy) && (
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{entry.detail || entry.blockedBy}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Runtime status */}
          <SectionCard title="Runtime" icon={BarChart2} iconColor="text-primary"
            action={
              <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
                agentStatus === 'running' ? 'bg-emerald-50 text-emerald-600' :
                agentStatus === 'paused'  ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500')}>
                {agentStatus === 'running' ? 'Running' : agentStatus === 'paused' ? 'Paused' : 'Idle'}
              </span>
            }>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <KV label="Last Tick" value={runtime.lastTickAt
                ? new Date(Number(runtime.lastTickAt)*1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Not yet'} />
              <KV label="Heartbeat" value={String(runtime.heartbeatCount || 0)} />
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5 text-xs text-slate-500 mb-3">
              {String(runtime.lastSummary?.opportunities || 0)} opportunities · {String(runtime.lastSummary?.autoBids || 0)} bids · {String(runtime.lastSummary?.settledAuctions || 0)} settlements
            </div>
            {runtime.lastError && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600 mb-3">
                {runtime.lastError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Net P&L',        value: formatMoney(performance.netPnL ? Number(performance.netPnL)/1e7 : 0),                                                  color: 'text-emerald-600' },
                { label: 'Gross +',        value: formatMoney(performanceAttribution.grossPositivePnL ? Number(performanceAttribution.grossPositivePnL)/1e7 : 0),         color: 'text-blue-600' },
                { label: 'Trade P&L',      value: formatMoney(performance.realizedTradePnL ? Number(performance.realizedTradePnL)/1e7 : 0),                               color: 'text-cyan-600' },
                { label: 'Fees Paid',      value: formatMoney(performance.paidActionFees ? Number(performance.paidActionFees)/1e7 : 0),                                   color: 'text-amber-600' },
                { label: 'Treasury Ret.',  value: formatMoney(performance.treasuryReturn ? Number(performance.treasuryReturn)/1e7 : 0),                                   color: 'text-purple-600' },
                { label: 'Win Rate',       value: `${Number(performanceAttribution.winRatePct || 0).toFixed(1)}%`,                                                        color: 'text-slate-700' },
                { label: 'Outcomes',       value: String(performanceAttribution.totalAuctionOutcomes || 0),                                                               color: 'text-slate-700' },
              ].map(i => <KV key={i.label} label={i.label} value={i.value} color={i.color} />)}
            </div>

            {/* Attribution */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'Yield',    value: formatMoney(performanceAttribution.yieldContribution ? Number(performanceAttribution.yieldContribution)/1e7 : 0) },
                { label: 'Treasury', value: formatMoney(performanceAttribution.treasuryContribution ? Number(performanceAttribution.treasuryContribution)/1e7 : 0) },
                { label: 'Trade',    value: formatMoney(performanceAttribution.tradeContribution ? Number(performanceAttribution.tradeContribution)/1e7 : 0) },
                { label: 'Fee Drag', value: formatMoney(performanceAttribution.feeDrag ? Number(performanceAttribution.feeDrag)/1e7 : 0) },
                { label: 'W/L',      value: `${String(performanceAttribution.auctionWins || 0)}W / ${String(performanceAttribution.auctionLosses || 0)}L` },
              ].map(i => <KV key={i.label} label={i.label} value={i.value} />)}
            </div>

            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">DeFi Participation</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Tx Count', value: String(defiMetrics.txCount || 0) },
                  { label: 'Bid Count', value: String(defiMetrics.bidsPlaced || 0) },
                  { label: 'Buy/Sell', value: `${String(defiMetrics.buyCount || 0)} / ${String(defiMetrics.sellCount || 0)}` },
                  { label: 'Trade Volume', value: formatMoney(defiMetrics.volumeTradedGross ? Number(defiMetrics.volumeTradedGross)/1e7 : 0) },
                  { label: 'Unique Assets', value: String(defiMetrics.uniqueAssetsTraded || 0) },
                  { label: 'Active Days', value: String(defiMetrics.activeDays || 0) },
                  { label: 'Claim Volume', value: formatMoney(defiMetrics.yieldClaimedVolume ? Number(defiMetrics.yieldClaimedVolume)/1e7 : 0) },
                  { label: 'Participation', value: String(defiMetrics.participationScore || 0) },
                ].map((metric) => (
                  <KV key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>
            </div>

            {/* Recent events */}
            {performanceEvents.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Events</p>
                {performanceEvents.slice(0, 5).map((ev: any) => (
                  <div key={ev.id} className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-100 px-3 py-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{ev.label}</p>
                      <p className="text-[10px] text-slate-400">
                        {String(ev.category || '').toUpperCase()}
                        {ev?.metadata?.side ? ` · ${String(ev.metadata.side).toUpperCase()}` : ''}
                        {ev?.metadata?.tokenId ? ` · TWIN #${String(ev.metadata.tokenId)}` : ''}
                        {ev?.metadata?.assetName ? ` · ${String(ev.metadata.assetName)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-xs font-bold',
                        ev.direction === 'inflow' ? 'text-emerald-600' :
                        ev.direction === 'outflow' ? 'text-amber-600' : 'text-slate-600')}>
                        {ev.amount ? formatMoney(Number(ev.amount)/1e7) : '—'}
                      </p>
                      <p className="text-[10px] text-slate-300">
                        {ev.ts ? new Date(Number(ev.ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Positions */}
          <SectionCard title="Positions" icon={Bot} iconColor="text-primary">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <KV label="Owned Twins"      value={String(totalAssets)} />
              <KV label="Payment Sessions" value={String(positions.sessions?.length || 0)} />
            </div>
            {(positions.assets || []).length === 0 ? (
              <p className="text-sm text-slate-400">No asset twins acquired yet.</p>
            ) : (positions.assets || []).slice(0, 4).map((a: any) => (
              <div key={a.tokenId} className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5 mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-800">Twin #{a.tokenId}</p>
                  <p className="text-[10px] text-slate-400">{a.verificationStatusLabel || a.verificationStatus}</p>
                </div>
                <span className="text-xs font-bold text-emerald-600">{formatMoney(Number(a.claimableYield || 0)/1e7)}</span>
              </div>
            ))}
          </SectionCard>

          {/* Bid Reserves */}
          <SectionCard title="Bid Reserves" icon={Target} iconColor="text-purple-500">
            {reserveActionStatus !== 'idle' && reserveActionMessage && (
              <div className={cn('rounded-xl border px-3 py-2 text-xs mb-3',
                reserveActionStatus === 'ok'  ? 'border-emerald-100 bg-emerald-50 text-emerald-700' :
                reserveActionStatus === '402' ? 'border-amber-100 bg-amber-50 text-amber-700' :
                'border-red-100 bg-red-50 text-red-600')}>
                {reserveActionMessage}
              </div>
            )}
            {reservationExposure.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Leading',        value: String(reservationSummary.leading),       color: 'text-emerald-600' },
                  { label: 'Outbid',         value: String(reservationSummary.outbid),        color: 'text-amber-600' },
                  { label: 'Ready Settle',   value: String(reservationSummary.readyToSettle), color: 'text-primary' },
                ].map(i => <KV key={i.label} label={i.label} value={i.value} color={i.color} />)}
              </div>
            )}
            {reservationExposure.length === 0 && reservations.length === 0 ? (
              <p className="text-sm text-slate-400">No active auction reservations.</p>
            ) : (reservationExposure.length > 0 ? reservationExposure : reservations).map((entry: any) => (
              <div key={entry.bidId} className="bg-slate-50 rounded-xl border border-slate-100 p-3 mb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{entry.title || `Auction #${entry.auctionId}`}</p>
                    <p className="text-[10px] text-slate-400">Bid #{entry.bidId} · {formatShortAddress(entry.issuer)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-purple-600">{formatMoney(Number(entry.reservedAmount || 0)/1e7)}</p>
                    {entry.statusLabel && (
                      <p className={cn('text-[10px] font-bold uppercase tracking-widest mt-0.5',
                        entry.status === 'ready_to_settle' ? 'text-primary' :
                        entry.status === 'leading'         ? 'text-emerald-600' :
                        entry.status === 'outbid' || entry.status === 'closed_outbid' ? 'text-amber-600' : 'text-slate-400')}>
                        {entry.statusLabel}
                      </p>
                    )}
                  </div>
                </div>
                {entry.auction && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Top Bid',       value: `${entry.highestBidDisplay || '0.00'} USDC` },
                        { label: 'Next Valid',    value: `${entry.minimumNextBidDisplay || '0.00'} USDC` },
                        { label: 'Time Left',     value: formatCountdown(entry.endTime) },
                        { label: 'Gap To Relead', value: Number(entry.nextBidGap || 0) > 0 ? formatMoney(Number(entry.nextBidGap || 0)/1e7) : '—' },
                      ].map(i => <KV key={i.label} label={i.label} value={i.value} />)}
                    </div>
                    <div className="flex gap-2">
                      {entry.readyToSettle && (
                        <button onClick={() => void settleReservedAuction(Number(entry.auctionId))}
                          disabled={settlePendingAuctionId === Number(entry.auctionId)}
                          className="flex-1 rounded-xl border border-primary text-primary text-xs font-bold hover:bg-blue-50 disabled:opacity-50 py-2">
                          {settlePendingAuctionId === Number(entry.auctionId) ? 'Settling…' : 'Settle Now'}
                        </button>
                      )}
                      {entry.status === 'outbid' && (
                        <button onClick={() => void rebidReservedAuction(Number(entry.auctionId), String(entry.minimumNextBidDisplay || '0'))}
                          disabled={rebidPendingAuctionId === Number(entry.auctionId)}
                          className="flex-1 rounded-xl border border-purple-200 text-purple-700 text-xs font-bold hover:bg-purple-50 disabled:opacity-50 py-2">
                          {rebidPendingAuctionId === Number(entry.auctionId) ? 'Rebidding…' : `Rebid ${entry.minimumNextBidDisplay || '0'} USDC`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </SectionCard>

          {/* Shortlist Signals */}
          {(savedScreens.length > 0 || watchlist.length > 0 || screenHighlights.length > 0 || watchlistHighlights.length > 0 || bidFocus) && (
            <SectionCard title="Shortlist Signals" icon={Target} iconColor="text-blue-500"
              action={
                <Link to="/app/marketplace" className="text-[10px] font-bold text-slate-400 hover:text-primary">Manage</Link>
              }>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <KV label="Saved Screens"   value={String(savedScreens.length)} />
                <KV label="Watchlist Twins" value={String(watchlist.length)} />
              </div>
              {bidFocus && (
                <div className="bg-blue-50 rounded-xl border border-blue-100 px-3 py-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Current Bid Focus</p>
                  <p className="text-xs font-bold text-slate-800">Auction #{bidFocus.auctionId} · Twin #{bidFocus.assetId}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {Array.isArray(bidFocus.prioritySource) && bidFocus.prioritySource.length > 0
                      ? `From ${bidFocus.prioritySource.join(' + ')}`
                      : 'No shortlist bias'}
                    {typeof bidFocus.preferenceScore === 'number' ? ` · score ${bidFocus.preferenceScore.toFixed(0)}` : ''}
                  </p>
                </div>
              )}
              {screenHighlights.length > 0 && (
                <div className="space-y-2 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Screen Matches</p>
                  {screenHighlights.map((e: any) => (
                    <div key={e.screenId} className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-100 px-3 py-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{e.name}</p>
                        <p className="text-[10px] text-slate-400">{String(e.matches)} matches · top #{e.topTokenId}</p>
                      </div>
                      <span className="text-[10px] font-bold text-primary">score {Number(e.topScore || 0).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {watchlistHighlights.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Watchlist Signals</p>
                  {watchlistHighlights.map((e: any) => (
                    <div key={e.tokenId} className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-100 px-3 py-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{e.name}</p>
                        <p className="text-[10px] text-slate-400">Twin #{e.tokenId} · {Array.isArray(e.reasons) ? e.reasons.join(' · ') : 'signal'}</p>
                      </div>
                      <span className={cn('text-[10px] font-bold uppercase tracking-widest',
                        e.severity === 'high' ? 'text-red-500' : e.severity === 'medium' ? 'text-amber-600' : 'text-primary')}>
                        {e.hasLiveAuction ? 'live' : e.severity || 'info'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Market */}
          <SectionCard title="Continuum Market" icon={Store} iconColor="text-purple-500"
            action={
              <Link to="/app/marketplace" className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-primary transition-colors">
                Open <ArrowUpRight size={11} />
              </Link>
            }>
            {marketAssets.length === 0 ? (
              <p className="text-sm text-slate-400">No assets indexed yet.</p>
            ) : marketAssets.slice(0, 5).map((a: any) => (
              <motion.div key={a.tokenId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5 mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-800">{a.publicMetadata?.name || a.name || `Asset #${a.tokenId}`}</p>
                  <p className="text-[10px] text-slate-400">{a.market?.activeAuction ? `Auction #${a.market.activeAuction.auctionId}` : 'No active auction'}</p>
                </div>
                <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full',
                  a.market?.hasActiveAuction ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500')}>
                  {a.market?.hasActiveAuction ? 'Live' : 'Browse'}
                </span>
              </motion.div>
            ))}
          </SectionCard>
        </div>
      </div>

      {/* ── Fund modal ── */}
      {showFundModal && agentPublicKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-primary" />
                <p className="text-sm font-bold text-slate-900">Fund Managed Agent</p>
              </div>
              <button onClick={() => setShowFundModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Agent Address</p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-slate-700 truncate flex-1">{agentPublicKey}</p>
                <button onClick={() => navigator.clipboard.writeText(agentPublicKey)} className="text-slate-400 hover:text-primary"><Copy size={13} /></button>
              </div>
            </div>
            <button onClick={() => window.open(`https://friendbot.stellar.org/?addr=${agentPublicKey}`, '_blank', 'noopener')}
              className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-all">
              Get Testnet XLM via Friendbot
            </button>
            <p className="text-xs text-slate-500">Send USDC to the agent address above so it can bid, settle, and rebalance treasury on your behalf.</p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
