import { useState } from 'react'

const TABS = ['Node.js', 'Python', 'Rust']

const CODE = {
  'Node.js': [
    ['keyword','import'],['plain',' { '],['class','StreamEngine'],['plain',' } '],['keyword','from'],['string'," '@stream-engine/sdk'"],['plain',';'],['nl'],
    ['keyword','const'],['plain',' agent = '],['keyword','new'],['plain',' '],['class','StreamEngine'],['plain','({'],['nl'],
    ['plain','  chain: '],['string',"'westend'"],['plain',', wallet: process.env.'],['class','USDC_KEY'],['nl'],
    ['plain','});'],['nl'],
    ['comment','// Discover service and auto-pay via x402'],['nl'],
    ['keyword','const'],['plain',' res = '],['keyword','await'],['plain',' agent.'],['fn','fetch'],['plain','('],['string',"'https://api.weatherdata.io/forecast'"],['plain',', {'],['nl'],
    ['plain','  paymentMode: '],['string',"'auto'"],['plain',','],['comment','  // Gemini AI decides'],['nl'],
    ['plain','  maxStream: '],['string',"'0.001 USDC/sec'"],['plain',','],['nl'],
    ['plain','  budget: '],['string',"'1 USDC'"],['nl'],
    ['plain','});'],
  ],
  'Python': [
    ['keyword','from'],['plain',' stream_engine '],['keyword','import'],['plain',' '],['class','StreamEngine'],['nl'],
    ['plain','agent = '],['class','StreamEngine'],['plain','(chain='],['string','"polkadot"'],['plain',')'],['nl'],
    ['comment','# x402 auto-pay on Polkadot'],['nl'],
    ['plain','res = agent.'],['fn','fetch'],['plain','('],['nl'],
    ['plain','    '],['string','"https://api.weatherdata.io/forecast"'],['plain',','],['nl'],
    ['plain','    payment_mode='],['string','"auto"'],['plain',','],['nl'],
    ['plain','    budget='],['string','"1 USDC"'],['nl'],
    ['plain',')'],
  ],
  'Rust': [
    ['keyword','use'],['plain',' stream_engine::'],['class','StreamEngine'],['plain',';'],['nl'],
    ['keyword','let'],['plain',' agent = '],['class','StreamEngine'],['plain','::'],['fn','new'],['plain','()'],['nl'],
    ['plain','    .'],['fn','chain'],['plain','('],['string','"polkadot"'],['plain',')'],['nl'],
    ['plain','    .'],['fn','build'],['plain','();'],['nl'],
    ['comment','// x402 auto-pay'],['nl'],
    ['keyword','let'],['plain',' res = agent.'],['fn','fetch'],['plain','('],['string','"https://api.weatherdata.io/forecast"'],['plain',')'],['nl'],
    ['plain','    .'],['fn','payment_mode'],['plain','('],['string','"auto"'],['plain',')'],['nl'],
    ['plain','    .'],['fn','await'],['plain','?;'],
  ],
}

const TC = { keyword:'text-purple-400', string:'text-green-400', comment:'text-surface-500 italic', class:'text-yellow-300', fn:'text-blue-400', plain:'text-surface-200' }

export default function LandingDevSection() {
  const [tab, setTab] = useState('Node.js')

  return (
    <section id="developers" className="w-full bg-surface-950 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-3 mb-12">
          <p className="text-flowpay-400 text-sm font-semibold uppercase tracking-widest font-mono">Developer Experience</p>
          <h2 className="text-4xl lg:text-5xl font-bold text-white">Ship in an afternoon.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-10 items-start">
          <div className="rounded-2xl bg-surface-900 border border-surface-700 shadow-glass overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-surface-800 border-b border-surface-700">
              <span className="w-3 h-3 rounded-full bg-red-500" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-green-500" aria-hidden="true" />
              <div className="ml-4 flex gap-1">
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1 text-xs rounded font-mono transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-flowpay-500/50 ${tab === t ? 'bg-surface-700 text-white' : 'text-surface-400 hover:text-surface-200'}`}
                    aria-pressed={tab === t}
                  >{t}</button>
                ))}
              </div>
            </div>
            <pre className="p-5 font-mono text-sm leading-6 overflow-x-auto"><code>
              {CODE[tab].map((token, i) =>
                token[0] === 'nl' ? <br key={i} /> : <span key={i} className={TC[token[0]]}>{token[1]}</span>
              )}
            </code></pre>
          </div>
          <div className="space-y-8">
            <div className="space-y-4">
              {[
                { title: 'TypeScript SDK', desc: 'Full type safety, autocomplete, and x402 handling built-in.' },
                { title: 'Auto 402 Handling', desc: 'SDK parses USDC payment requirements and pays automatically.' },
                { title: 'Gemini AI Integration', desc: 'Pass your Gemini key and let AI optimize payment mode per request.' },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-flowpay-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-flowpay-400 text-sm" aria-hidden="true">✓</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{item.title}</h3>
                    <p className="text-surface-400 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {['npm install @stream-engine/sdk','npx stream-engine init --chain polkadot','npx stream-engine deploy --network polkadot'].map(cmd => (
                <div key={cmd} className="font-mono text-sm bg-surface-900 border border-surface-700 px-4 py-2 rounded-lg text-success-400 select-all hover:border-surface-600 transition-colors duration-200">
                  <span className="text-surface-500 mr-2">$</span>{cmd}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
