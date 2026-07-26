import { SiteHeader } from './components/SiteHeader'
import { Hero } from './components/Hero'
import { Screenshots } from './components/Screenshots'
import { HowItWorks } from './components/HowItWorks'
import { SeeItInAction } from './components/SeeItInAction'
import { Trust } from './components/Trust'
import { CTA } from './components/CTA'
import { Footer } from './components/Footer'
import { PrivacyPolicy } from './components/PrivacyPolicy'
import './index.css'

interface AppProps {
  url?: string
}

export function App({ url }: AppProps) {
  const path =
    url ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const isPrivacyPolicy =
    path === '/privacy-policy' || path === '/privacy-policy/'

  if (isPrivacyPolicy) {
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

  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Screenshots />
        <HowItWorks />
        <SeeItInAction />
        <Trust />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
