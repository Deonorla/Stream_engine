import { Link } from 'react-router-dom'

const LINKS = {
  Protocol:   ['x402 Standard', 'Stream Contract', 'RWA Studio', 'Westend Asset Hub'],
  Developers: ['Documentation', 'SDK Reference', 'GitHub', 'Contract Addresses'],
  Company:    ['About', 'Blog', 'Hackathon', 'Contact'],
}

export default function LandingFooter() {
  return (
    <footer className="w-full bg-surface-950 border-t border-surface-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M4 14 Q8 8 14 14 Q20 20 24 14" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <path d="M4 18 Q8 12 14 18 Q20 24 24 18" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
                <circle cx="14" cy="14" r="2.5" fill="#3b82f6"/>
              </svg>
              <span className="text-white font-bold">Stream Engine</span>
            </div>
            <p className="text-sm text-surface-500">Money moves at machine speed.</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-800 border border-surface-700 text-surface-400">Built on Westend Asset Hub</span>
            </div>
          </div>

          {Object.entries(LINKS).map(([category, items]) => (
            <div key={category} className="space-y-4">
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-widest">{category}</h3>
              <ul className="space-y-2">
                {items.map(link => (
                  <li key={link}>
                    <a href="#" className="text-sm text-surface-500 hover:text-white transition-colors duration-200">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-surface-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-surface-600">© {new Date().getFullYear()} Stream Engine. MIT License. Built on Westend Asset Hub.</p>
          <div className="flex items-center gap-6">
            {[
              { label: 'Twitter/X', href: '#', icon: <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
              { label: 'GitHub', href: 'https://github.com/ola-893/flowpay', icon: <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg> },
              { label: 'Discord', href: '#', icon: <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg> },
            ].map(({ label, href, icon }) => (
              <a key={label} href={href} className="text-surface-500 hover:text-white transition-colors duration-200" aria-label={label}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              >{icon}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
