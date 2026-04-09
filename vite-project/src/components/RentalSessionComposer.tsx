import { useEffect, useMemo, useState } from 'react';
import { Ban, Clock, RefreshCcw, WalletCards } from 'lucide-react';
import { StrKey } from '@stellar/stellar-sdk';
import { supportedPaymentAssets } from '../contactInfo.js';
import { useWallet } from '../context/WalletContext';
import { useAppMode } from '../context/AppModeContext';
import { buildRentalStreamMetadata } from '../pages/rwa/rwaData.js';
import Select from './ui/Select';

const DURATION_OPTIONS = [
  { label: '1 Hour', seconds: 3600 },
  { label: '24 Hours', seconds: 86400 },
  { label: '7 Days', seconds: 604800 },
  { label: '30 Days', seconds: 2592000 },
];

function formatBudget(value, symbol) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return `0.0000 ${symbol}`;
  }
  return `${numeric.toFixed(4)} ${symbol}`;
}

function formatSessionAmount(stream, rawValue) {
  const symbol = stream?.paymentTokenSymbol || stream?.assetCode || 'USDC';
  const decimals = supportedPaymentAssets.find((asset) => asset.symbol === symbol)?.decimals || 7;
  const numeric = Number(BigInt(String(rawValue || 0))) / 10 ** decimals;
  return `${numeric.toFixed(4)} ${symbol}`;
}

function resolveRentalReadiness(asset) {
  if (asset?.rentalReadiness) {
    return asset.rentalReadiness;
  }

  const ownerAddress = asset?.currentOwner || asset?.ownerAddress || asset?.assetAddress || '';
  const ready = StrKey.isValidEd25519PublicKey(String(ownerAddress || '').trim());
  return {
    ready,
    label: ready ? 'Stellar Rental Ready' : 'Needs Owner Sync',
    reason: ready
      ? 'This asset is ready for live Stellar rental sessions.'
      : 'This asset still needs a Stellar owner account before rentals can start.',
  };
}

