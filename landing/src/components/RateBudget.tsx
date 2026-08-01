/* ───────────────────────────────────────────────────────────────────────────
   The rate limit, and why it isn't the ceiling it looks like.

   Placed above HowItWorks on purpose. Running out of lookups and quietly
   going dead is the specific way the competing extensions disappoint people,
   so anyone arriving with that experience should hit the answer early rather
   than after two sections about where the data comes from. It has to read
   standalone as a result, which is why it states the limit itself instead of
   assuming the reader met it earlier.

   It answers with the mechanism rather than a reassurance. The
   numbers below are the shipped defaults from `src/scripts/countries.ts`
   (LOOKUP_LIMIT_PER_WINDOW, LOOKUP_WINDOW_MINUTES, DEFAULT_PREFETCH_SHARE) —
   hardcoded here the same way HowItWorks hardcodes the 30-day cache, since the
   landing site is its own package and importing across would drag the
   extension's module graph into a static site for three integers.
   ─────────────────────────────────────────────────────────────────────────── */

const FACTS = [
  {
    title: 'The real number',
    body: 'The budget comes from X’s own response headers, not a guess baked in at build time. Your hovers count against it too.',
    readout: ['Source', 'x-rate-limit-*'],
  },
  {
    title: 'Spread, not sprinted',
    body: 'Roughly one lookup every 26 seconds, recomputed each time — stretching when you hover a lot, tightening when the window refills.',
    readout: ['Pace', 'window ÷ budget'],
  },
  {
    title: 'Hovers always win',
    body: 'Background work stops at 70%, so the rest of the window is there for accounts you actually point at.',
    readout: ['Reserved', '15 of 50'],
  },
]

export function RateBudget() {
  return (
    <section id="budget" class="band relative scroll-mt-24">
      <div class="shell">
        <div class="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-16">
          <div>
            <h2 class="t-h2 reveal max-w-[22ch]">
              X’s rate limit, solved instead of hit.
            </h2>
            <p class="t-lead reveal mt-6">
              You have seen the failure. The top of a thread fills in, then
              nothing does. That is the limit: fifty account lookups every
              fifteen minutes, and one busy thread has more accounts than that.
            </p>
            <p class="t-body reveal mt-6">
              Most profiles here never cost one. They are already cached, or
              someone else looked them up and the shared cache answers. The rest
              is rationed.
            </p>
          </div>

          <div class="reveal" style="animation-delay:120ms">
            <BudgetBar />
          </div>
        </div>

        <ol class="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-px">
          {FACTS.map((f, i) => (
            <li
              key={f.title}
              class="reveal flex flex-col sm:px-7 sm:first:pl-0 sm:last:pr-0"
              style={`animation-delay:${i * 90}ms`}
            >
              <h3 class="t-h3">{f.title}</h3>
              <p class="t-body mt-2.5 max-w-[40ch]">{f.body}</p>
              <dl class="border-hair mt-6 border-t pt-3 sm:mt-auto">
                <dt class="t-data">{f.readout[0]}</dt>
                <dd class="text-signal mt-1 font-mono text-[0.75rem] font-medium">
                  {f.readout[1]}
                </dd>
              </dl>
            </li>
          ))}
        </ol>

        <p class="t-body reveal mt-14 max-w-[58ch]">
          Run it dry anyway and you get a countdown to the reset, not a blank
          flag. The share and the pacing are both yours to change.
        </p>
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

function BudgetBar() {
  return (
    <figure class="border-hair bg-ink-1 rounded-2xl border p-7">
      <figcaption class="t-data">One 15-minute window</figcaption>

      {/* 49 gaps at 3px would eat most of a phone's width and leave the ticks
          thinner than the space between them, so the gap scales with room. */}
      <div
        class="mt-5 flex gap-px sm:gap-0.75"
        role="img"
        aria-label="Fifty lookups per window: thirty-five available to background prefetching, fifteen reserved for the accounts you hover."
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
          <span class="bg-signal/45 mr-2 inline-block h-2 w-2 rounded-[1px] align-middle" />
          <span class="text-text text-[0.8125rem] font-semibold">35</span>
          <p class="text-faint mt-1 text-[0.8125rem] leading-relaxed">
            background, trickled out across the full fifteen minutes
          </p>
        </div>
        <div>
          <span class="bg-attention/70 mr-2 inline-block h-2 w-2 rounded-[1px] align-middle" />
          <span class="text-text text-[0.8125rem] font-semibold">15</span>
          <p class="text-faint mt-1 text-[0.8125rem] leading-relaxed">
            held back, so a hover is never the request that runs you dry
          </p>
        </div>
      </div>
    </figure>
  )
}
