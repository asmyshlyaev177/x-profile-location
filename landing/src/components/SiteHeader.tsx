import { useEffect, useState } from 'preact/hooks'
import { GITHUB_REPO_URL } from '../utils/constants'
import { InstallButton } from './InstallButton'
import { Wordmark } from './Wordmark'
import { LanguagePicker } from './LanguagePicker'
import { LanguageSuggest } from './LanguageSuggest'
import { useI18n } from '../i18n/context'

export function SiteHeader() {
  const { t, href } = useI18n()
  const [lifted, setLifted] = useState(false)

  // Root-relative, not bare fragments: the header renders on the guide pages
  // too, where `#how` would resolve against a document that has no such
  // section. `href()` then puts the reader's own language in front of it.
  const links = [
    { href: href('/') + '#proof', label: t.nav.screenshots },
    { href: href('/') + '#how', label: t.nav.howItWorks },
    { href: href('/') + '#features', label: t.nav.features },
    { href: href('/') + '#compare', label: t.nav.comparison },
    { href: href('/') + '#privacy', label: t.nav.privacy },
  ]

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
    <>
      <LanguageSuggest />
      <header
        class="sticky top-0 z-(--z-sticky) transition-colors duration-300 ease-out"
        style={
          lifted
            ? 'background:color-mix(in oklch, var(--bg) 82%, transparent);backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--line)'
            : 'border-bottom:1px solid transparent'
        }
      >
        <div class="shell flex h-(--header-h) items-center justify-between gap-6">
          <Wordmark />

          {/* Five links plus a wordmark plus a button only breathe from ~1024px;
              below that the install CTA is the only thing that matters anyway.
              The language picker stays at every width — someone reading the
              wrong language cannot use the page at all, which is a worse
              problem than a cramped nav. */}
          <nav
            aria-label={t.nav.sections}
            class="hidden items-center gap-7 lg:flex"
          >
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                class="text-muted hover:text-ink text-[0.8125rem] font-medium transition-colors duration-150"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div class="flex items-center gap-3">
            <LanguagePicker />

            {/* Icon-only, and kept at every width: "there is a repo" is the
                claim, and it reads from the mark alone. The label lives in
                `aria-label` and the tooltip. */}
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener"
              title={t.nav.sourceOnGitHub}
              aria-label={t.nav.sourceOnGitHub}
              class="text-muted hover:text-ink hover:border-line-strong border-line hidden size-9 items-center justify-center rounded-full border transition-colors duration-150 sm:inline-flex"
            >
              <GitHubIcon />
            </a>
            <InstallButton size="sm" placement="header" />
          </div>
        </div>
      </header>
    </>
  )
}

// Simple Icons — github
function GitHubIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}
