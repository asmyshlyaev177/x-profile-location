/* ───────────────────────────────────────────────────────────────────────────
   The rate limit, on the homepage: the number, the shape of the window, and a
   link out.

   Running out of lookups and quietly going dead is the specific way the
   competing extensions disappoint people, so anyone arriving with that
   experience should hit the answer early rather than after two sections about
   where the data comes from. It has to read standalone as a result, which is
   why it states the limit itself instead of assuming the reader met it
   earlier.

   The mechanism — the pacing, the reserved share, what happens when you do run
   dry — is a page of its own at `/x-rate-limit`. It was here, and three
   paragraphs plus a three-column grid is a wall of text between a visitor and
   the rest of the site.
   ─────────────────────────────────────────────────────────────────────────── */

import { useI18n } from '../i18n/context'
import type { Dict } from '../i18n/dict/en'

export function RateBudget() {
  const { t, href } = useI18n()

  return (
    <section id="budget" class="band relative scroll-mt-24">
      <div class="shell">
        <div class="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
          <div>
            <h2 class="t-h2 reveal max-w-[22ch]">{t.rateBudget.heading}</h2>
            <p class="t-lead reveal mt-6">{t.rateBudget.lead}</p>
            <a
              href={href('/x-rate-limit')}
              class="text-signal reveal mt-7 inline-block text-[0.9375rem] font-semibold underline decoration-1 underline-offset-4"
            >
              {t.rateBudget.link}
            </a>
          </div>

          <div class="reveal" style="animation-delay:120ms">
            <BudgetBar t={t} />
          </div>
        </div>
      </div>

      <div class="hairline" />
    </section>
  )
}

/* ── The window, drawn to scale ────────────────────────────────────────────
   Fifty ticks because the claim is a specific number and a generic progress
   bar would be a decoration instead of an argument. The split is the shipped
   default: 40 for background work, the last 10 held back
   (`DEFAULT_PREFETCH_SHARE = 0.8`).

   The numbers in the copy around it are the shipped defaults from
   `src/scripts/countries.ts` (LOOKUP_LIMIT_PER_WINDOW, LOOKUP_WINDOW_MINUTES,
   DEFAULT_PREFETCH_SHARE) — written into the dictionaries the same way
   HowItWorks writes the 30-day cache, since the landing site is its own
   package and importing across would drag the extension's module graph into a
   static site for three integers.
   ───────────────────────────────────────────────────────────────────────── */

const BACKGROUND_SHARE = 40
const TOTAL = 50

export function BudgetBar({ t }: { t: Dict }) {
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
