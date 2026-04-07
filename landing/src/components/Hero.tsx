import { InstallButton } from './InstallButton'

export function Hero() {
  return (
    <section class="relative overflow-hidden bg-dark min-h-screen flex items-center">
      {/* Background glow blobs */}
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute -top-32 -left-32 w-120 h-120 rounded-full bg-teal/10 blur-[120px]" />
        <div class="absolute top-1/2 right-0 w-90 h-90 rounded-full bg-teal/8 blur-[100px] -translate-y-1/2" />
      </div>

      <div class="relative mx-auto max-w-7xl px-6 lg:px-8 py-24 w-full">
        <div class="flex flex-col lg:flex-row items-center gap-16">
          {/* Left: copy */}
          <div class="flex-1 max-w-xl">
            {/* Badge */}
            <div class="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-4 py-1.5 mb-8">
              <span class="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
              <span class="text-xs font-medium text-teal tracking-wide uppercase">
                Chrome &amp; Firefox Extension
              </span>
            </div>

            <h1 class="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-white mb-6">
              See Where Every
              <br />
              <span class="text-teal">X Profile Is From</span>
            </h1>

            <p class="text-lg text-white/60 leading-relaxed mb-10 max-w-md">
              Hover any X&nbsp;/&nbsp;Twitter profile and instantly see their
              real country flag — powered by X's own verified location data.
              Includes VPN detection and per-country blocking.
            </p>

            <div class="flex flex-wrap items-center gap-4">
              <InstallButton size="sm" />
            </div>
          </div>

          {/* Right: hover card mockup */}
          <div class="flex-1 flex justify-center lg:justify-end">
            <HoverCardMockup />
          </div>
        </div>
      </div>
    </section>
  )
}

function HoverCardMockup() {
  return (
    <div class="relative w-full max-w-sm" style="perspective: 1000px;">
      {/* Outer glow */}
      <div class="absolute inset-0 rounded-2xl bg-teal/20 blur-3xl scale-90 opacity-60" />

      {/* X Feed background */}
      <div
        class="relative rounded-2xl border border-white/10 bg-dark-card shadow-2xl overflow-hidden p-4 space-y-3"
        style="transform: rotateY(-6deg) rotateX(3deg);"
      >
        {/* Feed items */}
        {[1, 2].map((i) => (
          <div key={i} class="rounded-xl border border-white/6 bg-white/3 p-3 space-y-2">
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 rounded-full bg-white/15 shrink-0" />
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
        <div class="rounded-xl border border-teal/30 bg-[#0f0f1c] shadow-lg p-4 space-y-3">
          {/* Profile row */}
          <div class="flex items-start gap-3">
            <div class="h-12 w-12 rounded-full bg-teal/30 shrink-0" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3 w-28 rounded bg-white/50" />
              <div class="h-2.5 w-20 rounded bg-white/25" />
              {/* Location row injected by extension */}
              <div class="flex items-center gap-1.5 mt-1">
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
          <div class="flex items-center gap-1.5 pt-1 border-t border-white/6">
            <span class="text-[10px] text-teal/60 font-medium uppercase tracking-wide">
              X Profile Location
            </span>
          </div>
        </div>

        {/* VPN example row */}
        <div class="rounded-xl border border-white/6 bg-white/3 p-3">
          <div class="flex items-center gap-2">
            <div class="h-8 w-8 rounded-full bg-white/15 shrink-0" />
            <div class="flex-1 space-y-1">
              <div class="h-2.5 w-24 rounded bg-white/30" />
              <div class="flex items-center gap-1.5">
                <span class="text-base leading-none">🇺🇸</span>
                <span
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded"
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
