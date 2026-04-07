export function SeeItInAction() {
  return (
    <section class="bg-[#edeef7] py-24">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Heading */}
        <div class="text-center mb-16">
          <h2 class="text-4xl font-extrabold text-[#0b0b12] tracking-tight mb-4">
            See it in Action
          </h2>
          <p class="text-lg text-[#0b0b12]/60 max-w-xl mx-auto">
            Browse X&nbsp;/&nbsp;Twitter with an interface that finally puts you
            in control — fast, clean, and distraction-free.
          </p>
        </div>

        {/* Screenshot cards */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ScreenshotCard
            title="Refined Reading Mode"
            description="One-click distraction-free viewing lets you focus on the content that matters, filtering out noise from the timeline."
            accentColor="teal"
          />
          <ScreenshotCard
            title="Smart Curation Dashboard"
            description="Organize your followed profiles and curated lists with an intelligent filter engine and beautiful legacy display."
            accentColor="purple"
          />
        </div>
      </div>
    </section>
  )
}

interface ScreenshotCardProps {
  title: string
  description: string
  accentColor: 'teal' | 'purple'
}

function ScreenshotCard({ title, description, accentColor }: ScreenshotCardProps) {
  const accent = accentColor === 'teal' ? '#00d4c0' : '#8b5cf6'

  return (
    <div class="rounded-2xl overflow-hidden bg-[#0f0f1c] border border-white/8 shadow-xl">
      {/* Mock screenshot */}
      <div class="relative h-64 p-4 overflow-hidden" style={`background: #131320;`}>
        {/* Glow */}
        <div
          class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 blur-3xl opacity-30 rounded-full"
          style={`background: ${accent};`}
        />

        {/* Browser chrome */}
        <div class="relative rounded-xl overflow-hidden border border-white/10 h-full">
          <div class="flex items-center gap-1.5 px-3 py-2 bg-[#0b0b12] border-b border-white/8">
            <span class="h-2 w-2 rounded-full bg-white/20" />
            <span class="h-2 w-2 rounded-full bg-white/20" />
            <span class="h-2 w-2 rounded-full bg-white/20" />
            <div class="ml-2 flex-1 h-4 rounded bg-white/8" />
          </div>

          <div class="p-3 space-y-2 bg-[#131320] h-full">
            {/* Sidebar + content layout */}
            <div class="flex gap-2 h-full">
              {/* Sidebar */}
              <div class="w-16 space-y-2 flex-shrink-0">
                {[40, 30, 35, 28].map((w, i) => (
                  <div
                    key={i}
                    class="h-2 rounded"
                    style={`width: ${w}px; background: ${i === 0 ? accent + '60' : 'rgba(255,255,255,0.12)'};`}
                  />
                ))}
              </div>
              {/* Main content */}
              <div class="flex-1 space-y-2">
                {/* Profile strip */}
                <div
                  class="rounded-lg p-2 flex items-center gap-2"
                  style={`background: ${accent}18; border: 1px solid ${accent}30;`}
                >
                  <div class="h-5 w-5 rounded-full" style={`background: ${accent}60;`} />
                  <div class="h-2 w-20 rounded bg-white/30" />
                </div>
                {/* Content rows */}
                {[1, 2, 3].map((i) => (
                  <div key={i} class="rounded-lg p-2 bg-white/4 space-y-1.5">
                    <div class="h-2 w-full rounded bg-white/20" />
                    <div class="h-2 w-3/4 rounded bg-white/12" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Text */}
      <div class="px-6 py-5">
        <h3 class="text-lg font-bold text-white mb-2">{title}</h3>
        <p class="text-sm text-white/50 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
