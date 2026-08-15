/* ───────────────────────────────────────────────────────────────────────────
   The rate limit, and why it isn't the ceiling it looks like.

   Placed above HowItWorks on purpose. Running out of lookups and quietly
   going dead is the specific way the competing extensions disappoint people,
   so anyone arriving with that experience should hit the answer early rather
   than after two sections about where the data comes from. It has to read
   standalone as a result, which is why it states the limit itself instead of
   assuming the reader met it earlier.

   It answers with the mechanism rather than a reassurance. The
   numbers in the copy are the shipped defaults from `src/scripts/countries.ts`
   (LOOKUP_LIMIT_PER_WINDOW, LOOKUP_WINDOW_MINUTES, DEFAULT_PREFETCH_SHARE) —
   written into the dictionaries the same way HowItWorks writes the 30-day
   cache, since the landing site is its own package and importing across would
   drag the extension's module graph into a static site for three integers.
   ─────────────────────────────────────────────────────────────────────────── */

import { useT } from '../i18n/context'
import type { Dict } from '../i18n/dict/en'

export function RateBudget() {
  const t = useT()
  const facts = [
    t.rateBudget.facts.real,
    t.rateBudget.facts.spread,
    t.rateBudget.facts.hovers,
  ]

  return (
    <section id="budget" class="band relative scroll-mt-24">
      <div class="shell">
        <div class="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-16">
          <div>
            <h2 class="t-h2 reveal max-w-[22ch]">{t.rateBudget.heading}</h2>
            <p class="t-lead reveal mt-6">{t.rateBudget.lead}</p>
            <p class="t-body reveal mt-6">{t.rateBudget.body}</p>
          </div>

          <div class="reveal" style="animation-delay:120ms">
            <BudgetBar t={t} />
          </div>
        </div>

        <ol class="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-px">
          {facts.map((f, i) => (
            <li
              key={f.title}
              class="reveal flex flex-col sm:px-7 sm:first:ps-0 sm:last:pe-0"
              style={`animation-delay:${i * 90}ms`}
            >
              <h3 class="t-h3">{f.title}</h3>
              <p class="t-body mt-2.5 max-w-[40ch]">{f.body}</p>
              <dl class="border-hair mt-6 border-t pt-3 sm:mt-auto">
                <dt class="t-data">{f.readoutKey}</dt>
                <dd class="text-signal mt-1 font-mono text-[0.75rem] font-medium">
                  {f.readoutValue}
                </dd>
              </dl>
            </li>
          ))}
        </ol>

        <p class="t-body reveal mt-14 max-w-[58ch]">{t.rateBudget.closing}</p>
      </div>

      <div class="hairline" />
    </section>
  )
}

/* ── The window, drawn to scale ────────────────────────────────────────────
   Fifty ticks because the claim is a specific number and a generic progress
   bar would be a decoration instead of an argument. The split is the shipped
   default: 35 for background work, the last 15 held back.
   ───────────────────────────────────────────────────────────────────────── */

const BACKGROUND_SHARE = 35
const TOTAL = 50

function BudgetBar({ t }: { t: Dict }) {
  return (
    <figure class="border-hair bg-ink-1 rounded-2xl border p-7">
      <figcaption class="t-data">{t.rateBudget.bar.caption}</figcaption>

      {/* 49 gaps at 3px would eat most of a phone's width and leave the ticks
          thinner than the space between them, so the gap scales with room. */}
      <div
        class="mt-5 flex gap-px sm:gap-0.75"
        role="img"
        aria-label={t.rateBudget.bar.alt}
      >
        {Array.from({ length: TOTAL }, (_, i) => (
          <span
            key={i}
            class={`h-9 flex-1 rounded-[2px] ${
              i < BACKGROUND_SHARE ? 'bg-signal/45' : 'bg-attention/70'
            }`}
          />
        ))}
      </div>

      <div class="mt-5 grid grid-cols-2 gap-6">
        <div>
          <span class="bg-signal/45 me-2 inline-block h-2 w-2 rounded-[1px] align-middle" />
          <span class="text-text text-[0.8125rem] font-semibold">
            {BACKGROUND_SHARE}
          </span>
          <p class="text-faint mt-1 text-[0.8125rem] leading-relaxed">
            {t.rateBudget.bar.backgroundNote}
          </p>
        </div>
        <div>
          <span class="bg-attention/70 me-2 inline-block h-2 w-2 rounded-[1px] align-middle" />
          <span class="text-text text-[0.8125rem] font-semibold">
            {TOTAL - BACKGROUND_SHARE}
          </span>
          <p class="text-faint mt-1 text-[0.8125rem] leading-relaxed">
            {t.rateBudget.bar.reservedNote}
          </p>
        </div>
      </div>
    </figure>
  )
}
