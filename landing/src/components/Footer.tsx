import {
  CHROME_STORE_URL,
  DONATE_URL,
  GITHUB_REPO_URL,
} from '../utils/constants'
import { Wordmark } from './Wordmark'
import { useI18n } from '../i18n/context'

export function Footer() {
  const { t, href } = useI18n()

  const groups: {
    heading: string
    items: { label: string; href: string }[]
  }[] = [
    {
      heading: t.footer.groupExtension,
      items: [
        { label: t.nav.screenshots, href: `${href('/')}#proof` },
        { label: t.nav.howItWorks, href: `${href('/')}#how` },
        { label: t.nav.features, href: `${href('/')}#features` },
        { label: t.footer.chromeWebStore, href: CHROME_STORE_URL },
        { label: t.nav.sourceOnGitHub, href: GITHUB_REPO_URL },
        { label: t.footer.supportProject, href: DONATE_URL },
      ],
    },
    {
      heading: t.footer.groupGuides,
      items: [
        {
          label: t.footer.guideAboutAccount,
          href: href('/x-about-this-account'),
        },
        {
          label: t.footer.guideEngagementFarming,
          href: href('/spot-engagement-farming'),
        },
        { label: t.footer.guideRateLimit, href: href('/x-rate-limit') },
        { label: t.footer.guideComparison, href: href('/x-posed-alternative') },
      ],
    },
    {
      heading: t.footer.groupSmallPrint,
      items: [
        // English-only, so it is linked without a locale prefix on purpose —
        // `href()` would point at a page that was never rendered.
        { label: t.footer.privacyPolicy, href: '/privacy-policy' },
        { label: t.footer.whatIsNotCollected, href: `${href('/')}#privacy` },
        {
          label: t.footer.contact,
          href: 'mailto:asmyshlyaev177+x-ext@gmail.com',
        },
      ],
    },
  ]

  return (
    <footer class="border-line border-t">
      <div class="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p class="text-muted mt-4 max-w-[34ch] text-[0.8125rem] leading-relaxed">
            {t.footer.tagline}
          </p>
          <p class="t-data mt-5">
            {t.footer.version} {__EXT_VERSION__}
          </p>
        </div>

        {groups.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 class="t-data">{group.heading}</h2>
            <ul class="mt-4 space-y-2.5">
              {group.items.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    class="text-body hover:text-accent text-[0.875rem] transition-colors duration-150"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div class="shell border-line flex flex-col gap-3 border-t py-6 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-muted text-[0.8125rem]">
          © {new Date().getFullYear()} X-Pat
        </p>
        <p class="text-muted text-[0.8125rem]">{t.footer.notAffiliated}</p>
      </div>
    </footer>
  )
}
