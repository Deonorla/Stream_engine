import { useState } from 'react';
import { ArrowRight, ArrowUpRight, ArrowDownLeft, Plus, Wallet, Shield, Zap, RefreshCw, Bot, Lock } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useAppMode } from '../context/AppModeContext';
import StreamList from '../components/StreamList';
import { supportedPaymentAssets } from '../contactInfo.js';
import Select from '../components/ui/Select';
import { useAgentWallet } from '../hooks/useAgentWallet';

const DURATION_OPTIONS = [
  { label: '1 Hour',   seconds: 3600 },
  { label: '24 Hours', seconds: 86400 },
  { label: '7 Days',   seconds: 604800 },
  { label: '30 Days',  seconds: 2592000 },
];

export default function Streams() {
  const {
    walletAddress,
    paymentBalance,
    paymentTokenSymbol,
    incomingStreams,
    outgoingStreams,
    isLoadingStreams,
    isProcessing,
    createStream,
    withdraw,
    cancel,
    formatEth,
    fetchPaymentBalance,
    refreshStreams,
    xlmBalance,
  } = useWallet();
  const { mode } = useAppMode();
  const { agentPublicKey } = useAgentWallet(walletAddress);

  const [recipient, setRecipient]   = useState('');
  const [amount, setAmount]         = useState('');
  const [duration, setDuration]     = useState(DURATION_OPTIONS[0].seconds);
  const [sessionId, setSessionId]   = useState('');
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState(
    supportedPaymentAssets[0]?.symbol || 'USDC',
  );
  const selectedAsset = supportedPaymentAssets.find((asset) => asset.symbol === selectedAssetSymbol)
    || supportedPaymentAssets[0];

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!recipient || !amount) return;
    await createStream(recipient, duration, amount, "{}", { asset: selectedAsset });
    setRecipient('');
    setAmount('');
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!sessionId) return;
    await withdraw(Number(sessionId));
    setSessionId('');
  };

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-12">

      {/* ── Agent Mode Banner ── */}
      {mode === 'agent' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl ethereal-gradient flex items-center justify-center shadow-md shadow-blue-500/20">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold font-headline text-slate-900">Autonomous Payment Streams</p>
              <p className="text-xs text-slate-400">Agent wallet signs all transactions — no Freighter required</p>
            </div>
            <div className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold ${agentPublicKey ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${agentPublicKey ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {agentPublicKey ? `Agent: ${agentPublicKey.slice(0,6)}…${agentPublicKey.slice(-4)}` : 'No agent wallet'}
            </div>
          </div>

          {!agentPublicKey ? (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
              <Lock size={16} className="text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">Create an agent wallet in <strong>My Agent</strong> to enable autonomous stream deployment.</p>
            </div>
          ) : (
            <AgentStreamDeployer
              agentPublicKey={agentPublicKey}
              outgoingStreams={outgoingStreams}
              incomingStreams={incomingStreams}
              isLoadingStreams={isLoadingStreams}
              formatEth={formatEth}
              withdraw={withdraw}
              cancel={cancel}
              refreshStreams={refreshStreams}
            />
          )}
        </div>
      )}

      {/* ── Owner Mode UI ── */}
      {mode === 'owner' && (<>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
       <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-4 right-4">
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
            </span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <Shield size={16} />
            </div>
            <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Earning</p>
          </div>
          <h4 className="text-xl font-headline font-bold text-slate-900">{incomingStreams.filter(s => !['ended','cancelled','completed'].includes(s.sessionStatus) && s.isActive !== false).length} Earning</h4>
          <p className="text-xs text-slate-400 mt-1">
            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Not connected'}
          </p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-teal-50 blur-[80px] rounded-full"></div>
          <div className="relative z-10">
            <p className="text-[10px] font-label font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Spending</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-4xl font-headline font-black text-slate-900 tracking-tighter">{outgoingStreams.filter(s => !['ended','cancelled','completed'].includes(s.sessionStatus) && s.isActive !== false).length}</h3>
              <span className="text-lg font-headline font-bold text-secondary">streams</span>
            </div>
          </div>
          <div className="relative z-10 w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center text-secondary">
            <ArrowUpRight size={28} />
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Zap size={16} />
            </div>
            <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Runtime</p>
          </div>
          <h4 className="text-xl font-headline font-bold text-slate-900">Stellar Testnet</h4>
          <p className="text-xs text-slate-400 mt-1">Soroban Node v2.0.4</p>
        </div>

        
      </div>

      {/* Deploy Payment Job + Claim Earnings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-white p-6 sm:p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-3xl font-headline font-black uppercase tracking-tighter">Create new stream</h3>
            <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 rounded-full">
              <span className={`w-2 h-2 rounded-full ${walletAddress ? 'bg-secondary animate-pulse' : 'bg-slate-300'}`}></span>
              <span className="text-[10px] font-label font-bold uppercase tracking-widest text-secondary">
                {walletAddress ? 'Agent Ready' : 'Not Connected'}
              </span>
            </div>
          </div>
          <form onSubmit={handleCreate} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* 1. Service Wallet */}
              <div className="md:col-span-1 space-y-3">
                <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400 ml-1">1. Service Wallet</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
                  placeholder="G... Stellar address"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  required
                />
              </div>

              {/* 2. Asset */}
              <div className="space-y-3">
                <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400 ml-1">2. Asset</label>
                <Select
                  options={supportedPaymentAssets.map((a) => ({ value: a.symbol, label: a.symbol, sub: a.name }))}
                  value={selectedAssetSymbol}
                  onChange={(v) => setSelectedAssetSymbol(String(v))}
                />
              </div>

              {/* 3. Budget */}
              <div className="space-y-3">
                <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400 ml-1">3. Budget</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm pr-16"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                    {selectedAsset?.symbol || 'USDC'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 ml-1">
                  Bal: {selectedAsset?.symbol === 'XLM'
                    ? `${parseFloat(xlmBalance || '0').toFixed(2)} XLM`
                    : `${parseFloat(paymentBalance || '0').toFixed(2)} ${selectedAsset?.symbol || 'USDC'}`}
                </p>
              </div>

              {/* 4. Duration */}
              <div className="space-y-3">
                <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400 ml-1">4. Duration</label>
                <Select
                  options={DURATION_OPTIONS.map((o) => ({ value: o.seconds, label: o.label }))}
                  value={duration}
                  onChange={(v) => setDuration(Number(v))}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isProcessing || !walletAddress}
              className="w-full md:w-auto px-12 py-5 bg-primary text-white rounded-2xl font-headline font-black text-lg uppercase tracking-tighter hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {isProcessing ? 'Initiating...' : <><Plus size={20} /> Initiate <ArrowRight size={20} /></>}
            </button>
          </form>
        </div>

        <div className="lg:col-span-4 bg-slate-50 p-6 sm:p-10 rounded-[2.5rem] border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm mb-8">
              <Wallet size={24} />
            </div>
            <h3 className="text-2xl font-headline font-black uppercase tracking-tighter mb-4">Claim Earnings</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-8">Enter a session ID to claim streamed funds earned by your agent.</p>
            <input
              type="text"
              className="w-full bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-200 text-sm mb-4"
              placeholder="Session ID (e.g. 42)"
              value={sessionId}
              onChange={e => setSessionId(e.target.value)}
            />
          </div>
          <button
            onClick={handleWithdraw}
            disabled={isProcessing || !sessionId || !walletAddress}
            className="w-full py-4 border-2 border-primary text-primary rounded-2xl font-label uppercase tracking-widest text-xs font-bold hover:bg-primary hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Claim Session
          </button>
        </div>
      </div>

      {/* Stream Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[
          { icon: ArrowDownLeft, label: 'Earning Streams', color: 'text-secondary', streams: incomingStreams, variant: 'incoming' },
          { icon: ArrowUpRight,  label: 'Spending Streams', color: 'text-primary',   streams: outgoingStreams, variant: 'outgoing' },
        ].map(({ icon: Icon, label, color, streams: list, variant }) => (
          <div key={label} className="space-y-6">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-3">
                <Icon className={color} size={20} />
                <h3 className="text-xl font-headline font-bold text-slate-900">{label}</h3>
              </div>
              <button onClick={refreshStreams} className="text-slate-400 hover:text-primary transition-colors">
                <RefreshCw size={16} />
              </button>
            </div>
            {list.length === 0 && !isLoadingStreams ? (
              <div className="bg-slate-50 rounded-[2.5rem] p-12 border border-slate-100 flex flex-col items-center justify-center text-center min-h-[300px]">
                <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-slate-200 mb-6">
                  <Icon size={32} />
                </div>
                <p className="text-slate-400 text-sm">
                  {variant === 'incoming' ? 'No incoming streams detected.' : "You haven't initialized any streams."}
                </p>
              </div>
            ) : (
              <StreamList
                title=""
                streams={list}
                variant={variant}
                formatEth={formatEth}
                onWithdraw={withdraw}
                onCancel={cancel}
                isLoading={isLoadingStreams}
              />
            )}
          </div>
        ))}
      </div>

      {/* Service Directory */}
      <div className="bg-slate-50 p-6 sm:p-10 rounded-[2.5rem] border border-slate-100">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-2xl font-headline font-black uppercase tracking-tighter mb-2">Protected Service Directory</h3>
            <p className="text-slate-500 text-sm">Configure backend routes that require active payment sessions.</p>
          </div>
          <button className="px-6 py-3 bg-slate-900 text-white rounded-xl font-label text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-primary transition-colors">
            <Plus size={16} /> Register Route
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white/50 border border-slate-100 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 mb-4">
                <Shield size={20} />
              </div>
              <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-300">Empty Slot</p>
            </div>
          ))}
        </div>
      </div>
      </>) } {/* end owner mode */}
    </div>
  );
}

