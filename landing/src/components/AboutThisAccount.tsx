import { InstallButton } from './InstallButton'
import { useI18n } from '../i18n/context'
import { headlineGap } from '../i18n/locales'

export function AboutThisAccount() {
  const { t, locale } = useI18n()
  const g = t.guides.aboutThisAccount
  const steps = [g.steps.web, g.steps.mobile, g.steps.what]

  return (
    <article>
      <header class="relative overflow-hidden">
        <div class="graticule" aria-hidden="true" />
        <div class="shell relative pt-[clamp(3rem,5vw,4.5rem)] pb-[clamp(2.5rem,4vw,4rem)]">
          <p class="t-data">{g.kicker}</p>
          <h1 class="t-display rise mt-4 max-w-[20ch]">
            {g.titleLead}
            {headlineGap(locale.script, g.titleLead, g.titleAccent)}
            <span class="text-signal">{g.titleAccent}</span>
            {g.titleRest}
          </h1>
          <p
            class="t-lead rise mt-7 max-w-[58ch]"
            style="animation-delay:120ms"
          >
            {g.lead}
          </p>
        </div>
        <div class="hairline" />
      </header>

      <section class="band">
        <div class="shell">
          <h2 class="t-h2 reveal max-w-[22ch]">{g.whereHeading}</h2>
          <ol class="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-px">
            {steps.map((s, i) => (
              <li
                key={s.where}
                class="reveal flex flex-col sm:px-7 sm:first:ps-0 sm:last:pe-0"
                style={`animation-delay:${i * 90}ms`}
              >
                <span class="bg-signal text-void grid h-12 w-12 shrink-0 place-items-center rounded-full font-mono text-[0.9375rem] font-bold">
                  {i + 1}
                </span>
                <h3 class="t-h3 mt-6">{s.where}</h3>
                <p class="t-body mt-2.5 max-w-[40ch]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="bg-ink-1 hairline band relative">
        <div class="shell-narrow max-w-3xl!">
          <div>
            <h2 class="t-h2 reveal">{g.cantHeading}</h2>
            <div class="policy reveal mt-8 space-y-5">
              <p>{g.cant1}</p>
              <p>{g.cant2}</p>
              <p>{g.cant3}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="band">
        <div class="shell-narrow max-w-3xl!">
          <div>
            <h2 class="t-h2 reveal">{g.sameHeading}</h2>
            <div class="policy reveal mt-8 space-y-5">
              <p>{g.same1}</p>
              <p>{g.same2}</p>
              <p>{g.same3}</p>
            </div>
            <div class="reveal mt-10">
              <InstallButton size="lg" placement="guide_about_this_account" />
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}
