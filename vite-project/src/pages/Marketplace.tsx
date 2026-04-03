import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart2,
  Bookmark,
  BookmarkCheck,
  Clock3,
  Gavel,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AssetCard, AssetDetailPortal } from '../components/AssetCard';
import RentalSessionComposer from '../components/RentalSessionComposer';
import Select from '../components/ui/Select';
import { useWallet } from '../context/WalletContext';
import { useAgentWallet } from '../hooks/useAgentWallet';
import {
  addAgentWatchAsset,
  createMarketAuction,
  deleteAgentScreen,
  fetchAgentPerformance,
  fetchAuction,
  fetchAgentState,
  fetchAgentScreens,
  fetchAgentWatchlist,
  fetchMarketAsset,
  fetchMarketAnalytics,
  fetchMarketCatalog,
  fetchMarketPositions,
  placeAuctionBid,
  removeAgentWatchAsset,
  saveAgentScreen,
  settleAuction,
} from '../services/rwaApi.js';
import { mapApiAssetToUiAsset, TYPE_META } from './rwa/rwaData';

const SORT_OPTIONS = [
  { value: 'score_desc', label: 'Best Match' },
  { value: 'auction_desc', label: 'Live Auctions' },
  { value: 'yield_desc', label: 'Highest Yield' },
  { value: 'price_asc', label: 'Lowest Rate' },
  { value: 'newest', label: 'Newest' },
];

const TYPE_FILTERS = ['all', 'real_estate', 'vehicle', 'commodity'];

function buildUiAsset(asset: any) {
  return {
    ...mapApiAssetToUiAsset(asset),
    market: asset.market || {},
    issuer: asset.issuer,
    tokenId: asset.tokenId,
    currentOwner: asset.currentOwner,
    publicMetadata: asset.publicMetadata,
    verificationStatusLabel: asset.verificationStatusLabel,
    screening: asset.screening || null,
  };
}

function sortAssets(assets: any[], sort: string) {
  const copy = [...assets];
  if (sort === 'score_desc') {
    return copy.sort((left, right) => Number(right.screening?.score || 0) - Number(left.screening?.score || 0));
  }
  if (sort === 'auction_desc') {
    return copy.sort((left, right) => Number(Boolean(right.market?.hasActiveAuction)) - Number(Boolean(left.market?.hasActiveAuction)));
  }
  if (sort === 'yield_desc') return copy.sort((left, right) => (right.yieldBalance || 0) - (left.yieldBalance || 0));
  if (sort === 'price_asc') return copy.sort((left, right) => (left.pricePerHour || 0) - (right.pricePerHour || 0));
  return copy.reverse();
}

