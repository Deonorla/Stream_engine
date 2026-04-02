import { ArrowRight, Cpu, Play, Search, ShieldCheck, Layers, CheckCircle, Terminal, UserCheck, Gauge, Fingerprint, Ban, CreditCard, Key } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-on-surface font-body overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 glass-nav">
        <div className="flex justify-between items-center px-4 sm:px-8 h-16 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tighter text-slate-900 font-headline">
              <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                <path d="M4 14 Q8 8 14 14 Q20 20 24 14" stroke="#1a3de6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <path d="M4 18 Q8 12 14 18 Q20 24 24 18" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
                <circle cx="14" cy="14" r="2.5" fill="#1a3de6"/>
              </svg>
              Stream Engine
            </Link>
            <div className="hidden md:flex gap-6 items-center">
              
            </div>
          </div>
          <Link to="/app" className="ethereal-gradient text-white px-6 py-2 rounded-xl font-headline text-sm font-medium hover:opacity-80 transition-all shadow-lg shadow-blue-500/20">
            Launch App
          </Link>
        </div>
      </nav>

      <main className="pt-16">
        {/* Hero */}
        <section className="relative min-h-screen flex items-center px-4 sm:px-6 md:px-20 overflow-hidden bg-white">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <h2 className="text-[25vw] font-headline font-black leading-none text-transparent" style={{ WebkitTextStroke: '2px #eceef0' }}>
              ST-09
            </h2>
          </div>
          <div className="relative z-20 max-w-2xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="flex items-center gap-4 mb-8 text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 font-headline">
              <span>Stellar Testnet</span>
              <div className="w-12 h-[1px] bg-slate-200"></div>
              <span>x402 Live</span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
              className="font-headline text-4xl sm:text-6xl md:text-8xl font-bold tracking-tighter text-on-surface mb-8 leading-[0.9]">
              The Economy Layer <br/>for <span className="text-primary">Autonomous Agents.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}
              className="text-lg md:text-xl text-on-surface-variant max-w-lg font-medium leading-relaxed mb-12">
              Agents discover, rent, and trade tokenized real-world assets using programmable payment streams on Stellar.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col sm:flex-row items-center gap-6">
              <Link to="/app" className="ethereal-gradient text-white px-10 py-5 rounded-full font-headline text-lg font-bold shadow-2xl shadow-blue-500/20 hover:opacity-90 transition-all">
                Launch Agent
              </Link>
              <button className="flex items-center gap-2 group">
                <span className="w-10 h-10 flex items-center justify-center rounded-full border border-slate-200 group-hover:bg-surface transition-colors">
                  <Play size={16} className="fill-current" />
                </span>
                <span className="font-headline font-bold text-sm uppercase tracking-widest">Watch Demo</span>
              </button>
            </motion.div>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-1/2 z-10 hidden lg:block">
            <motion.img
              initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.2, ease: 'easeOut' }}
              alt="Cybernetic Architect"
              className="h-full w-full object-contain object-right-bottom"
              src="/images/Untitled.png"
            />
          </div>
        </section>

        {/* Features */}
        <section className="py-24 px-6 bg-surface-container-low">
          <div className="max-w-7xl mx-auto">
            <h2 className="font-headline text-3xl font-bold text-center mb-4">Built for agents, not humans</h2>
            <p className="text-on-surface-variant text-center mb-16 max-w-xl mx-auto">Three primitives. One autonomous payment stack.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Cpu,
                  title: 'Agent Payment Sessions',
                  color: 'text-primary', bg: 'bg-blue-50',
                  points: [
                    'Agent opens a session once with USDC or XLM',
                    'Calls protected APIs using X-FlowPay-Stream-ID',
                    'Middleware meters usage — no human signing per call',
                    'Gemini-powered brain decides when to top up',
                  ],
                },
                {
                  icon: Layers,
                  title: 'Agent-Traded RWA Assets',
                  color: 'text-purple-600', bg: 'bg-purple-50',
                  points: [
                    'Humans mint verified rental asset NFTs once',
                    'Agents autonomously trade or rent on behalf of owners',
                    'Yield streams per-second to the NFT holder',
                    'Flash advance the full remaining balance anytime',
                  ],
                },
                {
                  icon: Gauge,
                  title: 'Per-Second Micropayments',
                  color: 'text-secondary', bg: 'bg-teal-50',
                  points: [
                    'Stream USDC or XLM to any Stellar address',
                    'Set amount and duration — flow rate is automatic',
                    'Cancel anytime for a pro-rata refund',
                    'Incoming streams claimable in real time',
                  ],
                },
              ].map(({ icon: Icon, title, color, bg, points }, i) => (
                <motion.div key={i} whileHover={{ y: -8 }} className="p-8 bg-surface-container-lowest rounded-3xl border border-slate-100 hover:shadow-xl transition-all duration-300 flex flex-col gap-6">
                  <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center`}>
                    <Icon size={28} className={color} />
                  </div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">{title}</h3>
                  <ul className="space-y-3">
                    {points.map((p, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-on-surface-variant">
                        <CheckCircle size={16} className={`${color} mt-0.5 shrink-0`} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-24 bg-surface px-6">
          <div className="max-w-7xl mx-auto">
            <h2 className="font-headline text-3xl font-bold text-center mb-16">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
              <div className="hidden md:block absolute top-12 left-0 w-full h-[1px] bg-slate-200 z-0"></div>
              {[
                { icon: Search, step: '01', title: 'Open a Session', desc: 'Connect Freighter and open a reusable x402 payment session. The backend issues a session meter — no per-request signing needed.' },
                { icon: ShieldCheck, step: '02', title: 'Middleware Validates', desc: 'Every API call carries an X-FlowPay-Stream-ID header. The middleware checks the session balance and unlocks the protected route.' },
                { icon: Layers, step: '03', title: 'USDC or XLM Settles', desc: 'Consumed value is tracked per-second. Pay in USDC or XLM. Cancel anytime for a pro-rata refund. Yield streams on RWA assets settle the same way.' },
              ].map(({ icon: Icon, step, title, desc }, i) => (
                <motion.div key={i} whileInView={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} viewport={{ once: true }} transition={{ delay: i * 0.2 }} className="relative z-10 space-y-6">
                  <div className="w-16 h-16 rounded-full bg-white shadow-xl flex items-center justify-center text-primary border border-blue-100">
                    <Icon size={32} />
                  </div>
                  <h3 className="font-headline text-2xl font-bold">{step}. {title}</h3>
                  <p className="text-on-surface-variant leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
        <section className="py-24 px-6 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <h2 className="font-headline text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">Built for payments that never stop</h2>
              <p className="text-on-surface-variant max-w-xl">A full-stack protocol layer for AI agents, API providers, and RWA owners to transact without friction.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-8 bg-surface-container-lowest rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col justify-between overflow-hidden relative group">
                <div>
                  <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label text-[10px] font-bold uppercase tracking-wider mb-4 inline-block">x402 Protocol</span>
                  <h3 className="font-headline text-3xl font-bold mb-4">Reusable Payment Sessions</h3>
                  <p className="text-on-surface-variant max-w-md">Open one session, call protected routes as many times as your balance allows. No wallet pop-up on every request.</p>
                </div>
                <div className="mt-8 h-48 bg-blue-50 rounded-xl flex items-center justify-center px-6 overflow-hidden relative border border-blue-100">
                  <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, #bfdbfe 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                  <div className="relative z-10 w-full flex items-center justify-between gap-2 text-xs font-mono">
                    {/* Agent */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-white border border-blue-200 shadow-sm flex items-center justify-center">
                        <Cpu size={20} className="text-primary" />
                      </div>
                      <span className="text-primary text-[10px] font-bold">Agent</span>
                    </div>
                    {/* Arrow + header label */}
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-slate-500 text-[9px] whitespace-nowrap">POST /api/premium</span>
                      <div className="w-full flex items-center gap-1">
                        <div className="flex-1 h-[1px] bg-gradient-to-r from-blue-600 to-purple-500" />
                        <span className="text-purple-500 text-[10px]">▶</span>
                      </div>
                      <span className="text-[9px] text-purple-600 whitespace-nowrap font-semibold">X-FlowPay-Stream-ID</span>
                    </div>
                    {/* Middleware */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-white border border-purple-200 shadow-sm flex items-center justify-center">
                        <ShieldCheck size={20} className="text-purple-600" />
                      </div>
                      <span className="text-purple-600 text-[10px] font-bold">Middleware</span>
                    </div>
                    {/* Arrow + status */}
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-slate-500 text-[9px]">✓ Balance OK</span>
                      <div className="w-full flex items-center gap-1">
                        <div className="flex-1 h-[1px] bg-gradient-to-r from-purple-500 to-secondary" />
                        <span className="text-secondary text-[10px]">▶</span>
                      </div>
                      <span className="text-[9px] text-secondary font-semibold">200 OK</span>
                    </div>
                    {/* Route */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-white border border-teal-200 shadow-sm flex items-center justify-center">
                        <Key size={20} className="text-secondary" />
                      </div>
                      <span className="text-secondary text-[10px] font-bold">Route</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="md:col-span-4 flex flex-col gap-6">
                <div className="flex-1 bg-tertiary text-white rounded-3xl p-8 shadow-xl flex flex-col justify-between">
                  <CreditCard size={40} />
                  <div>
                    <h4 className="font-headline text-2xl font-bold mb-2">USDC & XLM on Stellar</h4>
                    <p className="text-tertiary-fixed text-sm">Instant settlement via Stellar SAC. Pay in USDC or XLM.</p>
                  </div>
                </div>
                <div className="flex-1 bg-surface-container-high rounded-3xl p-8 border border-slate-100 flex flex-col justify-between">
                  <Key size={40} className="text-primary" />
                  <div>
                    <h4 className="font-headline text-2xl font-bold mb-2 text-on-surface">RWA Yield Streams</h4>
                    <p className="text-on-surface-variant text-sm">Tokenize rental assets and stream yield to NFT holders.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RWA Studio Section */}
        <section className="py-24 px-6 bg-surface overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row items-start gap-16">
              <div className="flex-1">
                <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label text-[10px] font-bold uppercase tracking-wider mb-6 inline-block">RWA Studio</span>
                <h2 className="font-headline text-3xl sm:text-4xl md:text-5xl font-bold mb-6">Tokenize real-world assets. Stream the yield.</h2>
                <p className="text-on-surface-variant text-lg mb-8 leading-relaxed">RWA Studio lets you mint a verified digital twin of any productive rental asset — real estate, vehicles, or equipment — as an NFT on Stellar. Evidence stays private; only the attestation root is anchored on-chain.</p>
                <ul className="space-y-5 mb-10">
                  {[
                    { title: 'Mint a Verified NFT', desc: 'Upload title deeds and valuations. The backend hashes evidence privately and anchors the root on-chain.' },
                    { title: 'Attestation & Compliance', desc: 'Issuers are onboarded once. Attestors verify the asset. Compliance guard enforces jurisdiction rules.' },
                    { title: 'Stream Yield to Holders', desc: 'Fund a yield pool in USDC. The stream drips to the NFT owner per-second for the rental duration.' },
                    { title: 'Flash Advance', desc: 'Need liquidity now? Claim the full remaining yield in one transaction before the stream ends.' },
                  ].map(({ title, desc }, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <CheckCircle size={20} className="text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold text-on-surface">{title}</p>
                        <p className="text-sm text-on-surface-variant">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link to="/app/rwa" className="ethereal-gradient text-white px-8 py-4 rounded-xl font-headline font-bold inline-flex items-center gap-3 hover:opacity-90 transition-all shadow-lg shadow-blue-500/20">
                  <Layers size={20} /> Open RWA Studio
                </Link>
              </div>
              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { icon: ShieldCheck, label: 'Verification Status', value: 'Verified', sub: 'Evidence root anchored', color: 'text-secondary', bg: 'bg-secondary-container' },
                  { icon: Fingerprint, label: 'Issuer Onboarding', value: 'Explicit', sub: 'No owner-only surprises', color: 'text-primary', bg: 'bg-blue-50' },
                  { icon: Gauge,       label: 'Yield Flow Rate',   value: '0.0023 USDC/s', sub: 'Per-second streaming', color: 'text-purple-600', bg: 'bg-purple-50' },
                  { icon: UserCheck,   label: 'Attestation Roles', value: '7 roles', sub: 'Surveyor · Legal · Valuer…', color: 'text-amber-600', bg: 'bg-amber-50' },
                  { icon: Ban,         label: 'Compliance Guard',  value: 'Active', sub: 'Freeze · Dispute · Revoke', color: 'text-red-500', bg: 'bg-red-50' },
                  { icon: Terminal,    label: 'Evidence Storage',  value: 'Private', sub: 'Only hash anchored on-chain', color: 'text-slate-600', bg: 'bg-slate-100' },
                ].map(({ icon: Icon, label, value, sub, color, bg }, i) => (
                  <motion.div key={i} whileHover={{ y: -4 }} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4`}>
                      <Icon size={20} className={color} />
                    </div>
                    <p className="text-[10px] font-label font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                    <p className="font-headline font-bold text-on-surface">{value}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{sub}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto rounded-[3rem] ethereal-gradient p-12 md:p-24 text-center text-white relative overflow-hidden">
            <h2 className="font-headline text-3xl sm:text-4xl md:text-6xl font-bold mb-8 relative z-10 leading-tight">Deploy agents. Stream payments. Trade assets.</h2>
            <p className="text-xl mb-12 opacity-90 max-w-2xl mx-auto relative z-10">The autonomous payment infrastructure for the next generation of AI agents on Stellar.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
              <Link to="/app" className="bg-white text-primary px-10 py-5 rounded-full font-headline text-lg font-bold hover:scale-105 transition-transform shadow-xl">
                Get Started
              </Link>
              {/* <button className="bg-white/10 backdrop-blur-md text-white border border-white/20 px-10 py-5 rounded-full font-headline text-lg font-bold hover:bg-white/20 transition-all">
                Contact Sales
              </button> */}
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full py-12 border-t border-slate-100 bg-white">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 max-w-7xl mx-auto gap-8">
          <p className="font-headline text-xs uppercase tracking-widest text-slate-400">© 2026 Stream Engine. x402 · Stellar · RWA.</p>
          {/* <div className="flex flex-wrap justify-center gap-6">
            {['Privacy Policy', 'Terms of Service', 'Github', 'Discord', 'Twitter'].map(l => (
              <a key={l} className="font-headline text-xs uppercase tracking-widest text-slate-400 hover:text-blue-500 transition-colors" href="#">{l}</a>
            ))}
          </div> */}
        </div>
      </footer>
    </div>
  );
}
