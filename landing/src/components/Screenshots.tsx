import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks'
import {
  ScrollMenu,
  VisibilityContext,
  type publicApiType,
} from 'react-horizontal-scrolling-menu'
import 'react-horizontal-scrolling-menu/styles.css'
import { useT } from '../i18n/context'
import type { Dict } from '../i18n/dict/en'

/**
 * Which shot maps to which file. The label and alt text are copy and live in
 * `screenshots.shots.<id>`; only the filename is data, and it is the same in
 * every language because the images are of an English UI.
 */
const SHOT_IDS = [
  'blocked',
  'copy',
  'hover',
  'vpn',
  'feed',
  'keyword',
  'flagBios',
  'swipe',
] as const satisfies readonly (keyof Dict['screenshots']['shots'])[]

const SHOT_COUNT = SHOT_IDS.length

const SRC: Record<(typeof SHOT_IDS)[number], string> = {
  hover: '/Hover_screenshot-x-profile-location.png',
  copy: '/Copy_screenshot-x-profile-location.png',
  vpn: '/VPN_screenshot-x-profile-location.png',
  feed: '/Flags_screenshot-x-profile-location.png',
  blocked: '/Hidden_screenshot-x-profile-location.png',
  keyword: '/Highlight_screenshot-x-profile-location.png',
  flagBios: '/Highlight2_screenshot-x-profile-location.png',
  swipe: '/swipe_right.png',
}

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
function Thumb({ src, class: cls }: { src: string; class?: string }) {
  return (
    <picture>
      <source srcSet={thumbWebp(src)} type="image/webp" />
      <img
        src={png(src)}
        alt=""
        width="160"
        height="64"
        // Not draggable: one native image-drag would swallow the rail's
        // drag-to-scroll mid-gesture.
        draggable={false}
        class={`bg-surface h-16 w-full object-cover object-top ${cls ?? ''}`}
        loading="lazy"
        decoding="async"
      />
    </picture>
  )
}

