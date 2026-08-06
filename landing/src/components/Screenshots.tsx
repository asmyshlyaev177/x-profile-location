import { useEffect, useRef, useState } from 'preact/hooks'

const SCREENSHOTS = [
  {
    src: '/Hover_screenshot-x-profile-location.png',
    label: 'Flag on hover',
    alt: 'An X hover card with a German flag and the word Germany added below the handle',
  },
  {
    src: '/VPN_screenshot-x-profile-location.png',
    label: 'VPN warning',
    alt: 'A hover card showing a US flag next to a red ⚠ VPN badge',
  },
  {
    src: '/Flags_screenshot-x-profile-location.png',
    label: 'Flags in the feed',
    alt: 'A timeline where every author carries their country flag inline, without hovering',
  },
  {
    src: '/Warning-screenshot-x-profile-location.png',
    label: 'Blocked countries',
    alt: 'Profiles from blocked locations reading as a warning sign instead of a flag',
  },
  {
    src: '/Highlight_screenshot-x-profile-location.png',
    label: 'Keyword highlight',
    alt: 'A tweet highlighted in amber because the author bio matched a saved keyword',
  },
  {
    src: '/Highlight2_screenshot-x-profile-location.png',
    label: 'Flag-stuffed bios',
    alt: 'An account flagged for packing several country flags into its bio',
  },
  {
    src: '/swipe_right.png',
    label: 'Swipe on mobile',
    alt: 'A phone-width timeline with a swipe-right gesture revealing the author country as an overlay',
  },
]

type Shot = (typeof SCREENSHOTS)[number]

/**
 * Screenshots live in public/ and so are not content-hashed by Vite. The
 * version stamp is what lets `_headers` cache them for a year: replace a
 * screenshot, bump the extension version, and every browser refetches.
 */
const v = `?v=${__EXT_VERSION__}`
const png = (src: string) => src + v
const webp = (src: string) => src.replace(/\.png$/, '.webp') + v
const thumbWebp = (src: string) => src.replace(/\.png$/, '-thumb.webp') + v

/** 320w WebP for a rail that renders around 128px wide. */
function Thumb({ shot, class: cls }: { shot: Shot; class?: string }) {
  return (
    <picture>
      <source srcSet={thumbWebp(shot.src)} type="image/webp" />
      <img
        src={png(shot.src)}
        alt=""
        width="160"
        height="64"
        class={`bg-ink-1 h-16 w-full object-cover object-top ${cls ?? ''}`}
        loading="lazy"
        decoding="async"
      />
    </picture>
  )
}

