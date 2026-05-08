import { Hero } from './components/Hero'
import { Screenshots } from './components/Screenshots'
import { SeeItInAction } from './components/SeeItInAction'
import { CTA } from './components/CTA'
import { Footer } from './components/Footer'
import { PrivacyPolicy } from './components/PrivacyPolicy'
import './index.css'

interface AppProps {
  url?: string
}

export function App({ url }: AppProps) {
  const path = url ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const isPrivacyPolicy = path === '/privacy-policy' || path === '/privacy-policy/'

  if (isPrivacyPolicy) {
    return (
      <main>
        <PrivacyPolicy />
        <Footer />
      </main>
    )
  }

  return (
    <main>
      <Hero />
      <Screenshots />
      <SeeItInAction />
      <CTA />
      <Footer />
    </main>
  )
}
