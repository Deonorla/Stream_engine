
const TESTIMONIALS = [
  {
    user: '@infra_nwachukwu',
    role: 'Backend Engineer',
    quote: 'Replaced our billing layer with Stream Engine in 4 days. Agents now negotiate USDC payment mode dynamically with zero manual config.',
  },
  {
    user: '@rwa_builder',
    role: 'DeFi Protocol Lead',
    quote: 'The RWA module is insane. We tokenized a real estate portfolio on Polkadot and yields started streaming on-chain within an hour.',
  },
  {
    user: '@ai_agent_dev',
    role: 'AI Systems Architect',
    quote: 'x402 + Gemini AI mode selection is the missing piece for autonomous agent payments on Polkadot. This is the infrastructure we needed.',
  },
]

export default function LandingTestimonials() {
  return (
    <section className="w-full bg-surface-950 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-3 mb-16">
          <p className="text-flowpay-400 text-sm font-semibold uppercase tracking-widest font-mono">Loved by builders</p>
          <h2 className="text-4xl lg:text-5xl font-bold text-white">What builders are saying.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-surface-900 border border-surface-700 rounded-xl overflow-hidden hover:border-flowpay-500/30 hover:shadow-glow transition-all duration-300">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-800 border-b border-surface-700">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" aria-hidden="true" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" aria-hidden="true" />
                <span className="ml-2 text-xs font-mono text-flowpay-400">{t.user}</span>
              </div>
              <div className="p-5 font-mono">
                <p className="text-surface-300 text-sm leading-relaxed mb-4">"{t.quote}"</p>
                <span className="text-xs bg-surface-700 text-surface-400 px-2 py-0.5 rounded">{t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
