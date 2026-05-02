export function SeeItInAction() {
  return (
    <section class="bg-surface py-24">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Heading */}
        <div class="text-center mb-14">
          <h2 class="text-4xl font-extrabold text-white tracking-tight mb-4">
            See It in Action
          </h2>
          <p class="text-lg text-[#a0a3ab] max-w-xl mx-auto">
            Works on hover cards, profile pages, and individual tweets — no setup needed.
          </p>
        </div>

        {/* 2×2 grid */}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card
            title="Country Flag on Hover"
            description="See the real country flag directly in hover cards — no clicks needed."
            accentColor="#6b9e7a"
            preview={<CountryFlagPreview />}
          />
          <Card
            title="VPN Detection"
            description="When X flags a location as potentially inaccurate, a ⚠ VPN badge appears next to the flag."
            accentColor="#d4736e"
            preview={<VpnPreview />}
          />
          <Card
            title="Registration Country"
            description="See which country's app store was used to create the account — shown as a 📱 badge before the location flag."
            accentColor="#c9a461"
            preview={<MobilePreview />}
          />
          <Card
            title="Lookup Cooldown"
            description="When X temporarily limits lookups, a countdown shows exactly when they'll resume."
            accentColor="#d19a66"
            preview={<RateLimitPreview />}
          />
          <Card
            title="Keyword & Flag Filters"
            description="Configure keyword and flag-count highlights from the built-in options popup."
            accentColor="#1d9bf0"
            preview={<OptionsPreview />}
          />
          <Card
            title="Highlighted Tweets"
            description="Tweets from users matching your keywords or flag patterns are marked with an amber highlight so they stand out."
            accentColor="#f59e0b"
            preview={<HighlightedTweetPreview />}
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
    <div
      class="rounded-2xl overflow-hidden border border-border hover:border-white/20 transition-all duration-200 ease-out hover:-translate-y-0.5"
      style={`background: #252830; border-top: 2px solid ${accentColor};`}
    >
      {/* Preview area */}
      <div
        class="relative h-44 flex items-center justify-center overflow-hidden"
        style="background: #1c1e24;"
      >
        <div class="relative">{preview}</div>
      </div>

      {/* Text */}
      <div class="px-5 py-4">
        <h3 class="text-base font-bold text-white mb-1.5">{title}</h3>
        <p class="text-sm text-[#d0d2d8] leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline hover-card skeleton used by the previews
// ---------------------------------------------------------------------------
function HoverCard({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="rounded-xl border border-border bg-dark-card p-3 w-56 space-y-2.5">
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
      <span
        class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded"
        style="background:rgba(168,85,247,.12);color:rgb(180,100,255);border:1px solid rgba(168,85,247,.3);"
      >
        <span>📱</span>
        <span>🇯🇵</span>
      </span>
      <span class="text-base leading-none">🇯🇵</span>
      <span class="text-xs text-white/55">Japan</span>
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

function OptionsPreview() {
  return (
    <div
      class="rounded-xl overflow-hidden shadow-lg w-52"
      style="background:#fff; transform:scale(0.82); transform-origin:center;"
    >
      {/* title bar */}
      <div style="padding:10px 12px 6px; border-bottom:1px solid #e5e7eb;">
        <span style="font-size:13px;font-weight:700;color:#111;">Options</span>
      </div>
      {/* keyword accordion */}
      <div style="margin:8px;border:1px solid #e5e7eb;border-top:2px solid #f59e0b;border-radius:8px;overflow:hidden;">
        <div style="padding:7px 10px;font-size:10px;font-weight:600;color:#111;display:flex;justify-content:space-between;align-items:center;">
          <span>Highlight by keyword 🔍</span>
          <span style="color:#6b7280;font-size:9px;">▾</span>
        </div>
        <div style="padding:6px 10px 8px;border-top:1px solid #e5e7eb;">
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;border-radius:5px;padding:2px 6px;font-size:9px;">nafo</span>
            <span style="background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;border-radius:5px;padding:2px 6px;font-size:9px;">crypto</span>
          </div>
          <div style="border:1px solid #d1d5db;border-radius:5px;padding:3px 7px;font-size:9px;color:#9ca3af;">Type a keyword…</div>
        </div>
      </div>
      {/* flags accordion */}
      <div style="margin:0 8px 8px;border:1px solid #e5e7eb;border-top:2px solid #1d9bf0;border-radius:8px;overflow:hidden;">
        <div style="padding:7px 10px;font-size:10px;font-weight:600;color:#111;display:flex;justify-content:space-between;align-items:center;">
          <span>Highlight by flags 🏴</span>
          <span style="color:#6b7280;font-size:9px;">▸</span>
        </div>
      </div>
    </div>
  )
}

function HighlightedTweetPreview() {
  return (
    <div class="space-y-2 w-56">
      {/* normal tweet */}
      <div class="rounded-lg border p-3" style="background:#1c1e24;border-color:rgba(255,255,255,0.1);">
        <div class="flex gap-2">
          <div class="h-6 w-6 rounded-full shrink-0" style="background:rgba(255,255,255,0.15);" />
          <div class="flex-1 space-y-1.5">
            <div class="h-2 w-20 rounded" style="background:rgba(255,255,255,0.4);" />
            <div class="h-1.5 w-full rounded" style="background:rgba(255,255,255,0.1);" />
            <div class="h-1.5 w-3/4 rounded" style="background:rgba(255,255,255,0.07);" />
          </div>
        </div>
      </div>
      {/* highlighted tweet */}
      <div
        class="rounded-lg border p-3"
        style="background:rgba(245,158,11,0.07);border-color:rgba(255,255,255,0.1);border-left:3px solid #f59e0b;"
      >
        <div class="flex gap-2">
          <div class="h-6 w-6 rounded-full shrink-0" style="background:rgba(255,255,255,0.15);" />
          <div class="flex-1 space-y-1.5">
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-16 rounded" style="background:rgba(255,255,255,0.4);" />
              <span style="font-size:9px;color:#fbbf24;font-weight:600;">crypto • nft</span>
            </div>
            <div class="h-1.5 w-full rounded" style="background:rgba(255,255,255,0.1);" />
            <div class="h-1.5 w-2/3 rounded" style="background:rgba(255,255,255,0.07);" />
          </div>
        </div>
      </div>
    </div>
  )
}
