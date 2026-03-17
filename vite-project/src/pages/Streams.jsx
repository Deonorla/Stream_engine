import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { paymentTokenAddress, paymentTokenDisplayName, paymentTokenSymbol } from '../contactInfo';
import CreateStreamForm from '../components/CreateStreamForm';
import StreamList from '../components/StreamList';
import { CollapsibleSection, SkeletonStreamCard } from '../components/ui';
import { ArrowRightLeft, Coins, Plus, Wallet, PlugZap, Globe, Shield } from 'lucide-react';
import { useProtocolCatalog } from '../hooks/useProtocolCatalog';
import { callRoute } from '../services/routeApi';

const PUBLIC_ROUTE = {
  path: '/api/free',
  mode: 'free',
  price: '0',
  description: 'Public route with no payment requirement.',
};

function formatResponseBody(body) {
  if (body == null) {
    return 'No response body';
  }

  if (typeof body === 'string') {
    return body;
  }

  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function RouteExplorer({
  routes,
  matchingStreams,
  selectedRoutePath,
  setSelectedRoutePath,
  selectedStreamId,
  setSelectedStreamId,
  routeResult,
  isCallingRoute,
  onCallRoute,
}) {
  const selectedRoute = routes.find((route) => route.path === selectedRoutePath) || routes[0];

  return (
    <section className="card-glass p-4 md:p-6 border border-white/5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-300" /> Endpoint Explorer
          </h3>
          <p className="text-sm text-white/50 mt-1">
            Hit every backend route from the frontend. Protected routes can reuse an active stream that pays the service wallet.
          </p>
        </div>
        <div className="text-xs text-white/40 font-mono">
          {matchingStreams.length} compatible stream{matchingStreams.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-4">
          <label className="block">
            <span className="block text-sm text-white/70 mb-1.5">Backend route</span>
            <select
              className="input-default w-full"
              value={selectedRoutePath}
              onChange={(event) => setSelectedRoutePath(event.target.value)}
            >
              {routes.map((route) => (
                <option key={route.path} value={route.path}>
                  {route.path} · {route.mode}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white font-mono">{selectedRoute?.path}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-mono border ${
                selectedRoute?.mode === 'streaming'
                  ? 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10'
                  : selectedRoute?.mode === 'per-request'
                    ? 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                    : 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
              }`}>
                {selectedRoute?.mode}
              </span>
            </div>
            <div className="text-sm text-white/55 mt-3">{selectedRoute?.description}</div>
            <div className="text-xs text-white/35 mt-3">
              {selectedRoute?.mode === 'streaming'
                ? `${selectedRoute?.price} ${paymentTokenSymbol}/sec`
                : selectedRoute?.mode === 'per-request'
                  ? `${selectedRoute?.price} ${paymentTokenSymbol} per request`
                  : 'No payment required'}
            </div>
          </div>

          <label className="block">
            <span className="block text-sm text-white/70 mb-1.5">Active stream for protected routes</span>
            <select
              className="input-default w-full"
              value={selectedStreamId}
              onChange={(event) => setSelectedStreamId(event.target.value)}
              disabled={selectedRoute?.mode === 'free'}
            >
              <option value="">
                {selectedRoute?.mode === 'free' ? 'Not required for /api/free' : 'Call without a stream header'}
              </option>
              {matchingStreams.map((stream) => (
                <option key={stream.id} value={String(stream.id)}>
                  Stream #{stream.id} · {Number(stream.totalAmount || 0n) > 0 ? paymentTokenSymbol : 'Budgeted'} · active
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn-primary min-h-[44px] px-4"
            onClick={onCallRoute}
            disabled={!selectedRoute || isCallingRoute}
          >
            {isCallingRoute ? 'Calling route...' : `Call ${selectedRoute?.path}`}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-white/40 mb-3">Latest response</div>
          {routeResult ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white/60">{routeResult.path}</div>
                <div className={`rounded-full px-3 py-1 text-xs font-mono ${
                  routeResult.ok
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : routeResult.status === 402
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-red-500/15 text-red-300'
                }`}>
                  HTTP {routeResult.status}
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-white/40 mb-2">Headers</div>
                <pre className="overflow-auto text-xs text-white/65">{formatResponseBody(routeResult.headers)}</pre>
              </div>

              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-white/40 mb-2">Body</div>
                <pre className="overflow-auto text-xs text-white/72 whitespace-pre-wrap break-words">
                  {formatResponseBody(routeResult.body)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/45 leading-6">
              Call a route to inspect its live payload, payment headers, or 402 requirements.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function shortAddress(address = '') {
  if (!address) {
    return 'Unavailable';
  }
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function Streams() {
  const {
    walletAddress, paymentBalance, isProcessing, isInitialLoad, isLoadingStreams,
    incomingStreams, setIncomingStreams, outgoingStreams,
    fetchPaymentBalance, createStream, withdraw, cancel,
    formatEth, getClaimableBalance, setStatus, toast
  } = useWallet();
  const { catalog } = useProtocolCatalog();

  const [recipient, setRecipient] = useState('');
  const [amountEth, setAmountEth] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [manualStreamId, setManualStreamId] = useState('');
  const [claimableBalance, setClaimableBalance] = useState('0.0');
  const [selectedRoutePath, setSelectedRoutePath] = useState('/api/free');
  const [selectedStreamId, setSelectedStreamId] = useState('');
  const [routeResult, setRouteResult] = useState(null);
  const [isCallingRoute, setIsCallingRoute] = useState(false);

  const explorerRoutes = [PUBLIC_ROUTE, ...(catalog?.routes || [])].filter(
    (route, index, routes) => routes.findIndex((candidate) => candidate.path === route.path) === index
  );
  const compatibleStreams = outgoingStreams.filter(
    (stream) => stream?.isActive && stream?.recipient?.toLowerCase() === catalog?.payments?.recipientAddress?.toLowerCase()
  );

  const prefillStreamingRoute = (route) => {
    const pricePerSecond = Number(route?.price || 0);
    const suggestedDuration = 3600;

    if (route?.mode !== 'streaming') {
      toast.warning('This endpoint is configured for direct settlement. Use the agent console to automate it.');
      return;
    }

    setRecipient(catalog?.payments?.recipientAddress || '');
    setDurationSeconds(String(suggestedDuration));
    setAmountEth((pricePerSecond * suggestedDuration).toFixed(4));
    setStatus(`Prepared a 1 hour stream budget for ${route.path}.`);
  };

  useEffect(() => {
    if (!catalog?.routes?.length) {
      return;
    }

    setSelectedRoutePath((current) => {
      if (explorerRoutes.some((route) => route.path === current)) {
        return current;
      }
      return PUBLIC_ROUTE.path;
    });
  }, [catalog?.routes?.length]);

  useEffect(() => {
    if (!compatibleStreams.length) {
      setSelectedStreamId('');
      return;
    }

    setSelectedStreamId((current) => {
      if (current && compatibleStreams.some((stream) => String(stream.id) === String(current))) {
        return current;
      }
      return String(compatibleStreams[0].id);
    });
  }, [compatibleStreams]);

  const handleCreateStream = async (e) => {
    e.preventDefault();
    const streamId = await createStream(recipient, durationSeconds, amountEth);
    if (streamId !== null) {
      setRecipient('');
      setAmountEth('');
      setDurationSeconds('');
      setManualStreamId(String(streamId));
    }
  };

  const checkClaimableBalance = async () => {
    const id = parseInt(manualStreamId || '0', 10);
    if (!Number.isFinite(id) || id <= 0) {
      toast.warning('Enter a valid stream ID');
      return;
    }
    setStatus('Checking claimable balance...');
    const balance = await getClaimableBalance(id);
    setClaimableBalance(balance);
    setStatus('Fetched claimable balance.');
  };

  const handleWithdrawManual = async () => {
    const id = parseInt(manualStreamId || '0', 10);
    if (!Number.isFinite(id) || id <= 0) {
      toast.warning('Enter a valid stream ID');
      return;
    }
    await withdraw(id);
    await checkClaimableBalance();
  };

  const handleCallRoute = async () => {
    const selectedRoute = explorerRoutes.find((route) => route.path === selectedRoutePath);
    if (!selectedRoute) {
      return;
    }

    setIsCallingRoute(true);
    setStatus(`Calling ${selectedRoute.path}...`);

    try {
      const result = await callRoute(selectedRoute.path, {
        streamId: selectedRoute.mode === 'free' ? undefined : selectedStreamId || undefined,
      });
      setRouteResult({
        ...result,
        path: selectedRoute.path,
      });
      setStatus(`Received HTTP ${result.status} from ${selectedRoute.path}.`);
    } catch (error) {
      console.error('Route call failed', error);
      setRouteResult({
        ok: false,
        status: 0,
        path: selectedRoute.path,
        headers: {},
        body: { error: error.message || 'Route call failed' },
      });
      setStatus(`Route call failed for ${selectedRoute.path}.`);
      toast.error(error.message || 'Unable to call the route right now.', { title: 'Route call failed' });
    } finally {
      setIsCallingRoute(false);
    }
  };

  // Live claimable ticker
  const tickerRef = useRef(null);
  useEffect(() => {
    if (!incomingStreams.length) return;
    const tick = () => {
      setIncomingStreams((prev) =>
        prev.map((s) => {
          if (!s.isActive) return s;
          const now = Math.floor(Date.now() / 1000);
          const cappedNow = Math.min(now, s.stopTime);
          const elapsed = Math.max(0, cappedNow - s.startTime);
          const streamed = BigInt(elapsed) * BigInt(s.flowRate);
          const claimable = streamed > BigInt(s.amountWithdrawn) ? streamed - BigInt(s.amountWithdrawn) : 0n;
          return { ...s, claimableInitial: claimable };
        })
      );
    };
    tickerRef.current = setInterval(tick, 1000);
    return () => clearInterval(tickerRef.current);
  }, [incomingStreams.length, setIncomingStreams]);

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ArrowRightLeft className="w-16 h-16 text-white/60 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-white/60 text-center max-w-md">
          Connect your wallet to create and manage payment streams.
        </p>
      </div>
    );
  }

  if (isInitialLoad && isLoadingStreams) {
    return (
      <div className="space-y-4 animate-fade-in">
        {[...Array(3)].map((_, i) => <SkeletonStreamCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 md:space-y-12 animate-fade-in">
      {/* Payment Balance Card */}
      <section className="card-glass p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <Coins className="w-5 h-5" /> {paymentTokenDisplayName} Balance
            </h3>
            <p className="text-2xl font-mono text-cyan-300">
              {Number(paymentBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} {paymentTokenSymbol}
            </p>
            <p className="text-xs text-white/50 mt-1 font-mono truncate">
              Token: {paymentTokenAddress}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-default min-h-[44px] px-4"
              onClick={fetchPaymentBalance}
              disabled={isProcessing}
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card-glass p-4 border border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40 mb-2">
            <Globe className="w-4 h-4 text-cyan-300" /> Runtime
          </div>
          <div className="text-lg font-semibold text-white">{catalog?.network?.name || 'Westend Asset Hub'}</div>
          <div className="text-xs text-white/40 mt-1">Chain ID {catalog?.network?.chainId || '420420421'}</div>
        </div>
        <div className="card-glass p-4 border border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40 mb-2">
            <Shield className="w-4 h-4 text-emerald-300" /> Service Wallet
          </div>
          <div className="text-lg font-semibold text-white font-mono">{shortAddress(catalog?.payments?.recipientAddress)}</div>
          <div className="text-xs text-white/40 mt-1">All protected routes settle to this recipient.</div>
        </div>
        <div className="card-glass p-4 border border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40 mb-2">
            <PlugZap className="w-4 h-4 text-purple-300" /> Protected Routes
          </div>
          <div className="text-lg font-semibold text-white">{catalog?.routes?.length || 0}</div>
          <div className="text-xs text-white/40 mt-1">Use a route preset to prefill the stream form.</div>
        </div>
      </section>

      <section className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <CollapsibleSection title="Create Stream" icon={<Plus className="w-5 h-5" />} defaultOpen={true}>
          <p className="text-sm text-white/50 mb-4">
            Fund a continuous {paymentTokenSymbol} stream. Flow rate = total amount / duration.
          </p>
          <CreateStreamForm
            recipient={recipient}
            setRecipient={setRecipient}
            amountEth={amountEth}
            setAmountEth={setAmountEth}
            durationSeconds={durationSeconds}
            setDurationSeconds={setDurationSeconds}
            balance={mneeBalance}
            onSubmit={handleCreateStream}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Withdraw Funds" icon={<Wallet className="w-5 h-5" />} defaultOpen={true}>
          <p className="text-sm text-white/60 mb-4">
            Enter a stream ID to check and withdraw claimable {paymentTokenSymbol}.
          </p>
          <div className="grid grid-cols-1 gap-4">
            <label>
              <span className="block text-sm text-white/70 mb-1.5">Stream ID</span>
              <input
                type="number"
                min={1}
                placeholder="e.g. 1"
                value={manualStreamId}
                onChange={(e) => setManualStreamId(e.target.value)}
                className="input-default w-full"
              />
            </label>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                className="btn-default flex-1 min-h-[44px]"
                onClick={checkClaimableBalance}
              >
                Check Balance
              </button>
              <button
                type="button"
                className="btn-primary flex-1 min-h-[44px]"
                onClick={handleWithdrawManual}
                disabled={!manualStreamId || parseFloat(claimableBalance || '0') <= 0}
              >
                Withdraw
              </button>
            </div>

            <p className="text-sm text-white/70">
              Can Withdraw:{' '}
              <span className="font-mono text-cyan-300">
                {Number(claimableBalance || '0').toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </span>{' '}
              {paymentTokenSymbol}
            </p>
          </div>
        </CollapsibleSection>
      </section>

      <section className="card-glass p-4 md:p-6 border border-white/5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <PlugZap className="w-5 h-5 text-cyan-300" /> Protected Service Directory
            </h3>
            <p className="text-sm text-white/50 mt-1">
              Live route policy from the backend. Streaming routes can prefill the form above with the current service wallet.
            </p>
          </div>
          <div className="text-xs text-white/40 font-mono">
            Asset ID {catalog?.payments?.paymentAssetId || 31337}
          </div>
        </div>

        {catalog?.routes?.length ? (
          <div className="grid gap-3">
            {catalog.routes.map((route) => (
              <div
                key={`${route.path}-${route.mode}`}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white font-mono">{route.path}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-mono border ${
                      route.mode === 'streaming'
                        ? 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10'
                        : 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                    }`}>
                      {route.mode}
                    </span>
                  </div>
                  <div className="text-sm text-white/55">{route.description || 'Protected route'}</div>
                  <div className="text-xs text-white/35 mt-2">
                    {route.mode === 'streaming'
                      ? `${route.price} ${paymentTokenSymbol}/sec`
                      : `${route.price} ${paymentTokenSymbol} per request`}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {route.mode === 'streaming' ? (
                    <button
                      type="button"
                      className="btn-primary min-h-[40px] px-4"
                      onClick={() => prefillStreamingRoute(route)}
                    >
                      Prefill 1h Stream
                    </button>
                  ) : (
                    <div className="px-3 py-2 rounded-lg border border-white/10 text-xs text-white/40">
                      Direct-only route
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-white/35 text-sm">
            No protected routes are configured yet.
          </div>
        )}
      </section>

      <RouteExplorer
        routes={explorerRoutes}
        matchingStreams={compatibleStreams}
        selectedRoutePath={selectedRoutePath}
        setSelectedRoutePath={setSelectedRoutePath}
        selectedStreamId={selectedStreamId}
        setSelectedStreamId={setSelectedStreamId}
        routeResult={routeResult}
        isCallingRoute={isCallingRoute}
        onCallRoute={handleCallRoute}
      />

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-2">
        <StreamList
          title="Incoming Streams"
          emptyText="No incoming streams found."
          isLoading={isLoadingStreams}
          streams={incomingStreams}
          variant="incoming"
          formatEth={formatEth}
          onWithdraw={withdraw}
          onCancel={cancel}
        />
        <StreamList
          title="Outgoing Streams"
          emptyText="No outgoing streams."
          isLoading={isLoadingStreams}
          streams={outgoingStreams}
          variant="outgoing"
          formatEth={formatEth}
          onCancel={cancel}
        />
      </div>
    </div>
  );
}
