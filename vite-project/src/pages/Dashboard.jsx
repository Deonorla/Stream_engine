import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { ErrorBoundary, SkeletonDashboard } from '../components/ui';
import {
  ArrowRightLeft, Building2, Bot, TrendingUp,
  ArrowUpRight, ArrowDownLeft, Coins, Activity, Plus
} from 'lucide-react';
import { ethers } from 'ethers';
import { paymentTokenSymbol } from '../contactInfo';
import { fetchRwaAssets } from '../services/rwaApi';
import { useProtocolCatalog } from '../hooks/useProtocolCatalog';
import { mapApiAssetToUiAsset } from './rwa/rwaData';

function calcRwaClaimable(a) {
  if (typeof a?.yieldBalance === 'number') {
    return a.yieldBalance;
  }
  const now = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, Math.min(now, a.startTime + a.duration) - a.startTime);
  return Math.min(elapsed * a.flowRate, a.totalYield);
}

function resolveRwaTotal(a) {
  if (typeof a?.totalYield === 'number' && a.totalYield > 0) {
    return a.totalYield;
  }
  if (typeof a?.monthlyYieldTarget === 'number' && a.monthlyYieldTarget > 0) {
    return a.monthlyYieldTarget;
  }
  return Math.max(calcRwaClaimable(a), 1);
}

