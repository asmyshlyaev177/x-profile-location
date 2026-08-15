import { InstallButton } from './InstallButton'
import { GuideHeader } from './GuideHeader'
import { useT } from '../i18n/context'

export function AboutThisAccount() {
  const t = useT()
  const g = t.guides.aboutThisAccount
  const steps = [g.steps.web, g.steps.mobile, g.steps.what]

  return (
    <article>
      <GuideHeader g={g} />

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
          <h2 class="t-h2 reveal">{g.cantHeading}</h2>
          <div class="policy reveal mt-8 space-y-5">
            <p>{g.cant1}</p>
            <p>{g.cant2}</p>
            <p>{g.cant3}</p>
          </div>
        </div>
      </section>

      <section class="band">
        <div class="shell-narrow max-w-3xl!">
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
      </section>
    </article>
  )
}
