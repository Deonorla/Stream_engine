import { TrendingUp, ArrowUpRight, ArrowDownLeft, Building2, Plus, Activity, Cpu } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';

export default function Dashboard() {
  const { paymentBalance, xlmBalance, incomingStreams, outgoingStreams } = useWallet();

  const fmt = (val) => parseFloat(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const stats = [
    { icon: TrendingUp,    label: 'XLM Balance',        value: fmt(xlmBalance),     sub: ' token', color: 'text-secondary' },
    { icon: TrendingUp,    label: 'USDC Balance',      value: fmt(paymentBalance), sub: ' token',   color: 'text-primary' },
    { icon: ArrowUpRight,  label: 'Outgoing Streams',  value: String(outgoingStreams.length), sub: '0.00 USDC', color: 'text-primary',    href: '/app/streams' },
    { icon: ArrowDownLeft, label: 'Incoming Streams',  value: String(incomingStreams.length), sub: 'claimable now', color: 'text-secondary', href: '/app/streams' },
    { icon: Building2,     label: 'RWA Assets',        value: '0',    sub: '0.00 USDC',        color: 'text-purple-600', href: '/app/rwa' },
  ];

  return (    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-8">
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className={cn('flex items-center gap-2', stat.color)}>
                <stat.icon size={20} />
                <h3 className="text-xs font-bold uppercase tracking-wider">{stat.label}</h3>
              </div>
              {stat.href && (
                <Link to={stat.href}><ArrowUpRight size={16} className="text-slate-300 hover:text-primary transition-colors" /></Link>
              )}
            </div>
            <p className="text-3xl font-headline font-bold text-slate-900">{stat.value}</p>
            <p className="text-[10px] text-slate-400 mt-1">{stat.sub}</p>
          </motion.div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
          <div className="flex justify-between items-center mb-12">
            <div className="flex items-center gap-3">
              <TrendingUp className="text-primary" size={20} />
              <h3 className="text-sm font-bold uppercase tracking-widest">Payment Streams</h3>
            </div>
            <Link to="/app/streams" className="text-[10px] uppercase font-bold text-slate-400 hover:text-primary flex items-center gap-1 transition-colors">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-slate-400 text-sm mb-6">No active streams</p>
            <Link to="/app/streams" className="bg-primary text-white px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:scale-105 transition-all">
              <Plus size={16} /> Create Stream
            </Link>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
          <div className="flex justify-between items-center mb-12">
            <div className="flex items-center gap-3">
              <Building2 className="text-purple-600" size={20} />
              <h3 className="text-sm font-bold uppercase tracking-widest">RWA Studio</h3>
            </div>
            <Link to="/app/rwa" className="text-[10px] uppercase font-bold text-slate-400 hover:text-primary flex items-center gap-1 transition-colors">
              Browse <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-slate-500 font-bold mb-2">No indexed rental assets yet</p>
            <p className="text-slate-400 text-xs max-w-xs">Mint an asset in RWA Studio or wait for the registry to sync.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: TrendingUp, label: 'Create Stream',  sub: 'Send USDC per-second',          bg: 'bg-blue-50',    border: 'border-blue-100',   text: 'text-primary',      href: '/app/streams' },
          { icon: Building2,  label: 'Rent an Asset',  sub: 'Stream rent to RWA owners',     bg: 'bg-purple-50',  border: 'border-purple-100', text: 'text-purple-600',   href: '/app/rent' },
          { icon: Cpu,        label: 'Agent Console',  sub: 'AI-powered payment decisions',  bg: 'bg-slate-50',   border: 'border-slate-100',  text: 'text-slate-600',    href: '/app/agent' },
        ].map((action, i) => (
          <Link key={i} to={action.href} className={cn('flex items-center justify-between p-6 rounded-xl border transition-colors group', action.bg, action.border)}>
            <div className="flex items-center gap-4">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', action.bg)}>
                <action.icon className={action.text} size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{action.label}</p>
                <p className="text-[10px] text-slate-500">{action.sub}</p>
              </div>
            </div>
            <ArrowUpRight size={16} className="text-slate-400 group-hover:text-primary transition-all" />
          </Link>
        ))}
      </section>

      <section className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-10">
          <Activity className="text-secondary" size={20} />
          <h3 className="text-sm font-bold uppercase tracking-widest">Protocol Overview</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { label: 'Protected Routes',  value: '0',              color: 'text-secondary' },
            { label: 'Service Wallet',    value: 'Unavailable',    color: 'text-primary' },
            { label: 'Settlement',        value: 'soroban-sac',    color: 'text-slate-900' },
            { label: 'Network',           value: 'Stellar Testnet', color: 'text-primary' },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <p className={cn('text-3xl font-headline font-bold mb-1', item.color)}>{item.value}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-center">
        <div className="bg-white text-slate-500 px-6 py-3 rounded-lg flex items-center gap-3 font-mono text-xs border border-slate-100 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
          <span>Connected via Freighter • Stellar Testnet</span>
        </div>
      </div>
    </div>
  );
}
