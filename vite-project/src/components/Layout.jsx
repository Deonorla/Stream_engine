import { useWallet } from '../context/WalletContext';
import Header from './Header';
import WalletPickerModal from './WalletPickerModal';
import { MobileBottomNav, ErrorBoundary } from './ui';
import { LayoutDashboard, ArrowRightLeft, Bot, BookOpen, Building2 } from 'lucide-react';

const tabs = [
  { id: 'dashboard', path: '/app',         icon: LayoutDashboard, label: 'Dashboard'     },
  { id: 'streams',   path: '/app/streams',  icon: ArrowRightLeft,  label: 'Streams'       },
  { id: 'rwa',       path: '/app/rwa',      icon: Building2,       label: 'RWA Studio'    },
  { id: 'agent',     path: '/app/agent',    icon: Bot,             label: 'Agent Console' },
  { id: 'docs',      path: '/app/docs',     icon: BookOpen,        label: 'Docs'          },
];

export default function Layout({ children }) {
  const {
    walletAddress,
    walletDisplayAddress,
    chainId,
    getNetworkName,
    connectWallet,
    openWalletPicker,
    closeWalletPicker,
    isWalletPickerOpen,
    availableWallets,
    activeWallet,
    paymentBalance,
    status,
    isProcessing,
    isConnectingWallet,
  } = useWallet();

  return (
    <div className="min-h-screen w-full">
      <div className="absolute inset-0 bg-grid bg-[size:24px_24px] opacity-20 pointer-events-none" />

      <Header
        walletAddress={walletDisplayAddress}
        chainId={chainId}
        networkName={getNetworkName(chainId)}
        onConnect={openWalletPicker}
        onManageWallets={openWalletPicker}
        walletLabel={activeWallet?.name || ''}
        balance={paymentBalance}
        tabs={tabs}
      />

      <main className="mx-auto w-full max-w-7xl px-4 pb-24 md:pb-16">
        <div className="mt-6 md:mt-8">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        walletAddress={walletDisplayAddress}
        tabs={tabs}
      />

      {/* Status Bar */}
      <div className="pointer-events-none fixed bottom-20 md:bottom-6 left-1/2 z-40 w-[92%] max-w-3xl -translate-x-1/2">
        <div className="pointer-events-auto card-glass flex items-center gap-3 px-4 py-3">
          <div className={`h-2 w-2 rounded-full ${(isProcessing || isConnectingWallet) ? 'bg-cyan-400 animate-pulse' : 'bg-emerald-400'}`} />
          <div className="font-mono text-sm sm:text-base text-white/90 truncate flex items-center gap-2">
            {(isProcessing || isConnectingWallet) && (
              <svg className="h-4 w-4 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
            )}
            <span className="truncate">{status}</span>
          </div>
        </div>
      </div>

      <WalletPickerModal
        isOpen={isWalletPickerOpen}
        wallets={availableWallets}
        isConnecting={isConnectingWallet}
        activeWalletId={activeWallet?.id || ''}
        onClose={closeWalletPicker}
        onSelect={connectWallet}
      />
    </div>
  );
}
