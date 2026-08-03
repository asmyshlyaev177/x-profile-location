import { InstallButton } from './InstallButton'

const STEPS = [
  {
    n: '1',
    where: 'Web',
    body: 'Open the profile, then the ⋯ overflow menu sitting next to the Follow button. “About this account” is in that list.',
  },
  {
    n: '2',
    where: 'iOS / Android',
    body: 'Open the profile and tap the ⋯ in the top right of the header. Same entry, same panel.',
  },
  {
    n: '3',
    where: 'What you get',
    body: 'The country the account is based in, roughly when it joined, how many times the handle has changed, and which app store it signed up through.',
  },
]

export function AboutThisAccount() {
  return (
    <>
      <article>
        <header class="relative overflow-hidden">
          <div class="graticule" aria-hidden="true" />
          <div class="shell relative pt-[clamp(3rem,5vw,4.5rem)] pb-[clamp(2.5rem,4vw,4rem)]">
            <p class="t-data">Guide</p>
            <h1 class="t-display rise mt-4" style="max-width:20ch">
              X’s <span class="text-signal">“About this account”</span>, and how
              to stop clicking for it.
            </h1>
            <p
              class="t-lead rise mt-7 max-w-[58ch]"
              style="animation-delay:120ms"
            >
              X quietly knows which country every account posts from, and it
              will tell you — one profile at a time, three taps deep, for as
              many profiles as you have patience for. Here is where the panel
              lives, what it can and cannot answer, and what to do when you want
              the same fact for eighty replies instead of one.
            </p>
          </div>
          <div class="hairline" />
        </header>

        <section class="band">
          <div class="shell">
            <h2 class="t-h2 reveal max-w-[22ch]">
              Where the panel actually is
            </h2>
            <ol class="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-px">
              {STEPS.map((s, i) => (
                <li
                  key={s.n}
                  class="reveal flex flex-col sm:px-7 sm:first:pl-0 sm:last:pr-0"
                  style={`animation-delay:${i * 90}ms`}
                >
                  <span class="bg-signal text-void grid h-12 w-12 shrink-0 place-items-center rounded-full font-mono text-[0.9375rem] font-bold">
                    {s.n}
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
              <h2 class="t-h2 reveal">What it can’t answer</h2>
              <div class="policy reveal mt-8 space-y-5">
                <p>
                  The panel is per-profile and modal. That is fine when you are
                  vetting one account and useless when you are reading a reply
                  thread, which is the moment the question usually comes up. A
                  hundred replies is a hundred round trips through a menu, and
                  by the third one you have lost the thread you were reading.
                </p>
                <p>
                  It is also not always populated. X returns no country for a
                  fair number of accounts — often older or barely-active ones.
                  When the field is genuinely empty there is nothing to reveal,
                  and any tool claiming otherwise is guessing at an IP address.
                </p>
                <p>
                  And it says nothing about confidence. X internally marks some
                  locations as ones it cannot stand behind; the panel shows you
                  the country either way.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section class="band">
          <div class="shell-narrow max-w-3xl!">
            <div>
              <h2 class="t-h2 reveal">The same field, without the menu</h2>
              <div class="policy reveal mt-8 space-y-5">
                <p>
                  X-Pat reads exactly the field the panel reads — the same
                  endpoint, using the X session already in your browser — and
                  renders it as a flag in the hover card, and optionally inline
                  in the timeline. No IP lookups, no third-party database, no
                  account or API key.
                </p>
                <p>
                  It surfaces three things from that response: the country, the
                  app store the account signed up through, and whether X flags
                  the location as one it cannot verify — the confidence signal
                  the panel leaves out. Join date and handle history stay where
                  they are; the extension does not try to be the whole panel.
                </p>
                <p>
                  You can also act on it: countries and regions you would rather
                  not read can collapse behind a “Show” button, or hide.
                  Collapse is the default, because a timeline that silently
                  drops posts is a timeline you cannot trust.
                </p>
              </div>
              <div class="reveal mt-10">
                <InstallButton size="lg" placement="guide_about_this_account" />
              </div>
            </div>
          </div>
        </section>
      </article>
    </>
  )
}