function shortAddress(address = '') {
  if (!address) {
    return 'Unavailable';
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-cyan-400', to }) {
  const inner = (
    <div className="card-glass p-4 border border-white/5 hover:border-white/10 transition-colors group relative">
      <div className={`flex items-center gap-1.5 text-xs mb-2 ${color}`}>
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <div className="font-mono text-white font-bold text-2xl tabular-nums">{value}</div>
      {sub && <div className="text-white/40 text-xs mt-0.5">{sub}</div>}
      {to && <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 absolute top-3 right-3 transition-colors" />}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

// ─── Live stream row ──────────────────────────────────────────────────────────
function StreamRow({ stream, formatEth }) {
  const [claimable, setClaimable] = useState('0');

  useEffect(() => {
    const tick = () => {
      if (!stream.isActive) return;
      const now = Math.floor(Date.now() / 1000);
      const elapsed = Math.max(0, Math.min(now, Number(stream.stopTime)) - Number(stream.startTime));
      const streamed = BigInt(elapsed) * BigInt(stream.flowRate || 0);
      const c = streamed > BigInt(stream.amountWithdrawn || 0)
        ? streamed - BigInt(stream.amountWithdrawn || 0)
        : 0n;
      setClaimable(formatEth(c));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stream, formatEth]);

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
        <span className="font-mono text-white/60 text-xs truncate">
          #{stream.id} → {stream.recipient?.slice(0,6)}…{stream.recipient?.slice(-4)}
        </span>
      </div>
      <span className="font-mono text-cyan-300 text-xs tabular-nums shrink-0 ml-2">
        {claimable} {paymentTokenSymbol}
      </span>
    </div>
  );
}

// ─── RWA summary row ──────────────────────────────────────────────────────────
function RwaRow({ asset }) {
  const [streamed, setStreamed] = useState(() => calcRwaClaimable(asset));
  useEffect(() => {
    const id = setInterval(() => setStreamed(calcRwaClaimable(asset)), 1000);
    return () => clearInterval(id);
  }, [asset]);
  const total = resolveRwaTotal(asset);
  const pct = Math.min(100, (streamed / total) * 100);

  return (
    <div className="py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-white/70 text-xs truncate">{asset.title || asset.name}</span>
        <span className="font-mono text-purple-300 text-xs tabular-nums shrink-0 ml-2">
          {streamed.toFixed(2)} {paymentTokenSymbol}
        </span>
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const {
    outgoingStreams, incomingStreams,
    isInitialLoad, isLoadingStreams,
    walletAddress, paymentBalance, formatEth
  } = useWallet();
  const { catalog } = useProtocolCatalog();
  const [liveRwaAssets, setLiveRwaAssets] = useState([]);

  const [rwaStreamed, setRwaStreamed] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchRwaAssets()
      .then((assets) => {
        if (!cancelled) {
          setLiveRwaAssets(assets.map((asset) => mapApiAssetToUiAsset(asset)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveRwaAssets([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const update = () => setRwaStreamed(liveRwaAssets.reduce((sum, asset) => sum + calcRwaClaimable(asset), 0));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [liveRwaAssets]);

  const totalOutflow = useMemo(() =>
    outgoingStreams.reduce((sum, s) => {
      try { return sum + parseFloat(ethers.formatUnits(s.totalAmount || 0n, 6)); }
      catch { return sum; }
    }, 0),
  [outgoingStreams]);

  if (isInitialLoad && isLoadingStreams) return <SkeletonDashboard />;

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <Activity className="w-16 h-16 text-white/20 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-white/50 text-center max-w-sm">
          Connect to view your streams, RWA yields, and agent activity.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Top stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Coins}         label={`${paymentTokenSymbol} Balance`} value={Number(paymentBalance).toFixed(2)}  sub={catalog?.network?.name || 'Westend Asset Hub'} color="text-cyan-400" />
        <StatCard icon={ArrowUpRight}  label="Outgoing Streams" value={outgoingStreams.length}           sub={`${totalOutflow.toFixed(2)} ${paymentTokenSymbol}`} color="text-blue-400"    to="/app/streams" />
        <StatCard icon={ArrowDownLeft} label="Incoming Streams" value={incomingStreams.length}           sub="claimable now"                    color="text-emerald-400" to="/app/streams" />
        <StatCard icon={Building2}     label="RWA Assets"       value={liveRwaAssets.length}               sub={`${rwaStreamed.toFixed(2)} ${paymentTokenSymbol}`}  color="text-purple-400"  to="/app/rwa" />
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Payment streams panel */}
        <div className="card-glass border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2 text-sm">
              <ArrowRightLeft className="w-4 h-4 text-blue-400" /> Payment Streams
            </h2>
            <Link to="/app/streams" className="text-xs text-white/40 hover:text-white flex items-center gap-1 transition-colors">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {outgoingStreams.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/30 text-sm mb-3">No active streams</p>
              <Link to="/app/streams" className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Create Stream
              </Link>
            </div>
          ) : (
            <>
              {outgoingStreams.slice(0, 5).map(s => (
                <ErrorBoundary key={s.id} variant="inline">
                  <StreamRow stream={s} formatEth={formatEth} />
                </ErrorBoundary>
              ))}
              {outgoingStreams.length > 5 && (
                <Link to="/app/streams" className="block text-center text-xs text-white/30 hover:text-white/60 pt-2 transition-colors">
                  +{outgoingStreams.length - 5} more
                </Link>
              )}
            </>
          )}
        </div>

        {/* RWA yield panel */}
        <div className="card-glass border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-purple-400" /> RWA Studio
            </h2>
            <Link to="/app/rwa" className="text-xs text-white/40 hover:text-white flex items-center gap-1 transition-colors">
              Browse <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {liveRwaAssets.length > 0 ? (
            liveRwaAssets.map((asset) => <RwaRow key={asset.id} asset={asset} />)
          ) : (
            <div className="py-8 text-center">
              <p className="text-white/30 text-sm mb-2">No indexed rental assets yet</p>
              <p className="text-white/20 text-xs">Mint an asset in RWA Studio or wait for the registry to sync.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { to: '/app/streams', icon: ArrowRightLeft, label: 'Create Stream',  sub: `Send ${paymentTokenSymbol} per-second`,         color: 'from-blue-600/20 to-cyan-600/20',    border: 'border-blue-500/20'   },
          { to: '/app/rwa',     icon: Building2,      label: 'Rent an Asset',  sub: 'Stream rent to RWA owners',    color: 'from-purple-600/20 to-pink-600/20',  border: 'border-purple-500/20' },
          { to: '/app/agent',   icon: Bot,            label: 'Agent Console',  sub: 'AI-powered payment decisions', color: 'from-amber-600/20 to-orange-600/20', border: 'border-amber-500/20'  },
        ].map(({ to, icon: Icon, label, sub, color, border }) => (
          <Link key={to} to={to}
            className={`card-glass border ${border} bg-gradient-to-br ${color} p-4 flex items-center gap-3 hover:scale-[1.02] transition-transform duration-200 group`}
          >
            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
              <Icon className="w-5 h-5 text-white/70" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-medium text-sm">{label}</div>
              <div className="text-white/40 text-xs">{sub}</div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-white/20 group-hover:text-white/50 ml-auto shrink-0 transition-colors" />
          </Link>
        ))}
      </div>

      {/* ── Protocol stats ── */}
      <div className="card-glass border border-white/5 p-5">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Protocol Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { label: 'Protected Routes', value: String(catalog?.routes?.length || 0), color: 'text-emerald-400' },
            { label: 'Service Wallet', value: shortAddress(catalog?.payments?.recipientAddress), color: 'text-cyan-400' },
            { label: `${paymentTokenSymbol} Asset ID`, value: String(catalog?.payments?.paymentAssetId || 31337), color: 'text-purple-400' },
            { label: 'Network', value: catalog?.network?.name || 'Westend Asset Hub', color: 'text-blue-400' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className={`font-mono font-bold text-xl ${color}`}>{value}</div>
              <div className="text-white/40 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
