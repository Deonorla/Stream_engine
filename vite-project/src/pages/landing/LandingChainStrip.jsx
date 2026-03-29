// Active runtime strip
const ITEMS = [
  { icon: '⭐', label: 'Stellar'         },
  { icon: '⚡', label: 'x402 Protocol'   },
  { icon: '🌊', label: 'Session Meter'   },
  { icon: '⬡',  label: 'Stellar USDC'    },
  { icon: '✨', label: 'Gemini AI'       },
  { icon: '🔐', label: 'KYC/AML'         },
  { icon: '⚡', label: 'Flash Advance'   },
  { icon: '🛰️', label: 'Soroban Relay'  },
  // duplicate for seamless loop
  { icon: '⭐', label: 'Stellar'         },
  { icon: '⚡', label: 'x402 Protocol'   },
  { icon: '🌊', label: 'Session Meter'   },
  { icon: '⬡',  label: 'Stellar USDC'    },
  { icon: '✨', label: 'Gemini AI'       },
  { icon: '🔐', label: 'KYC/AML'         },
  { icon: '⚡', label: 'Flash Advance'   },
  { icon: '🛰️', label: 'Soroban Relay'  },
]

export default function LandingChainStrip() {
  return (
    <section className="w-full bg-surface-900 border-y border-surface-700 py-5 overflow-hidden" aria-label="Stellar ecosystem">
      <div className="relative flex items-center">
        <div className="flex animate-[marquee_24s_linear_infinite] whitespace-nowrap">
          {ITEMS.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-8 text-surface-500 hover:text-white opacity-50 hover:opacity-100 transition-all duration-300 font-semibold text-sm select-none"
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-surface-900 to-transparent pointer-events-none" aria-hidden="true" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-surface-900 to-transparent pointer-events-none" aria-hidden="true" />
      </div>
    </section>
  )
}
