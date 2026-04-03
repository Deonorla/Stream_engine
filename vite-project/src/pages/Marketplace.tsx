import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart2,
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
  createMarketAuction,
  fetchAuction,
  fetchMarketAsset,
  fetchMarketAnalytics,
  fetchMarketAssets,
  placeAuctionBid,
  settleAuction,
} from '../services/rwaApi.js';
import { mapApiAssetToUiAsset, TYPE_META } from './rwa/rwaData';

const SORT_OPTIONS = [
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
  };
}

function sortAssets(assets: any[], sort: string) {
  const copy = [...assets];
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

function MarketActions({
  asset,
  agentPublicKey,
  onRefresh,
}: {
  asset: any;
  agentPublicKey: string | null | undefined;
  onRefresh: () => Promise<void>;
}) {
  const [details, setDetails] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsStatus, setAnalyticsStatus] = useState<'idle' | 'loading' | '402' | 'ok' | 'err'>('idle');
  const [auctionStatus, setAuctionStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [bidStatus, setBidStatus] = useState<'idle' | 'loading' | 'ok' | '402' | 'err'>('idle');
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
      if (String(error?.message || '').includes('Payment') || String(error?.message || '').includes('402')) {
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
              ].map((item) => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-bold text-slate-800">{item.value}</p>
                </div>
              ))}
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
                    disabled={bidStatus === 'loading' || !bidAmount}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                    <Gavel size={13} />
                    {bidStatus === 'loading' ? 'Placing...' : 'Bid'}
                  </button>
                </div>
                {bidStatus === '402' && <p className="text-xs text-amber-700">Bid placement is paid. Reuse or enter a valid Continuum payment session ID first.</p>}
                {bidStatus === 'err' && <p className="text-xs text-red-500">Bid failed. Check your mandate, liquidity floor, and payment session.</p>}
                {bidStatus === 'ok' && <p className="text-xs text-secondary">Bid placed and principal reserved successfully.</p>}
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
  const { agentPublicKey } = useAgentWallet(walletAddress);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('auction_desc');
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchMarketAssets();
      setAssets(response.map(buildUiAsset));
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return sortAssets(
      assets.filter((asset) => {
        if (typeFilter !== 'all' && asset.type !== typeFilter) return false;
        if (!search) return true;
        const query = search.toLowerCase();
        return (
          asset.name?.toLowerCase().includes(query) ||
          asset.location?.toLowerCase().includes(query) ||
          asset.description?.toLowerCase().includes(query)
        );
      }),
      sort,
    );
  }, [assets, search, sort, typeFilter]);

  const liveAuctions = assets.filter((asset) => asset.market?.hasActiveAuction).length;
  const totalYield = assets.reduce((sum, asset) => sum + Number(asset.yieldBalance || 0), 0);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Productive Twins', value: String(assets.length), color: 'text-primary' },
          { label: 'Live Auctions', value: String(liveAuctions), color: 'text-purple-600' },
          { label: 'Claimable Yield', value: `${totalYield.toFixed(2)} USDC`, color: 'text-secondary' },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
            <p className={`text-2xl font-headline font-black ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-wrap gap-3 items-center">
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
