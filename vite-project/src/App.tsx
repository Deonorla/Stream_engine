import { Link } from 'react-router-dom';
import { ACTIVE_NETWORK } from './networkConfig.js';
import { paymentAssetCode, paymentTokenSymbol } from './contactInfo.js';

export default function App() {
  return (
    <div className="min-h-screen bg-surface-950 text-white flex items-center justify-center px-6">
      <div className="max-w-xl rounded-3xl border border-white/10 bg-surface-900/70 backdrop-blur-xl p-8 text-center">
        <div className="text-xs uppercase tracking-[0.28em] text-white/40 mb-3">Legacy Entrypoint</div>
        <h1 className="text-3xl font-bold mb-4">Stella's Stream Engine now runs through the routed app shell.</h1>
        <p className="text-white/65 leading-7 mb-6">
          The current runtime is <span className="text-white">{ACTIVE_NETWORK.name}</span> with
          <span className="text-white"> {paymentTokenSymbol}</span> settled through
          <span className="text-white"> {paymentAssetCode}</span>.
        </p>
        <Link to="/" className="btn-primary inline-flex">
          Open Stella's Stream Engine
        </Link>
      </div>
    </div>
  );
}
