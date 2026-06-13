import { useEffect, useRef } from 'preact/hooks'
import { InstallButton } from './InstallButton'

export function Hero() {
  return (
    <section
      class="bg-dark relative flex min-h-screen items-center overflow-hidden"
      style="background-image: radial-gradient(rgba(255,255,255,0.15) 1.5px, transparent 1.5px); background-size: 28px 28px;"
    >
      {/* Bottom border */}
      <div class="bg-border pointer-events-none absolute right-0 bottom-0 left-0 h-px" />

      <div class="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <div class="flex flex-col items-center gap-16 lg:flex-row">
          {/* Left: copy */}
          <div class="max-w-xl flex-1">
            <h1 class="mb-6 text-5xl leading-tight font-extrabold tracking-tight text-white lg:text-7xl">
              See Where Every
              <br />
              <span class="text-teal">X Profile Is From</span>
            </h1>

            <p class="mb-10 max-w-md text-lg leading-relaxed text-[#a0a3ab]">
              Hover any X profile to instantly see their real country. Powered
              by X's own location data.
            </p>

            <div class="flex flex-wrap items-center gap-4">
              <InstallButton size="sm" />
            </div>
          </div>

          {/* Right: hover card mockup */}
          <div class="flex flex-1 justify-center lg:justify-end">
            <HoverCardMockup />
          </div>
        </div>
      </div>
    </section>
  )
}

function HoverCardMockup() {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const MAX_TILT = 12 // degrees

    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v))

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      // normalise to -1 … 1, clamped so distant cursor doesn't over-rotate
      const nx = clamp((e.clientX - cx) / (rect.width / 2), -1, 1)
      const ny = clamp((e.clientY - cy) / (rect.height / 2), -1, 1)
      const ry = nx * MAX_TILT // horizontal mouse → Y-axis rotation
      const rx = -ny * MAX_TILT // vertical mouse → X-axis rotation (inverted)
      el.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`
    }

    const onLeave = () => {
      el.style.transform = 'rotateY(-6deg) rotateX(3deg)'
    }

    // listen on the whole hero section so tilt responds before the cursor is over the card
    const section = el.closest('section')!
    section.addEventListener('mousemove', onMove)
    section.addEventListener('mouseleave', onLeave)
    return () => {
      section.removeEventListener('mousemove', onMove)
      section.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div class="relative w-full max-w-sm" style="perspective: 1000px;">
      {/* No glow — flat X aesthetic */}

      {/* X Feed background */}
      <div
        ref={cardRef}
        class="border-border bg-dark-card relative space-y-3 overflow-hidden rounded-2xl border p-4 shadow-[0_8px_60px_-12px_rgba(109,158,122,0.15)] transition-transform duration-150 ease-out"
        style="transform: rotateY(-6deg) rotateX(3deg);"
      >
        {/* Feed items */}
        {[1, 2].map((i) => (
          <div
            key={i}
            class="border-border space-y-2 rounded-xl border bg-white/3 p-3"
          >
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 shrink-0 rounded-full bg-white/15" />
              <div class="space-y-1">
                <div class="h-2.5 w-24 rounded bg-white/30" />
                <div class="h-2 w-16 rounded bg-white/15" />
              </div>
            </div>
            <div class="space-y-1.5">
              <div class="h-2 w-full rounded bg-white/12" />
              <div class="h-2 w-4/5 rounded bg-white/8" />
            </div>
          </div>
        ))}

        {/* Hover card overlay */}
        <div class="border-border bg-dark space-y-3 rounded-xl border p-4">
          {/* Profile row */}
          <div class="flex items-start gap-3">
            <div class="bg-sage/30 h-12 w-12 shrink-0 rounded-full" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3 w-28 rounded bg-white/50" />
              <div class="h-2.5 w-20 rounded bg-white/25" />
              {/* Location row injected by extension */}
              <div class="mt-1 flex items-center gap-1.5">
                <span class="text-xl leading-none">🇩🇪</span>
                <span class="text-xs text-white/50">Germany</span>
              </div>
            </div>
          </div>
          {/* Bio */}
          <div class="space-y-1.5">
            <div class="h-2 w-full rounded bg-white/15" />
            <div class="h-2 w-3/4 rounded bg-white/10" />
          </div>
          {/* Stats row */}
          <div class="flex gap-4">
            <div class="space-y-0.5">
              <div class="h-3 w-8 rounded bg-white/30" />
              <div class="h-2 w-12 rounded bg-white/12" />
            </div>
            <div class="space-y-0.5">
              <div class="h-3 w-8 rounded bg-white/30" />
              <div class="h-2 w-12 rounded bg-white/12" />
            </div>
          </div>
          {/* Extension badge label */}
          <div class="border-border flex items-center gap-1.5 border-t pt-1">
            <span class="text-sage text-[10px] font-medium tracking-wide uppercase">
              X Profile Location
            </span>
          </div>
        </div>

        {/* VPN example row */}
        <div class="border-border rounded-xl border bg-white/3 p-3">
          <div class="flex items-center gap-2">
            <div class="h-8 w-8 shrink-0 rounded-full bg-white/15" />
            <div class="flex-1 space-y-1">
              <div class="h-2.5 w-24 rounded bg-white/30" />
              <div class="flex items-center gap-1.5">
                <span class="text-base leading-none">🇺🇸</span>
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style="background: rgba(220,38,38,0.15); color: rgb(200,25,25); border: 1px solid rgba(220,38,38,0.4);"
                >
                  ⚠ VPN
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
