import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ArrowRightLeft, Bot, BookOpen, Building2, ChevronDown, Wallet } from 'lucide-react';
import { paymentTokenSymbol } from '../contactInfo';

const defaultTabs = [
  { id: 'dashboard', path: '/app',          icon: LayoutDashboard, label: 'Dashboard'     },
  { id: 'streams',   path: '/app/streams',  icon: ArrowRightLeft,  label: 'Streams'       },
  { id: 'rwa',       path: '/app/rwa',      icon: Building2,       label: 'RWA Studio'    },
  { id: 'agent',     path: '/app/agent',    icon: Bot,             label: 'Agent Console' },
  { id: 'docs',      path: '/app/docs',     icon: BookOpen,        label: 'Docs'          },
];

export default function Header({
  walletAddress,
  chainId,
  networkName,
  onConnect,
  onManageWallets,
  walletLabel,
  balance,
  tabs = defaultTabs,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const activeTab = [...tabs]
    .sort((a, b) => b.path.length - a.path.length)
    .find(t => location.pathname.startsWith(t.path))?.id || 'dashboard';

  return (
    <header className="sticky top-0 z-50 w-full bg-surface-900/90 backdrop-blur-md border-b border-surface-700">
      <nav
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4"
        aria-label="App navigation"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0 group" aria-label="Stream Engine home">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M4 14 Q8 8 14 14 Q20 20 24 14" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M4 18 Q8 12 14 18 Q20 24 24 18" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
            <circle cx="14" cy="14" r="2.5" fill="#3b82f6"/>
          </svg>
          <span className="text-white font-bold text-base tracking-tight hidden sm:block">Stream Engine</span>
        </Link>

        {/* Desktop nav — scrollable so it never wraps */}
        <div className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {tabs.map(({ id, path, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <Link
                key={id}
                to={path}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0 ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-surface-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-flowpay-400" aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Wallet area — desktop */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {walletAddress ? (
            <>
              {/* Network badge */}
              {networkName && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs text-surface-300 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  {networkName}
                </div>
              )}

              {/* Wallet pill — balance + address + switch */}
              <button
                type="button"
                onClick={onManageWallets}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 hover:border-white/20 transition-colors group"
              >
                <Wallet className="w-3.5 h-3.5 text-flowpay-400 shrink-0" />
                {balance && (
                  <span className="font-mono text-xs text-flowpay-300 tabular-nums">
                    {parseFloat(balance).toFixed(2)} {paymentTokenSymbol}
                  </span>
                )}
                <span className="font-mono text-xs text-surface-300">
                  {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                </span>
                <ChevronDown className="w-3 h-3 text-surface-500 group-hover:text-white transition-colors" />
              </button>
            </>
          ) : (
            <button
              onClick={onConnect}
              className="px-4 py-2 bg-flowpay-500 hover:bg-flowpay-600 text-white text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-flowpay-500/50 whitespace-nowrap"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden ml-auto text-surface-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-flowpay-500/50 rounded p-1"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {menuOpen
              ? <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round"/>
              : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
            }
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-surface-950/95 backdrop-blur-md border-b border-surface-700 px-4 pt-3 pb-5 flex flex-col gap-1 animate-fade-in">
          {tabs.map(({ id, path, icon: Icon, label }) => (
            <Link
              key={id}
              to={path}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-white/10 text-white'
                  : 'text-surface-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}

          {/* Wallet section in mobile menu */}
          <div className="mt-3 pt-3 border-t border-surface-700">
            {walletAddress ? (
              <div className="space-y-2">
                {networkName && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-xs text-surface-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {networkName}
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800 border border-surface-700">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5 text-flowpay-400" />
                    <span className="font-mono text-xs text-surface-300">
                      {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
                    </span>
                  </div>
                  {balance && (
                    <span className="font-mono text-xs text-flowpay-300 tabular-nums">
                      {parseFloat(balance).toFixed(4)} {paymentTokenSymbol}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { onManageWallets?.(); setMenuOpen(false); }}
                  className="w-full py-2.5 border border-white/10 text-white/70 font-medium rounded-lg text-sm hover:text-white hover:border-white/20 transition-colors"
                >
                  Switch Wallet
                </button>
              </div>
            ) : (
              <button
                onClick={() => { onConnect(); setMenuOpen(false); }}
                className="w-full py-3 bg-flowpay-500 hover:bg-flowpay-600 text-white font-semibold rounded-lg text-sm transition-all duration-200"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
