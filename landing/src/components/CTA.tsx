import { InstallButton } from './InstallButton'

export function CTA() {
  return (
    <section
      class="relative overflow-hidden bg-dark py-28"
      style="background: radial-gradient(ellipse at center, #0d0d12 0%, #000000 70%);"
    >
      {/* Top border */}
      <div class="absolute top-0 left-0 right-0 h-px bg-border" />

      <div class="relative mx-auto max-w-3xl px-6 lg:px-8 text-center">
        <h2 class="text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-4">
          Know where every profile is from.
        </h2>
        <p class="text-lg text-[#a0a3ab] mb-10 max-w-lg mx-auto">
          Free to use. Install in seconds.
        </p>

        <div class="flex flex-wrap items-center justify-center gap-4">
          <InstallButton size="lg" />
        </div>
      </div>
    </section>
  )
}
