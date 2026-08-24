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
import { RateLimit } from './components/RateLimit'
import { Comparison } from './components/Comparison'
import { ComparisonTeaser } from './components/ComparisonTeaser'
import { NotFound } from './components/NotFound'
import { NOT_FOUND_PATH, metaFor, resolveRoute } from './routes'
import { splitLocale } from './i18n/locales'
import { I18nProvider } from './i18n/context'
import type { Dict } from './i18n/dict/en'
import './index.css'

interface AppProps {
  url?: string
  /**
   * The copy for this page's language. Supplied by whichever entry rendered
   * it — statically by `prerender.tsx`, lazily by `main.tsx` — so that `App`
   * itself never imports the registry.
   */
  dict: Dict
}

/**
 * Guide pages share one shape — article, then the page's own FAQ, then the
 * install CTA — so they only need to name their body here. The metadata for
 * each lives in the dictionaries, keyed from `routes.ts`.
 */
const GUIDES: Record<string, () => VNode> = {
  '/x-about-this-account': AboutThisAccount,
  '/spot-engagement-farming': EngagementFarming,
  '/x-rate-limit': RateLimit,
  '/x-posed-alternative': Comparison,
}

export function App({ url, dict }: AppProps) {
  const pathname =
    url ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const { locale, routePath } = splitLocale(pathname)
  const route = resolveRoute(routePath)
  const { faq } = metaFor(route, dict)

  return (
    <I18nProvider locale={locale} t={dict} routePath={route.path}>
      <Body route={route.path} faq={faq} />
    </I18nProvider>
  )
}

/**
 * Split out so every branch below sits *inside* the provider — a component
 * calling `useT()` above it would silently render English.
 */
function Body({
  route,
  faq,
}: {
  route: string
  faq: readonly { q: string; a: string }[]
}) {
  if (route === NOT_FOUND_PATH) {
    return (
      <>
        <SiteHeader />
        <main>
          <NotFound />
        </main>
        <Footer />
      </>
    )
  }

  if (route === '/privacy-policy') {
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

  const Guide = GUIDES[route]
  if (Guide) {
    return (
      <>
        <SiteHeader />
        <main>
          <Guide />
          <Faq items={faq} />
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
        {/* Third, straight after the proof. "It runs out of lookups and stops
            working" is the specific way competing extensions disappoint people,
            so the answer to it is an early argument, not a footnote. */}
        <RateBudget />
        {/* Then what you do with it, and only then the mechanism: hiding a
            country is what people arrive wanting, and where the flag comes
            from is an answer to a question they only have once they want it. */}
        {/* Straight after the rate limit: someone who already has one of these
            installed is here because it stopped answering, and that section is
            the claim the comparison then backs up. */}
        <ComparisonTeaser />
        <SeeItInAction />
        <HowItWorks />
        <Trust />
        <Faq items={faq} />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