function formatCountdown(endTime?: number) {
  if (!endTime) return 'Not scheduled';
  const seconds = Math.max(0, Number(endTime) - Math.floor(Date.now() / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0 && minutes <= 0) return 'Ready to settle';
  if (hours <= 0) return `${minutes}m left`;
  return `${hours}h ${minutes}m left`;
}

function formatRiskLabel(risk?: number) {
  const numericRisk = Number(risk || 0);
  if (numericRisk >= 70) return 'High';
  if (numericRisk >= 45) return 'Moderate';
  return 'Lower';
}

function formatShortAddress(value?: string | null) {
  if (!value) return 'Unknown';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatBidPlacedAt(value?: number) {
  if (!value) return 'Just now';
  return new Date(Number(value) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatUsdcMetric(value?: number) {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(2)} USDC`;
}

function formatPerformanceAmount(value?: string | number, direction = 'neutral') {
  const numeric = Number(value || 0) / 1e7;
  const prefix = direction === 'inflow' ? '+' : direction === 'outflow' ? '-' : '';
  return `${prefix}${formatUsdcMetric(Math.abs(numeric))}`;
}

function MarketActions({
  asset,
  agentPublicKey,
  mandate,
  liquidity,
  reservations,
  isWatched,
  watchPending,
  onToggleWatch,
  onRefresh,
}: {
  asset: any;
  agentPublicKey: string | null | undefined;
  mandate: any;
  liquidity: any;
  reservations: any[];
  isWatched: boolean;
  watchPending: boolean;
  onToggleWatch: (asset: any) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [details, setDetails] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsStatus, setAnalyticsStatus] = useState<'idle' | 'loading' | '402' | 'ok' | 'err'>('idle');
  const [auctionStatus, setAuctionStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [bidStatus, setBidStatus] = useState<'idle' | 'loading' | 'ok' | '402' | 'err'>('idle');
  const [bidError, setBidError] = useState('');
  const [reservePrice, setReservePrice] = useState('250');
  const [durationHours, setDurationHours] = useState('24');
  const [bidAmount, setBidAmount] = useState('');
  const [sessionId, setSessionId] = useState('');
  const isOwner = Boolean(agentPublicKey && asset.currentOwner && String(agentPublicKey).toUpperCase() === String(asset.currentOwner).toUpperCase());

  const loadDetails = useCallback(async () => {
    try {
      const response = await fetchMarketAsset(asset.tokenId);
      setDetails(response);
    } catch {
      setDetails(null);
    }
  }, [asset.tokenId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const activeAuction = details?.auctions?.find((entry: any) => entry.status === 'active') || asset.market?.activeAuction || null;
  const currentReservation = activeAuction
    ? (reservations || []).find((reservation: any) => Number(reservation.auctionId) === Number(activeAuction.auctionId))
    : null;
  const currentReservedUsdc = Number(currentReservation?.reservedAmount || 0) / 1e7;
  const sameIssuerReservedUsdc = (reservations || [])
    .filter((reservation: any) => String(reservation.issuer || '') === String(asset.issuer || ''))
    .reduce((sum: number, reservation: any) => {
      if (Number(reservation.auctionId) === Number(activeAuction?.auctionId || 0)) return sum;
      return sum + (Number(reservation.reservedAmount || 0) / 1e7);
    }, 0);
  const capitalBaseUsdc = Number(mandate?.capitalBase || 0);
  const minimumNextBidUsdc = Number(
    activeAuction?.minimumNextBidDisplay
    || activeAuction?.marketDepth?.minimumNextBid
    || activeAuction?.reservePriceDisplay
    || 0,
  );
  const liquidityHeadroomUsdc = Number(liquidity?.immediateBidHeadroomDisplay || 0) + currentReservedUsdc;
  const approvalLimitUsdc = Number(mandate?.approvalThreshold || 0);
  const assetCapLimitUsdc = capitalBaseUsdc > 0
    ? (capitalBaseUsdc * Number(mandate?.assetCapPct || 25)) / 100
    : 0;
  const issuerCapRemainingUsdc = capitalBaseUsdc > 0
    ? Math.max(0, ((capitalBaseUsdc * Number(mandate?.issuerCapPct || 40)) / 100) - sameIssuerReservedUsdc)
    : 0;
  const bidGuardrailCandidates = [
    { label: 'Liquidity runway', value: liquidityHeadroomUsdc },
    { label: 'Approval threshold', value: approvalLimitUsdc },
    { label: 'Asset cap', value: assetCapLimitUsdc },
    { label: 'Issuer cap', value: issuerCapRemainingUsdc },
  ].filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
  const limitingGuardrail = bidGuardrailCandidates.length
    ? bidGuardrailCandidates.reduce((lowest, entry) => (entry.value < lowest.value ? entry : lowest))
    : null;
  const maxGuidedBidUsdc = limitingGuardrail?.value || 0;
  const bidGuardrailNotes = [
    liquidity?.status === 'below_floor' ? 'Managed wallet is already below the liquidity floor.' : '',
    liquidity?.status === 'near_floor' ? 'Wallet is close to the reserve target, so auction headroom is tight.' : '',
    currentReservedUsdc > 0 ? `This auction already has ${currentReservedUsdc.toFixed(2)} USDC reserved by the agent.` : '',
    minimumNextBidUsdc > 0 && maxGuidedBidUsdc > 0 && maxGuidedBidUsdc < minimumNextBidUsdc
      ? 'Current headroom is below the minimum next bid, so a fresh bid would fail.'
      : '',
  ].filter(Boolean);
  const canBidNow = Boolean(
    !isOwner
    && agentPublicKey
    && activeAuction
    && maxGuidedBidUsdc >= minimumNextBidUsdc
    && liquidity?.status !== 'below_floor',
  );

  const handleCreateAuction = async () => {
    setAuctionStatus('loading');
    try {
      await createMarketAuction(asset.tokenId, {
        reservePrice,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + (Number(durationHours || 24) * 3600),
      });
      setAuctionStatus('ok');
      await loadDetails();
      await onRefresh();
    } catch {
      setAuctionStatus('err');
    }
  };

  const handleFetchAnalytics = async () => {
    setAnalyticsStatus('loading');
    try {
      const response = await fetchMarketAnalytics(asset.tokenId, sessionId || undefined);
      setAnalytics(response.analytics);
      setAnalyticsStatus('ok');
    } catch (error: any) {
      if (String(error?.message || '').includes('Payment') || String(error?.message || '').includes('402')) {
        setAnalyticsStatus('402');
      } else {
        setAnalyticsStatus('err');
      }
    }
  };

  const handlePlaceBid = async () => {
    if (!activeAuction || !bidAmount) return;
    setBidStatus('loading');
    setBidError('');
    try {
      await placeAuctionBid(activeAuction.auctionId, {
        amount: bidAmount,
        sessionId: sessionId || undefined,
      });
      setBidStatus('ok');
      setBidAmount('');
      await loadDetails();
      await onRefresh();
    } catch (error: any) {
      const message = String(error?.message || 'Bid failed.');
      setBidError(message);
      if (message.includes('Payment') || message.includes('402')) {
        setBidStatus('402');
      } else {
        setBidStatus('err');
      }
    }
  };

  const handleSettle = async () => {
    if (!activeAuction) return;
    setAuctionStatus('loading');
    try {
      await settleAuction(activeAuction.auctionId);
      setAuctionStatus('ok');
      await loadDetails();
      await onRefresh();
    } catch {
      setAuctionStatus('err');
    }
  };

  return (
    <div className="space-y-5 pt-4 border-t border-slate-100">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
        Twin transfers in Continuum represent platform and economic ownership inside the marketplace. They do not automatically transfer legal title in the physical world.
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Shortlist Monitoring</p>
          <p className="mt-1 text-sm text-slate-600">
            Save this twin to the managed watchlist so the agent can keep it visible across refreshes.
          </p>
        </div>
        <button
          onClick={() => void onToggleWatch(asset)}
          disabled={!agentPublicKey || watchPending}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
            isWatched
              ? 'bg-slate-900 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          } disabled:opacity-50`}
        >
          {isWatched ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          {watchPending ? 'Saving...' : isWatched ? 'Watching' : 'Watch Twin'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Premium Analysis</p>
          <button
            onClick={() => void handleFetchAnalytics()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <BarChart2 size={12} />
            Fetch · 0.10 USDC
          </button>
        </div>
        <input
          value={sessionId}
          onChange={(event) => setSessionId(event.target.value)}
          placeholder="Optional Continuum payment session ID"
          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        {analyticsStatus === '402' && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-700">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            Open a Continuum payment session first, then retry the paid analysis call.
          </div>
        )}
        {analyticsStatus === 'err' && <p className="text-xs text-red-500">Could not load premium analysis.</p>}
        {analytics && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Premium Verdict</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                      analytics.verdict === 'BUY'
                        ? 'bg-emerald-100 text-emerald-700'
                        : analytics.verdict === 'HOLD'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    }`}>
                      {analytics.verdict || 'HOLD'}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {Number(analytics.confidence || 0).toFixed(0)}% confidence
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-slate-100 px-3 py-2 text-right min-w-[8rem]">
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Yield View</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">{analytics.yieldAssessment || 'No yield note yet.'}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{analytics.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Claimable Yield', value: `${Number(analytics.claimableYield || 0).toFixed(4)} USDC` },
                { label: 'Projected Annual Yield', value: `${Number(analytics.projectedAnnualYield || 0).toFixed(4)} USDC` },
                { label: 'Peer Rank', value: analytics.marketContext?.peerRank ? `#${analytics.marketContext.peerRank} of ${analytics.marketContext.peerCount}` : 'Unranked' },
                { label: 'Market Risk', value: `${formatRiskLabel(analytics.marketContext?.avgRisk)} · ${Number(analytics.marketContext?.avgRisk || 0).toFixed(0)}/100` },
                { label: 'Auctions', value: String(analytics.auctionCount || 0) },
                { label: 'Last Winning Bid', value: analytics.lastWinningBid || 'None yet' },
              ].map((item) => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-bold text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-[10px] font-label uppercase tracking-widest text-emerald-600">What Looks Good</p>
                <div className="mt-2 space-y-2">
                  {(analytics.positives || []).length ? (analytics.positives || []).map((item: string) => (
                    <p key={item} className="text-sm text-emerald-900">• {item}</p>
                  )) : <p className="text-sm text-emerald-900">No major upside flags yet.</p>}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-[10px] font-label uppercase tracking-widest text-amber-700">What To Watch</p>
                <div className="mt-2 space-y-2">
                  {(analytics.risks || []).length ? (analytics.risks || []).map((item: string) => (
                    <p key={item} className="text-sm text-amber-900">• {item}</p>
                  )) : <p className="text-sm text-amber-900">No elevated risk flags from the current snapshot.</p>}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Market Context</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Verified Share', value: `${Number(analytics.marketContext?.verifiedSharePct || 0).toFixed(1)}%` },
                    { label: 'Rental Ready Share', value: `${Number(analytics.marketContext?.rentalReadySharePct || 0).toFixed(1)}%` },
                    { label: 'Average Yield', value: `${Number(analytics.marketContext?.avgYield || 0).toFixed(2)}%` },
                    { label: 'Issuer Peer Count', value: String(analytics.marketContext?.issuerPeerCount || 0) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{item.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Auction Context</p>
                {analytics.auctionContext?.activeAuction ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-slate-600">
                      Active auction #{analytics.auctionContext.activeAuction.auctionId} has a reserve of {analytics.auctionContext.activeAuction.reservePrice} USDC and {analytics.auctionContext.activeAuction.bidCount} live bid{Number(analytics.auctionContext.activeAuction.bidCount || 0) === 1 ? '' : 's'}.
                    </p>
                    <p className="text-xs text-slate-500">
                      Highest bid: {analytics.auctionContext.activeAuction.highestBid || 'None yet'} · Time remaining: {formatCountdown(Math.floor(Date.now() / 1000) + Number(analytics.auctionContext.activeAuction.timeRemainingSeconds || 0))}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-slate-600">No active auction is running right now for this twin.</p>
                    <p className="text-xs text-slate-500">
                      Settled auctions: {String(analytics.auctionContext?.settledAuctionCount || 0)} · Latest winning bid: {analytics.auctionContext?.latestWinningBid || 'None yet'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Recent Activity</p>
              <div className="mt-3 space-y-2">
                {(analytics.recentActivity || []).length ? (analytics.recentActivity || []).map((entry: any) => (
                  <div key={`${entry.eventName}-${entry.txHash || entry.blockNumber}`} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">{entry.eventName}</p>
                    <p className="text-xs text-slate-500">
                      Block {entry.blockNumber || 'n/a'} · {entry.txHash || 'No tx hash'}
                    </p>
                  </div>
                )) : <p className="text-sm text-slate-500">No indexed market activity yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Timed Auction</p>
          {activeAuction && (
            <span className="rounded-full bg-purple-50 text-purple-600 text-[10px] font-bold uppercase tracking-widest px-3 py-1">
              {formatCountdown(activeAuction.endTime)}
            </span>
          )}
        </div>

        {activeAuction ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Reserve', value: `${activeAuction.reservePriceDisplay} USDC` },
                { label: 'Highest Bid', value: activeAuction.highestBidDisplay ? `${activeAuction.highestBidDisplay} USDC` : 'No bids yet' },
                { label: 'Minimum Next Bid', value: `${activeAuction.minimumNextBidDisplay || activeAuction.marketDepth?.minimumNextBid || activeAuction.reservePriceDisplay} USDC` },
                { label: 'Unique Bidders', value: String(activeAuction.uniqueBidderCount || activeAuction.marketDepth?.uniqueBidderCount || 0) },
              ].map((item) => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-bold text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-label uppercase tracking-widest text-blue-700">Bid Guardrails</p>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    canBidNow ? 'text-secondary' : 'text-amber-700'
                  }`}>
                    {canBidNow ? 'Bid eligible' : 'Needs room'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Max Guided Bid', value: formatUsdcMetric(maxGuidedBidUsdc) },
                    { label: 'Next Valid Bid', value: formatUsdcMetric(minimumNextBidUsdc) },
                    { label: 'Current Reserve', value: formatUsdcMetric(currentReservedUsdc) },
                    { label: 'Limiting Factor', value: limitingGuardrail?.label || 'No live guardrail yet' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-blue-100 bg-white px-3 py-3">
                      <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{item.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {bidGuardrailNotes.length ? bidGuardrailNotes.map((note) => (
                    <p key={note} className="text-xs text-slate-600">• {note}</p>
                  )) : (
                    <p className="text-xs text-slate-600">
                      The guided bid ceiling already accounts for liquidity runway, approval threshold, and current issuer/asset cap pressure.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Bid Ladder</p>
                <div className="mt-3 space-y-2">
                  {(activeAuction.bidLadder || []).length ? (
                    (activeAuction.bidLadder || []).map((bid: any, index: number) => (
                      <div key={bid.bidId} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">#{index + 1} · {bid.amountDisplay} USDC</p>
                            <p className="text-xs text-slate-500 mt-1">{formatShortAddress(bid.bidder)} · {formatBidPlacedAt(bid.placedAt)}</p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${bid.isLeading ? 'text-secondary' : 'text-slate-400'}`}>
                            {bid.isLeading ? 'leader' : bid.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No live bids yet. The first valid bid will set the auction pace.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Recent Bid Flow</p>
                <div className="mt-3 space-y-2">
                  {(activeAuction.recentBids || []).length ? (
                    (activeAuction.recentBids || []).map((bid: any) => (
                      <div key={`recent-${bid.bidId}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{bid.amountDisplay} USDC</p>
                            <p className="text-xs text-slate-500 mt-1">{formatShortAddress(bid.bidder)} · {formatBidPlacedAt(bid.placedAt)}</p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${bid.isLeading ? 'text-purple-600' : 'text-slate-400'}`}>
                            {bid.isLeading ? 'top bid' : bid.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Bid history will appear here as the auction book fills in.</p>
                  )}
                </div>
                <div className="mt-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs text-slate-500">
                  Spread to reserve: {activeAuction.marketDepth?.spreadToReserve || '0.0000000'} USDC · Active bids: {String(activeAuction.marketDepth?.activeBidCount || 0)}
                </div>
              </div>
            </div>

            {!isOwner && agentPublicKey && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bidAmount}
                    onChange={(event) => setBidAmount(event.target.value)}
                    placeholder="Bid amount (USDC)"
                    className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    onClick={() => void handlePlaceBid()}
                    disabled={bidStatus === 'loading' || !bidAmount || !canBidNow}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                    <Gavel size={13} />
                    {bidStatus === 'loading' ? 'Placing...' : 'Bid'}
                  </button>
                </div>
                {bidStatus === '402' && <p className="text-xs text-amber-700">Bid placement is paid. Reuse or enter a valid Continuum payment session ID first.</p>}
                {bidStatus === 'err' && <p className="text-xs text-red-500">{bidError || 'Bid failed. Check your mandate, liquidity floor, and payment session.'}</p>}
                {bidStatus === 'ok' && <p className="text-xs text-secondary">Bid placed and principal reserved successfully.</p>}
                {!canBidNow && (
                  <p className="text-xs text-amber-700">
                    This auction currently sits above the guided bid envelope. Free up liquidity, lower reserve pressure, or wait for treasury recall before retrying.
                  </p>
                )}
              </div>
            )}

            {formatCountdown(activeAuction.endTime) === 'Ready to settle' && agentPublicKey && (
              <button
                onClick={() => void handleSettle()}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
              >
                {auctionStatus === 'loading' ? 'Settling...' : 'Settle Auction'}
              </button>
            )}
          </div>
        ) : isOwner ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={reservePrice}
                onChange={(event) => setReservePrice(event.target.value)}
                placeholder="Reserve price"
                className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={durationHours}
                onChange={(event) => setDurationHours(event.target.value)}
                placeholder="Duration (hours)"
                className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <button
              onClick={() => void handleCreateAuction()}
              className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold"
            >
              {auctionStatus === 'loading' ? 'Opening Auction...' : 'List In Timed Auction'}
            </button>
            {auctionStatus === 'err' && <p className="text-xs text-red-500">Could not create the auction. Make sure the managed agent wallet currently owns this twin.</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No active auction yet. Once the seller escrows this twin, the agent marketplace can bid on it here.</p>
        )}
      </div>
    </div>
  );
}

export default function Marketplace() {
  const { walletAddress } = useWallet();
  const { agentPublicKey, activate } = useAgentWallet(walletAddress);
  const [assets, setAssets] = useState<any[]>([]);
  const [agentState, setAgentState] = useState<any>(null);
  const [agentPerformance, setAgentPerformance] = useState<any>(null);
  const [marketPositions, setMarketPositions] = useState<any>(null);
  const [marketSummary, setMarketSummary] = useState<any>(null);
  const [savedScreens, setSavedScreens] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [goal, setGoal] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [minYield, setMinYield] = useState('');
  const [maxRisk, setMaxRisk] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [rentalReadyOnly, setRentalReadyOnly] = useState(false);
  const [liveAuctionsOnly, setLiveAuctionsOnly] = useState(false);
  const [sort, setSort] = useState('auction_desc');
  const [selected, setSelected] = useState<any>(null);
  const [saveScreenStatus, setSaveScreenStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [saveScreenError, setSaveScreenError] = useState('');
  const [watchActionError, setWatchActionError] = useState('');
  const [watchPendingTokenId, setWatchPendingTokenId] = useState<number | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredGoal = useDeferredValue(goal);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = {
        search: deferredSearch || undefined,
        goal: deferredGoal || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        minYield: minYield || undefined,
        maxRisk: maxRisk || undefined,
        verifiedOnly: verifiedOnly ? 'true' : undefined,
        rentalReady: rentalReadyOnly ? 'true' : undefined,
        hasAuction: liveAuctionsOnly ? 'true' : undefined,
      };
      const [response, nextScreens, nextWatchlist, nextAgentState, nextMarketPositions, nextAgentPerformance] = await Promise.all([
        fetchMarketCatalog(query),
        agentPublicKey ? fetchAgentScreens(agentPublicKey) : Promise.resolve([]),
        agentPublicKey ? fetchAgentWatchlist(agentPublicKey) : Promise.resolve([]),
        agentPublicKey ? fetchAgentState(agentPublicKey) : Promise.resolve(null),
        agentPublicKey ? fetchMarketPositions() : Promise.resolve(null),
        agentPublicKey ? fetchAgentPerformance(agentPublicKey) : Promise.resolve(null),
      ]);
      setAssets((response.assets || []).map(buildUiAsset));
      setAgentState(nextAgentState);
      setAgentPerformance(nextAgentPerformance);
      setMarketPositions(nextMarketPositions);
      setMarketSummary(response.summary || null);
      setSavedScreens(nextScreens || []);
      setWatchlist(nextWatchlist || []);
    } catch {
      setAssets([]);
      setAgentState(null);
      setAgentPerformance(null);
      setMarketPositions(null);
      setMarketSummary(null);
      if (!agentPublicKey) {
        setSavedScreens([]);
        setWatchlist([]);
      }
    } finally {
      setLoading(false);
    }
  }, [agentPublicKey, deferredGoal, deferredSearch, liveAuctionsOnly, maxRisk, minYield, rentalReadyOnly, typeFilter, verifiedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const runtimeSummary = agentState?.runtime?.lastSummary || {};
  const performance = agentPerformance || agentState?.performance || {};
  const performanceAttribution = performance.attribution || {};
  const performanceEvents = Array.isArray(performance.recentEvents) ? [...performance.recentEvents].reverse() : [];
  const recentDecisionLog = Array.isArray(agentState?.decisionLog) ? [...agentState.decisionLog].reverse() : [];
  const screenHighlights = Array.isArray(runtimeSummary.screenHighlights) ? runtimeSummary.screenHighlights : [];
  const watchlistHighlights = Array.isArray(runtimeSummary.watchlistHighlights) ? runtimeSummary.watchlistHighlights : [];
  const bidFocus = runtimeSummary.bidFocus || null;
  const watchedTokenIds = useMemo(
    () => new Set((watchlist || []).map((entry: any) => Number(entry.tokenId))),
    [watchlist],
  );
  const screenHighlightTokenIds = useMemo(
    () => new Set(
      screenHighlights
        .map((entry: any) => Number(entry.topTokenId))
        .filter((tokenId: number) => Number.isFinite(tokenId) && tokenId > 0),
    ),
    [screenHighlights],
  );
  const watchSignalByTokenId = useMemo(
    () => new Map((watchlistHighlights || []).map((entry: any) => [Number(entry.tokenId), entry])),
    [watchlistHighlights],
  );
  const annotatedAssets = useMemo(
    () => assets.map((asset) => {
      const tokenId = Number(asset.tokenId);
      return {
        ...asset,
        agentSignals: {
          watched: watchedTokenIds.has(tokenId),
          screenHit: screenHighlightTokenIds.has(tokenId),
          watchSignal: watchSignalByTokenId.get(tokenId) || null,
          bidFocus: Number(bidFocus?.assetId || 0) === tokenId,
        },
      };
    }),
    [assets, bidFocus?.assetId, screenHighlightTokenIds, watchedTokenIds, watchSignalByTokenId],
  );
  const filtered = useMemo(() => sortAssets(annotatedAssets, sort), [annotatedAssets, sort]);

  const liveAuctions = Number(marketSummary?.liveAuctions ?? assets.filter((asset) => asset.market?.hasActiveAuction).length);
  const totalYield = Number(marketSummary?.totalClaimableYieldDisplay ?? assets.reduce((sum, asset) => sum + Number(asset.yieldBalance || 0), 0));
  const claimableYieldDisplay = `${totalYield.toFixed(2)} USDC`;
  const activeFilterCount = Number(marketSummary?.activeFilterCount || 0);
  const browseState = marketSummary?.browse || {};
  const universeCount = Number(marketSummary?.universeProductiveTwins ?? assets.length);
  const discoveryStats = [
    { label: 'Productive Twins', value: String(marketSummary?.totalProductiveTwins ?? assets.length), color: 'text-primary' },
    { label: 'Live Auctions', value: String(liveAuctions), color: 'text-purple-600' },
    { label: 'Verified Share', value: `${Number(marketSummary?.verifiedSharePct || 0).toFixed(1)}%`, color: 'text-secondary' },
    { label: 'Avg Yield', value: `${Number(marketSummary?.avgYield || 0).toFixed(2)}%`, color: 'text-amber-600' },
  ];
  const marketPulse = [
    { label: 'Rental Ready', value: `${Number(marketSummary?.rentalReadySharePct || 0).toFixed(1)}%`, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { label: 'Average Risk', value: `${Number(marketSummary?.avgRisk || 0).toFixed(0)}/100`, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
    { label: 'Top Yield', value: `${Number(marketSummary?.topYield || 0).toFixed(2)}%`, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
    { label: 'Claimable Yield', value: claimableYieldDisplay, tone: 'bg-purple-50 text-purple-700 border-purple-100' },
  ];
  const typeBreakdown = marketSummary?.typeBreakdown || {
    real_estate: assets.filter((asset) => asset.type === 'real_estate').length,
    vehicle: assets.filter((asset) => asset.type === 'vehicle').length,
    commodity: assets.filter((asset) => asset.type === 'commodity').length,
  };
  const topOpportunities = marketSummary?.highlights?.topOpportunities || [];
  const auctionsClosingSoon = marketSummary?.highlights?.auctionsClosingSoon || [];
  const ownedMarketAssets = Array.isArray(marketPositions?.ownedAssets) ? marketPositions.ownedAssets : [];
  const managedSessions = Array.isArray(marketPositions?.sessions) ? marketPositions.sessions : [];
  const managedReservations = Array.isArray(marketPositions?.reservations) ? marketPositions.reservations : [];
  const marketReservationExposure = Array.isArray(marketPositions?.reservationExposure) ? marketPositions.reservationExposure : [];
  const marketTreasury = marketPositions?.treasury || null;
  const marketLiquidity = marketPositions?.liquidity || null;
  const marketReservationSummary = {
    leading: marketReservationExposure.filter((entry: any) => entry.isLeading).length,
    outbid: marketReservationExposure.filter((entry: any) => entry.status === 'outbid').length,
    ready: marketReservationExposure.filter((entry: any) => entry.readyToSettle && entry.isLeading).length,
  };
  const screeningPills = [
    { label: browseState.search ? `Search: ${browseState.search}` : '', active: Boolean(browseState.search) },
    { label: browseState.type ? `${TYPE_META[browseState.type as keyof typeof TYPE_META]?.label || browseState.type}` : '', active: Boolean(browseState.type) },
    { label: 'Verified Only', active: verifiedOnly },
    { label: 'Rental Ready', active: rentalReadyOnly },
    { label: 'Live Auctions', active: liveAuctionsOnly },
    { label: minYield ? `Min Yield ${minYield}%` : '', active: Boolean(minYield) },
    { label: maxRisk ? `Max Risk ${maxRisk}` : '', active: Boolean(maxRisk) },
    { label: browseState.goal ? `Goal: ${browseState.goal}` : '', active: Boolean(browseState.goal) },
  ].filter((item) => item.active);

  const clearScreen = useCallback(() => {
    setSearch('');
    setGoal('');
    setTypeFilter('all');
    setMinYield('');
    setMaxRisk('');
    setVerifiedOnly(false);
    setRentalReadyOnly(false);
    setLiveAuctionsOnly(false);
    setSort('auction_desc');
  }, []);

  const applySavedScreen = useCallback((screen: any) => {
    const filters = screen?.filters || {};
    setSearch(String(filters.search || ''));
    setGoal(String(filters.goal || ''));
    setTypeFilter(String(filters.type || 'all'));
    setMinYield(filters.minYield != null ? String(filters.minYield) : '');
    setMaxRisk(filters.maxRisk != null ? String(filters.maxRisk) : '');
    setVerifiedOnly(Boolean(filters.verifiedOnly));
    setRentalReadyOnly(Boolean(filters.rentalReady));
    setLiveAuctionsOnly(Boolean(filters.hasAuction));
    setSort('score_desc');
  }, []);

  const handleSaveScreen = useCallback(async () => {
    if (!agentPublicKey) {
      setSaveScreenError('Activate the managed agent first to save marketplace screens.');
      setSaveScreenStatus('err');
      return;
    }
    setSaveScreenStatus('saving');
    setSaveScreenError('');
    try {
      await saveAgentScreen(agentPublicKey, {
        filters: marketSummary?.browse || {
          search: deferredSearch || null,
          goal: deferredGoal || null,
          type: typeFilter !== 'all' ? typeFilter : null,
          minYield: minYield || null,
          maxRisk: maxRisk || null,
          verifiedOnly,
          rentalReady: rentalReadyOnly,
          hasAuction: liveAuctionsOnly,
        },
        summary: {
          totalProductiveTwins: marketSummary?.totalProductiveTwins ?? assets.length,
          activeFilterCount,
          topOpportunity: topOpportunities[0]?.name || '',
        },
      });
      setSaveScreenStatus('ok');
      await load();
    } catch (saveError: any) {
      setSaveScreenStatus('err');
      setSaveScreenError(saveError?.message || 'Could not save this market screen.');
    }
  }, [activeFilterCount, agentPublicKey, assets.length, deferredGoal, deferredSearch, liveAuctionsOnly, load, marketSummary, maxRisk, minYield, rentalReadyOnly, topOpportunities, typeFilter, verifiedOnly]);

  const handleDeleteScreen = useCallback(async (screenId: string) => {
    if (!agentPublicKey) return;
    await deleteAgentScreen(agentPublicKey, screenId);
    await load();
  }, [agentPublicKey, load]);

  const handleToggleWatch = useCallback(async (asset: any) => {
    if (!agentPublicKey) {
      setWatchActionError('Activate the managed agent first to build a marketplace watchlist.');
      return;
    }
    setWatchActionError('');
    setWatchPendingTokenId(Number(asset.tokenId));
    try {
      if (watchedTokenIds.has(Number(asset.tokenId))) {
        await removeAgentWatchAsset(agentPublicKey, asset.tokenId);
      } else {
        await addAgentWatchAsset(agentPublicKey, {
          tokenId: Number(asset.tokenId),
          name: asset.name,
          assetType: asset.type,
          verificationStatus: asset.verificationStatusLabel,
          yieldRate: Number(asset.screening?.yieldRate || 0),
          riskScore: Number(asset.screening?.riskScore || 0),
        });
      }
      await load();
    } catch (watchError: any) {
      setWatchActionError(watchError?.message || 'Could not update the watchlist.');
    } finally {
      setWatchPendingTokenId(null);
    }
  }, [agentPublicKey, load, watchedTokenIds]);

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          {/* <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">Continuum</p> */}
          <h2 className="text-4xl font-headline font-bold tracking-tight text-on-surface">Marketplace</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Browse productive twins for free, pay for premium analysis, and let autonomous agents compete in timed auctions.
          </p>
        </div>
        <button onClick={() => void load()} className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50 transition-all">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {discoveryStats.map((item) => (
          <div key={item.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
            <p className={`text-2xl font-headline font-black ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Market Pulse</p>
              <p className="mt-1 text-sm text-slate-600">Free discovery signals before you pay for analysis or place a bid.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(typeBreakdown).map(([type, count]) => (
                <span
                  key={type}
                  className="rounded-full bg-slate-50 border border-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500"
                >
                  {TYPE_META[type as keyof typeof TYPE_META]?.label || type} · {String(count)}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {marketPulse.map((item) => (
              <div key={item.label} className={`rounded-xl border px-3 py-3 ${item.tone}`}>
                <p className="text-[9px] font-label uppercase tracking-widest opacity-70">{item.label}</p>
                <p className="mt-1 text-sm font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Closing Soon</p>
          {(auctionsClosingSoon || []).length ? (
            auctionsClosingSoon.map((auction: any) => (
              <div key={auction.auctionId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{auction.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Auction #{auction.auctionId} · {formatCountdown(auction.endTime)}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600">
                    {auction.uniqueBidderCount || 0} bidders
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Reserve {auction.reservePrice || 'n/a'} USDC · Next bid {auction.minimumNextBid || 'n/a'} USDC
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">No live auctions are nearing close yet.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Top Opportunities</p>
          {(topOpportunities || []).length ? (
            topOpportunities.map((entry: any, index: number) => (
              <div key={entry.tokenId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">#{index + 1} · {entry.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(TYPE_META[entry.assetType as keyof typeof TYPE_META]?.label || entry.assetType)} · {entry.verificationStatus}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    score {Number(entry.score || 0).toFixed(0)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Yield {Number(entry.yieldRate || 0).toFixed(2)}% · Risk {Number(entry.riskScore || 0).toFixed(0)}/100
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">Not enough market history yet to rank opportunities.</p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Your Market Book</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {agentPublicKey ? 'Managed agent' : 'Activate agent'}
            </span>
          </div>
          {agentPublicKey ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Owned Twins', value: String(ownedMarketAssets.length) },
                  { label: 'Sessions', value: String(managedSessions.length) },
                  { label: 'Bid Reserves', value: String(managedReservations.length) },
                  { label: 'Treasury Positions', value: String(marketTreasury?.positions?.length || 0) },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{item.label}</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Liquidity Runway</p>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    marketLiquidity?.status === 'below_floor'
                      ? 'text-rose-600'
                      : marketLiquidity?.status === 'near_floor'
                        ? 'text-amber-600'
                        : 'text-secondary'
                  }`}>
                    {marketLiquidity?.statusLabel || 'Waiting for wallet'}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: 'Liquid USDC', value: `${marketLiquidity?.walletBalanceDisplay || '0'} USDC` },
                    { label: 'Bid Headroom', value: `${marketLiquidity?.immediateBidHeadroomDisplay || '0'} USDC` },
                    { label: 'Reserve Floor', value: `${marketLiquidity?.liquidityFloorAmountDisplay || '0'} USDC` },
                    { label: 'Treasury Deployed', value: `${marketLiquidity?.treasuryDeployedDisplay || '0'} USDC` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                      <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{item.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{item.value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Bid reserves stay committed off-wallet, and treasury recall can reopen headroom when auction pressure rises.
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Reserve Book</p>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {marketReservationExposure.length ? 'Live exposure' : 'No reserves'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Leading', value: String(marketReservationSummary.leading), tone: 'text-secondary' },
                    { label: 'Outbid', value: String(marketReservationSummary.outbid), tone: 'text-amber-600' },
                    { label: 'Ready', value: String(marketReservationSummary.ready), tone: 'text-primary' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                      <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{item.label}</p>
                      <p className={`mt-1 text-sm font-bold ${item.tone}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {marketReservationExposure.slice(0, 3).map((entry: any) => (
                    <div key={entry.bidId} className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{entry.title || `Auction #${entry.auctionId}`}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Bid #{entry.bidId} · {entry.reservedAmountDisplay || '0.0000000'} USDC reserved
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${
                          entry.status === 'ready_to_settle'
                            ? 'text-primary'
                            : entry.status === 'leading'
                              ? 'text-secondary'
                              : entry.status === 'outbid'
                                ? 'text-amber-600'
                                : 'text-slate-400'
                        }`}>
                          {entry.statusLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Top bid {entry.highestBidDisplay || '0.0000000'} USDC · Next valid bid {entry.minimumNextBidDisplay || '0.0000000'} USDC · {formatCountdown(entry.endTime)}
                      </p>
                    </div>
                  ))}
                  {marketReservationExposure.length === 0 && (
                    <p className="text-sm text-slate-400">Reserved bids will show up here once the managed agent starts competing in live auctions.</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {ownedMarketAssets.slice(0, 3).map((asset: any) => (
                  <div key={asset.tokenId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{asset.publicMetadata?.name || asset.name || `Twin #${asset.tokenId}`}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Twin #{asset.tokenId} · {asset.verificationStatusLabel || 'unknown'} · platform/economic ownership only
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                        {Number(asset.claimableYield || 0) > 0 ? `${(Number(asset.claimableYield || 0) / 1e7).toFixed(2)} USDC` : 'No yield'}
                      </span>
                    </div>
                  </div>
                ))}
                {ownedMarketAssets.length === 0 && (
                  <p className="text-sm text-slate-400">No acquired twins yet. Win an auction to start building the market book.</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Activate the managed agent to load owned twins, live sessions, open bid reserves, and treasury positions in the marketplace.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Autonomous Attention</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {agentPublicKey ? 'Live runtime' : 'Activate agent'}
            </span>
          </div>
          {agentPublicKey ? (
            <>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
                <p className="text-[10px] font-label uppercase tracking-widest text-blue-700">Current Bid Focus</p>
                {bidFocus ? (
                  <>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      Auction #{bidFocus.auctionId} · twin #{bidFocus.assetId}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {Array.isArray(bidFocus.prioritySource) && bidFocus.prioritySource.length > 0
                        ? `Priority source: ${bidFocus.prioritySource.join(' + ')}`
                        : 'No shortlist bias applied on the last runtime loop.'}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">No eligible live auction target is active right now.</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Screen Hits', value: String(screenHighlights.length) },
                  { label: 'Watch Signals', value: String(watchlistHighlights.length) },
                  { label: 'Auto Bids', value: String(runtimeSummary.autoBids || 0) },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{item.label}</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{item.value}</p>
                  </div>
                ))}
              </div>
              {(watchlistHighlights || []).length ? (
                (watchlistHighlights || []).slice(0, 3).map((entry: any) => (
                  <div key={entry.tokenId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{entry.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Twin #{entry.tokenId} · {Array.isArray(entry.reasons) ? entry.reasons.join(' · ') : 'signal'}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600">
                        {entry.hasLiveAuction ? 'live auction' : entry.severity || 'info'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No active watchlist alerts from the managed runtime yet.</p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Activate the managed agent to see live shortlist hits, watchlist signals, and current bid focus in the market.
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Agent Outcome Snapshot</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {agentPublicKey ? 'Live performance' : 'Activate agent'}
            </span>
          </div>
          {agentPublicKey ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Net P&L', value: formatUsdcMetric(Number(performance.netPnL || 0) / 1e7), tone: 'text-secondary' },
                  { label: 'Win Rate', value: `${Number(performanceAttribution.winRatePct || 0).toFixed(1)}%`, tone: 'text-primary' },
                  { label: 'Realized Yield', value: formatUsdcMetric(Number(performance.realizedYield || 0) / 1e7), tone: 'text-purple-600' },
                  { label: 'Fee Drag', value: formatUsdcMetric(Number(performance.paidActionFees || 0) / 1e7), tone: 'text-amber-600' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{item.label}</p>
                    <p className={`mt-1 text-sm font-bold ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Recent Market Outcomes</p>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {String(performanceEvents.length)} events
                  </span>
                </div>
                {performanceEvents.length ? (
                  performanceEvents.slice(0, 3).map((event: any) => (
                    <div key={event.id} className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{event.label || 'Performance event'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {event.category || 'info'} · {new Date(Number(event.ts || Date.now())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${
                          event.direction === 'inflow'
                            ? 'text-secondary'
                            : event.direction === 'outflow'
                              ? 'text-amber-600'
                              : 'text-slate-400'
                        }`}>
                          {formatPerformanceAmount(event.amount, event.direction)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No realized market outcomes yet. Paid actions, claims, treasury returns, and auction closes will show up here.</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Recent Decisions</p>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {String(recentDecisionLog.length)} logged
                  </span>
                </div>
                {recentDecisionLog.length ? (
                  recentDecisionLog.slice(0, 3).map((entry: any, index: number) => (
                    <div key={entry.id || `${entry.ts || 'decision'}-${index}`} className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                      <p className="text-sm font-bold text-slate-800">{entry.message || 'Decision recorded'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {entry.detail || 'The managed runtime will append context here as it screens, bids, settles, and rebalances.'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No managed decisions recorded yet. Start the runtime to build a live decision trail here.</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Activate the managed agent to load live P&amp;L, recent market outcomes, and the current decision trail in the marketplace.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Saved Screens</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{String(savedScreens.length)} saved</span>
          </div>
          {savedScreens.length ? (
            savedScreens.slice(0, 4).map((screen: any) => (
              <div key={screen.screenId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{screen.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {Number(screen.summary?.totalProductiveTwins || 0)} twins · {Number(screen.summary?.activeFilterCount || 0)} active filters
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => applySavedScreen(screen)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => void handleDeleteScreen(screen.screenId)}
                      className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">No saved screens yet. Save a shortlist once the market view looks right.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Watchlist</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{String(watchlist.length)} twins</span>
          </div>
          {watchlist.length ? (
            watchlist.slice(0, 5).map((item: any) => (
              <div key={item.tokenId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {(TYPE_META[item.assetType as keyof typeof TYPE_META]?.label || item.assetType || 'Twin')} · {item.verificationStatus || 'unknown'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Yield {Number(item.yieldRate || 0).toFixed(2)}% · Risk {Number(item.riskScore || 0).toFixed(0)}/100
                    </p>
                  </div>
                  <button
                    onClick={() => void handleToggleWatch({ tokenId: item.tokenId })}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                  >
                    Unwatch
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">Watch specific twins from the drawer to keep them in the managed shortlist.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search productive twins..."
              className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="flex gap-1.5">
            {TYPE_FILTERS.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                  typeFilter === type ? 'bg-primary text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {type === 'all' ? 'All' : TYPE_META[type]?.label || type}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <Select
              options={SORT_OPTIONS}
              value={sort}
              onChange={(value) => setSort(String(value))}
              className="w-[10rem] text-slate-400"
              compact
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_auto_auto_auto]">
          <input
            type="text"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Agent screen goal, e.g. verified assets under 40 risk"
            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <input
            type="number"
            min="0"
            step="0.1"
            value={minYield}
            onChange={(event) => setMinYield(event.target.value)}
            placeholder="Min yield %"
            className="w-full lg:w-[9rem] bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={maxRisk}
            onChange={(event) => setMaxRisk(event.target.value)}
            placeholder="Max risk"
            className="w-full lg:w-[9rem] bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={clearScreen}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50"
          >
            Clear Screen
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {[
            { label: 'Verified Only', active: verifiedOnly, setActive: setVerifiedOnly },
            { label: 'Rental Ready', active: rentalReadyOnly, setActive: setRentalReadyOnly },
            { label: 'Live Auctions', active: liveAuctionsOnly, setActive: setLiveAuctionsOnly },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => item.setActive(!item.active)}
              className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                item.active ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
          <span className="text-xs text-slate-400">
            Showing {String(marketSummary?.totalProductiveTwins ?? assets.length)} of {String(universeCount)} productive twins.
          </span>
        </div>

        {activeFilterCount > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {screeningPills.map((item) => (
                <span
                  key={item.label}
                  className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700"
                >
                  {item.label}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              The free browse layer is now being screened server-side before premium analysis or bidding starts.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">Agent Shortlist Tools</p>
            <p className="mt-1 text-sm text-slate-600">
              Save the current market screen or watch specific twins so the managed agent can keep a persistent shortlist.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!agentPublicKey && (
              <button
                onClick={activate}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
              >
                Activate Agent
              </button>
            )}
            <button
              onClick={() => void handleSaveScreen()}
              disabled={saveScreenStatus === 'saving'}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
            >
              {saveScreenStatus === 'saving' ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              {saveScreenStatus === 'saving' ? 'Saving...' : 'Save Screen'}
            </button>
          </div>
        </div>
        {saveScreenStatus === 'ok' && (
          <p className="text-xs text-emerald-600">This market screen is now saved to the managed agent workspace.</p>
        )}
        {saveScreenError && (
          <p className="text-xs text-red-500">{saveScreenError}</p>
        )}
        {watchActionError && (
          <p className="text-xs text-red-500">{watchActionError}</p>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="bg-slate-100 rounded-[2.5rem] aspect-[3/4] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-50 rounded-[2.5rem] border border-slate-100 p-16 text-center">
          <Store size={40} className="text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">No productive twins match your filters.</p>
        </div>
      ) : (
        <motion.div
          key={`${typeFilter}-${sort}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
        >
          {filtered.map((asset) => (
            <AssetCard key={asset.tokenId} asset={asset} onDetails={setSelected} />
          ))}
        </motion.div>
      )}

      <AssetDetailPortal
        selected={selected}
        onClose={() => setSelected(null)}
        renderBody={(asset) => (
          <MarketActions
            asset={asset}
            agentPublicKey={agentPublicKey}
            mandate={agentState?.mandate || null}
            liquidity={marketLiquidity}
            reservations={managedReservations}
            isWatched={watchedTokenIds.has(Number(asset.tokenId))}
            watchPending={watchPendingTokenId === Number(asset.tokenId)}
            onToggleWatch={handleToggleWatch}
            onRefresh={load}
          />
        )}
        renderFooter={(asset) => (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Rental remains available as a secondary lane for physical use. Continuum v1 centers auctions, yield, and treasury.
            </div>
            <RentalSessionComposer asset={asset} onStarted={() => void load()} />
          </div>
        )}
      />
    </div>
  );
}
