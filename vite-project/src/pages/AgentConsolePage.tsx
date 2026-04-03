import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Activity, Zap, Store, TrendingUp, RefreshCw, Play, Pause, Settings, AlertTriangle, Target, Wallet, ArrowUpRight, ArrowDownLeft, BarChart2, Link as LinkIcon, PlusCircle, Copy, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { fetchRwaAssets } from '../services/rwaApi.js';
import { mapApiAssetToUiAsset } from './rwa/rwaData';
import { cn } from '../lib/cn';
import { useAgentWallet } from '../hooks/useAgentWallet';
import AgentWalletPanel from '../components/AgentWalletPanel';
import { useAgentBalances } from '../hooks/useAgentBalances';
import { useAgentLoop, makeLogEntry, type LogEntry } from '../hooks/useAgentLoop';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'running' | 'paused' | 'idle';
type AgentRule = { id: string; label: string; enabled: boolean; value: string; unit: string };

// ─── Sub-components ───────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: LogEntry }) {
  const icons = {
    action:   { Icon: Zap,           color: 'text-primary',    bg: 'bg-blue-50' },
    decision: { Icon: Target,        color: 'text-purple-600', bg: 'bg-purple-50' },
    info:     { Icon: Activity,      color: 'text-slate-500',  bg: 'bg-slate-100' },
    error:    { Icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50' },
    profit:   { Icon: TrendingUp,    color: 'text-secondary',  bg: 'bg-teal-50' },
  };
  const { Icon, color, bg } = icons[entry.type];
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${bg}`}>
        <Icon size={13} className={color} />
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
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AgentConsolePage() {
  const { walletAddress, outgoingStreams, incomingStreams, refreshStreams } = useWallet();
  const { agentPublicKey } = useAgentWallet(walletAddress);
  const { xlm: agentXlm, usdc: agentUsdc } = useAgentBalances(agentPublicKey);
  const isConnected = Boolean(walletAddress);

  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([makeLogEntry({ type: 'info', message: 'Agent initialized. Configure rules and press Run to start.', detail: 'Stellar Testnet · Ready' })]);
  const [totalProfit, setTotalProfit] = useState(0);
  const [actionsCount, setActionsCount] = useState(0);
  const [agentSessions, setAgentSessions] = useState<any[]>([]);
  const [rules, setRules] = useState<AgentRule[]>([
    { id: 'min_yield',  label: 'Min yield target',    enabled: true,  value: '5',  unit: '%' },
    { id: 'max_budget', label: 'Max budget per trade', enabled: true,  value: '50', unit: 'USDC' },
    { id: 'auto_claim', label: 'Auto-claim threshold', enabled: true,  value: '1',  unit: 'USDC' },
    { id: 'auto_renew', label: 'Auto-renew sessions',  enabled: false, value: '24', unit: 'hrs before' },
  ]);
  const [showSettings, setShowSettings] = useState(false);
  const [marketAssets, setMarketAssets] = useState<any[]>([]);

  const [showFundModal, setShowFundModal] = useState(false);
  const { start: startLoop, stop: stopLoop } = useAgentLoop(agentPublicKey);
  const logBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => {
    fetchRwaAssets().then(raw => setMarketAssets(raw.slice(0, 4).map(mapApiAssetToUiAsset))).catch(() => {});
  }, []);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLogs(l => [...l.slice(-99), makeLogEntry(entry)]);
    if (entry.type === 'profit' && entry.amount) {
      setTotalProfit(p => Math.round((p + (parseFloat(entry.amount!.replace('+', '')) || 0)) * 100) / 100);
    }
    if (entry.type === 'action') setActionsCount(c => c + 1);
  }, []);

  const startAgent = useCallback(() => {
    if (!agentPublicKey) return;
    setAgentStatus('running');
    addLog({ type: 'info', message: 'Autonomous agent started', detail: `Rules active: ${rules.filter(r => r.enabled).length}` });
    startLoop(rules, addLog, setAgentSessions);
  }, [agentPublicKey, rules, addLog, startLoop]);

  const pauseAgent = useCallback(() => {
    setAgentStatus('paused');
    stopLoop();
    addLog({ type: 'info', message: 'Agent paused by operator', detail: 'Resume anytime' });
  }, [addLog, stopLoop]);

  const stopAgent = useCallback(() => {
    setAgentStatus('idle');
    stopLoop();
    addLog({ type: 'info', message: 'Agent stopped', detail: `Session summary: ${actionsCount} actions` });
  }, [addLog, stopLoop, actionsCount]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const statusConfig = {
    running: { label: 'Running', color: 'text-secondary',  bg: 'bg-emerald-50', dot: 'bg-secondary animate-pulse' },
    paused:  { label: 'Paused',  color: 'text-amber-600',  bg: 'bg-amber-50',   dot: 'bg-amber-400' },
    idle:    { label: 'Idle',    color: 'text-slate-500',  bg: 'bg-slate-100',  dot: 'bg-slate-300' },
  }[agentStatus];

  const activeStreams = agentSessions.filter(s => s.sessionStatus === 'active').length;
  const totalClaimable = agentSessions.reduce((sum, s) => sum + parseFloat(s.claimableAmount || s.consumedAmount || '0'), 0);

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-slate-50/50">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl ethereal-gradient flex items-center justify-center shadow-md shadow-blue-500/20">
            <Bot size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold font-headline text-slate-900">My Agent</p>
            <p className="text-[10px] font-mono text-slate-400">
              {agentPublicKey ? `${agentPublicKey.slice(0,6)}…${agentPublicKey.slice(-4)}` : 'No agent wallet'}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold ${statusConfig.bg} ${statusConfig.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {[
            { icon: TrendingUp,    label: 'P&L',       value: `+${totalProfit.toFixed(2)} USDC`,    color: 'text-secondary' },
            { icon: Zap,           label: 'Actions',   value: String(actionsCount),                  color: 'text-primary' },
            { icon: ArrowUpRight,  label: 'Sessions',  value: String(activeStreams),                  color: 'text-primary' },
            { icon: ArrowDownLeft, label: 'Claimable', value: `${totalClaimable.toFixed(4)} USDC`,   color: 'text-secondary' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm">
              <Icon size={13} className={color} />
              <div>
                <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{label}</p>
                <p className={`text-sm font-headline font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowFundModal(true)} disabled={!agentPublicKey}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-40">
            <PlusCircle size={14} /> Fund Wallet
          </button>
          <button onClick={() => setShowSettings(s => !s)}
            className={cn('p-2.5 rounded-xl border transition-all', showSettings ? 'bg-blue-50 border-blue-200 text-primary' : 'border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50')}>
            <Settings size={16} />
          </button>
          <button onClick={() => refreshStreams()} className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50 transition-all">
            <RefreshCw size={16} />
          </button>
          {agentStatus === 'idle' && (
            <button onClick={startAgent} disabled={!isConnected || !agentPublicKey}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/20 hover:scale-105 transition-all disabled:opacity-40">
              <Play size={14} /> Run Agent
            </button>
          )}
          {agentStatus === 'running' && (
            <button onClick={pauseAgent}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:scale-105 transition-all">
              <Pause size={14} /> Pause
            </button>
          )}
          {agentStatus === 'paused' && (
            <div className="flex gap-2">
              <button onClick={startAgent} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:scale-105 transition-all">
                <Play size={14} /> Resume
              </button>
              <button onClick={stopAgent} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-bold hover:bg-red-50 transition-all">
                Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Rules panel ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="bg-white border-b border-slate-100 overflow-hidden shrink-0">
            <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <button onClick={() => setRules(r => r.map(x => x.id === rule.id ? { ...x, enabled: !x.enabled } : x))}
                    className={cn('w-9 h-5 rounded-full transition-colors relative shrink-0 flex items-center', rule.enabled ? 'bg-primary' : 'bg-slate-200')}>
                    <span className={cn('absolute w-3.5 h-3.5 bg-white rounded-full shadow transition-transform', rule.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 truncate">{rule.label}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <input type="number" value={rule.value}
                        onChange={e => setRules(r => r.map(x => x.id === rule.id ? { ...x, value: e.target.value } : x))}
                        className="w-16 bg-white border border-slate-100 rounded-lg px-2 py-1 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                      <span className="text-xs text-slate-400">{rule.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main 3-column layout ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">

        {/* Col 1: Activity feed */}
        <div className="flex flex-col overflow-hidden border-r border-slate-100">
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-primary" />
              <span className="text-xs font-label uppercase tracking-widest text-slate-500 font-bold">Live Activity</span>
            </div>
            {agentStatus === 'running' && (
              <span className="flex items-center gap-1.5 text-[10px] text-secondary font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" /> Autonomous
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-2">
            {logs.map(entry => <LogRow key={entry.id} entry={entry} />)}
            <div ref={logBottomRef} />
          </div>
        </div>

        {/* Col 2: Marketplace opportunities */}
        <div className="flex flex-col overflow-hidden border-r border-slate-100">
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <Store size={15} className="text-purple-600" />
              <span className="text-xs font-label uppercase tracking-widest text-slate-500 font-bold">Opportunities</span>
            </div>
            <Link to="/app/marketplace" className="text-[10px] font-bold text-slate-400 hover:text-primary flex items-center gap-1 transition-colors">
              Full market <ArrowUpRight size={11} />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {marketAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Store size={32} className="text-slate-200 mb-3" />
                <p className="text-sm text-slate-400">No assets available yet.</p>
                <Link to="/app/marketplace" className="mt-4 text-xs font-bold text-primary hover:underline">Browse marketplace</Link>
              </div>
            ) : marketAssets.map(asset => (
              <div key={asset.id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                  <img src={`https://picsum.photos/seed/${asset.type}${asset.id}/100/100`} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{asset.name}</p>
                  <p className="text-xs text-slate-400 truncate">{asset.location}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-secondary">${asset.pricePerHour.toFixed(4)}/hr</span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                      asset.verificationStatus === 'verified' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                      {asset.verificationStatusLabel || 'Pending'}
                    </span>
                  </div>
                </div>
                <Link to="/app/marketplace"
                  className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shrink-0">
                  <BarChart2 size={14} />
                </Link>
              </div>
            ))}
          </div>

          {/* P&L summary */}
          <div className="border-t border-slate-100 bg-white p-4 shrink-0">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-3">Session P&L</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Profit',    value: `+${totalProfit.toFixed(2)}`,  color: 'text-secondary' },
                { label: 'Actions',   value: String(actionsCount),           color: 'text-primary' },
                { label: 'Sessions',  value: String(activeStreams),           color: 'text-purple-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <p className={`text-base font-headline font-black ${color}`}>{value}</p>
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Fund Wallet Modal ── */}
      {showFundModal && agentPublicKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-primary" />
                <p className="text-sm font-bold text-slate-900">Fund Agent Wallet</p>
              </div>
              <button onClick={() => setShowFundModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1">
              <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Agent Address</p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-slate-700 truncate flex-1">{agentPublicKey}</p>
                <button onClick={() => navigator.clipboard.writeText(agentPublicKey)}
                  className="text-slate-400 hover:text-primary shrink-0"><Copy size={13} /></button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Fund with XLM</p>
              <button
                onClick={() => window.open(`https://friendbot.stellar.org/?addr=${agentPublicKey}`, '_blank', 'noopener')}
                className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-all">
                Get Testnet XLM via Friendbot
              </button>
              <p className="text-[10px] text-slate-400">Opens Stellar Friendbot — funds your agent with free testnet XLM instantly.</p>
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-100">
              <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Fund with USDC</p>
              <p className="text-xs text-slate-500">Copy the agent address above, then send USDC from your Freighter wallet to that address.</p>
              <button onClick={() => { navigator.clipboard.writeText(agentPublicKey); }}
                className="w-full py-3 rounded-xl border border-primary text-primary text-sm font-bold hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                <Copy size={14} /> Copy Agent Address
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
