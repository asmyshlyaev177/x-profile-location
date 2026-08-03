import { InstallButton } from './InstallButton'
import { ComparisonTable } from './ComparisonTable'
import { COMPETITORS, LOSSES, ROWS, SCRAPED } from '../data/comparison'

/**
 * /x-posed-alternative — the page someone lands on after typing that query.
 *
 * Written on the assumption the reader is already suspicious. Whoever searches
 * "<competitor> alternative" has been sold to before, so the order is: name the
 * competition fairly, hand them the table, then spend a section on where the
 * competition wins. The differentiators come last, because they are only worth
 * anything once the page has proved it is not lying.
 *
 * Nothing here disparages. Every competing extension listed is a real project
 * doing a real job, two of them for far more people than this one.
 */

const SCRAPED_LABEL = new Date(`${SCRAPED}T00:00:00Z`).toLocaleDateString(
  'en-GB',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
)

export function Comparison() {
  return (
    <article>
      <header class="relative overflow-hidden">
        <div class="graticule" aria-hidden="true" />
        <div class="shell relative pt-[clamp(3rem,5vw,4.5rem)] pb-[clamp(2.5rem,4vw,4rem)]">
          <p class="t-data">Comparison</p>
          <h1 class="t-display rise mt-4" style="max-width:20ch">
            X-Pat vs <span class="text-signal">X-Posed</span>, and the rest of
            the shelf.
          </h1>
          <p
            class="t-lead rise mt-7 max-w-[58ch]"
            style="animation-delay:120ms"
          >
            About twenty extensions put a country flag next to an X handle.
            Three of them have meaningful numbers of users. Here is what each
            one actually does, what X-Pat does differently, and the three things
            X-Posed does better — which is the part most comparison pages leave
            out.
          </p>
        </div>
        <div class="hairline" />
      </header>

      <section class="band">
        <div class="shell">
          <h2 class="t-h2 reveal max-w-[24ch]">Feature by feature</h2>
          <p class="t-body reveal mt-5 max-w-[58ch]">
            Every cell comes from a public store listing or a public repository,
            read on {SCRAPED_LABEL}. A dash means the listing does not say — for
            the two closed-source extensions that is not the same as a no, and
            it would be unfair to draw it as one.
          </p>
          <div class="reveal mt-10">
            <ComparisonTable rows={ROWS} showNotes />
          </div>
        </div>
      </section>

      {/* The honest-broker section. It sits before the differentiators, not
          after them, so it reads as disclosure rather than as a concession
          tacked on once the selling is done. */}
      <section class="bg-ink-1 hairline band relative">
        <div class="shell">
          <h2 class="t-h2 reveal max-w-[24ch]">Where X-Posed is ahead</h2>
          <ol class="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-px">
            {LOSSES.map((item, i) => (
              <li
                key={item.title}
                class="reveal flex flex-col sm:px-7 sm:first:pl-0 sm:last:pr-0"
                style={`animation-delay:${i * 90}ms`}
              >
                <h3 class="t-h3">{item.title}</h3>
                <p class="t-body mt-2.5 max-w-[40ch]">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="band">
        <div class="shell-narrow max-w-3xl!">
          <h2 class="t-h2 reveal">What actually differs</h2>
          <div class="policy reveal mt-8 space-y-5">
            <p>
              Everything in this category depends on a shared cache. X allows
              one browser roughly fifty profile lookups every fifteen minutes,
              and a busy thread has more accounts than that — so every extension
              here that keeps working past the limit does it by reading a cache
              other people filled. The question is not whether there is a
              server. It is what that server is allowed to do.
            </p>
            <p>
              <strong class="text-text font-semibold">
                Ours is published, and you can run your own.
              </strong>{' '}
              The cache server is in the same repository as the extension, with
              deployment docs for both Cloudflare Workers and a plain VPS.
              X-Posed publishes its extension — genuinely, and under MIT — but
              not the Worker its contributions are sent to. That is the piece
              you cannot check by reading the code you installed.
            </p>
            <p>
              <strong class="text-text font-semibold">
                A cached answer here needs corroboration.
              </strong>{' '}
              Contributions are stored as per-install votes and the consensus is
              what gets served, with a confidence threshold you can raise in the
              options page. X-Posed's own documentation describes storing the
              last accepted value for a handle, which means the most recent
              contributor decides. Both designs are honest about the same
              underlying problem: neither server can prove a contribution really
              came from X.
            </p>
            <p>
              <strong class="text-text font-semibold">
                Lookups carry no identifier.
              </strong>{' '}
              Reads are an unsigned list of handles, so the server has nothing
              to join them against and cannot build "this install looked at
              these accounts". Counting readers would take one line and would
              end that property, which is why the published stats undercount on
              purpose.
            </p>
            <p>
              And the rate limit is rationed rather than raced: background work
              stops at seventy percent of the window, so the last fifteen
              lookups are still there for accounts you actually hover.{' '}
              <a
                href="/#budget"
                class="text-signal underline decoration-1 underline-offset-4"
              >
                The mechanism is drawn out on the homepage
              </a>
              .
            </p>
          </div>

          <div class="reveal mt-10">
            <InstallButton size="lg" placement="comparison" />
          </div>
        </div>
      </section>

      <section class="bg-ink-1 hairline band relative">
        <div class="shell-narrow max-w-3xl!">
          <h2 class="t-h2 reveal">Sources</h2>
          <p class="t-body reveal mt-5">
            Read on {SCRAPED_LABEL}. Install counts and features move; if
            something below is out of date, it is an error rather than a
            position, and the{' '}
            <a
              href="https://github.com/asmyshlyaev177/x-profile-location/issues"
              class="text-signal underline decoration-1 underline-offset-4"
            >
              issue tracker
            </a>{' '}
            is the fastest way to have it corrected.
          </p>
          <ul class="policy reveal mt-8 space-y-4">
            {COMPETITORS.map((c) => (
              <li key={c.short}>
                <a
                  href={c.storeUrl}
                  rel="noopener"
                  class="text-signal underline decoration-1 underline-offset-4"
                >
                  {c.name}
                </a>
                {c.repoUrl ? (
                  <>
                    {' — source: '}
                    <a
                      href={c.repoUrl}
                      rel="noopener"
                      class="text-signal underline decoration-1 underline-offset-4"
                    >
                      {c.repoUrl.replace('https://github.com/', '')}
                    </a>
                  </>
                ) : (
                  <span class="text-faint"> — source not published</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </article>
  )
}
