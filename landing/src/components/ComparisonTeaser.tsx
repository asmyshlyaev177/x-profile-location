import { ComparisonTable } from './ComparisonTable'
import { ROWS } from '../data/comparison'
import { useI18n } from '../i18n/context'

/**
 * The homepage's five-row cut of the comparison, linking through to the full
 * page.
 *
 * Five rows rather than fifteen because this is not the comparison page — it is
 * the thing that tells a visitor a comparison page exists. The rows shown are
 * the ones flagged `headline`, which are the architectural claims; the
 * feature-tick rows are mostly parity with X-Posed and would read as padding
 * here.
 *
 * Placed after Trust on purpose. Naming a competitor before the site has said
 * what it does is a page arguing with someone the reader has not met.
 */

const HEADLINE_ROWS = ROWS.filter((r) => r.headline)

export function ComparisonTeaser() {
  const { t, href } = useI18n()

  return (
    <section id="compare" class="band relative scroll-mt-24">
      <div class="shell">
        <div class="grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:items-start lg:gap-16">
          <div>
            <h2 class="t-h2 reveal max-w-[20ch]">{t.compareTeaser.heading}</h2>
            <p class="t-lead reveal mt-6 max-w-[46ch]">
              {t.compareTeaser.lead}
            </p>
            <p class="t-body reveal mt-6 max-w-[46ch]">
              {t.compareTeaser.body}
            </p>
            <a
              href={href('/x-posed-alternative')}
              class="text-signal reveal mt-7 inline-block text-[0.9375rem] font-semibold underline decoration-1 underline-offset-4"
            >
              {t.compareTeaser.link}
            </a>
          </div>

          <div class="reveal" style="animation-delay:120ms">
            <ComparisonTable rows={HEADLINE_ROWS} />
          </div>
        </div>
      </div>

      <div class="hairline" />
    </section>
  )
}