export function Screenshots() {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const prev = () =>
    setActive((i) => (i - 1 + SCREENSHOTS.length) % SCREENSHOTS.length)
  const next = () => setActive((i) => (i + 1) % SCREENSHOTS.length)

  // <dialog> earns its keep here: top-layer rendering, a focus trap and Escape
  // handling all come for free, and no z-index can clip it.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const shot = SCREENSHOTS[active]

  return (
    <section id="proof" class="band-tight relative scroll-mt-24">
      <div class="shell">
        {/* This band sits narrower than the rest of the page: the source crops
            run from 298×361 to 891×438, and a full-width panel would mat a
            300px screenshot in half a metre of empty background. */}
        <div class="mx-auto w-full max-w-4xl">
          <header class="mb-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <h2 class="t-h2 reveal max-w-[22ch]">
              This is it, running inside X.
            </h2>
            <p class="t-body reveal max-w-[34ch] text-balance">
              Screenshots from an ordinary timeline. Pick one to see it working.
            </p>
          </header>

          <div
            id={`shot-panel-${active}`}
            role="tabpanel"
            aria-labelledby={`shot-tab-${active}`}
            class="bg-ink-1 border-hair relative grid h-[clamp(19rem,44vw,27rem)] place-items-center overflow-hidden rounded-2xl border p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-8"
          >
            <div class="graticule opacity-40" aria-hidden="true" />

            <picture key={shot.src}>
              <source srcSet={webp(shot.src)} type="image/webp" />
              <img
                src={png(shot.src)}
                alt={shot.alt}
                width="891"
                height="676"
                class="border-hair/70 relative max-h-full w-auto rounded-lg border object-contain shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]"
                loading="lazy"
                decoding="async"
              />
            </picture>

            <button
              type="button"
              class="text-faint hover:text-text bg-void/70 border-hair hover:border-hair-strong absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold backdrop-blur-sm transition-colors"
              onClick={() => setOpen(true)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M1.5 1h5a.5.5 0 0 1 0 1H2v4.5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 1.5 1zm13 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0V2h-4.5a.5.5 0 0 1 0-1h5zM1 9.5a.5.5 0 0 1 1 0V14h4.5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5v-5zm14 0v5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1 0-1H14V9.5a.5.5 0 0 1 1 0z" />
              </svg>
              Full size
            </button>

            <Arrow dir="prev" onClick={prev} />
            <Arrow dir="next" onClick={next} />
          </div>

          {/* One rail at every width: seven fit exactly on desktop, and the
              min-width turns it into a snap-scroller on phones. */}
          <div
            role="tablist"
            aria-label="Screenshots"
            class="scrollbar-none mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
          >
            {SCREENSHOTS.map((s, i) => {
              const on = i === active
              return (
                <button
                  key={s.src}
                  type="button"
                  id={`shot-tab-${i}`}
                  role="tab"
                  aria-selected={on}
                  aria-controls={`shot-panel-${i}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') next()
                    if (e.key === 'ArrowLeft') prev()
                  }}
                  class={`group relative min-w-28 shrink-0 basis-[calc((100%-3rem)/7)] snap-start overflow-hidden rounded-lg border transition-[border-color] duration-200 ease-out ${
                    on
                      ? 'border-signal/70'
                      : 'border-hair hover:border-hair-strong'
                  }`}
                >
                  {/* Dimming belongs on the image, not the button: container
                      opacity drags the caption down with it, which is what put
                      the inactive labels at 3.6:1. */}
                  <Thumb
                    shot={s}
                    class={`transition-opacity duration-200 ease-out ${on ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'}`}
                  />
                  <span
                    class={`block px-1.5 py-1.5 text-center text-[0.625rem] leading-tight font-semibold ${on ? 'bg-signal text-void' : 'bg-ink-2 text-body'}`}
                  >
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lightbox. The click handler is backdrop-to-dismiss; the keyboard path
          is Escape, which a native <dialog> handles itself and reports through
          onClose — there is no key event to add here. */}
      {/* oxlint-disable-next-line click-events-have-key-events */}
      <dialog
        ref={dialogRef}
        class="lightbox"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false)
        }}
        aria-label="Screenshot viewer"
      >
        <figure class="grid max-h-[88vh] max-w-[92vw] place-items-center gap-4">
          <picture>
            <source srcSet={webp(shot.src)} type="image/webp" />
            <img
              src={png(shot.src)}
              alt={shot.alt}
              class="max-h-[80vh] w-auto"
            />
          </picture>
          <figcaption class="t-data text-body">
            {shot.label} · {active + 1} / {SCREENSHOTS.length}
          </figcaption>
        </figure>

        <button
          type="button"
          class="text-faint hover:text-text absolute top-4 right-5 text-2xl leading-none"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ✕
        </button>
        <Arrow dir="prev" onClick={prev} />
        <Arrow dir="next" onClick={next} />
      </dialog>
    </section>
  )
}

function Arrow({
  dir,
  onClick,
}: {
  dir: 'prev' | 'next'
  onClick: () => void
}) {
  const isPrev = dir === 'prev'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? 'Previous screenshot' : 'Next screenshot'}
      class={`text-faint hover:text-text bg-void/70 border-hair hover:border-hair-strong absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border backdrop-blur-sm transition-colors ${
        isPrev ? 'left-2 sm:left-3' : 'right-2 sm:right-3'
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points={isPrev ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
      </svg>
    </button>
  )
}
