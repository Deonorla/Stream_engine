import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ArrowRightLeft, Bot, BookOpen } from 'lucide-react';

const defaultTabs = [
  { id: 'dashboard', path: '/app',        icon: LayoutDashboard, label: 'Dashboard'     },
  { id: 'streams',   path: '/app/streams', icon: ArrowRightLeft,  label: 'Streams'       },
  { id: 'agent',     path: '/app/agent',   icon: Bot,             label: 'Agent Console' },
  { id: 'docs',      path: '/app/docs',    icon: BookOpen,        label: 'Docs'          },
];

export default function Header({ walletAddress, chainId, networkName, onConnect, balance, tabs = defaultTabs }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const activeTab = [...tabs].sort((a, b) => b.path.length - a.path.length)
    .find(t => location.pathname.startsWith(t.path))?.id || 'dashboard';

  return (
    <header className="sticky top-0 z-50 w-full bg-surface-900/90 backdrop-blur-md border-b border-surface-700">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between" aria-label="App navigation">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group" aria-label="Stream Engine home">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M4 14 Q8 8 14 14 Q20 20 24 14" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M4 18 Q8 12 14 18 Q20 24 24 18" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
            <circle cx="14" cy="14" r="2.5" fill="#3b82f6"/>
          </svg>
          <span className="text-white font-bold text-lg tracking-tight">Stream Engine</span>
        </Link>

        {/* Desktop nav tabs */}
        <div className="hidden md:flex items-center gap-6">
          {tabs.map(({ id, path, icon: Icon, label }) => {
            const isActive = activeTab === id
            return (
              <Link
                key={id}
                to={path}
                className="relative flex items-center gap-1.5 text-sm pb-1 transition-colors duration-200 group"
                style={{ color: isActive ? '#fff' : '' }}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-surface-400 group-hover:text-white'}`} />
                <span className={isActive ? 'text-white' : 'text-surface-400 group-hover:text-white transition-colors duration-200'}>{label}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-flowpay-400 animate-pulse" />}
                {/* underline */}
                <span
                  className="absolute bottom-0 left-0 h-[2px] rounded-full bg-flowpay-400 transition-all duration-300"
                  style={{ width: isActive ? '100%' : '0%' }}
                  aria-hidden="true"
                />
              </Link>
            )
          })}
        </div>

        {/* Right: wallet */}
        <div className="hidden md:flex items-center gap-3">
          {walletAddress ? (
            <>
              {networkName && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs text-surface-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
                  {networkName}
                </div>
              )}
              {balance && (
                <div className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 font-mono text-xs text-flowpay-300">
                  {parseFloat(balance).toFixed(4)} DOT
                </div>
              )}
              <div className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 font-mono text-xs text-surface-300">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </div>
            </>
          ) : (
            <button
              onClick={onConnect}
              className="px-5 py-2 bg-flowpay-500 hover:bg-flowpay-600 text-white text-sm font-semibold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-flowpay-500/50"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-surface-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-flowpay-500/50 rounded"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {menuOpen
              ? <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round"/>
              : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
            }
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-surface-950 border-b border-surface-700 px-4 py-5 flex flex-col gap-3">
          {tabs.map(({ id, path, icon: Icon, label }, i) => (
            <Link
              key={id}
              to={path}
              className={`flex items-center gap-2 text-sm transition-colors duration-200 ${activeTab === id ? 'text-white' : 'text-surface-400 hover:text-white'}`}
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => setMenuOpen(false)}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
          {!walletAddress && (
            <button onClick={() => { onConnect(); setMenuOpen(false) }} className="mt-2 px-5 py-3 bg-flowpay-500 hover:bg-flowpay-600 text-white font-semibold rounded-lg text-sm transition-all duration-300">
              Connect Wallet
            </button>
          )}
        </div>
      )}
    </header>
  );
}
