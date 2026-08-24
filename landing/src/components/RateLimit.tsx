/* ───────────────────────────────────────────────────────────────────────────
   The rate limit in full — the three paragraphs and the three facts that used
   to sit on the homepage.

   No new copy: every string here is the `rateBudget` block the homepage
   already carried in all fifteen languages, so moving the detail out cost no
   translation. The homepage keeps the heading, the lead and the bar.
   ─────────────────────────────────────────────────────────────────────────── */

import { BudgetBar } from './RateBudget'
import { useT } from '../i18n/context'

export function RateLimit() {
  const t = useT()
  const c = t.rateBudget
  const facts = [c.facts.real, c.facts.spread, c.facts.hovers]

  return (
    <article>
      <header class="relative overflow-hidden">
        <div class="graticule" aria-hidden="true" />
        <div class="shell relative pt-[clamp(3rem,5vw,4.5rem)] pb-[clamp(2.5rem,4vw,4rem)]">
          <h1 class="t-display rise max-w-[20ch]">{c.heading}</h1>
          <p
            class="t-lead rise mt-7 max-w-[58ch]"
            style="animation-delay:120ms"
          >
            {c.lead}
          </p>
        </div>
        <div class="hairline" />
      </header>

      <section class="band">
        <div class="shell">
          <div class="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
            <p class="t-body reveal max-w-[46ch]">{c.body}</p>
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
                <h2 class="t-h3">{f.title}</h2>
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

          <p class="t-body reveal mt-14 max-w-[58ch]">{c.closing}</p>
        </div>
      </section>
    </article>
  )
}