export function Screenshots() {
  const t = useT()
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Spelled out rather than spread: the four fields are the whole shape, and
  // the spread allocated a fresh copy of each on every render.
  const shots = SHOT_IDS.map((id) => {
    const copy = t.screenshots.shots[id]
    return { id, src: SRC[id], label: copy.label, alt: copy.alt }
  })

  // Stable, so the keydown listener below can depend on them honestly: the
  // count is a constant and `setActive` takes an updater, so neither closes
  // over anything that moves.
  const prev = useCallback(
    () => setActive((i) => (i - 1 + SHOT_COUNT) % SHOT_COUNT),
    [],
  )
  const next = useCallback(() => setActive((i) => (i + 1) % SHOT_COUNT), [])

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
  }, [open, prev, next])

  const { dragProps, dragManager, dragging } = useDragToScroll()

  // The rail follows the big image: switching slides from the panel arrows or
  // keyboard must not leave the highlighted thumb scrolled out of sight.
  const railApi = useRef<publicApiType | null>(null)
  const railMounted = useRef(false)
  useEffect(() => {
    // Skip the mount run: scrollToItem is native scrollIntoView, which also
    // scrolls the *page* to reveal the rail — the site loaded ~600px down.
    if (!railMounted.current) {
      railMounted.current = true
      return
    }
    const api = railApi.current
    if (!api) return
    api.scrollToItem(
      api.getItemElementById(SHOT_IDS[active]!),
      'smooth',
      'nearest',
    )
  }, [active])

  const shot = shots[active]!

  return (
    <section id="proof" class="band-tight relative scroll-mt-24">
      <div class="shell">
        {/* This band sits narrower than the rest of the page: the source crops
            run from 298×361 to 891×438, and a full-width panel would mat a
            300px screenshot in half a metre of empty background. */}
        <div class="mx-auto w-full max-w-4xl">
          <header class="mb-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <h2 class="t-h2 reveal max-w-[22ch]">{t.screenshots.heading}</h2>
            <p class="t-body reveal max-w-[34ch] text-balance">
              {t.screenshots.lead}
            </p>
          </header>

          <div
            id={`shot-panel-${active}`}
            role="region"
            aria-labelledby={`shot-tab-${active}`}
            class="bg-surface border-line relative grid h-[var(--shot-h)] place-items-center overflow-hidden rounded-2xl border p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-8"
            style="--shot-h:clamp(19rem,44vw,27rem)"
          >
            <div class="graticule opacity-40" aria-hidden="true" />

            <picture key={shot.src}>
              <source srcSet={webp(shot.src)} type="image/webp" />
              <img
                src={png(shot.src)}
                alt={shot.alt}
                width="891"
                height="676"
                // Capped off `--shot-h` rather than `max-h-full`: a percentage
                // max-height on a grid item resolves against an auto-sized
                // row, which is indefinite, so it resolved to nothing and
                // every shot taller than the panel was cropped by
                // `overflow-hidden` instead of being scaled down.
                class="border-line/70 relative max-h-[calc(var(--shot-h)-2rem)] w-auto rounded-lg border object-contain shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)] sm:max-h-[calc(var(--shot-h)-4rem)]"
                loading="lazy"
                decoding="async"
              />
            </picture>

            <button
              type="button"
              class="text-muted hover:text-ink bg-bg/70 border-line hover:border-line-strong absolute end-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold backdrop-blur-sm transition-colors"
              onClick={() => setOpen(true)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M1.5 1h5a.5.5 0 0 1 0 1H2v4.5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 1.5 1zm13 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0V2h-4.5a.5.5 0 0 1 0-1h5zM1 9.5a.5.5 0 0 1 1 0V14h4.5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5v-5zm14 0v5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1 0-1H14V9.5a.5.5 0 0 1 1 0z" />
              </svg>
              {t.screenshots.fullSize}
            </button>

            <Arrow dir="prev" onClick={prev} t={t} />
            <Arrow dir="next" onClick={next} t={t} />
          </div>

          {/* The rail scrolls: eight thumbs outgrew the shell, and a cut-off
              eighth looked like the gallery ended at seven. ScrollMenu owns the
              overflow — its arrows appear only on the side that actually has
              more, so the edge states explain themselves.

              Plain pressed-state buttons, not a tablist: ScrollMenu's wrappers
              (scroll container, items, arrows) sit between a tablist and its
              tabs, which axe rejects as children a tablist may not own. The
              labelled scroll region + aria-pressed say the same thing without
              claiming a structure the DOM doesn't have. */}
          <div class="mt-3">
            <ScrollMenu
              apiRef={railApi}
              LeftArrow={RailLeft}
              RightArrow={RailRight}
              scrollContainerLabel={t.screenshots.railLabel}
              scrollContainerClassName={`scrollbar-none cursor-grab gap-2 pb-1 ${
                dragging ? 'cursor-grabbing select-none' : ''
              }`}
              itemClassName="flex"
              {...dragProps}
            >
              {shots.map((s, i) => {
                const on = i === active
                return (
                  <button
                    key={s.id}
                    itemId={s.id}
                    type="button"
                    id={`shot-tab-${i}`}
                    aria-pressed={on}
                    onClick={() => {
                      // Releasing a drag over a thumb is the drag ending, not
                      // a pick.
                      if (!dragManager.dragging) setActive(i)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') next()
                      if (e.key === 'ArrowLeft') prev()
                    }}
                    class={`group relative w-32 overflow-hidden rounded-lg border transition-[border-color] duration-200 ease-out ${
                      on
                        ? 'border-accent/70'
                        : 'border-line hover:border-line-strong'
                    }`}
                  >
                    {/* Dimming belongs on the image, not the button: container
                        opacity drags the caption down with it, which is what put
                        the inactive labels at 3.6:1. */}
                    <Thumb
                      src={s.src}
                      class={`transition-opacity duration-200 ease-out ${on ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'}`}
                    />
                    <span
                      class={`block px-1.5 py-1.5 text-center text-[0.625rem] leading-tight font-semibold ${on ? 'bg-accent text-bg' : 'bg-surface-2 text-body'}`}
                    >
                      {s.label}
                    </span>
                  </button>
                )
              })}
            </ScrollMenu>
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
        aria-label={t.screenshots.viewer}
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
            {shot.label} · {active + 1} / {shots.length}
          </figcaption>
        </figure>

        <button
          type="button"
          class="text-muted hover:text-ink absolute end-5 top-4 text-2xl leading-none"
          onClick={() => setOpen(false)}
          aria-label={t.screenshots.close}
        >
          ✕
        </button>
        <Arrow dir="prev" onClick={prev} t={t} />
        <Arrow dir="next" onClick={next} t={t} />
      </dialog>
    </section>
  )
}