export default function RentalSessionComposer({ asset, onStarted }) {
  const { mode } = useAppMode();
  const isAgentMode = mode === 'agent';
  const {
    cancel,
    createStream,
    isProcessing,
    outgoingStreams,
    paymentBalance,
    paymentTokenSymbol,
    refreshStreams,
    toast,
    walletAddress,
    xlmBalance,
  } = useWallet();
  const [durationSeconds, setDurationSeconds] = useState(DURATION_OPTIONS[0].seconds);
  const [assetSymbol, setAssetSymbol] = useState(
    supportedPaymentAssets[0]?.symbol || 'USDC',
  );

  useEffect(() => {
    setDurationSeconds(DURATION_OPTIONS[0].seconds);
    setAssetSymbol(supportedPaymentAssets[0]?.symbol || 'USDC');
  }, [asset?.tokenId]);

  const selectedAsset = useMemo(
    () => supportedPaymentAssets.find((item) => item.symbol === assetSymbol) || supportedPaymentAssets[0],
    [assetSymbol],
  );
  const renterHours = durationSeconds / 3600;
  const budgetAmount = Number((Number(asset?.pricePerHour || 0) * renterHours).toFixed(6));
  const ownerAddress = asset?.currentOwner || asset?.ownerAddress || asset?.assetAddress || '';
  const rentalReadiness = resolveRentalReadiness(asset);
  const hasValidRecipient = Boolean(rentalReadiness.ready);
  const isOwner = Boolean(walletAddress && walletAddress === ownerAddress);
  const linkedSession = useMemo(() => {
    const currentTokenId = String(asset?.tokenId || asset?.id || '');
    return (outgoingStreams || []).find((stream) => {
      const metadata = (() => {
        try {
          return JSON.parse(String(stream?.metadata || '{}'));
        } catch {
          return {};
        }
      })();
      return String(metadata?.assetTokenId || '') === currentTokenId;
    }) || null;
  }, [asset?.id, asset?.tokenId, outgoingStreams]);
  const linkedSessionActive = Boolean(linkedSession?.isActive);

  if (isOwner && walletAddress) return null;

  const isActivelyRented = (Boolean(asset?.isRented) || Number(asset?.activeStreamId || 0) > 0) && !linkedSessionActive;
  if (isActivelyRented) return (
    <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
      <div>
        <p className="text-xs font-bold text-blue-700">Currently Rented</p>
        <p className="text-[10px] text-blue-600 mt-0.5">This asset is under an active rental session. It will be available once the session ends or is cancelled.</p>
      </div>
    </div>
  );

  const canStart = Boolean(
    walletAddress
    && hasValidRecipient
    && !isOwner
    && !linkedSessionActive
    && budgetAmount > 0,
  );

  const handleStart = async () => {
    if (!walletAddress) {
      toast.warning('Connect Freighter before starting a rental session.', {
        title: 'Wallet Required',
      });
      return;
    }
    if (isOwner) {
      toast.warning('Switch to a renter wallet to start a live session for this asset.', {
        title: 'Owner Wallet Connected',
      });
      return;
    }
    if (!hasValidRecipient) {
      toast.warning('This asset is not synced to a Stellar owner account yet, so rental sessions are still disabled.', {
        title: 'Recipient Not Ready',
      });
      return;
    }
    if (!selectedAsset) {
      toast.warning('No payment asset is configured for this rental session.', {
        title: 'Payment Asset Missing',
      });
      return;
    }

    const streamId = await createStream(
      ownerAddress,
      durationSeconds,
      budgetAmount.toFixed(6),
      buildRentalStreamMetadata(asset, renterHours),
      { asset: selectedAsset },
    );

    if (streamId !== null && streamId !== undefined) {
      await refreshStreams?.();
      onStarted?.(streamId);
    }
  };

  const handleEndSession = async () => {
    if (!linkedSession?.id) {
      return;
    }
    await cancel(linkedSession.id);
    await refreshStreams?.();
  };

  const availableBalance = selectedAsset?.symbol === 'XLM'
    ? `${parseFloat(xlmBalance || '0').toFixed(4)} XLM`
    : `${parseFloat(paymentBalance || '0').toFixed(4)} ${selectedAsset?.symbol || paymentTokenSymbol}`;

  return (
    <div className="space-y-3">
      {linkedSessionActive && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-emerald-700">Rental Active · Session #{linkedSession.id}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">
              {formatSessionAmount(linkedSession, linkedSession.refundableAmount)} refundable · {formatSessionAmount(linkedSession, linkedSession.consumedAmount ?? Math.max(0, Number(linkedSession.totalAmount || 0) - Number(linkedSession.refundableAmount || 0)))} consumed
            </p>
          </div>
          <button type="button" onClick={() => void refreshStreams?.()} className="text-emerald-500 hover:text-emerald-700">
            <RefreshCcw size={13} />
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
        <label className="space-y-1">
          <span className="block text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">
            Settlement Asset
          </span>
          <Select
            options={supportedPaymentAssets.map(a => ({ value: a.symbol, label: `${a.symbol} · ${a.name}` }))}
            value={assetSymbol}
            onChange={v => setAssetSymbol(String(v))}
            disabled={isProcessing || isAgentMode}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">
            Rental Duration
          </span>
          <Select
            options={DURATION_OPTIONS.map(o => ({ value: o.seconds, label: o.label }))}
            value={durationSeconds}
            onChange={v => setDurationSeconds(Number(v))}
            disabled={isProcessing || isAgentMode}
          />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Rental Budget</p>
            <p className="mt-1 text-lg font-headline font-bold text-slate-900">
              {formatBudget(budgetAmount, selectedAsset?.symbol || paymentTokenSymbol)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Available</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{availableBalance}</p>
          </div>
        </div>
      </div>

      {linkedSession && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-label font-bold uppercase tracking-widest text-blue-500">Active Rental Session</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Session #{linkedSession.id}</p>
              <p className="mt-1 text-xs text-slate-600">
                {linkedSessionActive
                  ? `This renter wallet already has a live ${linkedSession.sessionStatusLabel || 'session'} for this asset.`
                  : `Latest ${linkedSession.sessionStatusLabel || 'session'} for this asset.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshStreams?.()}
              className="rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-blue-600"
            >
              <RefreshCcw size={12} className="inline-block mr-1" />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/70 bg-white px-3 py-3">
              <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Refund If Ended Now</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatSessionAmount(linkedSession, linkedSession.refundableAmount)}
              </p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white px-3 py-3">
              <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Consumed So Far</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatSessionAmount(
                  linkedSession,
                  linkedSession.consumedAmount
                  ?? Math.max(
                    0,
                    Number(linkedSession.totalAmount || 0) - Number(linkedSession.refundableAmount || 0),
                  ),
                )}
              </p>
            </div>
          </div>
          {linkedSessionActive && (
            <button
              type="button"
              onClick={() => void handleEndSession()}
              disabled={isProcessing}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white py-3 text-xs font-bold uppercase tracking-widest text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Ban size={14} />
              {isProcessing ? 'Ending Session...' : 'End Session Early'}
            </button>
          )}
        </div>
      )}

      {!walletAddress && (
        <p className="text-xs text-amber-600">Connect Freighter to open a live Stellar rental session.</p>
      )}
      {isAgentMode && (
        <p className="text-xs text-amber-600">Switch to Owner Mode to rent assets. Rentals are for humans only — the agent trades, not rents.</p>
      )}
      {!hasValidRecipient && (
        <p className="text-xs text-amber-600">{rentalReadiness.reason || 'This asset is not ready for live Stellar rental sessions yet.'}</p>
      )}
      {linkedSessionActive && (
        <p className="text-xs text-blue-600">End the current session first if you want to reopen this asset with a different duration or payment asset.</p>
      )}

      <button
        type="button"
        onClick={() => void handleStart()}
        disabled={!canStart || isProcessing || isAgentMode}
        className="flex w-full items-center justify-center gap-2 rounded-2xl ethereal-gradient py-4 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Clock size={16} />
        {isProcessing ? 'Starting Session...' : 'Start Rental Session'}
        <WalletCards size={16} />
      </button>
    </div>
  );
}
