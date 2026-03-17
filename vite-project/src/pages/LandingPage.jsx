import { useEffect, useMemo, useState } from 'react'
import LandingNavbar from './landing/LandingNavbar'
import LandingHero from './landing/LandingHero'
import LandingStats from './landing/LandingStats'
import LandingHowItWorks from './landing/LandingHowItWorks'
import LandingFeatures from './landing/LandingFeatures'
import LandingRWASection from './landing/LandingRWASection'
import LandingChainStrip from './landing/LandingChainStrip'
import LandingDevSection from './landing/LandingDevSection'
import LandingSafetySection from './landing/LandingSafetySection'
import LandingTestimonials from './landing/LandingTestimonials'
import LandingCTASection from './landing/LandingCTASection'
import LandingFooter from './landing/LandingFooter'
import { useProtocolCatalog } from '../hooks/useProtocolCatalog'
import { fetchRwaAssets } from '../services/rwaApi'

export default function LandingPage() {
  const { catalog } = useProtocolCatalog()
  const [assetCount, setAssetCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetchRwaAssets()
      .then((assets) => {
        if (!cancelled) {
          setAssetCount(assets.length)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetCount(0)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const runtime = useMemo(() => {
    const routeCount = catalog?.routes?.length || 0
    const contractCount = [
      catalog?.payments?.contractAddress,
      catalog?.rwa?.hubAddress,
      catalog?.rwa?.assetNFTAddress,
      catalog?.rwa?.assetRegistryAddress,
      catalog?.rwa?.assetStreamAddress,
      catalog?.rwa?.complianceGuardAddress,
    ].filter(Boolean).length

    return {
      networkName: catalog?.network?.name || 'Westend Asset Hub',
      tokenSymbol: catalog?.payments?.tokenSymbol || 'USDC',
      paymentAssetId: catalog?.payments?.paymentAssetId || 31337,
      routeCount,
      assetCount,
      contractCount,
    }
  }, [assetCount, catalog])

  return (
    <div className="bg-surface-950 text-white overflow-x-hidden">
      <LandingNavbar />
      <main>
        <LandingHero {...runtime} />
        <LandingStats {...runtime} />
        <LandingHowItWorks {...runtime} />
        <LandingFeatures {...runtime} />
        <LandingRWASection {...runtime} />
        <LandingChainStrip />
        <LandingDevSection />
        <LandingSafetySection />
        <LandingTestimonials />
        <LandingCTASection />
      </main>
      <LandingFooter />
    </div>
  )
}
