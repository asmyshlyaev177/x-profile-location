import { CHROME_STORE_URL, DONATE_URL } from '../utils/constants'
import { Wordmark } from './Wordmark'

const LINKS: { heading: string; items: { label: string; href: string }[] }[] = [
  {
    heading: 'The extension',
    items: [
      { label: 'Screenshots', href: '/#proof' },
      { label: 'How it works', href: '/#how' },
      { label: 'Features', href: '/#features' },
      { label: 'Chrome Web Store', href: CHROME_STORE_URL },
      { label: 'Support the project', href: DONATE_URL },
    ],
  },
  {
    heading: 'Guides',
    items: [
      { label: 'X “About this account”', href: '/x-about-this-account' },
      {
        label: 'Spotting engagement farming',
        href: '/spot-engagement-farming',
      },
    ],
  },
  {
    heading: 'Small print',
    items: [
      { label: 'Privacy policy', href: '/privacy-policy' },
      { label: 'What is not collected', href: '/#privacy' },
      { label: 'Contact', href: 'mailto:asmyshlyaev177+x-ext@gmail.com' },
    ],
  },
]

export function Footer() {
  return (
    <footer class="border-hair border-t">
      <div class="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p class="text-faint mt-4 max-w-[34ch] text-[0.8125rem] leading-relaxed">
            A country flag on every X profile, taken from X’s own data. Built by
            one person, with no company behind it.
          </p>
          <p class="t-data mt-5">Version {__EXT_VERSION__}</p>
        </div>

        {LINKS.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 class="t-data">{group.heading}</h2>
            <ul class="mt-4 space-y-2.5">
              {group.items.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    class="text-body hover:text-signal text-[0.875rem] transition-colors duration-150"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div class="shell border-hair flex flex-col gap-3 border-t py-6 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-faint text-[0.8125rem]">
          © {new Date().getFullYear()} X-Pat
        </p>
        <p class="text-faint text-[0.8125rem]">
          Not affiliated with X Corp. Location data comes from X’s own public
          endpoints.
        </p>
      </div>
    </footer>
  )
}
