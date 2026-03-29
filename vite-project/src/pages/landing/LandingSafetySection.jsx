import { useState } from 'react'

function Toggle({ label, defaultOn }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-surface-700 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${on ? 'bg-success-500 animate-pulse' : 'bg-surface-600'}`} aria-hidden="true" />
        <span className="font-mono text-sm text-surface-300">{label}</span>
      </div>
      <button
        role="switch" aria-checked={on} aria-label={`Toggle ${label}`}
        onClick={() => setOn(!on)}
        className={`relative w-10 h-5 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-flowpay-500/50 ${on ? 'bg-success-500' : 'bg-surface-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

export default function LandingSafetySection() {
  return (
    <section id="security" className="w-full bg-surface-900 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <p className="text-flowpay-400 text-sm font-semibold uppercase tracking-widest font-mono">Safety & Compliance</p>
            <h2 className="text-4xl lg:text-5xl font-bold text-white">Humans stay in control.</h2>
            <p className="text-surface-300 leading-relaxed">AI agents operate autonomously on the Stellar-backed runtime, but you always have the final word. Kill switches, rate limiters, and budget caps keep your system safe.</p>
            <ul className="space-y-3">
              {['Emergency pause — stop all agents instantly','Daily and per-stream USDC spending caps','Suspicious activity detection via Gemini AI','KYC/AML gate for all RWA transactions'].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-surface-300">
                  <span className="text-success-400 flex-shrink-0" aria-hidden="true">✓</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface-800 rounded-2xl border border-surface-700 p-6 shadow-card font-mono">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-surface-700">
              <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" aria-hidden="true" />
              <span className="text-sm text-surface-300">stream-engine · stellar control panel</span>
            </div>
            <div className="space-y-0">
              <Toggle label="Agent Rate Limit" defaultOn={true} />
              <Toggle label="KYC Gate" defaultOn={true} />
              <Toggle label="Human Override" defaultOn={false} />
              <Toggle label="Auto-cancel on Failure" defaultOn={true} />
            </div>
            <div className="mt-5 pt-4 border-t border-surface-700 space-y-2">
              <label className="text-xs text-surface-400 uppercase tracking-widest" htmlFor="budget-cap">Agent Budget Cap (USDC/day)</label>
              <input id="budget-cap" type="number" defaultValue="50" className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-flowpay-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-flowpay-500/50 hover:border-surface-600 transition-colors duration-200" aria-label="Agent daily budget cap in USDC" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-warning-400 text-xs font-mono">
              <span aria-hidden="true">⚠</span>
              <span>Human Override armed — agents pause on trigger</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
