/* ───────────────────────────────────────────────────────────────────────────
   Features.

   Deliberately not a grid of same-sized cards. The five badge variants are one
   legend, because that is what they are — five readings of the same injected
   row. The three things that change your timeline get room to argue for
   themselves. Accent colour is never decorative: cyan is ours, X blue is X's,
   amber means highlighted, red means blocked.
   ─────────────────────────────────────────────────────────────────────────── */

import { SUPPORTED_ANDROID } from '../utils/browser'
import { useT } from '../i18n/context'
import { fill } from '../i18n/fill'
import { rich } from '../i18n/rich'
import type { Dict } from '../i18n/dict/en'

export function SeeItInAction() {
  const t = useT()

  return (
    <section id="features" class="band relative scroll-mt-24">
      <div class="shell">
        <header class="mb-14 flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
          <h2 class="t-h2 reveal max-w-[26ch]">{t.features.heading}</h2>
          <p class="t-body reveal max-w-[38ch]">{t.features.lead}</p>
        </header>

        <Legend t={t} />

        <div class="mt-20 space-y-20">
          <HideShowcase t={t} />
          <HighlightShowcase t={t} />

          <div class="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <CacheShowcase t={t} />
            <SwipeShowcase t={t} />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── The legend: five readings of the same row ─────────────────────────────── */

/** The badges are pictures of the extension's output, so they never translate. */
const BADGES = {
  country: (
    <span class="inline-flex items-center gap-1.5" dir="ltr">
      <span class="text-lg leading-none">🇩🇪</span>
      <span class="text-body text-[0.8125rem]">Germany</span>
    </span>
  ),
  region: (
    <span class="text-body border-hair-strong rounded border px-1.5 py-0.5 font-mono text-[0.75rem] font-semibold">
      EUR
    </span>
  ),
  vpn: (
    <span class="inline-flex items-center gap-1.5" dir="ltr">
      <span class="text-base leading-none">🇺🇸</span>
      <span class="text-alarm border-alarm/40 bg-alarm/10 rounded border px-1.5 py-0.5 text-[0.6875rem] font-bold">
        ⚠ VPN
      </span>
    </span>
  ),
  registration: (
    <span class="inline-flex items-center gap-1.5">
      <span class="text-xblue border-xblue/40 bg-xblue/10 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6875rem] font-bold">
        📱 🇯🇵
      </span>
    </span>
  ),
  cooldown: (
    <span
      class="text-attention border-attention/40 bg-attention/10 inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[0.6875rem] font-bold"
      dir="ltr"
    >
      ⏱ 4m 32s
    </span>
  ),
} as const

/** Rows on narrow screens, columns on wide ones — a legend either way. */
function Legend({ t }: { t: Dict }) {
  const ids = ['country', 'region', 'vpn', 'registration', 'cooldown'] as const

  return (
    <dl class="border-hair divide-hair divide-y border-y lg:grid lg:grid-cols-5 lg:divide-x lg:divide-y-0">
      {ids.map((id, i) => (
        // A <div> inside a <dl> may contain nothing but <dt>/<dd>, so the badge
        // lives in the <dt> alongside its label rather than in a sibling div —
        // otherwise these stop being definition list items to assistive tech.
        <div
          key={id}
          class="reveal grid grid-cols-[7rem_1fr] items-start gap-x-5 py-5 lg:grid-cols-1 lg:px-6 lg:py-7 lg:first:ps-0 lg:last:pe-0"
          style={`animation-delay:${i * 70}ms`}
        >
          <dt class="flex flex-col gap-3 lg:gap-4">
            <span class="flex min-h-8 items-center">{BADGES[id]}</span>
            <span class="t-data text-signal">
              {t.features.readings[id].name}
            </span>
          </dt>
          <dd class="text-body text-[0.8125rem] leading-relaxed lg:mt-1.5">
            {t.features.readings[id].body}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ── Showcase shell ───────────────────────────────────────────────────────── */

function Showcase({
  title,
  children,
  stage,
  flip = false,
  readout,
}: {
  title: string
  children: preact.ComponentChildren
  stage: preact.ComponentChildren
  flip?: boolean
  readout?: [string, string][]
}) {
  return (
    <div class="reveal grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div class={flip ? 'lg:order-2' : ''}>
        <h3 class="t-h2 text-[clamp(1.5rem,2.4vw,2rem)]! leading-[1.1]!">
          {title}
        </h3>
        <div class="t-body mt-4 space-y-3">{children}</div>

        {readout && (
          <dl class="border-hair mt-7 grid gap-x-8 gap-y-4 border-t pt-5 sm:grid-cols-3">
            {readout.map(([k, v]) => (
              <div key={k}>
                <dt class="t-data">{k}</dt>
                <dd class="text-text mt-1.5 text-[0.8125rem] font-semibold">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div
        class={`bg-ink-1 border-hair relative grid min-h-64 place-items-center overflow-hidden rounded-2xl border p-6 ${flip ? 'lg:order-1' : ''}`}
      >
        <div class="graticule opacity-30" aria-hidden="true" />
        <div class="relative">{stage}</div>
      </div>
    </div>
  )
}

/* ── 1 · Hide tweets by location ──────────────────────────────────────────── */

function HideShowcase({ t }: { t: Dict }) {
  const c = t.features.hide
  return (
    <Showcase
      title={c.title}
      stage={<HidePreview t={t} />}
      readout={[
        [c.readoutCollapse, c.readoutCollapseValue],
        [c.readoutHide, c.readoutHideValue],
        [c.readoutOff, c.readoutOffValue],
      ]}
    >
      <p>{c.p1}</p>
      <p>{rich(c.p2)}</p>
      <p>{c.p3}</p>
    </Showcase>
  )
}

function HidePreview({ t }: { t: Dict }) {
  return (
    <div class="w-full max-w-76 space-y-2.5">
      <TweetShell />
      <div class="border-hair bg-ink-2 flex items-center gap-2 rounded-lg border px-3 py-3">
        <span class="text-faint text-[0.8125rem] font-semibold">
          {t.hero.panelHidden}
        </span>
        <span class="text-xblue border-xblue/50 ms-auto rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-bold">
          {t.hero.panelShow}
        </span>
      </div>
      <TweetShell />
      <div class="border-hair/70 flex items-center justify-center rounded-lg border border-dashed py-4">
        <span class="t-data">{t.features.hide.previewRemoved}</span>
      </div>
    </div>
  )
}

/* ── 2 · Highlight rules ──────────────────────────────────────────────────── */

function HighlightShowcase({ t }: { t: Dict }) {
  const c = t.features.highlight
  return (
    <Showcase
      title={c.title}
      flip
      stage={<HighlightPreview t={t} />}
      readout={[
        [c.readoutMatch, c.readoutMatchValue],
        [c.readoutFlags, c.readoutFlagsValue],
        [c.readoutExceptions, c.readoutExceptionsValue],
      ]}
    >
      <p>{c.p1}</p>
      <p>{c.p2}</p>
    </Showcase>
  )
}

/** Side by side once there is room, stacked before that, so the options panel
 *  and its effect are never clipped by the stage. */
function HighlightPreview({ t }: { t: Dict }) {
  return (
    <div class="flex flex-col items-center gap-4 sm:flex-row">
      <OptionsPopup t={t} />
      <span
        class="text-hair-strong shrink-0 rotate-90 text-2xl sm:rotate-0 sm:rtl:-scale-x-100"
        aria-hidden="true"
      >
        →
      </span>
      <div class="w-52 space-y-2.5">
        <TweetShell compact />
        <div
          class="border-attention/45 rounded-lg border p-2.5"
          style="background:color-mix(in oklch, var(--color-attention) 14%, var(--color-ink-2))"
        >
          <div class="flex gap-2">
            <div class="bg-hair-strong h-5 w-5 shrink-0 rounded-full" />
            <div class="flex-1 space-y-1.5">
              <div class="flex items-center gap-1.5">
                <div class="bg-hair-strong h-1.5 w-10 rounded-full" />
                <span class="text-attention font-mono text-[0.5rem] font-bold">
                  crypto · nft
                </span>
              </div>
              <div class="bg-hair h-1.5 w-full rounded-full" />
              <div class="bg-hair h-1.5 w-2/3 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The extension's options page — light UI, so it stays light here. */
function OptionsPopup({ t }: { t: Dict }) {
  const c = t.features.highlight
  return (
    <div class="w-48 shrink-0 overflow-hidden rounded-xl bg-white shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)]">
      <div class="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
        <span class="text-[0.8125rem] font-bold text-neutral-900">
          {c.optionsTitle}
        </span>
        <span class="text-[0.5625rem] font-bold text-teal-700">
          {c.optionsSaved}
        </span>
      </div>
      <div class="space-y-2 p-2.5">
        <div class="rounded-md border border-neutral-200 px-2.5 py-2">
          <div class="flex items-center justify-between">
            <span class="text-[0.625rem] font-semibold text-neutral-900">
              {c.optionsByKeyword}
            </span>
            <span class="text-[0.5625rem] text-neutral-500">▾</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            {['nafo', 'crypto'].map((k) => (
              <span
                key={k}
                class="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[0.5625rem] font-medium text-blue-800"
              >
                {k}
              </span>
            ))}
          </div>
          <div class="mt-2 rounded border border-neutral-300 px-2 py-1 text-[0.5625rem] text-neutral-500">
            {c.optionsPlaceholder}
          </div>
        </div>
        <div class="flex items-center justify-between rounded-md border border-neutral-200 px-2.5 py-2">
          <span class="text-[0.625rem] font-semibold text-neutral-900">
            {c.optionsByFlags}
          </span>
          <span class="text-[0.5625rem] text-neutral-500">▸</span>
        </div>
      </div>
    </div>
  )
}

/* ── 3 · Community cache ──────────────────────────────────────────────────── */

function CacheShowcase({ t }: { t: Dict }) {
  const c = t.features.cache
  return (
    <div class="reveal border-hair bg-ink-1 relative overflow-hidden rounded-2xl border p-7">
      <div class="graticule opacity-25" aria-hidden="true" />
      <div class="relative">
        <h3 class="t-h3 text-[1.0625rem]">{c.title}</h3>
        <p class="t-body mt-3 max-w-[46ch]">{c.p1}</p>
        <p class="t-body mt-3 max-w-[46ch]">{c.p2}</p>
        <div class="mt-7">
          <CachePreview t={t} />
        </div>
      </div>
    </div>
  )
}

const arrow = (
  <span class="text-hair-strong text-lg rtl:-scale-x-100" aria-hidden="true">
    →
  </span>
)

const contributor = (flag: string) => (
  <span class="bg-hair ring-hair-strong relative grid h-8 w-8 place-items-center rounded-full ring-1">
    <span class="absolute -end-1 -bottom-1 text-[0.625rem] leading-none">
      {flag}
    </span>
  </span>
)

function CachePreview({ t }: { t: Dict }) {
  return (
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div class="flex flex-col gap-2">
        <div class="flex gap-1.5">
          {contributor('🇯🇵')}
          {contributor('🇩🇪')}
          {contributor('🇧🇷')}
        </div>
        <span class="t-data">{t.features.cache.contributors}</span>
      </div>

      {arrow}

      <div class="flex flex-col items-center gap-1.5">
        <span class="border-signal/50 bg-signal/12 grid h-11 w-11 place-items-center rounded-full border text-lg">
          🌍
        </span>
        <span class="t-data text-signal">{t.features.cache.shared}</span>
      </div>

      {arrow}

      <div class="border-hair bg-ink-2 flex items-center gap-2 rounded-xl border p-2.5">
        <span class="bg-hair h-6 w-6 shrink-0 rounded-full" />
        <span class="text-base leading-none">🇯🇵</span>
        <span class="text-signal border-signal/40 bg-signal/10 rounded border px-1.5 py-0.5 font-mono text-[0.625rem] font-bold">
          {t.features.cache.instant}
        </span>
      </div>
    </div>
  )
}

/* ── 4 · Mobile swipe ─────────────────────────────────────────────────────── */

function SwipeShowcase({ t }: { t: Dict }) {
  const c = t.features.swipe
  return (
    <div class="reveal border-hair bg-ink-1 relative overflow-hidden rounded-2xl border p-7">
      <div class="graticule opacity-25" aria-hidden="true" />
      <div class="relative">
        <h3 class="t-h3 text-[1.0625rem]">{c.title}</h3>
        <p class="t-body mt-3">{c.p1}</p>
        <p class="t-body mt-3">
          {rich(fill(c.p2, { browser: SUPPORTED_ANDROID }))}
        </p>
        <div class="mt-8 grid place-items-center">
          <SwipePreview />
        </div>
      </div>
    </div>
  )
}

function SwipePreview() {
  return (
    <div class="relative w-52" dir="ltr">
      <div class="border-hair bg-ink-2 rounded-lg border p-3">
        <div class="flex gap-2">
          <div class="bg-hair h-6 w-6 shrink-0 rounded-full" />
          <div class="flex-1 space-y-1.5">
            <div class="bg-hair-strong h-1.5 w-16 rounded-full" />
            <div class="flex items-center gap-1.5">
              <span class="text-[0.875rem] leading-none">🇧🇷</span>
              <span class="text-body text-[0.625rem]">Brazil</span>
            </div>
            <div class="bg-hair h-1.5 w-full rounded-full" />
          </div>
        </div>
      </div>
      <span
        class="absolute top-1/2 -left-7 -translate-y-1/2 text-xl"
        aria-hidden="true"
      >
        👉
      </span>
      <div class="border-xblue/60 bg-void/95 absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-lg border px-3 py-1 text-[0.75rem] font-semibold whitespace-nowrap text-white">
        🇧🇷 Brazil
      </div>
    </div>
  )
}

/* ── Shared ───────────────────────────────────────────────────────────────── */

function TweetShell({ compact = false }: { compact?: boolean }) {
  return (
    <div class="border-hair bg-ink-2 rounded-lg border p-2.5">
      <div class="flex gap-2">
        <div
          class={`bg-hair-strong shrink-0 rounded-full ${compact ? 'h-5 w-5' : 'h-6 w-6'}`}
        />
        <div class="flex-1 space-y-1.5">
          <div class="bg-hair-strong h-1.5 w-14 rounded-full" />
          <div class="bg-hair h-1.5 w-full rounded-full" />
          <div class="bg-hair h-1.5 w-3/5 rounded-full" />
        </div>
      </div>
    </div>
  )
}
