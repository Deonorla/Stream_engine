function WalletIcon({ wallet }) {
  if (wallet.icon) {
    return (
      <img
        src={wallet.icon}
        alt={`${wallet.name} icon`}
        className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white/80">
      {wallet.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function WalletPickerModal({
  isOpen,
  wallets,
  isConnecting,
  activeWalletId,
  onClose,
  onSelect,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-surface-900/95 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Wallets</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Choose a wallet</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Supported injected wallets appear here automatically. Use Talisman, MetaMask, or Rabby.
            </p>
          </div>

          <button
            type="button"
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/50 transition-colors hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="grid gap-3">
          {wallets.map((wallet) => {
            const isActive = activeWalletId === wallet.id;
            return (
              <button
                key={wallet.id}
                type="button"
                className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all ${
                  isActive
                    ? 'border-flowpay-500/40 bg-flowpay-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                } ${!wallet.isAvailable ? 'cursor-not-allowed opacity-60' : ''}`}
                onClick={() => wallet.isAvailable && onSelect(wallet)}
                disabled={isConnecting || !wallet.isAvailable}
              >
                <WalletIcon wallet={wallet} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-white">{wallet.name}</span>
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-mono text-cyan-300">
                      Injected
                    </span>
                    {isActive && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-mono text-emerald-300">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-white/50">{wallet.description}</p>
                </div>

                <div className="text-sm text-white/30">
                  {isConnecting ? 'Connecting…' : 'Open'}
                </div>
              </button>
            );
          })}
        </div>

        {!wallets.length && (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
            No compatible wallets were detected in this browser.
          </div>
        )}
      </div>
    </div>
  );
}
