import { useI18n } from '../i18n/context'

export function Trust() {
  const { t, href } = useI18n()

  return (
    <section id="privacy" class="band hairline bg-ink-1 relative scroll-mt-24">
      <div class="shell">
        <div class="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <h2 class="t-h2 reveal">{t.trust.heading}</h2>
            <p class="t-lead reveal mt-6">{t.trust.lead}</p>
            <p class="t-body reveal mt-6">{t.trust.body}</p>
            <a
              href={href('/privacy-policy')}
              class="text-signal hover:text-text reveal mt-7 inline-flex items-center gap-2 text-[0.9375rem] font-semibold underline decoration-1 underline-offset-[6px] transition-colors"
            >
              {t.trust.readPolicy}
              {/* Flipped by the RTL build: an arrow that means "onwards" points
                  the other way when the text does. */}
              <span aria-hidden="true" class="rtl:-scale-x-100">
                →
              </span>
            </a>
          </div>

          <div class="grid items-start gap-4 sm:grid-cols-2">
            <Column
              kind="never"
              title={t.trust.neverTitle}
              note={t.trust.neverNote}
              items={t.trust.never}
            />
            <Column
              kind="opt"
              title={t.trust.optTitle}
              note={t.trust.optNote}
              items={t.trust.optional}
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
  items: readonly string[]
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
