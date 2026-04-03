import { useState } from 'react';
import { Copy, KeyRound, Loader2, ShieldCheck, Link } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useAgentWallet } from '../hooks/useAgentWallet';
import { useAgentBalances } from '../hooks/useAgentBalances';
import { agentAuthHeaders } from '../hooks/useAgentWallet';
import { getRwaApiBaseUrl } from '../services/rwaApi';
import { ACTIVE_NETWORK } from '../networkConfig';

export default function AgentWalletPanel() {
  const { walletAddress } = useWallet();
  const { agentPublicKey, loading, error, activate } = useAgentWallet(walletAddress);
  const { xlm, usdc, refresh: refreshBalances } = useAgentBalances(agentPublicKey);
  const [copied, setCopied] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustMsg, setTrustMsg] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAsset, setWithdrawAsset] = useState('USDC');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const withdraw = async () => {
    if (!withdrawAmount || !walletAddress) return;
    setWithdrawBusy(true); setWithdrawMsg('');
    try {
      const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...agentAuthHeaders() },
        body: JSON.stringify({
          assetCode: withdrawAsset,
          assetIssuer: withdrawAsset === 'USDC' ? (ACTIVE_NETWORK.paymentAssetIssuer || '') : '',
          amount: withdrawAmount,
        }),
      });
      const data = await res.json();
      setWithdrawMsg(res.ok ? `✓ Sent ${withdrawAmount} ${withdrawAsset} to your wallet` : (data.error || 'Failed'));
      if (res.ok) { setWithdrawAmount(''); refreshBalances(); }
    } catch {
      setWithdrawMsg('Request failed');
    }
    setWithdrawBusy(false);
  };

  const setupTrustline = async () => {
    setTrustBusy(true); setTrustMsg('');
    try {
      const res = await fetch(`${getRwaApiBaseUrl()}/api/agent/trustline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...agentAuthHeaders() },
        body: JSON.stringify({
          assetCode: ACTIVE_NETWORK.paymentAssetCode || 'USDC',
          assetIssuer: ACTIVE_NETWORK.paymentAssetIssuer || '',
        }),
      });
      const data = await res.json();
      setTrustMsg(res.ok ? '✓ Trustline created' : (data.error || 'Failed'));
    } catch {
      setTrustMsg('Request failed');
    }
    setTrustBusy(false);
  };

  if (!walletAddress) return (
    <div className="flex flex-col items-center gap-2 py-3 text-center">
      <KeyRound size={18} className="text-slate-300" />
      <p className="text-xs text-slate-400">Connect Freighter to activate your agent wallet.</p>
    </div>
  );

  if (loading) return (
    <div className="flex items-center gap-2 py-3 text-slate-400 text-xs">
      <Loader2 size={14} className="animate-spin" /> Activating agent wallet…
    </div>
  );

  if (!agentPublicKey) return (
    <div className="flex flex-col items-center gap-3 py-2">
      <KeyRound size={18} className="text-slate-300" />
      <p className="text-xs text-slate-500 text-center">No agent wallet yet.</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={activate}
        className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all">
        Activate Agent Wallet
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-secondary text-xs font-bold">
        <ShieldCheck size={13} /> Agent wallet active
      </div>
      <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1">
        <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Agent Public Key</p>
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono text-slate-700 truncate flex-1">{agentPublicKey}</p>
          <button onClick={() => copy(agentPublicKey)} className="text-slate-400 hover:text-primary shrink-0">
            <Copy size={13} />
          </button>
        </div>
        {copied && <p className="text-[10px] text-secondary">Copied!</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[{ label: 'XLM', value: `${xlm} XLM` }, { label: 'USDC', value: `${usdc} USDC` }].map(({ label, value }) => (
          <div key={label} className="bg-slate-50 rounded-xl border border-slate-100 px-3 py-2 text-center">
            <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">{label}</p>
            <p className="text-xs font-bold text-slate-700">{value}</p>
          </div>
        ))}
      </div>

      {/* Fund agent wallet */}
      <div className="pt-1 border-t border-slate-100 space-y-2">
        <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Fund Agent Wallet</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => window.open(`https://friendbot.stellar.org/?addr=${agentPublicKey}`, '_blank', 'noopener')}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
            + XLM (Friendbot)
          </button>
          <button
            onClick={() => { copy(agentPublicKey); }}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-blue-100 bg-blue-50 text-xs font-bold text-primary hover:bg-blue-100 transition-all">
            <Copy size={11} /> Copy for USDC
          </button>
        </div>
        <p className="text-[10px] text-slate-400">To fund with USDC: copy the agent address above and send from Freighter.</p>
      </div>
      <button onClick={setupTrustline} disabled={trustBusy}
        className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all disabled:opacity-50 ${
          usdc === '0' || usdc === '0.0000000'
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}>
        {trustBusy ? <Loader2 size={12} className="animate-spin" /> : <Link size={12} />}
        {usdc === '0' || usdc === '0.0000000' ? '⚠ Setup USDC Trustline (required)' : 'Setup USDC Trustline'}
      </button>
      {trustMsg && <p className={`text-xs text-center ${trustMsg.startsWith('✓') ? 'text-secondary' : 'text-red-400'}`}>{trustMsg}</p>}

      {/* Withdraw to owner wallet */}
      <div className="pt-1 border-t border-slate-100 space-y-2">
        <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Withdraw to Owner Wallet</p>
        <div className="flex gap-2">
          <select value={withdrawAsset} onChange={e => setWithdrawAsset(e.target.value)}
            className="bg-slate-50 border border-slate-100 rounded-xl px-2 py-2 text-xs font-bold text-slate-600 focus:outline-none">
            <option>USDC</option>
            <option>XLM</option>
          </select>
          <input type="number" placeholder="Amount" value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <button onClick={withdraw} disabled={withdrawBusy || !withdrawAmount}
            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 hover:opacity-90 transition-all">
            {withdrawBusy ? <Loader2 size={12} className="animate-spin" /> : 'Send'}
          </button>
        </div>
        {withdrawMsg && <p className={`text-xs ${withdrawMsg.startsWith('✓') ? 'text-secondary' : 'text-red-400'}`}>{withdrawMsg}</p>}
      </div>
    </div>
  );
}
