import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-surface-900/90 backdrop-blur-md border-b border-surface-700' : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between" aria-label="Main navigation">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group" aria-label="Stella's Stream Engine home">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M4 14 Q8 8 14 14 Q20 20 24 14" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M4 18 Q8 12 14 18 Q20 24 24 18" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
            <circle cx="14" cy="14" r="2.5" fill="#3b82f6"/>
          </svg>
          <span className="text-white font-bold text-lg tracking-tight">Stella's Stream Engine</span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {['Protocol', 'Use Cases', 'Developers'].map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(' ', '-')}`}
              className="relative text-surface-200 hover:text-white transition-colors duration-200 text-sm after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-[1px] after:bg-stream-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              {link}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/app" className="px-5 py-2 bg-stream-500 hover:bg-stream-600 text-white text-sm font-semibold rounded-lg shadow-glow-sm animate-glow-pulse transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-stream-500/50" aria-label="Launch Stella's Stream Engine app">
            Launch App
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-surface-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-stream-500/50 rounded"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {menuOpen ? (
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round"/>
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile overlay */}
      {menuOpen && (
        <div className="md:hidden bg-surface-950 border-b border-surface-700 px-4 py-6 flex flex-col gap-4 animate-slide-down">
          {['Protocol', 'Use Cases', 'Developers'].map((link, i) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(' ', '-')}`}
              className="text-surface-200 hover:text-white text-lg transition-colors animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => setMenuOpen(false)}
            >
              {link}
            </a>
          ))}
          <Link
            to="/app"
            className="mt-2 px-5 py-3 bg-stream-500 hover:bg-stream-600 text-white font-semibold rounded-lg text-center transition-all duration-300"
            onClick={() => setMenuOpen(false)}
          >
            Launch App
          </Link>
        </div>
      )}
    </header>
  )
}
