/* A genuine sequence, so it gets numbers. Everything else on this page does not. */
const STEPS = [
  {
    n: '1',
    title: 'You hover a profile',
    body: 'Or swipe right on a tweet, if you’re on a phone. There’s no settings page to open first; the lookup happens where your cursor already is.',
    readout: ['Trigger', 'hover · swipe · feed'],
  },
  {
    n: '2',
    title: 'Your browser asks X directly',
    body: 'It reuses the session already in your browser to make the same request the site makes when it shows you an account. Nothing of ours sits in between.',
    readout: ['Endpoint', 'x.com · AboutAccountQuery'],
  },
  {
    n: '3',
    title: 'The flag lands in the card',
    body: 'Your browser keeps the answer for 30 days, so the second look is free. There’s a button in the options page that clears it.',
    readout: ['Cache', 'local · 30 days'],
  },
]

export function HowItWorks() {
  return (
    <section id="how" class="bg-ink-1 hairline band relative scroll-mt-24">
      <div class="shell">
        <div class="mb-14 max-w-[52ch]">
          <h2 class="t-h2 reveal">Where the flag actually comes from</h2>
          <p class="t-lead reveal mt-5 max-w-none">
            Every account on X has a country on file. X keeps it behind a menu
            almost nobody opens. Nothing here guesses at an IP address or asks
            an outside database.
          </p>
        </div>

        <ol class="grid gap-10 sm:grid-cols-3 sm:gap-px">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              class="reveal flex flex-col sm:px-7 sm:first:pl-0 sm:last:pr-0"
              style={`animation-delay:${i * 90}ms`}
            >
              <div class="flex items-center gap-4 pb-6">
                <span class="bg-signal text-void grid h-12 w-12 shrink-0 place-items-center rounded-full font-mono text-[0.9375rem] font-bold">
                  {s.n}
                </span>
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    class="from-hair-strong h-px flex-1 bg-linear-to-r to-transparent"
                  />
                )}
              </div>

              <h3 class="t-h3">{s.title}</h3>
              <p class="t-body mt-2.5 max-w-[40ch]">{s.body}</p>

              {/* Pushed to the bottom so the three readouts line up even when
                  the copy above them does not run to the same depth. */}
              <dl class="border-hair mt-6 border-t pt-3 sm:mt-auto">
                <dt class="t-data">{s.readout[0]}</dt>
                <dd class="text-signal mt-1 font-mono text-[0.75rem] font-medium">
                  {s.readout[1]}
                </dd>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
