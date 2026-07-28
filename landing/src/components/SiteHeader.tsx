import { useEffect, useState } from 'preact/hooks'
import { InstallButton } from './InstallButton'
import { Wordmark } from './Wordmark'

// Root-relative, not bare fragments: the header renders on the guide pages too,
// where `#how` would resolve against a document that has no such section.
const LINKS = [
  { href: '/#proof', label: 'Screenshots' },
  { href: '/#how', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#privacy', label: 'Privacy' },
]

export function SiteHeader() {
  const [lifted, setLifted] = useState(false)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setLifted(window.scrollY > 24)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <header
      class="sticky top-0 z-[var(--z-sticky)] transition-colors duration-300 ease-out"
      style={
        lifted
          ? 'background:color-mix(in oklch, var(--color-void) 82%, transparent);backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--color-hair)'
          : 'border-bottom:1px solid transparent'
      }
    >
      <div class="shell flex h-[var(--header-h)] items-center justify-between gap-6">
        <Wordmark />

        {/* Four links plus a wordmark plus a button only breathe from ~1024px;
            below that the install CTA is the only thing that matters anyway. */}
        <nav aria-label="Sections" class="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              class="text-faint hover:text-text text-[0.8125rem] font-medium transition-colors duration-150"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <InstallButton size="sm" />
      </div>
    </header>
  )
}
