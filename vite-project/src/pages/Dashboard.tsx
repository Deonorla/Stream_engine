import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownLeft, Store, Plus, Zap, Bot, Activity, Layers, Target, AlertTriangle, RefreshCw, Play, Pause, Wallet, X, KeyRound, PlusCircle, Copy, ShieldCheck, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/cn';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useAppMode } from '../context/AppModeContext';
import { paymentTokenSymbol } from '../contactInfo';
import Select from '../components/ui/Select';
import { useAgentWallet, agentAuthHeaders } from '../hooks/useAgentWallet';
import AgentWalletPanel from '../components/AgentWalletPanel';
import { useAgentBalances } from '../hooks/useAgentBalances';
import { fetchMarketAssets } from '../services/rwaApi.js';
import { useAgentLoopContext } from '../context/AgentLoopContext';
import { getAssetImage } from '../components/AssetCard';

// ─── Shared ───────────────────────────────────────────────────────────────────

function MiniStreamRow({ stream, formatEth }) {
  const now = Math.floor(Date.now() / 1000);
  const duration = Math.max(1, stream.stopTime - stream.startTime);
  const elapsed = Math.max(0, Math.min(now, stream.stopTime) - stream.startTime);
  const progress = Math.min(100, (elapsed / duration) * 100);
  const isActive = stream.isActive && now < stream.stopTime;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">#{stream.id}</span>
          <span className={`text-[10px] font-semibold ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
            {isActive ? '● Streaming' : '○ Ended'}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-slate-900">{formatEth(stream.totalAmount)}</div>
        <div className="text-[10px] text-slate-400">{stream.paymentTokenSymbol || paymentTokenSymbol}</div>
      </div>
    </div>
  );
}

// ─── Agent mode log ───────────────────────────────────────────────────────────

function AgentLogRow({ entry }: { entry: any }) {
  const icons: any = {
    action:   { Icon: Zap,           color: 'text-blue-500',   bg: 'bg-blue-50' },
    decision: { Icon: Bot,           color: 'text-purple-500', bg: 'bg-purple-50' },
    info:     { Icon: Activity,      color: 'text-slate-400',  bg: 'bg-slate-100' },
    error:    { Icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50' },
    profit:   { Icon: TrendingUp,    color: 'text-emerald-500',bg: 'bg-emerald-50' },
  };
  const { Icon, color, bg } = icons[entry.type] || icons.info;
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 group">
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${bg}`}>
        <Icon size={13} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 font-medium leading-snug">{entry.message}</p>
        {entry.detail && <p className="text-xs text-slate-400 mt-0.5">{entry.detail}</p>}
      </div>
      <div className="text-right shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {entry.amount && (
          <p className={`text-xs font-bold ${entry.amount.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}>{entry.amount}</p>
        )}
        <p className="text-[10px] text-slate-600 mt-0.5">{time}</p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { paymentBalance, xlmBalance, incomingStreams, outgoingStreams, formatEth, walletAddress, refreshStreams, fetchPaymentBalance } = useWallet();
  const { mode, setMode } = useAppMode();
  const { agentPublicKey } = useAgentWallet(walletAddress);
  const { xlm: agentXlm, usdc: agentUsdc } = useAgentBalances(agentPublicKey);

  // Agent mode state
  const { logs: agentLogs, agentStatus: ctxStatus, startAgent: ctxStart, pauseAgent: ctxPause, refreshState: ctxRefresh } = useAgentLoopContext();
  const agentRunning = ctxStatus === 'running';
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showTrustlineModal, setShowTrustlineModal] = useState(false);
  const [trustlineBusy, setTrustlineBusy] = useState(false);
  const [trustlineMsg, setTrustlineMsg] = useState('');
  const [withdrawAsset, setWithdrawAsset] = useState('USDC');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');

  const handleWithdrawToOwner = async () => {
    if (!withdrawAmount || !walletAddress) return;
    setWithdrawBusy(true); setWithdrawMsg('');
    try {
      const { agentAuthHeaders } = await import('../hooks/useAgentWallet');
      const { getRwaApiBaseUrl } = await import('../services/rwaApi.js');
      const { ACTIVE_NETWORK } = await import('../networkConfig.js');
      const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...agentAuthHeaders() },
        body: JSON.stringify({
          assetCode: withdrawAsset,
          assetIssuer: withdrawAsset === 'USDC' ? (ACTIVE_NETWORK.paymentAssetIssuer || '') : '',
          amount: withdrawAmount,
        }),
      });
      const data = await res.json();
      setWithdrawMsg(res.ok ? `✓ Sent ${withdrawAmount} ${withdrawAsset} to your wallet` : (data.error || 'Failed'));
      if (res.ok) { setWithdrawAmount(''); fetchPaymentBalance(); }
    } catch { setWithdrawMsg('Request failed'); }
    setWithdrawBusy(false);
  };

  const handleSetupTrustline = async () => {
    setTrustlineBusy(true); setTrustlineMsg('');
    try {
      const { getRwaApiBaseUrl, ACTIVE_NETWORK } = await import('../services/rwaApi.js').then(async m => ({ getRwaApiBaseUrl: m.getRwaApiBaseUrl, ACTIVE_NETWORK: (await import('../networkConfig.js')).ACTIVE_NETWORK }));
      const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/trustline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...agentAuthHeaders() },
        body: JSON.stringify({ assetCode: ACTIVE_NETWORK.paymentAssetCode || 'USDC', assetIssuer: ACTIVE_NETWORK.paymentAssetIssuer || '' }),
      });
      const data = await res.json();
      setTrustlineMsg(res.ok ? '✓ USDC trustline created successfully!' : (data.error || 'Failed'));
    } catch { setTrustlineMsg('Request failed'); }
    setTrustlineBusy(false);
  };

  const agentProfit = agentLogs.filter(e => e.type === 'profit' && e.amount)
    .reduce((sum, e) => sum + (parseFloat(e.amount!.replace('+', '')) || 0), 0);
  const agentActions = agentLogs.filter(e => e.type === 'action').length;
  const [marketAssets, setMarketAssets] = useState<any[]>([]);
  useEffect(() => {
    fetchMarketAssets().then(r => {
      const mine = new Set([walletAddress, agentPublicKey].filter(Boolean).map(k => String(k).trim().toUpperCase()));
      const others = mine.size
        ? r.filter(a => !mine.has(String(a.currentOwner || '').trim().toUpperCase()) && !mine.has(String(a.issuer || '').trim().toUpperCase()))
        : r;
      setMarketAssets(others.slice(0, 3));
    }).catch(() => {});
  }, [walletAddress, agentPublicKey]);
  // Sync shared agent state when wallet is known
  useEffect(() => { if (agentPublicKey) ctxRefresh(agentPublicKey); }, [agentPublicKey, ctxRefresh]);

  const startAgent = useCallback(async () => {
    if (!agentPublicKey) return;
    await ctxStart(agentPublicKey);
  }, [agentPublicKey, ctxStart]);

  const stopAgent = useCallback(async () => {
    if (!agentPublicKey) return;
    await ctxPause(agentPublicKey);
  }, [agentPublicKey, ctxPause]);
  
  const navigate = useNavigate();
  const fmt = (v: any) => parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const INACTIVE = ['ended', 'cancelled', 'completed'];
  const isActive = (s: any) => !INACTIVE.includes(s.sessionStatus) && s.isActive !== false;
  const activeOut = outgoingStreams.filter(isActive);
  const activeIn  = incomingStreams.filter(isActive);

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-6">

      {/* ── Mode banner ── */}
      <motion.div layout className="flex items-center gap-4 rounded-2xl px-6 py-4 border border-slate-100 bg-white shadow-sm transition-all">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0',
          mode === 'owner' ? 'ethereal-gradient shadow-blue-500/20' : 'ethereal-gradient bg-blue-500/20')}>
          {mode === 'owner'
            ? <Layers size={18} className="text-white" />
            : <Bot size={18} className={agentRunning ? 'text-white animate-pulse' : 'text-white'} />}
        </div>
        <div className="flex-1 min-w-0">
          {mode === 'owner' ? (
            <>
              <p className="text-xs font-label uppercase tracking-widest text-slate-400">Asset Owner · Freighter</p>
             
            </>
          ) : (
            <>
              <p className="text-xs font-label uppercase tracking-widest text-slate-400">Autonomous Agent Mode</p>
              <p className="text-sm font-mono font-bold text-slate-800 truncate">
                {agentPublicKey ? `` : 'No agent detected'}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {mode === 'agent' && (
            <>
              <span className={cn('flex items-center gap-1.5 text-xs font-bold',
                agentRunning ? 'text-secondary' : 'text-slate-400')}>
                <span className={cn('w-2 h-2 rounded-full', agentRunning ? 'bg-secondary animate-pulse' : 'bg-slate-500')} />
                {agentRunning ? 'Running' : 'Idle'}
              </span>
              {agentRunning ? (
                <button onClick={stopAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:opacity-90 transition-all">
                  <Pause size={12} /> Pause
                </button>
              ) : (
                <button onClick={startAgent} disabled={!agentPublicKey}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-bold hover:opacity-90 transition-all disabled:opacity-40">
                  <Play size={12} /> Run Agent
                </button>
              )}
              <button onClick={() => setShowFundModal(true)} disabled={!agentPublicKey}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-40">
                <PlusCircle size={12} /> Fund Wallet
              </button>
              <button onClick={() => { setShowTrustlineModal(true); setTrustlineMsg(''); }} disabled={!agentPublicKey}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-all disabled:opacity-40">
                <ShieldCheck size={12} /> USDC Trustline
              </button>
              <button onClick={() => { setShowWithdrawModal(true); setWithdrawMsg(''); }} disabled={!agentPublicKey}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-all disabled:opacity-40">
                <ArrowUpRight size={12} /> Withdraw
              </button>
            </>
          )}
          <button
            onClick={() => { setMode(mode === 'owner' ? 'agent' : 'owner'); if (agentRunning) stopAgent(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:text-primary hover:border-blue-200 transition-all">
            {mode === 'owner' ? <><Bot size={12} /> Agent Mode</> : <><Layers size={12} /> Owner Mode</>}
          </button>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ══ OWNER MODE ══ */}
        {mode === 'owner' && (
          <motion.div key="owner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* Stats */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { icon: TrendingUp,    label: 'XLM Balance',      value: fmt(xlmBalance),       sub: 'Stellar Lumens',   color: 'text-secondary', href: null },
                { icon: TrendingUp,    label: 'USDC Balance',     value: fmt(paymentBalance),   sub: 'Circle USDC',      color: 'text-primary',   href: null },
                { icon: ArrowUpRight,  label: 'Outgoing Streams', value: String(activeOut.length), sub: 'Agent is paying', color: 'text-primary',  href: '/app/streams' },
                { icon: ArrowDownLeft, label: 'Incoming Streams', value: String(activeIn.length),  sub: 'Claimable now',  color: 'text-secondary', href: '/app/streams' },
                { icon: Store,         label: 'Marketplace',      value: '→',                   sub: 'Browse assets',    color: 'text-purple-600',href: '/app/marketplace' },
              ].map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div className={cn('flex items-center gap-2', stat.color)}>
                      <stat.icon size={16} />
                      <h3 className="text-[10px] font-bold uppercase tracking-wider">{stat.label}</h3>
                    </div>
                    {stat.href && <Link to={stat.href}><ArrowUpRight size={14} className="text-slate-300 hover:text-primary transition-colors" /></Link>}
                  </div>
                  <p className="text-2xl font-headline font-bold text-slate-900">{stat.value}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{stat.sub}</p>
                </motion.div>
              ))}
            </section>

            {/* Streams + quick actions */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col h-[280px]">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <Zap className="text-primary" size={18} />
                    <h3 className="text-sm font-bold uppercase tracking-widest">Payment Streams</h3>
                  </div>
                  <Link to="/app/streams" className="text-[10px] uppercase font-bold text-slate-400 hover:text-primary flex items-center gap-1">
                    All <ArrowUpRight size={12} />
                  </Link>
                </div>
                {[...activeOut, ...activeIn].slice(0, 4).length > 0 ? (
                  <div className="flex-1 overflow-auto">
                    {[...activeOut, ...activeIn].slice(0, 4).map(s => (
                      <MiniStreamRow key={s.id} stream={s} formatEth={formatEth} />
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <p className="text-slate-400 text-sm mb-4">No active streams</p>
                    <Link to="/app/streams" className="bg-primary text-white px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-500/20">
                      <Plus size={14} /> Start Streaming
                    </Link>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  { icon: Zap,    label: 'Payment Streams', sub: 'Deploy agent payments',        bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-primary',    href: '/app/streams' },
                  { icon: Layers, label: 'RWA Studio',      sub: 'Mint · verify · manage assets', bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-600', href: '/app/rwa' },
                  { icon: Store,  label: 'Marketplace',     sub: 'Discover yield opportunities',  bg: 'bg-teal-50',   border: 'border-teal-100',   text: 'text-secondary',  href: '/app/marketplace' },
                ].map((a, i) => (
                  <Link key={a.label} to={a.href} className={cn('flex items-center justify-between p-4 rounded-xl border transition-colors group', a.bg, a.border)}>
                    <div className="flex items-center gap-3">
                      <a.icon className={a.text} size={16} />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{a.label}</p>
                        <p className="text-[10px] text-slate-500">{a.sub}</p>
                      </div>
                    </div>
                    <ArrowUpRight size={14} className="text-slate-300 group-hover:text-primary transition-all" />
                  </Link>
                ))}
              </div>
            </section>
          </motion.div>
        )}

        {/* ══ AGENT MODE ══ */}
        {mode === 'agent' && (
          <motion.div key="agent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* Agent stats */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Agent XLM',   value: agentPublicKey ? fmt(agentXlm) : '—',                sub: 'token',    color: 'text-secondary' },
                { label: 'Agent USDC',  value: agentPublicKey ? fmt(agentUsdc) : '—',                sub: 'token',     color: 'text-primary' },
                { label: 'Session P&L', value: `+${agentProfit.toFixed(2)}`,                 sub: 'profit',          color: 'text-secondary' },
                { label: 'Actions',     value: String(agentActions),                          sub: 'Autonomous decisions', color: 'text-purple-600' },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-2">{s.label}</p>
                  <p className={cn('text-2xl font-headline font-bold', s.color)}>{s.value}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{s.sub}</p>
                </motion.div>
              ))}
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

              {/* Live activity */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col h-[380px]">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-primary animate-pulse" />
                    <span className="text-xs font-label uppercase tracking-widest text-slate-500 font-bold">Live Activity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {agentRunning && (
                      <span className="flex items-center gap-1.5 text-[10px] text-secondary font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" /> Autonomous
                      </span>
                    )}
                    <button onClick={() => navigate('/app/agent')} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 transition-all">
                     <ArrowUpRight size={16} className="text-amber-600" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-2" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                  {!agentPublicKey ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
                        <KeyRound size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700 mb-1">No agent wallet</p>
                        <p className="text-xs text-slate-400 max-w-[180px]">Create one to start autonomous activity.</p>
                      </div>
                      <button onClick={() => setShowWalletModal(true)}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-blue-500/20">
                        Create Agent Wallet
                      </button>
                    </div>
                  ) : (
                    <>
                      {[...agentLogs].reverse().map(e => <AgentLogRow key={e.id} entry={e} />)}
                    </>
                  )}
                </div>
              </div>

              {/* Opportunities + streams */}
              <div className="space-y-4">
                {/* Active streams */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap size={13} className="text-primary" />
                      <span className="text-xs font-label uppercase tracking-widest text-slate-500 font-bold">Active Streams</span>
                    </div>
                    <Link to="/app/streams" className="text-[10px] text-slate-400 hover:text-primary font-bold">Manage</Link>
                  </div>
                  {activeOut.length === 0 && activeIn.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">No active streams. Run the agent to start.</p>
                  ) : (
                    [...activeOut, ...activeIn].slice(0, 3).map(s => (
                      <MiniStreamRow key={s.id} stream={s} formatEth={formatEth} />
                    ))
                  )}
                </div>

                {/* Market opportunities */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Store size={13} className="text-purple-600" />
                      <span className="text-xs font-label uppercase tracking-widest text-slate-500 font-bold">Opportunities</span>
                    </div>
                    <Link to="/app/marketplace" className="text-[10px] text-slate-400 hover:text-primary font-bold">Full market</Link>
                  </div>
                  <div className="space-y-2">
                    {marketAssets.length === 0 ? (
                      <p className="text-xs text-slate-400">No assets indexed yet.</p>
                    ) : marketAssets.map(a => {
                      const vs = a.verificationStatus || a.verificationStatusLabel || '';
                      const vsColor = vs === 'verified' ? 'bg-emerald-50 text-emerald-600' : vs === 'verified_with_warnings' ? 'bg-yellow-50 text-yellow-600' : 'bg-amber-50 text-amber-600';
                      const vsLabel = vs === 'verified' ? 'Verified' : vs === 'verified_with_warnings' ? 'Warnings' : 'Pending';
                      return (
                      <div key={a.id || a.tokenId} className="flex items-center gap-3 py-1.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                          <img src={a.publicMetadata?.image || a.imageUrl || getAssetImage(a.type || a.assetType, a.id || a.tokenId, 80, 80)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{a.name}</p>
                          <p className="text-[10px] text-slate-400">${(a.pricePerHour ?? 0).toFixed(4)}/hr</p>
                        </div>
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', vsColor)}>{vsLabel}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create Wallet Modal ── */}
      <AnimatePresence>
        {showWalletModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-primary" />
                  <p className="text-sm font-headline font-bold text-slate-900">Create Agent Wallet</p>
                </div>
                <button onClick={() => setShowWalletModal(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <AgentWalletPanel />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Fund Agent Wallet Modal ── */}
      {showFundModal && agentPublicKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-primary" />
                <p className="text-sm font-bold text-slate-900">Fund Agent Wallet</p>
              </div>
              <button onClick={() => setShowFundModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1">
              <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Agent Address</p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-slate-700 truncate flex-1">{agentPublicKey}</p>
                <button onClick={() => navigator.clipboard.writeText(agentPublicKey)} className="text-slate-400 hover:text-primary shrink-0">
                  <Copy size={13} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Fund with XLM</p>
              <button onClick={() => window.open(`https://friendbot.stellar.org/?addr=${agentPublicKey}`, '_blank', 'noopener')}
                className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-all">
                Get Testnet XLM via Friendbot
              </button>
              <p className="text-[10px] text-slate-400">Funds your agent with free testnet XLM instantly.</p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Fund with USDC</p>
              <p className="text-xs text-slate-500">Copy the agent address and send USDC from your Freighter wallet.</p>
              <button onClick={() => navigator.clipboard.writeText(agentPublicKey)}
                className="w-full py-3 rounded-xl border border-primary text-primary text-sm font-bold hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                <Copy size={14} /> Copy Agent Address
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Withdraw Modal ── */}
      {showWithdrawModal && agentPublicKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight size={16} className="text-amber-600" />
                <p className="text-sm font-bold text-slate-900">Withdraw from Agent</p>
              </div>
              <button onClick={() => { setShowWithdrawModal(false); setWithdrawMsg(''); setWithdrawAmount(''); }}
                className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-500">Funds will be sent to your connected Freighter wallet.</p>
            <div className="space-y-3">
              <div className="flex gap-2 items-start">
                <div className="w-32 shrink-0">
                  <Select
                    compact
                    options={[
                      { value: 'USDC', label: 'USDC' },
                      { value: 'XLM',  label: 'XLM' },
                    ]}
                    value={withdrawAsset}
                    onChange={v => setWithdrawAsset(String(v))}
                  />
                </div>
                <input type="number" placeholder="Amount" value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              {withdrawMsg && <p className={`text-xs ${withdrawMsg.startsWith('✓') ? 'text-secondary' : 'text-red-400'}`}>{withdrawMsg}</p>}
              <button onClick={handleWithdrawToOwner} disabled={withdrawBusy || !withdrawAmount}
                className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {withdrawBusy
                  ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  : <><ArrowUpRight size={16} /> Withdraw {withdrawAmount || '0'} {withdrawAsset}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── USDC Trustline Modal ── */}
      {showTrustlineModal && agentPublicKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <p className="text-sm font-bold text-slate-900">Setup USDC Trustline</p>
              </div>
              <button onClick={() => { setShowTrustlineModal(false); setTrustlineMsg(''); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            {/* Help box */}
            <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <HelpCircle size={15} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-blue-700">How to fund your agent with USDC</p>
                <ol className="text-[11px] text-blue-600 space-y-1 list-decimal list-inside">
                  <li>Click <strong>Fund Wallet</strong> → get free testnet XLM via Friendbot</li>
                  <li>Wait a few seconds for the XLM to arrive</li>
                  <li>Come back here and click <strong>Setup Trustline</strong> below</li>
                  <li>Then send USDC from your Freighter wallet to the agent address</li>
                </ol>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1">
              <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Agent Address</p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-slate-700 truncate flex-1">{agentPublicKey}</p>
                <button onClick={() => navigator.clipboard.writeText(agentPublicKey)} className="text-slate-400 hover:text-primary shrink-0"><Copy size={13} /></button>
              </div>
            </div>

            {trustlineMsg && (
              <p className={`text-xs font-medium ${trustlineMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{trustlineMsg}</p>
            )}

            <button onClick={handleSetupTrustline} disabled={trustlineBusy}
              className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {trustlineBusy
                ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                : <><ShieldCheck size={15} /> Setup USDC Trustline</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
