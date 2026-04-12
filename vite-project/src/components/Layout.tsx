import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import WalletPickerModal from './WalletPickerModal';
import { useWallet } from '../context/WalletContext';

function getTitle(pathname) {
  if (pathname.startsWith('/app/streams'))     return 'Payment Sessions';
  if (pathname.startsWith('/app/rwa'))         return 'RWA Studio';
  if (pathname.startsWith('/app/property-mint')) return 'List a Property';
  if (pathname.startsWith('/app/property/'))    return 'Property Detail';
  if (pathname.startsWith('/app/properties'))   return 'Browse Properties';
  if (pathname.startsWith('/app/agent'))       return 'Agent Console';
  if (pathname.startsWith('/app/verify'))      return 'Asset Verification';
  if (pathname.startsWith('/app/marketplace')) return 'Continuum Marketplace';
  if (pathname.startsWith('/app/docs'))        return 'Documentation';
  return 'Continuum Hub';
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    isWalletPickerOpen, closeWalletPicker,
    availableWallets, isConnectingWallet,
    activeWallet, connectWallet, disconnectWallet,
  } = useWallet();

  const isLanding = pathname === '/';
  if (isLanding) return <>{children}</>;

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="lg:pl-64 min-h-screen flex flex-col">
        <TopBar title={getTitle(pathname)} onMenuClick={() => setSidebarOpen(true)} />
        <div className="flex-1 overflow-auto">{children}</div>
      </main>

      <WalletPickerModal
        isOpen={isWalletPickerOpen}
        wallets={availableWallets}
        isConnecting={isConnectingWallet}
        activeWalletId={activeWallet?.id}
        onClose={closeWalletPicker}
        onSelect={(wallet) => connectWallet(wallet.id)}
        onDisconnect={activeWallet ? () => { disconnectWallet(); closeWalletPicker(); } : null}
      />
    </div>
  );
}
