import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Activity, Zap, Store, TrendingUp, RefreshCw, Play, Pause, Settings, AlertTriangle, Target, Wallet, ArrowUpRight, ArrowDownLeft, BarChart2, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { fetchRwaAssets } from '../services/rwaApi.js';
import { mapApiAssetToUiAsset } from './rwa/rwaData';
import { cn } from '../lib/cn';
import { getStoredAgentWallet } from '../lib/agentWallet';
import AgentWalletPanel from '../components/AgentWalletPanel';
import { useAgentBalances } from '../hooks/useAgentBalances';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'running' | 'paused' | 'idle';
type LogEntry = {
  id: number; ts: number;
  type: 'action' | 'decision' | 'info' | 'error' | 'profit';
  message: string; detail?: string; amount?: string; asset?: string;
};
type AgentRule = { id: string; label: string; enabled: boolean; value: string; unit: string };

// ─── Mock log ─────────────────────────────────────────────────────────────────

let logId = 0;
const MOCK_ACTIONS: Omit<LogEntry, 'id' | 'ts'>[] = [
  { type: 'decision', message: 'Scanning marketplace for yield opportunities', detail: 'Evaluating 3 assets' },
  { type: 'action',   message: 'Opened rental stream on Azure Heights Residence', detail: 'Session #12 · 30 days', amount: '+8.2% APY', asset: 'Real Estate' },
  { type: 'profit',   message: 'Claimed yield from Skyline Logistics Hub', detail: 'Session #9 settled', amount: '+2.4 USDC' },
  { type: 'decision', message: 'Holding — vehicle asset yield below threshold', detail: 'Min yield: 5% · Current: 3.1%' },
  { type: 'action',   message: 'Cancelled underperforming stream', detail: 'Session #7 · Refund: 12.5 USDC', amount: '+12.5 USDC' },
  { type: 'info',     message: 'Portfolio rebalance check complete', detail: '2 active rentals · 1 pending claim' },
  { type: 'action',   message: 'Deployed payment stream to equipment provider', detail: 'Session #13 · 7 days · 5 USDC', amount: '-5.0 USDC' },
  { type: 'profit',   message: 'Flash advance executed on yield vault', detail: 'Advance: 18.3 USDC', amount: '+18.3 USDC' },
];
function makeLog(override?: Partial<LogEntry>): LogEntry {
  const base = MOCK_ACTIONS[logId % MOCK_ACTIONS.length];
  return { ...base, ...override, id: ++logId, ts: Date.now() };
}

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
  const { walletAddress, paymentBalance, xlmBalance, outgoingStreams, incomingStreams, refreshStreams } = useWallet();
  const agentWallet = getStoredAgentWallet();
  const { xlm: agentXlm, usdc: agentUsdc } = useAgentBalances(agentWallet?.publicKey);
  const isConnected = Boolean(walletAddress);

  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([makeLog({ type: 'info', message: 'Agent initialized. Configure rules and press Run to start.', detail: 'Stellar Testnet · Ready' })]);
  const [totalProfit, setTotalProfit] = useState(0);
  const [actionsCount, setActionsCount] = useState(0);
  const [rules, setRules] = useState<AgentRule[]>([
    { id: 'min_yield',  label: 'Min yield target',    enabled: true,  value: '5',  unit: '%' },
    { id: 'max_budget', label: 'Max budget per trade', enabled: true,  value: '50', unit: 'USDC' },
    { id: 'auto_claim', label: 'Auto-claim threshold', enabled: true,  value: '1',  unit: 'USDC' },
    { id: 'auto_renew', label: 'Auto-renew sessions',  enabled: false, value: '24', unit: 'hrs before' },
  ]);
  const [showSettings, setShowSettings] = useState(false);
  const [marketAssets, setMarketAssets] = useState<any[]>([]);

  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  useEffect(() => {
    fetchRwaAssets().then(raw => setMarketAssets(raw.slice(0, 4).map(mapApiAssetToUiAsset))).catch(() => {});
  }, []);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLogs(l => [...l.slice(-99), makeLog(entry)]);
    if (entry.type === 'profit' && entry.amount) {
      const val = parseFloat(entry.amount.replace('+', '')) || 0;
      setTotalProfit(p => Math.round((p + val) * 100) / 100);
    }
    if (entry.type === 'action') setActionsCount(c => c + 1);
  }, []);

  const startAgent = useCallback(() => {
    setAgentStatus('running');
    addLog({ type: 'info', message: 'Autonomous agent started', detail: `Rules active: ${rules.filter(r => r.enabled).length}` });
    loopRef.current = setInterval(() => {
      addLog(MOCK_ACTIONS[Math.floor(Math.random() * MOCK_ACTIONS.length)]);
    }, 4000);
  }, [addLog, rules]);

  const pauseAgent = useCallback(() => {
    setAgentStatus('paused');
    if (loopRef.current) clearInterval(loopRef.current);
    addLog({ type: 'info', message: 'Agent paused by operator', detail: 'Resume anytime' });
  }, [addLog]);

  const stopAgent = useCallback(() => {
    setAgentStatus('idle');
    if (loopRef.current) clearInterval(loopRef.current);
    addLog({ type: 'info', message: 'Agent stopped', detail: `Session summary: ${actionsCount} actions` });
  }, [addLog, actionsCount]);

  useEffect(() => () => { if (loopRef.current) clearInterval(loopRef.current); }, []);

  const statusConfig = {
    running: { label: 'Running', color: 'text-secondary',  bg: 'bg-emerald-50', dot: 'bg-secondary animate-pulse' },
    paused:  { label: 'Paused',  color: 'text-amber-600',  bg: 'bg-amber-50',   dot: 'bg-amber-400' },
    idle:    { label: 'Idle',    color: 'text-slate-500',  bg: 'bg-slate-100',  dot: 'bg-slate-300' },
  }[agentStatus];

  const activeStreams = outgoingStreams.filter(s => !['ended','cancelled','completed'].includes(s.sessionStatus)).length;
  const earningStreams = incomingStreams.filter(s => !['ended','cancelled','completed'].includes(s.sessionStatus)).length;
  const fmt = (v: any) => parseFloat(v || 0).toFixed(2);

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
              {agentWallet ? `${agentWallet.publicKey.slice(0,6)}…${agentWallet.publicKey.slice(-4)}` : 'No agent wallet'}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold ${statusConfig.bg} ${statusConfig.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {[
            { icon: TrendingUp,    label: 'P&L',      value: `+${totalProfit.toFixed(2)} USDC`, color: 'text-secondary' },
            { icon: Zap,           label: 'Actions',  value: String(actionsCount),               color: 'text-primary' },
            { icon: ArrowUpRight,  label: 'Spending', value: String(activeStreams),               color: 'text-primary' },
            { icon: ArrowDownLeft, label: 'Earning',  value: String(earningStreams),              color: 'text-secondary' },
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
          <button onClick={() => setShowSettings(s => !s)}
            className={cn('p-2.5 rounded-xl border transition-all', showSettings ? 'bg-blue-50 border-blue-200 text-primary' : 'border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50')}>
            <Settings size={16} />
          </button>
          <button onClick={() => refreshStreams()} className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50 transition-all">
            <RefreshCw size={16} />
          </button>
          {agentStatus === 'idle' && (
            <button onClick={startAgent} disabled={!isConnected}
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
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr_320px] overflow-hidden">

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
                { label: 'Profit',   value: `+${totalProfit.toFixed(2)}`, color: 'text-secondary' },
                { label: 'Actions',  value: String(actionsCount),          color: 'text-primary' },
                { label: 'Streams',  value: String(activeStreams),          color: 'text-purple-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <p className={`text-base font-headline font-black ${color}`}>{value}</p>
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Col 3: Agent wallet + quick links */}
        <div className="flex flex-col overflow-hidden bg-white">
          <div className="px-5 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={14} className="text-primary" />
              <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-500">Agent Wallet</p>
            </div>
            <AgentWalletPanel />
          </div>

          {/* Agent wallet balances */}
          {agentWallet && (
            <div className="px-5 py-4 border-b border-slate-100 shrink-0">
              <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-3">Agent Balances</p>
              <div className="space-y-2">
                {[
                  { label: 'XLM',  value: `${agentXlm} XLM`,  color: 'text-secondary' },
                  { label: 'USDC', value: `${agentUsdc} USDC`, color: 'text-primary' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    <span className="text-[10px] font-label uppercase tracking-widest text-slate-400">{label}</span>
                    <span className={`text-sm font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Owner wallet context */}
          {/* <div className="px-5 py-4 border-b border-slate-100 shrink-0">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-3">Owner Wallet (Freighter)</p>
            <div className="space-y-2">
              {[
                { label: 'XLM',  value: `${fmt(xlmBalance)} XLM`,         color: 'text-slate-700' },
                { label: 'USDC', value: `${fmt(paymentBalance)} USDC`,     color: 'text-primary' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                  <span className="text-[10px] font-label uppercase tracking-widest text-slate-400">{label}</span>
                  <span className={`text-sm font-bold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div> */}

          {/* Quick links */}
          <div className="px-5 py-4 space-y-2 flex-1">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-3">Quick Actions</p>
            {[
              { label: 'Browse Marketplace',  sub: 'Find yield opportunities',  href: '/app/marketplace', color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Payment Streams',     sub: 'Deploy agent payments',      href: '/app/streams',     color: 'text-primary',    bg: 'bg-blue-50' },
              { label: 'RWA Studio',          sub: 'Owner tools — mint & manage',href: '/app/rwa',         color: 'text-slate-600',  bg: 'bg-slate-50' },
            ].map(({ label, sub, href, color, bg }) => (
              <Link key={href} to={href}
                className={cn('flex items-center justify-between p-3 rounded-2xl border border-slate-100 hover:shadow-sm transition-all group', bg)}>
                <div>
                  <p className={`text-xs font-bold ${color}`}>{label}</p>
                  <p className="text-[10px] text-slate-400">{sub}</p>
                </div>
                <LinkIcon size={13} className="text-slate-300 group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
