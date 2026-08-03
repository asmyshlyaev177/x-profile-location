import { InstallButton } from './InstallButton'

/* Ordered by how cheap the signal is to check, not by how damning it is. */
const SIGNALS = [
  {
    signal: 'Follower / following ratio',
    tell: 'Following 4,000, followed by 40',
    cost: 'One glance at the hover card',
  },
  {
    signal: 'Account age',
    tell: 'Joined three weeks ago, already deep in political threads',
    cost: 'Hover card',
  },
  {
    signal: 'Reply latency',
    tell: 'First reply within seconds, on an account with no history with the author',
    cost: 'Timestamp, if you care to look',
  },
  {
    signal: 'Bio composition',
    tell: 'A row of flags and emoji where a sentence would go',
    cost: 'Free — it is right there',
  },
  {
    signal: 'Reply substance',
    tell: 'The same stock phrase you have seen under four other posts today',
    cost: 'Memory, mostly',
  },
  {
    signal: 'Where the account is based',
    tell: 'Confident lecturing about a country the account has never posted from',
    cost: 'Three taps, per profile — or inline',
  },
]

export function EngagementFarming() {
  return (
    <article>
      <header class="relative overflow-hidden">
        <div class="graticule" aria-hidden="true" />
        <div class="shell relative pt-[clamp(3rem,5vw,4.5rem)] pb-[clamp(2.5rem,4vw,4rem)]">
          <p class="t-data">Guide</p>
          <h1 class="t-display rise mt-4" style="max-width:20ch">
            How to spot <span class="text-signal">engagement farming</span> on
            X.
          </h1>
          <p
            class="t-lead rise mt-7 max-w-[58ch]"
            style="animation-delay:120ms"
          >
            Since X started paying out on impressions, replying became a job.
            Not a well-paid one, which is exactly why the output looks the way
            it does: fast, generic, and pasted under whatever is trending. Here
            are the signals that actually separate a real reply from a farmed
            one.
          </p>
        </div>
        <div class="hairline" />
      </header>

      <section class="band">
        <div class="shell">
          <div class="max-w-[60ch]">
            <h2 class="t-h2 reveal">No single signal is a verdict</h2>
            <div class="policy reveal mt-8 space-y-5">
              <p>
                Every tell below has an innocent explanation. New accounts are
                new. Some people follow generously. Plenty of thoughtful posters
                have an emoji in their bio. Treating any one of these as proof
                will have you writing off ordinary strangers, which is both
                unpleasant and boring.
              </p>
              <p>
                What works is stacking them. An account three weeks old,
                following thousands, followed by dozens, first in the replies
                with a stock phrase — that combination is not a coincidence, and
                you can read it in about two seconds once you know where to
                look.
              </p>
            </div>
          </div>

          <div class="reveal mt-14 overflow-x-auto">
            <table class="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr class="border-hair-strong border-b">
                  <th class="t-data pr-6 pb-3">Signal</th>
                  <th class="t-data pr-6 pb-3">What it looks like</th>
                  <th class="t-data pb-3">Cost to check</th>
                </tr>
              </thead>
              <tbody>
                {SIGNALS.map((s) => (
                  <tr key={s.signal} class="border-hair border-b align-top">
                    <td class="text-text py-4 pr-6 text-[0.9375rem] font-semibold">
                      {s.signal}
                    </td>
                    <td class="text-body py-4 pr-6 text-[0.9375rem] leading-relaxed">
                      {s.tell}
                    </td>
                    <td class="text-faint py-4 font-mono text-[0.8125rem]">
                      {s.cost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="bg-ink-1 hairline band relative">
        <div class="shell-narrow max-w-3xl!">
          <div>
            <h2 class="t-h2 reveal">The one you can’t see</h2>
            <div class="policy reveal mt-8 space-y-5">
              <p>
                Five of the six signals above are already on screen. Follower
                counts, join date, the bio, the reply itself — X hands you all
                of it without being asked. The sixth is the one X keeps behind a
                menu: where the account actually posts from.
              </p>
              <p>
                It matters more than the others for a specific kind of annoyance
                — not spam exactly, but confident instruction about somewhere
                the account has no stake in. That reads very differently once
                you can see it, and X makes you open a panel per profile to find
                out.
              </p>
              <p>
                <strong class="text-text font-semibold">
                  X-Pat does that part.
                </strong>{' '}
                It puts the country in the hover card and, if you want it,
                inline in the timeline — plus a warning when X itself cannot
                verify the location. It does not score accounts or judge replies
                for you; the other five signals stay your call. It just stops
                the one genuinely hidden fact from costing three taps.
              </p>
            </div>
            <div class="reveal mt-10">
              <InstallButton size="lg" placement="guide_engagement_farming" />
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}
