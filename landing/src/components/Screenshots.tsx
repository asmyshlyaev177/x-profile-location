import { useState } from 'preact/hooks'

const SCREENSHOTS = [
  {
    src: '/Hover_screenshot-x-profile-location.png',
    label: 'Country Flag',
    alt: 'Country flag shown in X hover card',
  },
  {
    src: '/VPN_screenshot-x-profile-location.png',
    label: 'VPN Detection',
    alt: 'VPN warning badge next to location flag',
  },
  {
    src: '/Highlight_screenshot-x-profile-location.png',
    label: 'Highlight',
    alt: 'Highlight tweets by keywords in bio',
  },
  {
    src: '/Warning-screenshot-x-profile-location.png',
    label: 'Warnings',
    alt: 'Warnings instead of selected country flags',
  },
  {
    src: '/Flags_screenshot-x-profile-location.png',
    label: 'Inline flags',
    alt: 'Inline flags',
  },
  {
    src: '/Highlight2_screenshot-x-profile-location.png',
    label: 'Highlight flags',
    alt: 'Highlight flags',
  },
  {
    src: '/swipe_right.png',
    label: 'Swipe right (mobile)',
    alt: 'Swipe right (mobile)',
  },
]

export function Screenshots() {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  const prev = () =>
    setActive((i) => (i - 1 + SCREENSHOTS.length) % SCREENSHOTS.length)
  const next = () => setActive((i) => (i + 1) % SCREENSHOTS.length)

  const onKeyDown = (e: KeyboardEvent) => {
    if (!lightbox) return
    if (e.key === 'ArrowLeft') prev()
    if (e.key === 'ArrowRight') next()
    if (e.key === 'Escape') setLightbox(false)
  }

  const shot = SCREENSHOTS[active]

  return (
    <section class="bg-dark border-border border-t py-24">
      <div class="mx-auto max-w-6xl px-6 lg:px-8">
        {/* Header */}
        <div class="mb-12 text-center">
          <span class="text-teal mb-4 inline-block text-xs font-semibold tracking-widest uppercase">
            See It in Action
          </span>
          <h2 class="mb-4 text-4xl font-extrabold tracking-tight text-white">
            Screenshots
          </h2>
          <p class="mx-auto max-w-lg text-lg text-[#a0a3ab]">
            Screenshots of the extension running inside X.
          </p>
        </div>

        {/* Featured image */}
        <div
          class="border-border relative mb-4 flex items-center justify-center overflow-hidden rounded-2xl border bg-[#0d0d12]"
          style="height:560px;box-shadow: 0 24px 80px -16px rgba(0,0,0,0.6);"
        >
          <img
            key={shot.src}
            src={shot.src}
            alt={shot.alt}
            class="max-h-full max-w-full object-contain"
            loading="eager"
            decoding="async"
          />

          {/* Caption bar */}
          <div
            class="absolute right-0 bottom-0 left-0 flex items-center justify-between px-5 py-3"
            style="background:linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 100%);"
          >
            <span class="text-sm font-medium text-white/80">{shot.label}</span>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white"
              onClick={() => setLightbox(true)}
              aria-label="Expand screenshot"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M1.5 1h5a.5.5 0 0 1 0 1H2v4.5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 1.5 1zm13 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0V2h-4.5a.5.5 0 0 1 0-1h5zM1 9.5a.5.5 0 0 1 1 0V14h4.5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5v-5zm14 0v5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1 0-1H14V9.5a.5.5 0 0 1 1 0z" />
              </svg>
              Expand
            </button>
          </div>

          {/* Prev/next on featured */}
          <button
            type="button"
            class="absolute top-1/2 left-3 -translate-y-1/2 rounded-full p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white"
            onClick={prev}
            aria-label="Previous screenshot"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            class="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white"
            onClick={next}
            aria-label="Next screenshot"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Thumbnail strip */}
        <div class="grid grid-cols-5 gap-2">
          {SCREENSHOTS.map((s, i) => (
            <button
              key={s.src}
              type="button"
              class="relative overflow-hidden rounded-lg border transition-all duration-150 focus:outline-none"
              style={`border-color:${i === active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'};opacity:${i === active ? '1' : '0.5'};`}
              onClick={() => setActive(i)}
              aria-label={s.label}
              aria-pressed={i === active}
            >
              <img
                src={s.src}
                alt={s.alt}
                class="w-full object-contain"
                style="height:72px;"
                loading="lazy"
                decoding="async"
              />
              <div
                class="absolute inset-x-0 bottom-0 py-1 text-center"
                style="background:rgba(0,0,0,0.55);"
              >
                <span class="text-[10px] font-medium text-white/80">
                  {s.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center"
          style="background:rgba(0,0,0,0.92);"
          onClick={() => setLightbox(false)}
          onKeyDown={onKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot viewer"
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <button
            type="button"
            class="absolute top-5 right-5 text-xl leading-none text-white/50 transition-colors hover:text-white"
            onClick={() => setLightbox(false)}
            aria-label="Close"
          >
            ✕
          </button>

          <button
            type="button"
            class="absolute top-1/2 left-5 -translate-y-1/2 p-2 text-white/50 transition-colors hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            aria-label="Previous"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <img
            src={shot.src}
            alt={shot.alt}
            class="max-h-screen w-screen object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            type="button"
            class="absolute top-1/2 right-5 -translate-y-1/2 p-2 text-white/50 transition-colors hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            aria-label="Next"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <div class="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
            {SCREENSHOTS.map((_, i) => (
              <button
                key={i}
                type="button"
                class="h-1.5 rounded-full transition-all duration-200"
                style={`width:${i === active ? '20px' : '6px'};background:${i === active ? '#fff' : 'rgba(255,255,255,0.3)'};`}
                onClick={(e) => {
                  e.stopPropagation()
                  setActive(i)
                }}
                aria-label={`Screenshot ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
