const FEATURES = [
  {
    title: 'x402 Service Discovery',
    desc: 'Standard HTTP 402 responses. Any AI agent hits your API and gets DOT payment requirements automatically — no custom integration.',
    color: 'text-flowpay-400', span: 'md:col-span-2',
    extra: (
      <div className="mt-4 rounded-lg bg-surface-900 border border-surface-700 p-3 font-mono text-xs space-y-1">
        <div><span className="text-surface-500">GET</span> <span className="text-flowpay-300">/api/weather</span></div>
        <div><span className="text-warning-400">← 402</span> <span className="text-surface-300">Payment Required</span></div>
        <div className="pl-2 text-surface-400">X-Payment-Mode: <span className="text-success-400">streaming</span></div>
        <div className="pl-2 text-surface-400">X-FlowPay-Rate: <span className="text-flowpay-400">0.0001 DOT/sec</span></div>
        <div><span className="text-success-400">→ 200</span> <span className="text-surface-300">OK + Data</span></div>
      </div>
    ),
  },
  {
    title: 'Autonomous DOT Payments',
    desc: 'Agents pay for API access with DOT on Polkadot EVM — no human intervention, no gas surprises.',
    color: 'text-flowpay-400', span: '',
  },
  {
    title: 'RWA Physical Access',
    desc: 'Stream DOT to unlock real-world assets — smart locks, IoT ignition, PLC controllers. Owner keeps the NFT and all financial rights.',
    color: 'text-success-400', span: '',
  },
  {
    title: 'Gemini AI Engine',
    desc: 'Google Gemini analyzes usage patterns and selects streaming vs per-request payment mode in real-time.',
    color: 'text-accent-400', span: '', glow: 'hover:shadow-glow-accent',
  },
  {
    title: 'Hybrid Payment Modes',
    desc: 'Per-request for low volume, streaming for high frequency. SDK switches automatically — one signature, unlimited requests.',
    color: 'text-flowpay-300', span: '',
  },
  {
    title: 'Human Safety Controls',
    desc: 'Kill switches, rate limiters, daily budget caps, fleet freeze, and emergency pause — full oversight at all times.',
    color: 'text-success-400', span: 'md:col-span-2',
    extra: (
      <div className="mt-4 flex flex-wrap gap-3">
        {[{ label: 'Rate Limit', on: true }, { label: 'Budget Cap', on: true }, { label: 'Fleet Freeze', on: true }, { label: 'Emergency Pause', on: false }].map(t => (
          <div key={t.label} className="flex items-center gap-2 bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 font-mono text-xs">
            <span className={`w-2 h-2 rounded-full ${t.on ? 'bg-success-500 animate-pulse' : 'bg-surface-600'}`} aria-hidden="true" />
            <span className="text-surface-300">{t.label}</span>
            <span className={t.on ? 'text-success-400' : 'text-surface-500'}>{t.on ? 'ON' : 'OFF'}</span>
          </div>
        ))}
      </div>
    ),
  },
];

export default function LandingFeatures() {
  return (
    <section id="use-cases" className="w-full bg-surface-900 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-3 mb-16">
          <p className="text-flowpay-400 text-sm font-semibold uppercase tracking-widest font-mono">Features</p>
          <h2 className="text-4xl lg:text-5xl font-bold text-white">Built for the agent economy.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className={`bg-surface-800/60 backdrop-blur border border-surface-700 rounded-2xl p-6 hover:border-flowpay-500/40 hover:shadow-glow transition-all duration-300 ${f.span || ''} ${f.glow || ''}`}>
              <h3 className={`text-lg font-semibold mb-2 ${f.color}`}>{f.title}</h3>
              <p className="text-surface-300 text-sm leading-relaxed">{f.desc}</p>
              {f.extra}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
