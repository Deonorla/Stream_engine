import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { AgentConsole } from '../components/AgentConsole';
import { DecisionLog } from '../components/DecisionLog';
import { ErrorBoundary, SkeletonAgentConsole } from '../components/ui';
import { Bot, Play, Pause, RefreshCw, BarChart3, StopCircle } from 'lucide-react';
import { paymentTokenSymbol } from '../contactInfo';
import { fetchProtocolCatalog } from '../services/protocolApi';

const CONFIG_STORAGE_KEY = 'stream-engine-agent-config:v1';
const PAUSE_STORAGE_KEY = 'stream-engine-agent-paused:v1';

function readStoredConfig() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function readStoredPauseState() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(PAUSE_STORAGE_KEY) === 'true';
}

function shortAddress(address = '') {
  if (!address) {
    return 'Unavailable';
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function parseMetadata(metadata) {
  if (!metadata || typeof metadata !== 'string') {
    return {};
  }

  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function unitsToNumber(value, decimals = 6) {
  const normalized = typeof value === 'bigint' ? value : BigInt(value || 0);
  return Number(normalized) / 10 ** decimals;
}

function getAccruedAmount(stream, decimals = 6) {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, Math.min(now, Number(stream.stopTime || 0)) - Number(stream.startTime || 0));
  const accrued = BigInt(elapsed) * BigInt(stream.flowRate || 0n);
  const capped = accrued > BigInt(stream.totalAmount || 0n) ? BigInt(stream.totalAmount || 0n) : accrued;
  return unitsToNumber(capped, decimals);
}

function getRemainingBudget(stream, decimals = 6) {
  const total = unitsToNumber(stream.totalAmount || 0n, decimals);
  return Math.max(0, total - getAccruedAmount(stream, decimals));
}

export default function AgentConsolePage() {
  const {
    walletAddress,
    isInitialLoad,
    outgoingStreams,
    incomingStreams,
    paymentBalance,
    getNetworkName,
    chainId,
    contractWithProvider,
    refreshStreams,
  } = useWallet();

  const [agentConfig, setAgentConfig] = useState(() => (
    readStoredConfig() || {
      agentId: 'StreamEngine-Agent-001',
      spendingLimits: {
        daily: '100',
        weekly: '500',
        monthly: '2000',
        perRequestLimit: '1',
      },
      alertThresholds: [75, 90],
    }
  ));
  const [isPaused, setIsPaused] = useState(() => readStoredPauseState());
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(agentConfig));
  }, [agentConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PAUSE_STORAGE_KEY, isPaused ? 'true' : 'false');
  }, [isPaused]);

  const loadCatalog = async () => {
    setIsRefreshing(true);
    setCatalogError('');
    try {
      const nextCatalog = await fetchProtocolCatalog();
      setCatalog(nextCatalog);
    } catch (error) {
      console.error('Failed to load protocol catalog', error);
      setCatalogError(error.message || 'Unable to load protocol catalog.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const serviceEndpoints = useMemo(() => catalog?.routes || [], [catalog]);
  const networkName = catalog?.network?.name || getNetworkName(chainId);

  const spending = useMemo(() => {
    const now = Date.now();
    const windows = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    };

    return outgoingStreams.reduce((summary, stream) => {
      const startedAtMs = Number(stream.startTime || 0) * 1000;
      const accrued = getAccruedAmount(stream);

      if (now - startedAtMs <= windows.daily) {
        summary.daily += accrued;
      }
      if (now - startedAtMs <= windows.weekly) {
        summary.weekly += accrued;
      }
      if (now - startedAtMs <= windows.monthly) {
        summary.monthly += accrued;
      }

      return summary;
    }, {
      daily: 0,
      weekly: 0,
      monthly: 0,
      requests: serviceEndpoints.length,
      streams: outgoingStreams.filter((stream) => stream.isActive).length,
    });
  }, [outgoingStreams, serviceEndpoints.length]);

  const stats = useMemo(() => ([
    { icon: Bot, label: 'Agent ID', value: agentConfig.agentId || 'Unassigned', color: 'flowpay' },
    { icon: RefreshCw, label: 'Protected Routes', value: serviceEndpoints.length, color: 'accent' },
    { icon: Play, label: 'Active Streams', value: outgoingStreams.filter((stream) => stream.isActive).length, color: 'success' },
    { icon: StopCircle, label: 'Wallet Balance', value: `${Number(paymentBalance).toFixed(2)} ${paymentTokenSymbol}`, color: 'warning' },
  ]), [agentConfig.agentId, paymentBalance, outgoingStreams, serviceEndpoints.length]);

  const alerts = useMemo(() => {
    const nextAlerts = [];
    const dailyLimit = Number(agentConfig.spendingLimits?.daily || agentConfig.spendingLimits?.dailyLimit || 0);
    const balance = Number(paymentBalance || 0);

    if (dailyLimit > 0 && spending.daily >= dailyLimit * 0.75) {
      nextAlerts.push({
        type: spending.daily >= dailyLimit * 0.9 ? 'error' : 'warning',
        message: `${Math.round((spending.daily / dailyLimit) * 100)}% of daily budget has been consumed.`,
        time: 'Current session',
      });
    }

    const lowBalanceStreams = outgoingStreams.filter((stream) => stream.isActive && getRemainingBudget(stream) < 0.1);
    if (lowBalanceStreams.length > 0) {
      nextAlerts.push({
        type: 'warning',
        message: `${lowBalanceStreams.length} active stream${lowBalanceStreams.length > 1 ? 's are' : ' is'} nearly depleted.`,
        time: 'Live monitor',
      });
    }

    if (balance <= 0) {
      nextAlerts.push({
        type: 'error',
        message: `Wallet balance is empty. Fund ${paymentTokenSymbol} before starting new streams.`,
        time: 'Current session',
      });
    }

    if (catalogError) {
      nextAlerts.push({
        type: 'error',
        message: catalogError,
        time: 'Catalog fetch',
      });
    }

    if (nextAlerts.length === 0) {
      nextAlerts.push({
        type: 'info',
        message: 'No active warnings. Stream Engine policy checks are healthy.',
        time: 'Current session',
      });
    }

    return nextAlerts;
  }, [agentConfig.spendingLimits, catalogError, paymentBalance, outgoingStreams, spending.daily]);

  const healthChecks = useMemo(() => ([
    { name: 'Wallet Connected', status: walletAddress ? 'ok' : 'error' },
    { name: 'Network Ready', status: networkName ? 'ok' : 'error' },
    { name: 'Stream Contract', status: contractWithProvider ? 'ok' : 'error' },
    { name: 'Service Catalog', status: catalogError ? 'error' : 'ok' },
  ]), [catalogError, contractWithProvider, networkName, walletAddress]);

  const decisionLogs = useMemo(() => {
    const streamLogs = outgoingStreams.map((stream) => {
      const metadata = parseMetadata(stream.metadata);
      const accrued = getAccruedAmount(stream);
      const target = metadata.target || metadata.assetName || shortAddress(stream.recipient);
      const isRental = metadata.type === 'rwa-rental';

      return {
        timestamp: Number(stream.startTime || 0) * 1000,
        mode: 'stream',
        reasoning: isRental
          ? `Rental access for ${target} is being settled continuously so the renter can cancel at any time and recover unused balance.`
          : `Continuous settlement is active for ${target}. Stream #${stream.id} keeps requests or access live without repeating approvals.`,
        volume: Number(stream.id),
        volumeLabel: isRental
          ? `${metadata.durationHours || 0} hour rental stream`
          : `${unitsToNumber(stream.totalAmount || 0n).toFixed(2)} ${paymentTokenSymbol} budget`,
        confidence: 0.92,
        provider: stream.recipient,
        streamCost: accrued,
        directCost: accrued * 1.2,
        savings: accrued * 0.2,
      };
    });

    const routePolicyLogs = serviceEndpoints.slice(0, 3).map((route, index) => ({
      timestamp: Date.now() - (index + 1) * 60_000,
      mode: route.mode === 'per-request' ? 'direct' : 'stream',
      reasoning: route.mode === 'per-request'
        ? `${route.path} stays on direct settlement at ${route.price} ${paymentTokenSymbol} per call because the route is configured for low-frequency access.`
        : `${route.path} is configured for reusable streaming at ${route.price} ${paymentTokenSymbol}/sec so agents can keep the session warm.`,
      volume: index + 1,
      volumeLabel: route.description || 'Live route policy',
      confidence: 0.84,
      provider: route.path,
      streamCost: Number(route.price) || 0,
      directCost: (Number(route.price) || 0) * 1.15,
      savings: (Number(route.price) || 0) * 0.15,
      isNew: streamLogs.length === 0 && index === 0,
    }));

    return [...streamLogs, ...routePolicyLogs]
      .sort((left, right) => right.timestamp - left.timestamp);
  }, [outgoingStreams, serviceEndpoints]);

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Bot className="w-16 h-16 text-white/60 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-white/60 text-center max-w-md">
          Connect your wallet to configure the agent, inspect protected routes, and monitor real streaming activity.
        </p>
      </div>
    );
  }

  if (isInitialLoad) {
    return <SkeletonAgentConsole />;
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      <div className={`card-glass p-4 flex items-center justify-between ${isPaused ? 'border-amber-500/50' : 'border-emerald-500/50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
          <div>
            <span className="font-medium text-white">Agent Status:</span>
            <span className={`ml-2 ${isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isPaused ? 'Paused' : 'Active'}
            </span>
          </div>
        </div>
        <div className="text-sm text-white/60">
          Network: <span className="font-mono text-cyan-300">{networkName}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`card-glass p-4 text-center hover:bg-white/5 transition-colors ${isPaused ? 'border-amber-500/30' : ''}`}
        >
          <div className="flex justify-center mb-2">
            {isPaused ? <Play className="w-6 h-6 text-white/80" /> : <Pause className="w-6 h-6 text-white/80" />}
          </div>
          <div className="text-sm text-white/80">{isPaused ? 'Resume' : 'Pause'} Agent</div>
        </button>
        <button
          onClick={async () => {
            await Promise.allSettled([loadCatalog(), refreshStreams?.()]);
          }}
          className="card-glass p-4 text-center hover:bg-white/5 transition-colors"
        >
          <div className="flex justify-center mb-2">
            <RefreshCw className={`w-6 h-6 text-white/80 ${isRefreshing ? 'animate-spin' : ''}`} />
          </div>
          <div className="text-sm text-white/80">Refresh Status</div>
        </button>
        <button className="card-glass p-4 text-center hover:bg-white/5 transition-colors">
          <div className="flex justify-center mb-2">
            <BarChart3 className="w-6 h-6 text-white/80" />
          </div>
          <div className="text-sm text-white/80">Live Metrics</div>
        </button>
        <button
          onClick={() => setIsPaused(true)}
          className="card-glass p-4 text-center hover:bg-white/5 transition-colors border-red-500/30"
        >
          <div className="flex justify-center mb-2">
            <StopCircle className="w-6 h-6 text-red-400" />
          </div>
          <div className="text-sm text-white/80">Emergency Stop</div>
        </button>
      </div>

      <ErrorBoundary variant="inline">
        <AgentConsole
          config={agentConfig}
          setConfig={setAgentConfig}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
          spending={spending}
          alerts={alerts}
          healthChecks={healthChecks}
          stats={stats}
          serviceEndpoints={serviceEndpoints}
          credential={{
            label: 'Service Recipient',
            value: catalog?.payments?.recipientAddress || catalog?.payments?.contractAddress || '',
          }}
          onRefreshCredential={loadCatalog}
        />
      </ErrorBoundary>

      <ErrorBoundary variant="inline">
        <DecisionLog logs={decisionLogs} />
      </ErrorBoundary>

      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Configuration Summary</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-white/60 mb-2">Spending Limits</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-white/70">Daily Limit</span>
                <span className="font-mono text-cyan-300">{agentConfig.spendingLimits.daily || agentConfig.spendingLimits.dailyLimit} {paymentTokenSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Per Request</span>
                <span className="font-mono text-cyan-300">{agentConfig.spendingLimits.perRequestLimit || '1'} {paymentTokenSymbol}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white/60 mb-2">Runtime</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-white/70">Protected Routes</span>
                <span className="font-mono text-cyan-300">{serviceEndpoints.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Incoming Streams</span>
                <span className="font-mono text-cyan-300">{incomingStreams.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
