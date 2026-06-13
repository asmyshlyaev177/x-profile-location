import { InstallButton } from './InstallButton'

export function CTA() {
  return (
    <section
      class="bg-dark relative overflow-hidden py-28"
      style="background: radial-gradient(ellipse at center, #0d0d12 0%, #000000 70%);"
    >
      {/* Top border */}
      <div class="bg-border absolute top-0 right-0 left-0 h-px" />

      <div class="relative mx-auto max-w-3xl px-6 text-center lg:px-8">
        <h2 class="mb-4 text-4xl font-extrabold tracking-tight text-white lg:text-5xl">
          Know where every profile is from.
        </h2>
        <p class="mx-auto mb-10 max-w-lg text-lg text-[#a0a3ab]">
          Free to use. Install in seconds.
        </p>

        <div class="flex flex-wrap items-center justify-center gap-4">
          <InstallButton size="lg" />
        </div>
      </div>
    </section>
  )
}
