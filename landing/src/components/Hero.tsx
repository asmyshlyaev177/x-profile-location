export function Hero() {
  return (
    <section class="relative overflow-hidden bg-[#0b0b12] min-h-screen flex items-center">
      {/* Background glow blobs */}
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-teal/10 blur-[120px]" />
        <div class="absolute top-1/2 right-0 w-[360px] h-[360px] rounded-full bg-teal/8 blur-[100px] -translate-y-1/2" />
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
              Your Browser,
              <br />
              <span class="text-teal">Reimagined</span>
            </h1>

            <p class="text-lg text-white/60 leading-relaxed mb-10 max-w-md">
              Explore X&nbsp;/&nbsp;Twitter profiles with a beautiful reading
              mode, smart curation dashboard, and seamless sync across all your
              devices.
            </p>

            <div class="flex flex-wrap items-center gap-4">
              <a
                href="#"
                class="inline-flex items-center gap-2 rounded-full bg-teal px-6 py-3 text-sm font-semibold text-[#0b0b12] hover:bg-teal-dark transition-colors"
              >
                <ChromeIcon />
                Add to Chrome
              </a>
              <a
                href="#"
                class="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:border-white/40 hover:bg-white/5 transition-colors"
              >
                <FirefoxIcon />
                Add to Firefox
              </a>
            </div>
          </div>

          {/* Right: browser mockup */}
          <div class="flex-1 flex justify-center lg:justify-end">
            <BrowserMockup />
          </div>
        </div>
      </div>
    </section>
  )
}

function BrowserMockup() {
  return (
    <div
      class="relative w-full max-w-lg"
      style="perspective: 1200px; transform-style: preserve-3d;"
    >
      {/* Outer glow */}
      <div class="absolute inset-0 rounded-2xl bg-teal/20 blur-3xl scale-95" />

      <div
        class="relative rounded-2xl border border-white/10 bg-[#131320] shadow-2xl overflow-hidden"
        style="transform: rotateY(-8deg) rotateX(4deg);"
      >
        {/* Browser chrome */}
        <div class="flex items-center gap-2 px-4 py-3 border-b border-white/8 bg-[#0f0f1c]">
          <span class="h-3 w-3 rounded-full bg-red-500/70" />
          <span class="h-3 w-3 rounded-full bg-yellow-500/70" />
          <span class="h-3 w-3 rounded-full bg-green-500/70" />
          <div class="ml-3 flex-1 h-6 rounded-full bg-white/8 flex items-center px-3">
            <span class="text-[10px] text-white/30">x.com/profile</span>
          </div>
        </div>

        {/* Content area */}
        <div class="p-4 space-y-3">
          {/* Profile header */}
          <div class="flex items-center gap-3 p-3 rounded-xl bg-teal/10 border border-teal/20">
            <div class="h-10 w-10 rounded-full bg-teal/40" />
            <div class="space-y-1.5">
              <div class="h-3 w-24 rounded bg-white/40" />
              <div class="h-2 w-16 rounded bg-white/20" />
            </div>
            <div class="ml-auto h-7 w-20 rounded-full bg-teal/60" />
          </div>

          {/* Feed items */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              class="rounded-xl border border-white/6 bg-white/4 p-3 space-y-2"
            >
              <div class="flex items-center gap-2">
                <div class="h-6 w-6 rounded-full bg-white/20" />
                <div class="h-2 w-20 rounded bg-white/25" />
              </div>
              <div class="space-y-1.5">
                <div class="h-2 w-full rounded bg-white/15" />
                <div class="h-2 w-4/5 rounded bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChromeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  )
}

function FirefoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
    </svg>
  )
}
