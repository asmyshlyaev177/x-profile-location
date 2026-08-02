import type { VNode } from 'preact'
import { SiteHeader } from './components/SiteHeader'
import { Hero } from './components/Hero'
import { Screenshots } from './components/Screenshots'
import { HowItWorks } from './components/HowItWorks'
import { RateBudget } from './components/RateBudget'
import { SeeItInAction } from './components/SeeItInAction'
import { Trust } from './components/Trust'
import { Faq } from './components/Faq'
import { CTA } from './components/CTA'
import { Footer } from './components/Footer'
import { PrivacyPolicy } from './components/PrivacyPolicy'
import { AboutThisAccount } from './components/AboutThisAccount'
import { EngagementFarming } from './components/EngagementFarming'
import { Comparison } from './components/Comparison'
import { ComparisonTeaser } from './components/ComparisonTeaser'
import { resolveRoute } from './routes'
import './index.css'

interface AppProps {
  url?: string
}

/**
 * Guide pages share one shape — article, then the page's own FAQ, then the
 * install CTA — so they only need to name their body here. The metadata for
 * each lives in `routes.ts`.
 */
const GUIDES: Record<string, () => VNode> = {
  '/x-about-this-account': AboutThisAccount,
  '/spot-engagement-farming': EngagementFarming,
  '/x-posed-alternative': Comparison,
}

export function App({ url }: AppProps) {
  const path =
    url ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const route = resolveRoute(path)

  if (route.path === '/privacy-policy') {
    return (
      <>
        <SiteHeader />
        <main>
          <PrivacyPolicy />
        </main>
        <Footer />
      </>
    )
  }

  const Guide = GUIDES[route.path]
  if (Guide) {
    return (
      <>
        <SiteHeader />
        <main>
          <Guide />
          <Faq items={route.faq ?? []} />
          <CTA />
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Screenshots />
        {/* Above HowItWorks deliberately. "It runs out of lookups and stops
            working" is the specific way competing extensions disappoint people,
            so the answer to it is an early argument, not a footnote. */}
        <RateBudget />
        <HowItWorks />
        <SeeItInAction />
        <Trust />
        <ComparisonTeaser />
        <Faq items={route.faq ?? []} />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
