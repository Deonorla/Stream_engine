import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function LandingCTASection() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  return (
    <section className="w-full py-28 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #050810 0%, #0f172a 40%, #1a0a2e 70%, #050810 100%)' }}>
      <div className="absolute top-0 left-0 right-0 h-px bg-flowpay-gradient opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(59,130,246,0.06) 0%, transparent 70%)' }} aria-hidden="true" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
        <div className="space-y-4">
          <h2 className="text-4xl md:text-6xl font-black text-white leading-tight">
            The economy of agents<br />runs on{' '}
            <span style={{ background: 'linear-gradient(90deg,#3b82f6,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Stream Engine.</span>
          </h2>
          <p className="text-lg text-surface-300">Join the developer beta and start streaming DOT payments in minutes.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#" className="px-8 py-4 border-2 border-white/30 text-white hover:border-white hover:bg-white/5 font-semibold rounded-xl transition-all duration-300 text-lg focus:outline-none focus:ring-2 focus:ring-white/30" aria-label="Read the Stream Engine whitepaper">Read the Whitepaper</a>
          <Link to="/app" className="px-8 py-4 font-semibold rounded-xl transition-all duration-300 text-lg focus:outline-none focus:ring-2 focus:ring-flowpay-500/50 text-white" style={{ background: 'linear-gradient(135deg,#3b82f6,#a855f7)' }} aria-label="Join the developer beta">Join Developer Beta →</Link>
        </div>
        <div>
          <form onSubmit={e => { e.preventDefault(); if (email) setSubmitted(true) }} className="max-w-md mx-auto" aria-label="Newsletter signup">
            {submitted ? (
              <p className="text-success-400 font-mono text-sm py-3">✓ You're on the list. We'll be in touch.</p>
            ) : (
              <div className="flex items-center bg-surface-900/80 border border-surface-600 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-flowpay-500/50 focus-within:border-flowpay-500/50 transition-all duration-200">
                <span className="pl-4 text-surface-500 font-mono text-sm select-none" aria-hidden="true">&gt;</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="enter your email" className="flex-1 bg-transparent px-3 py-3.5 text-white font-mono text-sm placeholder-surface-600 focus:outline-none" aria-label="Email for developer beta" required />
                <span className="pr-3 text-flowpay-400 font-mono animate-pulse" aria-hidden="true">_</span>
                <button type="submit" className="px-5 py-3.5 bg-flowpay-500 hover:bg-flowpay-600 text-white text-sm font-semibold transition-colors duration-200 focus:outline-none" aria-label="Subscribe">Subscribe</button>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
