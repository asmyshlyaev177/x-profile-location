export function SeeItInAction() {
  return (
    <section class="bg-surface py-24">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Heading */}
        <div class="text-center mb-14">
          <h2 class="text-4xl font-extrabold text-dark tracking-tight mb-4">
            See it in Action
          </h2>
          <p class="text-lg text-dark/60 max-w-xl mx-auto">
            Works on hover cards across the feed, profile pages, and tweet
            detail views — no config needed.
          </p>
        </div>

        {/* 2×2 grid */}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card
            title="Country Flag on Hover"
            description="Instantly shows the verified country flag from X's own location data right inside every hover card."
            accentColor="#00d4c0"
            preview={<CountryFlagPreview />}
          />
          <Card
            title="VPN Detection"
            description="When X marks a location as potentially inaccurate a ⚠ VPN badge appears next to the flag."
            accentColor="#ef4444"
            preview={<VpnPreview />}
          />
          <Card
            title="Mobile App Store Country"
            description="Accounts registered via Android or iOS show a 📱 badge with the App Store country alongside the flag."
            accentColor="#a855f7"
            preview={<MobilePreview />}
          />
          <Card
            title="Rate Limit Timer"
            description="When X's API rate limit is hit, a live countdown shows exactly how long until lookups resume."
            accentColor="#f59e0b"
            preview={<RateLimitPreview />}
          />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------
function Card({
  title,
  description,
  accentColor,
  preview,
}: {
  title: string
  description: string
  accentColor: string
  preview: preact.ComponentChildren
}) {
  return (
    <div class="rounded-2xl overflow-hidden bg-dark-card border border-white/8 shadow-lg">
      {/* Preview area */}
      <div class="relative h-44 flex items-center justify-center overflow-hidden" style="background: #131320;">
        <div
          class="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 blur-3xl opacity-20 rounded-full"
          style={`background: ${accentColor};`}
        />
        <div class="relative">{preview}</div>
      </div>

      {/* Text */}
      <div class="px-5 py-4">
        <h3 class="text-base font-bold text-white mb-1.5">{title}</h3>
        <p class="text-xs text-white/50 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline hover-card skeleton used by the previews
// ---------------------------------------------------------------------------
function HoverCard({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="rounded-xl border border-white/12 bg-dark p-3 w-56 space-y-2.5">
      <div class="flex items-start gap-2.5">
        <div class="h-8 w-8 rounded-full bg-white/15 shrink-0" />
        <div class="flex-1 space-y-1.5 pt-0.5">
          <div class="h-2.5 w-20 rounded bg-white/40" />
          <div class="h-2 w-14 rounded bg-white/20" />
          {/* injected row */}
          <div class="flex items-center gap-1.5">{children}</div>
        </div>
      </div>
      <div class="space-y-1.5">
        <div class="h-1.5 w-full rounded bg-white/10" />
        <div class="h-1.5 w-3/4 rounded bg-white/7" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-card previews
// ---------------------------------------------------------------------------
function CountryFlagPreview() {
  return (
    <HoverCard>
      <span class="text-lg leading-none">🇩🇪</span>
      <span class="text-xs text-white/55">Germany</span>
    </HoverCard>
  )
}

function VpnPreview() {
  return (
    <HoverCard>
      <span class="text-base leading-none">🇺🇸</span>
      <span
        class="text-[10px] font-bold px-1.5 py-0.5 rounded"
        style="background:rgba(220,38,38,.15);color:rgb(200,25,25);border:1px solid rgba(220,38,38,.4);"
      >
        ⚠ VPN
      </span>
    </HoverCard>
  )
}

function MobilePreview() {
  return (
    <HoverCard>
      <span class="text-base leading-none">🇯🇵</span>
      <span class="text-xs text-white/55">Japan</span>
      <span
        class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded"
        style="background:rgba(168,85,247,.12);color:rgb(180,100,255);border:1px solid rgba(168,85,247,.3);"
      >
        <span>📱</span>
        <span>🇯🇵</span>
      </span>
    </HoverCard>
  )
}

function RateLimitPreview() {
  return (
    <HoverCard>
      <span
        class="text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1"
        style="background:rgba(180,120,0,.12);color:rgb(160,100,0);border:1px solid rgba(180,120,0,.4);"
      >
        <span>⏱</span>
        <span>4m 32s</span>
      </span>
    </HoverCard>
  )
}
