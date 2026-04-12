import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Zap, Store, Bot, FileText, X, ChevronRight, Layers, MapPin, Home } from 'lucide-react';
import { cn } from '../lib/cn';
import { useWallet } from '../context/WalletContext';
import { useAppMode } from '../context/AppModeContext';
import { useAgentWallet } from '../hooks/useAgentWallet';

const ownerNavItems = [
  { icon: LayoutDashboard, label: 'Owner Hub',        href: '/app',              sub: 'Capital · assets · overview' },
  { icon: Store,           label: 'Marketplace',      href: '/app/marketplace',  sub: 'Browse · Analyze · Bid' },
  { icon: Bot,             label: 'Agent Console',    href: '/app/agent',        sub: 'Mandate · Treasury · P&L' },
  { icon: Layers,          label: 'RWA Studio',       href: '/app/rwa',          sub: 'Admit · Verify · Manage' },
  { icon: MapPin,          label: 'List Property',    href: '/app/property-mint', sub: 'Landed · Estate · Full data' },
  { icon: Home,            label: 'Browse Properties', href: '/app/properties',    sub: 'View minted listings' },
  { icon: Zap,             label: 'Payment Sessions', href: '/app/streams',      sub: 'Stream Engine rail' },
];

const agentNavItems = [
  { icon: LayoutDashboard, label: 'Agent Hub',        href: '/app',              sub: 'Positions · activity · P&L' },
  { icon: Store,           label: 'Marketplace',      href: '/app/marketplace',  sub: 'Browse · Analyze · Bid' },
  { icon: Bot,             label: 'Agent Console',    href: '/app/agent',        sub: 'Wallet · Mandate · Treasury' },
  { icon: Zap,             label: 'Payment Sessions', href: '/app/streams',      sub: 'Stream Engine rail' },
];

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { walletAddress } = useWallet();
  const { mode, setMode } = useAppMode();
  const { agentPublicKey } = useAgentWallet(walletAddress);
  const navItems = mode === 'agent' ? agentNavItems : ownerNavItems;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;
  const agentShort = agentPublicKey
    ? `${agentPublicKey.slice(0, 6)}…${agentPublicKey.slice(-4)}`
    : null;

  return (
    <div className="flex flex-col h-full py-6">
      {/* Logo */}
      <div className="px-6 mb-10">
        <div className="flex items-center gap-3">
         
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                <path d="M4 14 Q8 8 14 14 Q20 20 24 14" stroke="#1a3de6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <path d="M4 18 Q8 12 14 18 Q20 24 24 18" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
                <circle cx="14" cy="14" r="2.5" fill="#1a3de6"/>
              </svg>
         
          <div>
            <h1 className="text-sm font-black text-slate-900 font-headline leading-tight tracking-tight">Continuum</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span className="text-[9px] font-label uppercase tracking-widest text-slate-400">Powered by Stream Engine</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === '/app'}
            onClick={onNavClick}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group',
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            )}
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                  isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                )}>
                  <item.icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-bold font-headline leading-tight', isActive ? 'text-blue-700' : 'text-slate-700')}>{item.label}</p>
                  <p className="text-[10px] text-slate-400 truncate">{item.sub}</p>
                </div>
                {isActive && <ChevronRight size={14} className="text-blue-400 shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 mt-4 space-y-2">
        {/* Mode toggle */}
        <div className="mx-1 rounded-2xl border border-slate-100 overflow-hidden">
          <button
            onClick={() => setMode('owner')}
            className={cn('w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-colors',
              mode === 'owner' ? 'bg-blue-50 text-primary' : 'bg-white text-slate-400 hover:text-slate-700')}
          >
            <Layers size={13} />
            <span>Owner Mode</span>
          </button>
          <button
            onClick={() => setMode('agent')}
            className={cn('w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-colors border-t border-slate-100',
              mode === 'agent' ? 'bg-blue-50 text-primary' : 'bg-white text-slate-400 hover:text-slate-700')}
          >
            <Bot size={13} />
            <span>Agent Mode</span>
            {mode === 'agent' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />}
          </button>
        </div>

        {/* Active wallet */}
        <div className="mx-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mb-1">
            {mode === 'owner' ? 'Owner Wallet' : 'Agent Wallet'}
          </p>
          <p className="text-xs font-mono font-bold text-slate-700">
            {mode === 'owner' ? (shortAddress || 'Not connected') : (agentShort || 'No agent wallet')}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', mode === 'owner' ? 'bg-secondary' : 'bg-primary')} />
            <span className={cn('text-[9px] font-bold', mode === 'owner' ? 'text-secondary' : 'text-primary')}>
              {mode === 'owner' ? 'Freighter · Stellar Testnet' : 'Keypair · Autonomous'}
            </span>
          </div>
        </div>

        <NavLink
          to="/app/docs"
          onClick={onNavClick}
          className={({ isActive }) => cn(
            'flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-xs font-headline',
            isActive ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-400 hover:text-slate-600'
          )}
        >
          <FileText size={14} /><span>Docs</span>
        </NavLink>
      </div>
    </div>
  );
}

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <>
      <aside className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 z-40 bg-white/90 backdrop-blur-lg border-r border-slate-100">
        <SidebarContent />
      </aside>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <aside className="relative w-72 bg-white h-full shadow-2xl flex flex-col">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
              <X size={20} />
            </button>
            <SidebarContent onNavClick={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