/**
 * Drag-to-scroll for mouse users, ported from the library's example app.
 * A 5px threshold separates a drag from a click, and dragStop defers one
 * frame so click handlers can still read `dragging` and skip selection.
 * Touch needs none of this — the container is a real scroll container.
 */
class DragManager {
  clicked = false
  dragging = false
  position = 0
  resetId = 0

  dragStart = (ev: { clientX: number }) => {
    // A pending reset from the previous drag would kill this one.
    window.cancelAnimationFrame(this.resetId)
    this.position = ev.clientX
    this.clicked = true
  }

  dragStop = () => {
    // Stop applying immediately; only `dragging` waits a frame, so click
    // handlers can still read it.
    this.clicked = false
    this.resetId = window.requestAnimationFrame(() => {
      this.dragging = false
    })
  }

  dragMove = (ev: { clientX: number }, cb: (delta: number) => void) => {
    const newDiff = this.position - ev.clientX

    if (this.clicked && Math.abs(newDiff) > 5) {
      this.dragging = true
      this.position = ev.clientX
      cb(newDiff)
    }
  }
}

function useDragToScroll() {
  const [dragManager] = useState(() => new DragManager())
  const [dragging, setDragging] = useState(false)

  const dragProps = {
    onMouseDown: () => (ev: { clientX: number }) => {
      dragManager.dragStart(ev)
      setDragging(true)
    },
    onMouseUp: () => () => {
      dragManager.dragStop()
      setDragging(false)
    },
    onMouseLeave: () => () => {
      dragManager.dragStop()
      setDragging(false)
    },
    onMouseMove:
      ({ scrollContainer }: publicApiType) =>
      (ev: { clientX: number }) =>
        dragManager.dragMove(ev, (delta) => {
          if (scrollContainer.current) {
            scrollContainer.current.scrollLeft += delta
          }
        }),
  }

  return { dragProps, dragManager, dragging }
}

/** Rail chevrons: both always drawn; the exhausted side is disabled, so the
 *  rail's edges read as edges rather than as a control that comes and goes. */
function RailChevron({ dir }: { dir: 'prev' | 'next' }) {
  const api = useContext<publicApiType>(VisibilityContext)
  const isPrev = dir === 'prev'
  // Misnamed upstream: use*ArrowVisible() returns whether the EDGE item is
  // visible — the arrow's disabled state, not its visibility.
  const edgeItemVisible = isPrev
    ? api.useLeftArrowVisible()
    : api.useRightArrowVisible()

  return (
    <button
      type="button"
      // The rail is its own tab stop and the thumbs are focusable; a stop per
      // side would make keyboard users walk chevrons they don't need.
      tabIndex={-1}
      aria-hidden="true"
      disabled={edgeItemVisible}
      onClick={() => (isPrev ? api.scrollPrev() : api.scrollNext())}
      class={`text-muted hover:text-ink bg-bg/70 border-line hover:border-line-strong disabled:hover:text-muted disabled:hover:border-line self-center rounded-full border p-1.5 backdrop-blur-sm transition-colors disabled:opacity-35 ${
        isPrev ? 'me-2' : 'ms-2'
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="rtl:-scale-x-100"
        aria-hidden="true"
      >
        <polyline points={isPrev ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
      </svg>
    </button>
  )
}

const RailLeft = () => <RailChevron dir="prev" />
const RailRight = () => <RailChevron dir="next" />

function Arrow({
  dir,
  onClick,
  t,
}: {
  dir: 'prev' | 'next'
  onClick: () => void
  t: Dict
}) {
  const isPrev = dir === 'prev'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? t.screenshots.prev : t.screenshots.next}
      // `start`/`end` rather than `left`/`right`, and the chevron mirrors with
      // them: "previous" is the direction you read *from*, whichever that is.
      class={`text-muted hover:text-ink bg-bg/70 border-line hover:border-line-strong absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border backdrop-blur-sm transition-colors ${
        isPrev ? 'start-2 sm:start-3' : 'end-2 sm:end-3'
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
        class="rtl:-scale-x-100"
        aria-hidden="true"
      >
        <polyline points={isPrev ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
      </svg>
    </button>
  )
}
