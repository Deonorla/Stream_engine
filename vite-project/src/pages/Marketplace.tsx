import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart2,
  Gavel,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AssetCard, AssetDetailPortal } from '../components/AssetCard';
import RentalSessionComposer from '../components/RentalSessionComposer';
import Select from '../components/ui/Select';
import { useWallet } from '../context/WalletContext';
import { useAgentWallet } from '../hooks/useAgentWallet';
import {
  createMarketAuction,
  fetchMarketAsset,
  fetchMarketAnalytics,
  fetchMarketCatalog,
  fetchMarketPositions,
  placeAuctionBid,
  settleAuction,
} from '../services/rwaApi.js';
import { mapApiAssetToUiAsset, TYPE_META } from './rwa/rwaData';

const SORT_OPTIONS = [
  { value: 'yield_desc', label: 'Highest Yield' },
  { value: 'price_asc', label: 'Lowest Rate' },
  { value: 'price_desc', label: 'Highest Rate' },
  { value: 'newest', label: 'Newest' },
];

const TYPE_FILTERS = ['all', 'real_estate', 'land'];

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
  if (sort === 'yield_desc') {
    return copy.sort((left, right) => (right.yieldBalance || 0) - (left.yieldBalance || 0));
  }
  if (sort === 'price_asc') {
    return copy.sort((left, right) => (left.pricePerHour || 0) - (right.pricePerHour || 0));
  }
  if (sort === 'price_desc') {
    return copy.sort((left, right) => (right.pricePerHour || 0) - (left.pricePerHour || 0));
  }
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

