import { useEffect, useRef } from 'preact/hooks'
import { SUPPORTED_ANDROID, SUPPORTED_DESKTOP } from '../utils/browser'
import { InstallButton } from './InstallButton'

export function Hero() {
  return (
    <section class="relative overflow-hidden">
      <div class="graticule" aria-hidden="true" />
      {/* A light source behind the panel, so the evidence reads as lit rather
          than pasted on. The only large area of brand colour above the fold. */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0"
        style="background:radial-gradient(58% 52% at 76% 44%, color-mix(in oklch, var(--color-signal) 13%, transparent), transparent 72%)"
      />

      {/* The panel column is a fixed 27rem, matching the panel's own max width:
          an `fr` column plus `justify-self-end` shrink-wrapped it to ~275px and
          opened a 200–330px hole between the copy and the evidence. */}
      <div class="shell relative grid items-center gap-9 pt-[clamp(3.25rem,6vw,5.25rem)] pb-[clamp(3.5rem,5vw,5rem)] lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-12">
        {/* ── Argument ── */}
        <div>
          <h1
            class="t-display rise"
            style="animation-delay:60ms;max-width:19ch"
          >
            See where any X profile is{' '}
            <span class="text-signal">really from</span>.
          </h1>

          <p class="t-lead rise mt-7" style="animation-delay:170ms">
            X already knows which country an account posts from. It just doesn’t
            show you. This puts the flag in the hover card, and lets you
            collapse or hide the countries you’d rather not read.
          </p>

          <div
            class="rise mt-9 flex flex-wrap items-center gap-x-6 gap-y-4"
            style="animation-delay:260ms"
          >
            <InstallButton size="lg" />
            <a
              href="#proof"
              class="text-body hover:text-signal decoration-hair-strong hover:decoration-signal text-[0.9375rem] font-semibold underline decoration-1 underline-offset-[6px] transition-colors duration-150"
            >
              See it running
            </a>
          </div>

          {/* Data rail — the install objections, answered in four readings */}
          <dl
            class="rise mt-11 grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:flex-wrap sm:gap-y-0"
            style="animation-delay:350ms"
          >
            {[
              ['Works in', SUPPORTED_DESKTOP],
              ['On Android', SUPPORTED_ANDROID],
              ['Account / API key', 'Neither'],
              ['Version', `v${__EXT_VERSION__}`],
            ].map(([k, v]) => (
              <div
                key={k}
                class="border-hair sm:border-l sm:pr-6 sm:pl-6 sm:first:border-l-0 sm:first:pl-0"
              >
                <dt class="t-data">{k}</dt>
                <dd class="text-text mt-1 text-[0.8125rem] font-semibold">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── Evidence ── */}
        <div class="rise" style="animation-delay:180ms">
          <XPanel />
        </div>
      </div>

      <div class="hairline" />
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
   A legible mock of X with the extension running: an inline flag in the feed,
   the injected row inside a hover card, and a VPN warning. Three states, one
   image — the panel does the job a feature list would otherwise have to.
   ─────────────────────────────────────────────────────────────────────────── */
function XPanel() {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    // Pointer tilt is a nicety for mice only: it has no touch equivalent and
    // no business running for someone who asked for less motion.
    const allowed =
      window.matchMedia('(pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!allowed) return

    const MAX_TILT = 8
    const REST = 'rotateY(-7deg) rotateX(2.5deg)'
    const clamp = (v: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, v))

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const nx = clamp(
        (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2),
        -1,
        1,
      )
      const ny = clamp(
        (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2),
        -1,
        1,
      )
      el.style.transform = `rotateY(${nx * MAX_TILT}deg) rotateX(${-ny * MAX_TILT}deg)`
    }
    const onLeave = () => {
      el.style.transform = REST
    }

    // Listen on the whole section so the tilt reacts before the cursor arrives
    const section = el.closest('section')!
    section.addEventListener('mousemove', onMove)
    section.addEventListener('mouseleave', onLeave)
    return () => {
      section.removeEventListener('mousemove', onMove)
      section.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div
      class="mx-auto w-full max-w-108"
      style="perspective:1400px"
      aria-hidden="true"
    >
      <div
        ref={cardRef}
        class="bg-ink-1 border-hair overflow-hidden rounded-2xl border shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)] transition-transform duration-200 ease-out lg:transform-[rotateY(-7deg)_rotateX(2.5deg)]"
      >
        {/* Browser chrome — grounds the mock as "inside x.com" */}
        <div class="border-hair bg-void/60 flex items-center gap-2 border-b px-3.5 py-2.5">
          <span class="flex gap-1.5">
            <i class="bg-hair-strong block h-2 w-2 rounded-full" />
            <i class="bg-hair-strong block h-2 w-2 rounded-full" />
            <i class="bg-hair-strong block h-2 w-2 rounded-full" />
          </span>
          <span class="bg-ink-3 text-faint ml-2 flex-1 rounded-md px-2.5 py-1 font-mono text-[0.625rem] tracking-wide">
            x.com/home
          </span>
        </div>

        <div class="space-y-2 p-3">
          {/* 1 — inline flag in the timeline */}
          <TweetRow name="Lena Fischer" handle="@lenafischer">
            <span class="text-signal/90 inline-flex items-center gap-1 text-[0.6875rem]">
              <span class="text-[0.875rem] leading-none">🇯🇵</span> Japan
            </span>
          </TweetRow>

          {/* 2 — the hover card: the moment the extension exists for */}
          <div class="border-hair-strong bg-void rounded-xl border p-3.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)]">
            <div class="flex items-start gap-3">
              <div class="bg-signal/15 ring-signal/25 h-11 w-11 shrink-0 rounded-full ring-1" />
              <div class="min-w-0 flex-1">
                <p class="text-text truncate text-[0.8125rem] font-bold">
                  Marcus Weber
                </p>
                <p class="text-faint truncate text-[0.75rem]">@mweber</p>

                {/* Injected by the extension — flashes in after the card lands */}
                <p class="injected mt-1.5 inline-flex items-center gap-1.5 px-1 py-0.5">
                  <span class="text-[1.0625rem] leading-none">🇩🇪</span>
                  <span class="text-body text-[0.75rem] font-medium">
                    Germany
                  </span>
                </p>
              </div>
            </div>

            <div class="mt-3 space-y-1.5">
              <div class="bg-hair-strong/80 h-1.5 w-full rounded-full" />
              <div class="bg-hair-strong/60 h-1.5 w-2/3 rounded-full" />
            </div>

            <div class="text-faint mt-3 flex gap-4 font-mono text-[0.625rem]">
              <span>
                <b class="text-text font-semibold">412</b> Following
              </span>
              <span>
                <b class="text-text font-semibold">116.4K</b> Followers
              </span>
            </div>

            <div class="border-hair mt-3 flex items-center gap-1.5 border-t pt-2.5">
              <span class="bg-signal h-1 w-1 rounded-full" />
              <span class="t-data text-signal/80 text-[0.5625rem]!">X-Pat</span>
            </div>
          </div>

          {/* 3 — VPN warning */}
          <TweetRow name="nightcrawler" handle="@n1ghtcrawl">
            <span class="inline-flex items-center gap-1.5">
              <span class="text-[0.875rem] leading-none">🇺🇸</span>
              <span class="text-alarm border-alarm/40 bg-alarm/10 rounded border px-1.5 py-px text-[0.625rem] font-bold">
                ⚠ VPN
              </span>
            </span>
          </TweetRow>

          {/* 4 — a blocked country, collapsed rather than silently dropped */}
          <div class="border-hair/60 bg-ink-2/60 flex items-center gap-2 rounded-xl border px-3 py-2.5">
            <span class="text-faint text-[0.75rem] font-semibold">
              🚫 Hidden · 🇮🇳 India
            </span>
            <span class="text-xblue border-xblue/50 ml-auto rounded-full border px-2 py-0.5 text-[0.625rem] font-bold">
              Show
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TweetRow({
  name,
  handle,
  children,
}: {
  name: string
  handle: string
  children: preact.ComponentChildren
}) {
  return (
    <div class="border-hair/60 bg-ink-2/60 rounded-xl border p-3">
      <div class="flex gap-2.5">
        <div class="bg-hair h-8 w-8 shrink-0 rounded-full" />
        <div class="min-w-0 flex-1">
          <p class="flex items-baseline gap-1.5 truncate">
            <span class="text-text text-[0.75rem] font-semibold">{name}</span>
            <span class="text-faint text-[0.6875rem]">{handle}</span>
          </p>
          <div class="mt-0.5">{children}</div>
          <div class="mt-2 space-y-1.5">
            <div class="bg-hair-strong/70 h-1.5 w-full rounded-full" />
            <div class="bg-hair-strong/50 h-1.5 w-3/5 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
