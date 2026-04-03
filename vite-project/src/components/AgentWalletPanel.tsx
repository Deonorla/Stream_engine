import { useState } from 'react';
import { Copy, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useAgentWallet } from '../hooks/useAgentWallet';
import { useAgentBalances } from '../hooks/useAgentBalances';

export default function AgentWalletPanel() {
  const { walletAddress } = useWallet();
  const { agentPublicKey, loading, error, activate } = useAgentWallet(walletAddress);
  const { xlm, usdc } = useAgentBalances(agentPublicKey);
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
    </div>
  );
}