function AgentStreamDeployer({ agentPublicKey, outgoingStreams, incomingStreams, isLoadingStreams, formatEth, withdraw, cancel, refreshStreams }) {
  const { walletAddress } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState(DURATION_OPTIONS[0].seconds);
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState(supportedPaymentAssets[0]?.symbol || 'USDC');
  const [status, setStatus] = useState<null | 'deploying' | 'ok' | 'err'>(null);
  const [errMsg, setErrMsg] = useState('');

  const selectedAsset = supportedPaymentAssets.find(a => a.symbol === selectedAssetSymbol) || supportedPaymentAssets[0];

  const handleDeploy = async (e) => {
    e.preventDefault();
    if (!recipient || !amount || !walletAddress) return;
    setStatus('deploying'); setErrMsg('');
    try {
      const { agentAuthHeaders } = await import('../hooks/useAgentWallet');
      const { getRwaApiBaseUrl } = await import('../services/rwaApi.js');
      const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...agentAuthHeaders() },
        body: JSON.stringify({
          recipient,
          totalAmount: String(Math.round(Number(amount) * 10 ** (selectedAsset.decimals || 7))),
          durationSeconds: duration,
          assetCode: selectedAsset.symbol,
          assetIssuer: selectedAsset.issuer || '',
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Deploy failed');
      setStatus('ok');
      setRecipient(''); setAmount('');
      refreshStreams();
    } catch (err: any) {
      setErrMsg(err?.message || 'Stream deployment failed.');
      setStatus('err');
    }
  };

  const agentOut = outgoingStreams.filter(s => s.sender?.toUpperCase() === agentPublicKey.toUpperCase());
  const agentIn  = incomingStreams.filter(s => s.recipient?.toUpperCase() === agentPublicKey.toUpperCase());

  return (
    <div className="space-y-8">
      {/* Deploy form */}
      <form onSubmit={handleDeploy} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div className="space-y-2">
          <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Recipient</label>
          <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)} required
            placeholder="G... Stellar address"
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Asset</label>
          <Select options={supportedPaymentAssets.map(a => ({ value: a.symbol, label: a.symbol }))}
            value={selectedAssetSymbol} onChange={v => setSelectedAssetSymbol(String(v))} compact />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Amount</label>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
            placeholder="0.00"
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400">Duration</label>
          <Select options={DURATION_OPTIONS.map(o => ({ value: o.seconds, label: o.label }))}
            value={duration} onChange={v => setDuration(Number(v))} compact />
        </div>
        <button type="submit" disabled={status === 'deploying'}
          className="md:col-span-5 w-full md:w-auto px-10 py-4 bg-primary text-white rounded-2xl font-headline font-black text-sm uppercase tracking-tighter hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
          {status === 'deploying' ? 'Deploying…' : <><Zap size={16} /> Deploy Agent Stream <ArrowRight size={16} /></>}
        </button>
      </form>
      {status === 'ok' && <p className="text-xs text-secondary">Stream deployed by agent wallet.</p>}
      {status === 'err' && <p className="text-xs text-red-500">{errMsg}</p>}

      {/* Agent streams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[
          { label: 'Agent Spending Streams', streams: agentOut, variant: 'outgoing' },
          { label: 'Agent Earning Streams',  streams: agentIn,  variant: 'incoming' },
        ].map(({ label, streams, variant }) => (
          <div key={label} className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Bot size={15} className="text-primary" />
              <h3 className="text-sm font-headline font-bold text-slate-900">{label}</h3>
              <span className="ml-auto text-xs text-slate-400">{streams.length} stream{streams.length !== 1 ? 's' : ''}</span>
            </div>
            {streams.length === 0 ? (
              <div className="bg-slate-50 rounded-3xl border border-slate-100 p-10 text-center">
                <p className="text-slate-400 text-sm">No {variant} streams from agent wallet yet.</p>
              </div>
            ) : (
              <StreamList title="" streams={streams} variant={variant} formatEth={formatEth}
                onWithdraw={withdraw} onCancel={cancel} isLoading={isLoadingStreams} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
