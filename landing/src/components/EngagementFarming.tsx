import { InstallButton } from './InstallButton'
import { GuideHeader } from './GuideHeader'
import { useT } from '../i18n/context'
import { rich } from '../i18n/rich'

/* Ordered by how cheap the signal is to check, not by how damning it is. */
const SIGNAL_IDS = [
  'ratio',
  'age',
  'latency',
  'bio',
  'substance',
  'location',
] as const

export function EngagementFarming() {
  const t = useT()
  const g = t.guides.engagementFarming

  return (
    <article>
      <GuideHeader g={g} />

      <section class="band">
        <div class="shell">
          <div class="max-w-[60ch]">
            <h2 class="t-h2 reveal">{g.noVerdictHeading}</h2>
            <div class="policy reveal mt-8 space-y-5">
              <p>{g.noVerdict1}</p>
              <p>{g.noVerdict2}</p>
            </div>
          </div>

          <div class="reveal mt-14 overflow-x-auto">
            <table class="w-full min-w-[42rem] border-collapse text-start">
              <thead>
                <tr class="border-hair-strong border-b">
                  <th class="t-data pe-6 pb-3">{g.colSignal}</th>
                  <th class="t-data pe-6 pb-3">{g.colTell}</th>
                  <th class="t-data pb-3">{g.colCost}</th>
                </tr>
              </thead>
              <tbody>
                {SIGNAL_IDS.map((id) => {
                  const s = g.signals[id]
                  return (
                    <tr key={id} class="border-hair border-b align-top">
                      <td class="text-text py-4 pe-6 text-[0.9375rem] font-semibold">
                        {s.signal}
                      </td>
                      <td class="text-body py-4 pe-6 text-[0.9375rem] leading-relaxed">
                        {s.tell}
                      </td>
                      <td class="text-faint py-4 font-mono text-[0.8125rem]">
                        {s.cost}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="bg-ink-1 hairline band relative">
        <div class="shell-narrow max-w-3xl!">
          <h2 class="t-h2 reveal">{g.hiddenHeading}</h2>
          <div class="policy reveal mt-8 space-y-5">
            <p>{g.hidden1}</p>
            <p>{g.hidden2}</p>
            <p>{rich(g.hidden3)}</p>
          </div>
          <div class="reveal mt-10">
            <InstallButton size="lg" placement="guide_engagement_farming" />
          </div>
        </div>
      </section>
    </article>
  )
}
