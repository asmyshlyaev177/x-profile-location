import { Hero } from './components/Hero'
import { SeeItInAction } from './components/SeeItInAction'
import { Features } from './components/Features'
import { CTA } from './components/CTA'
import './index.css'

export function App() {
  return (
    <main>
      <Hero />
      <SeeItInAction />
      <Features />
      <CTA />
    </main>
  )
}
