import { InstallButton } from './InstallButton'

export function CTA() {
  return (
    <section class="relative overflow-hidden bg-dark py-28">
      {/* Glow */}
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-48 rounded-full bg-teal/10 blur-[80px]" />
      </div>

      <div class="relative mx-auto max-w-3xl px-6 lg:px-8 text-center">
        <h2 class="text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-4">
          Know where every profile is from.
        </h2>
        <p class="text-lg text-white/50 mb-10 max-w-lg mx-auto">
          Core features are free. Advanced features — are coming as a paid upgrade.
        </p>

        <div class="flex flex-wrap items-center justify-center gap-4">
          <InstallButton size="lg" />
        </div>
      </div>
    </section>
  )
}
