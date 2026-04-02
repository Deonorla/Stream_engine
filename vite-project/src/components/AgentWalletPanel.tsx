import { useState } from 'react';
import { CheckCircle, Copy, Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import {
  createAgentWallet,
  deleteAgentWallet,
  exportAgentSecret,
  getStoredAgentWallet,
  unlockAgentWallet,
  type AgentWalletRecord,
} from '../lib/agentWallet';

export default function AgentWalletPanel() {
  const [record, setRecord] = useState<AgentWalletRecord | null>(getStoredAgentWallet);
  const [step, setStep] = useState<'idle' | 'create' | 'created'>('idle');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCreate = async () => {
    if (!password || password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    const rec = await createAgentWallet(password);
    const kp = await unlockAgentWallet(password);
    setSecret(kp?.secret() || '');
    setRecord(rec);
    setStep('created');
    setPassword(''); setConfirm('');
    setBusy(false);
  };

  const handleExport = async () => {
    if (!password) { setError('Enter your password to export.'); return; }
    setBusy(true); setError('');
    const s = await exportAgentSecret(password);
    if (!s) { setError('Wrong password.'); setBusy(false); return; }
    setSecret(s); setShowSecret(true); setPassword(''); setBusy(false);
  };

  const handleDelete = () => {
    deleteAgentWallet();
    setRecord(null); setSecret(''); setShowSecret(false); setStep('idle');
  };

  if (!record && step === 'idle') return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
        <KeyRound size={18} />
      </div>
      <p className="text-xs text-slate-500 text-center">No agent wallet yet. Create one to enable autonomous spending.</p>
      <button onClick={() => setStep('create')}
        className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all">
        Create Agent Wallet
      </button>
    </div>
  );

  if (step === 'create') return (
    <div className="space-y-3">
      <p className="text-[10px] font-label uppercase tracking-widest text-slate-400">New Agent Wallet</p>
      <input type="password" placeholder="Password (min 8 chars)" value={password}
        onChange={e => setPassword(e.target.value)}
        className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
      <input type="password" placeholder="Confirm password" value={confirm}
        onChange={e => setConfirm(e.target.value)}
        className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleCreate} disabled={busy}
          className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate Keypair'}
        </button>
        <button onClick={() => { setStep('idle'); setError(''); }}
          className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-500">
          Cancel
        </button>
      </div>
    </div>
  );

  if (step === 'created' && record) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-secondary">
        <CheckCircle size={14} />
        <p className="text-xs font-bold">Agent wallet created!</p>
      </div>
      <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1">
        <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Public Key — fund this address</p>
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono text-slate-700 truncate flex-1">{record.publicKey}</p>
          <button onClick={() => copy(record.publicKey)} className="text-slate-400 hover:text-primary shrink-0"><Copy size={13} /></button>
        </div>
      </div>
      {secret && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          <p className="text-[9px] font-label uppercase tracking-widest text-amber-600">⚠ Back up your secret key now</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-amber-800 truncate flex-1">{showSecret ? secret : '•'.repeat(56)}</p>
            <button onClick={() => setShowSecret(v => !v)} className="text-amber-500 shrink-0">
              {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button onClick={() => copy(secret)} className="text-amber-500 shrink-0"><Copy size={13} /></button>
          </div>
          <p className="text-[10px] text-amber-600">This is the only time you'll see this. Store it safely.</p>
        </div>
      )}
      {copied && <p className="text-xs text-secondary">Copied!</p>}
      <button onClick={() => { setStep('idle'); setSecret(''); }}
        className="w-full py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600 uppercase tracking-widest">
        Done
      </button>
    </div>
  );

  if (record) return (
    <div className="space-y-3">
      <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1">
        <p className="text-[9px] font-label uppercase tracking-widest text-slate-400">Agent Public Key</p>
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono text-slate-700 truncate flex-1">{record.publicKey}</p>
          <button onClick={() => copy(record.publicKey)} className="text-slate-400 hover:text-primary shrink-0"><Copy size={13} /></button>
        </div>
        {copied && <p className="text-[10px] text-secondary">Copied!</p>}
      </div>
      {!showSecret ? (
        <div className="flex gap-2">
          <input type="password" placeholder="Password to export secret" value={password}
            onChange={e => setPassword(e.target.value)}
            className="flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <button onClick={handleExport} disabled={busy}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <Eye size={13} />
          </button>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          <p className="text-[9px] font-label uppercase tracking-widest text-amber-600">Secret Key</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-amber-800 truncate flex-1">{secret}</p>
            <button onClick={() => copy(secret)} className="text-amber-500 shrink-0"><Copy size={13} /></button>
          </div>
          <button onClick={() => { setShowSecret(false); setSecret(''); }} className="text-[10px] text-amber-600 underline">Hide</button>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button onClick={handleDelete} className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-600 transition-colors">
        <Trash2 size={11} /> Delete agent wallet
      </button>
    </div>
  );

  return null;
}
