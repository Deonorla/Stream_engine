export default function LandingHowItWorks({
  networkName = 'Stellar Testnet',
  tokenSymbol = 'USDC',
}) {
  const steps = [
    {
      num: '01',
      title: 'Service Discovery',
      desc: 'Agent hits any API → server returns HTTP 402 → x402 manifest describes payment options automatically.',
      border: 'hover:border-stream-500/40',
      badge: null,
      icon: (
        <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="13" cy="13" r="4" strokeLinecap="round"/>
          <path d="M13 3v3M13 20v3M3 13H6M20 13h3" strokeLinecap="round"/>
          <path d="M6.2 6.2l2.1 2.1M17.7 17.7l2.1 2.1M6.2 19.8l2.1-2.1M17.7 8.3l2.1-2.1" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      num: '02',
      title: 'Agent Policy Chooses',
      desc: 'The runtime inspects route policy and usage patterns, then chooses direct settlement for low volume or a reusable stream for high-frequency access.',
      color: 'text-accent-400',
      border: 'hover:border-accent-500/40',
      badge: 'Policy Engine',
      icon: (
        <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="13" cy="13" r="3"/>
          <circle cx="5" cy="7" r="2"/><circle cx="21" cy="7" r="2"/>
          <circle cx="5" cy="19" r="2"/><circle cx="21" cy="19" r="2"/>
          <path d="M7 8l4 3M19 8l-4 3M7 18l4-3M19 18l-4-3" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      num: '03',
      title: 'Stream Executes',
      desc: `${tokenSymbol} is funded into the payment session rail on ${networkName} and metered to the service wallet or asset owner. Cancellation always returns the unused balance.`,
      color: 'text-success-400',
      border: 'hover:border-success-500/40',
      badge: null,
      icon: (
        <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 13 Q7 7 13 13 Q19 19 23 13" strokeLinecap="round"/>
          <path d="M3 17 Q7 11 13 17 Q19 23 23 17" strokeLinecap="round" opacity="0.4"/>
        </svg>
      ),
    },
  ];

  return (
    <section id="protocol" className="w-full bg-surface-950 py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-3 mb-16">
          <p className="text-stream-400 text-sm font-semibold uppercase tracking-widest font-mono">How it works</p>
          <h2 className="text-4xl lg:text-5xl font-bold text-white">One runtime. {networkName}. Infinite agents.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 relative">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              <div className={`bg-surface-800 border border-surface-700 rounded-2xl p-6 shadow-card ${step.border} hover:shadow-card-hover transition-all duration-300 h-full group`}>
                <div className="flex items-start justify-between mb-4">
                  <span className={`text-5xl font-bold font-mono ${step.color} opacity-20 group-hover:opacity-40 transition-opacity duration-300`}>{step.num}</span>
                  {step.badge && <span className="text-xs px-2 py-1 rounded-full bg-accent-500/20 text-accent-300 border border-accent-500/30 font-mono">{step.badge}</span>}
                </div>
                <div className={`mb-3 ${step.color}`}>{step.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-surface-300 text-sm leading-relaxed">{step.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3 z-10 items-center" aria-hidden="true">
                  <div className="w-5 h-px bg-stream-500/40" />
                  <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                    <path d="M1 1l6 5-6 5" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