function formatShortAddress(value?: string | null) {
  if (!value) return 'Unknown';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatUsdc(value?: number) {
  return `${Number(value || 0).toFixed(2)} USDC`;
}

function AgentActions({
  asset,
  actorAddress,
  onRefresh,
}: {
  asset: any;
  actorAddress: string | null | undefined;
  onRefresh: () => Promise<void>;
}) {
  const [details, setDetails] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsStatus, setAnalyticsStatus] = useState<null | 'loading' | '402' | 'ok' | 'err'>(null);
  const [auctionStatus, setAuctionStatus] = useState<null | 'loading' | 'ok' | 'err'>(null);
  const [bidStatus, setBidStatus] = useState<null | 'loading' | 'ok' | '402' | 'err'>(null);
  const [bidError, setBidError] = useState('');
  const [reservePrice, setReservePrice] = useState('250');
  const [durationHours, setDurationHours] = useState('24');
  const [bidAmount, setBidAmount] = useState('');
  const [sessionId, setSessionId] = useState('');

  const isOwner = Boolean(
    actorAddress
      && asset.currentOwner
      && String(actorAddress).toUpperCase() === String(asset.currentOwner).toUpperCase(),
  );

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

  const activeAuction =
    details?.auctions?.find((entry: any) => entry.status === 'active')
    || asset.market?.activeAuction
    || null;

  const handleAnalytics = async () => {
    setAnalyticsStatus('loading');
    try {
      const data = await fetchMarketAnalytics(asset.tokenId, sessionId || undefined);
      setAnalytics(data.analytics);
      setAnalyticsStatus('ok');
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('402') || message.includes('Payment')) {
        setAnalyticsStatus('402');
      } else {
        setAnalyticsStatus('err');
      }
    }
  };

  const handleBid = async () => {
    if (!activeAuction || !bidAmount || Number(bidAmount) <= 0) return;
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
      const message = String(error?.message || 'Bid failed. Try again.');
      setBidError(message);
      if (message.includes('402') || message.includes('Payment')) {
        setBidStatus('402');
      } else {
        setBidStatus('err');
      }
    }
  };

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
    <div className="space-y-4 pt-4 border-t border-slate-100">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
        Twin transfers in Continuum represent platform and economic ownership inside the marketplace. They do not automatically transfer legal title in the physical world.
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Premium Analytics</p>
          <button
            onClick={() => void handleAnalytics()}
            disabled={analyticsStatus === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <BarChart2 size={12} />
            {analyticsStatus === 'loading' ? 'Loading…' : 'Fetch · 0.10 USDC'}
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
            Payment required. Open a Continuum payment session first, then retry.
          </div>
        )}
        {analyticsStatus === 'err' && <p className="text-xs text-red-500">Could not load analytics.</p>}
        {analyticsStatus === 'ok' && analytics && (
          <div className="space-y-3">
            {analytics.summary && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-700 leading-6">{analytics.summary}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Verdict', value: analytics.verdict || 'HOLD' },
                { label: 'Claimable Yield', value: `${Number(analytics.claimableYield || 0).toFixed(4)} USDC` },
                { label: 'Projected APY', value: `${Number(analytics.projectedAnnualYield || 0).toFixed(4)} USDC` },
                { label: 'Market Risk', value: `${Number(analytics.marketContext?.avgRisk || 0).toFixed(0)}/100` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
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
                { label: 'Reserve', value: `${activeAuction.reservePriceDisplay || activeAuction.reservePrice || '0'} USDC` },
                { label: 'Highest Bid', value: activeAuction.highestBidDisplay ? `${activeAuction.highestBidDisplay} USDC` : 'No bids yet' },
                { label: 'Bid Count', value: String(activeAuction.bidCount || 0) },
                { label: 'Leading Bidder', value: activeAuction.highestBidder ? formatShortAddress(activeAuction.highestBidder) : 'Waiting' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-label uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>

            {!isOwner && actorAddress && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bidAmount}
                    onChange={(event) => setBidAmount(event.target.value)}
                    placeholder="Amount (USDC)"
                    className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    onClick={() => void handleBid()}
                    disabled={bidStatus === 'loading' || !bidAmount}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                    <Gavel size={13} />
                    {bidStatus === 'loading' ? 'Placing…' : 'Bid'}
                  </button>
                </div>
                {bidStatus === '402' && <p className="text-xs text-amber-700">Payment required. Reuse a Continuum session, then retry the bid.</p>}
                {bidStatus === 'err' && <p className="text-xs text-red-500">{bidError || 'Bid failed. Try again.'}</p>}
                {bidStatus === 'ok' && <p className="text-xs text-secondary">Bid placed successfully.</p>}
              </div>
            )}

            {formatCountdown(activeAuction.endTime) === 'Ready to settle' && actorAddress && (
              <button
                onClick={() => void handleSettle()}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
              >
                {auctionStatus === 'loading' ? 'Settling…' : 'Settle Auction'}
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
              {auctionStatus === 'loading' ? 'Opening Auction…' : 'List In Timed Auction'}
            </button>
            {auctionStatus === 'err' && <p className="text-xs text-red-500">Could not create the auction.</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No active auction yet. Once the seller lists this twin, bidding starts here.</p>
        )}
      </div>
    </div>
  );
}

function AgentLeaderboard({ assets }: { assets: any[] }) {
  const byOwner: Record<string, number> = {};
  for (const asset of assets) {
    const address = asset.currentOwner || asset.ownerAddress || '';
    if (!address) continue;
    byOwner[address] = (byOwner[address] || 0) + (asset.yieldBalance || 0);
  }

  const rows = Object.entries(byOwner)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);

  if (!rows.length) return null;

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-amber-500" />
        <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">Top Agents</h3>
      </div>
      <div className="space-y-3">
        {rows.map(([address, totalYield], index) => (
          <div key={address} className="flex items-center gap-3">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                index === 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {index + 1}
            </span>
            <span className="text-xs font-mono text-slate-600 flex-1 truncate">{formatShortAddress(address)}</span>
            <span className="text-xs font-bold text-secondary">{formatUsdc(totalYield)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketStats({ assets }: { assets: any[] }) {
  const totalYield = assets.reduce((sum, asset) => sum + (asset.yieldBalance || 0), 0);
  const activeRentals = assets.filter((asset) => asset.rentalActivity?.currentlyRented).length;

  return (
    <div className="grid grid-cols-3 gap-4">
      {[
        { icon: Store, label: 'Listed Assets', value: assets.length, suffix: '', color: 'text-primary' },
        { icon: Zap, label: 'Active Rentals', value: activeRentals, suffix: '', color: 'text-secondary' },
        { icon: TrendingUp, label: 'Total Yield', value: totalYield.toFixed(2), suffix: ' USDC', color: 'text-purple-600' },
      ].map(({ icon: Icon, label, value, suffix, color }) => (
        <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className={`flex items-center gap-1.5 text-[10px] font-label font-bold uppercase tracking-widest mb-2 ${color}`}>
            <Icon size={12} />
            {label}
          </div>
          <p className={`text-2xl font-headline font-black ${color}`}>{value}{suffix}</p>
        </div>
      ))}
    </div>
  );
}

export default function Marketplace() {
  const { walletAddress } = useWallet();
  const { agentPublicKey, activate } = useAgentWallet(walletAddress);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [marketPositions, setMarketPositions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('yield_desc');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const actorAddress = agentPublicKey || walletAddress;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, positions] = await Promise.all([
        fetchMarketCatalog(),
        agentPublicKey ? fetchMarketPositions() : Promise.resolve(null),
      ]);
      setAllAssets((response.assets || []).map(buildUiAsset));
      setMarketPositions(positions);
    } catch {
      setAllAssets([]);
      setMarketPositions(null);
    } finally {
      setLoading(false);
    }
  }, [agentPublicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const next = allAssets.find((asset) => asset.tokenId === selected.tokenId);
    if (next) {
      setSelected(next);
    }
  }, [allAssets, selected]);

  const filtered = useMemo(() => sortAssets(
    allAssets.filter((asset) => {
      if (typeFilter !== 'all' && asset.type !== typeFilter) return false;
      if (onlyAvailable && asset.rentalActivity?.currentlyRented) return false;
      if (search) {
        const query = search.toLowerCase();
        return (
          asset.name?.toLowerCase().includes(query)
          || asset.location?.toLowerCase().includes(query)
          || asset.description?.toLowerCase().includes(query)
        );
      }
      return true;
    }),
    sort,
  ), [allAssets, onlyAvailable, search, sort, typeFilter]);

  const ownedAssets = Array.isArray(marketPositions?.ownedAssets)
    ? marketPositions.ownedAssets
    : allAssets.filter((asset) => {
        if (!actorAddress) return false;
        const currentOwner = String(asset.currentOwner || asset.ownerAddress || '').toUpperCase();
        return currentOwner === String(actorAddress).toUpperCase();
      });
  const activeSessions = Array.isArray(marketPositions?.sessions) ? marketPositions.sessions : [];
  const ownedYield = ownedAssets.reduce((sum: number, asset: any) => sum + (Number(asset.claimableYield || 0) / 1e7), 0);

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-headline font-bold tracking-tight text-on-surface">Marketplace</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Discover, rent, and trade productive real estate and land twins.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-primary hover:bg-slate-50 transition-all"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <MarketStats assets={allAssets} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search assets..."
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
                options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={sort}
                onChange={(value) => setSort(String(value))}
                className="w-[9rem] text-slate-400"
                compact
              />
            </div>

            <button
              onClick={() => setOnlyAvailable((value) => !value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                onlyAvailable ? 'bg-secondary text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${onlyAvailable ? 'bg-white' : 'bg-slate-300'}`} />
              Available Only
            </button>
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
              <p className="text-slate-400 text-sm">No assets match your filters.</p>
            </div>
          ) : (
            <motion.div
              key={`${typeFilter}-${sort}-${onlyAvailable}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
            >
              {filtered.map((asset) => (
                <AssetCard key={asset.id} asset={asset} onDetails={setSelected} />
              ))}
            </motion.div>
          )}
        </div>

        <div className="space-y-6">
          <AgentLeaderboard assets={allAssets} />

          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-primary" />
              <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-slate-700">My Positions</h3>
            </div>

            {!agentPublicKey ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Activate the managed agent to view the live auction book, owned twins, and session-driven positions from this page.
                </p>
                {walletAddress && (
                  <button
                    onClick={activate}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                  >
                    Activate Agent
                  </button>
                )}
              </div>
            ) : ownedAssets.length === 0 ? (
              <p className="text-xs text-slate-400">No positions yet. Win an auction or open a rental to start earning.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Assets held</span>
                  <span className="font-bold text-slate-700">{ownedAssets.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Active sessions</span>
                  <span className="font-bold text-secondary">{activeSessions.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Claimable yield</span>
                  <span className="font-bold text-secondary">{ownedYield.toFixed(4)} USDC</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AssetDetailPortal
        selected={selected}
        onClose={() => setSelected(null)}
        renderBody={(asset) => (
          <AgentActions
            asset={asset}
            actorAddress={actorAddress}
            onRefresh={load}
          />
        )}
        renderFooter={(asset) => (
          <RentalSessionComposer asset={asset} onStarted={() => void load()} />
        )}
      />
    </div>
  );
}
