import { useT } from '../i18n/context'

export function HowItWorks() {
  const t = useT()

  /* A genuine sequence, so it gets numbers. Everything else on this page does not. */
  const steps = [
    t.howItWorks.steps.hover,
    t.howItWorks.steps.ask,
    t.howItWorks.steps.land,
  ]

  return (
    <section id="how" class="bg-surface hairline band relative scroll-mt-24">
      <div class="shell">
        <div class="mb-14 max-w-[52ch]">
          <h2 class="t-h2 reveal">{t.howItWorks.heading}</h2>
          <p class="t-lead reveal mt-5 max-w-none">{t.howItWorks.lead}</p>
        </div>

        <ol class="grid gap-10 sm:grid-cols-3 sm:gap-px">
          {steps.map((s, i) => (
            <li
              key={s.title}
              class="reveal flex flex-col sm:px-7 sm:first:ps-0 sm:last:pe-0"
              style={`animation-delay:${i * 90}ms`}
            >
              <div class="flex items-center gap-4 pb-6">
                <span class="bg-accent text-bg grid h-12 w-12 shrink-0 place-items-center rounded-full font-mono text-[0.9375rem] font-bold">
                  {i + 1}
                </span>
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    class="from-line-strong h-px flex-1 bg-linear-to-r to-transparent"
                  />
                )}
              </div>

              <h3 class="t-h3">{s.title}</h3>
              <p class="t-body mt-2.5 max-w-[40ch]">{s.body}</p>

              {/* Pushed to the bottom so the three readouts line up even when
                  the copy above them does not run to the same depth. */}
              <dl class="border-line mt-6 border-t pt-3 sm:mt-auto">
                <dt class="t-data">{s.readoutKey}</dt>
                <dd class="text-accent mt-1 font-mono text-[0.75rem] font-medium">
                  {s.readoutValue}
                </dd>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
