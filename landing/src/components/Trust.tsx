const NEVER = [
  'Your X account, cookies or session tokens',
  'Bios, display names, or anything you read',
  'Your browsing history or activity on X',
  'Anything that identifies you personally',
]

const OPTIONAL = [
  'The public handle you looked up, e.g. @jack',
  'Its flag data: location, source, VPN indicator',
  'A random install ID, so the same flag from different people counts once',
]

export function Trust() {
  return (
    <section id="privacy" class="band hairline bg-ink-1 relative scroll-mt-24">
      <div class="shell">
        <div class="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <h2 class="t-h2 reveal">
              An extension that reads your X session had better be specific.
            </h2>
            <p class="t-lead reveal mt-6">
              So here it is. Lookups go straight to x.com, the same way the
              site’s own requests do, and never through a server of ours. Your
              browser holds the results for 30 days, and the options page clears
              them whenever you want.
            </p>
            <p class="t-body reveal mt-6">
              There’s no analytics or telemetry in the extension. This website
              does use Google Analytics, for visit counts and nothing else.
            </p>
            <a
              href="/privacy-policy"
              class="text-signal hover:text-text reveal mt-7 inline-flex items-center gap-2 text-[0.9375rem] font-semibold underline decoration-1 underline-offset-[6px] transition-colors"
            >
              Read the full privacy policy
              <span aria-hidden="true">→</span>
            </a>
          </div>

          <div class="grid items-start gap-4 sm:grid-cols-2">
            <Column
              kind="never"
              title="Never sent anywhere"
              note="There’s no setting for these. The extension never reads them."
              items={NEVER}
            />
            <Column
              kind="opt"
              title="Only with the cache on"
              note="One toggle in the options page controls it. Switch it off and nothing goes out."
              items={OPTIONAL}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function Column({
  kind,
  title,
  note,
  items,
}: {
  kind: 'never' | 'opt'
  title: string
  note: string
  items: string[]
}) {
  const isNever = kind === 'never'
  return (
    <div class="reveal border-hair bg-void flex flex-col rounded-2xl border p-6">
      <h3 class="t-data flex items-center gap-2">
        <span
          class={`grid h-4 w-4 place-items-center rounded-full text-[0.625rem] font-bold ${
            isNever ? 'bg-alarm/20 text-alarm' : 'bg-signal/20 text-signal'
          }`}
          aria-hidden="true"
        >
          {isNever ? '✕' : '✓'}
        </span>
        {title}
      </h3>
      <ul class="divide-hair mt-4 divide-y">
        {items.map((it) => (
          <li key={it} class="text-body py-3 text-[0.875rem] leading-relaxed">
            {it}
          </li>
        ))}
      </ul>
      <p class="text-faint border-hair mt-2 border-t pt-4 text-[0.8125rem] leading-relaxed">
        {note}
      </p>
    </div>
  )
}
