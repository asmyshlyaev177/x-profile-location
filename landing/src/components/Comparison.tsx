import { InstallButton } from './InstallButton'
import { ComparisonTable } from './ComparisonTable'
import { COMPETITORS, LOSS_IDS, ROWS, SCRAPED } from '../data/comparison'
import { GITHUB_REPO_URL } from '../utils/constants'
import { GuideHeader } from './GuideHeader'
import { useI18n } from '../i18n/context'
import { fill } from '../i18n/fill'
import { rich } from '../i18n/rich'

/**
 * /x-posed-alternative — the page someone lands on after typing that query.
 *
 * Written on the assumption the reader is already suspicious. Whoever searches
 * "<competitor> alternative" has been sold to before, so the order is: name the
 * competition fairly, hand them the table, then spend a section on where the
 * competition wins. The differentiators come last, because they are only worth
 * anything once the page has proved it is not lying.
 *
 * Nothing here disparages. Every competing extension listed is a real project
 * doing a real job, two of them for far more people than this one.
 */

const ISSUES_URL = `${GITHUB_REPO_URL}/issues`

export function Comparison() {
  const { t, locale, href } = useI18n()
  const g = t.guides.comparison

  // Formatted in the reader's own locale rather than en-GB: "2 August 2026"
  // is not a date to someone reading the Japanese page. `Intl` is in every
  // browser and in Node, so this is correct in the prerender too.
  const scrapedLabel = new Date(`${SCRAPED}T00:00:00Z`).toLocaleDateString(
    locale.htmlLang,
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  )

  return (
    <article>
      <GuideHeader g={g} />

      <section class="band">
        <div class="shell">
          <h2 class="t-h2 reveal max-w-[24ch]">{g.featureHeading}</h2>
          <p class="t-body reveal mt-5 max-w-[58ch]">
            {fill(g.featureLead, { date: scrapedLabel })}
          </p>
          <div class="reveal mt-10">
            <ComparisonTable rows={ROWS} showNotes />
          </div>
        </div>
      </section>

      {/* The honest-broker section. It sits before the differentiators, not
          after them, so it reads as disclosure rather than as a concession
          tacked on once the selling is done. */}
      <section class="bg-ink-1 hairline band relative">
        <div class="shell">
          <h2 class="t-h2 reveal max-w-[24ch]">{g.aheadHeading}</h2>
          <ol class="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-px">
            {LOSS_IDS.map((id, i) => {
              const item = t.comparison.losses[id]
              return (
                <li
                  key={id}
                  class="reveal flex flex-col sm:px-7 sm:first:ps-0 sm:last:pe-0"
                  style={`animation-delay:${i * 90}ms`}
                >
                  <h3 class="t-h3">{item.title}</h3>
                  <p class="t-body mt-2.5 max-w-[40ch]">{item.body}</p>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <section class="band">
        <div class="shell-narrow max-w-3xl!">
          <h2 class="t-h2 reveal">{g.differsHeading}</h2>
          <div class="policy reveal mt-8 space-y-5">
            <p>{g.differs1}</p>
            <p>{rich(g.differs2)}</p>
            <p>{rich(g.differs3)}</p>
            <p>{rich(g.differs4)}</p>
            <p>{rich(fill(g.differs5, { href: `${href('/')}#budget` }))}</p>
          </div>

          <div class="reveal mt-10">
            <InstallButton size="lg" placement="comparison" />
          </div>
        </div>
      </section>

      <section class="bg-ink-1 hairline band relative">
        <div class="shell-narrow max-w-3xl!">
          <h2 class="t-h2 reveal">{g.sourcesHeading}</h2>
          <p class="t-body reveal mt-5">
            {rich(
              fill(g.sourcesLead, { date: scrapedLabel, href: ISSUES_URL }),
            )}
          </p>
          <ul class="policy reveal mt-8 space-y-4">
            {COMPETITORS.map((c) => (
              <li key={c.short}>
                <a
                  href={c.storeUrl}
                  rel="noopener"
                  class="text-signal underline decoration-1 underline-offset-4"
                >
                  {c.name}
                </a>
                {c.repoUrl ? (
                  <>
                    {g.sourceLabel}
                    <a
                      href={c.repoUrl}
                      rel="noopener"
                      class="text-signal underline decoration-1 underline-offset-4"
                    >
                      {c.repoUrl.replace('https://github.com/', '')}
                    </a>
                  </>
                ) : (
                  <span class="text-faint">{g.sourceNotPublished}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </article>
  )
}
