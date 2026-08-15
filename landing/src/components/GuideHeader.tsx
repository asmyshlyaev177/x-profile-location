import { useI18n } from '../i18n/context'
import { headlineGap } from '../i18n/locales'

/** The opening block every guide page shares: kicker, split headline, lead. */
export function GuideHeader({
  g,
}: {
  g: {
    kicker: string
    titleLead: string
    titleAccent: string
    titleRest: string
    lead: string
  }
}) {
  const { locale } = useI18n()

  return (
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
        <p class="t-lead rise mt-7 max-w-[58ch]" style="animation-delay:120ms">
          {g.lead}
        </p>
      </div>
      <div class="hairline" />
    </header>
  )
}
