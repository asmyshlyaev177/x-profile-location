import { InstallButton } from './InstallButton'
import { useT } from '../i18n/context'

/* The one fold where colour carries the whole surface. */
export function CTA() {
  const t = useT()

  return (
    <section class="bg-accent relative overflow-hidden">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 opacity-[0.16]"
        style="background-image:radial-gradient(var(--bg) 1.5px, transparent 1.5px);background-size:26px 26px;-webkit-mask-image:radial-gradient(120% 100% at 50% 0%, #000, transparent 75%);mask-image:radial-gradient(120% 100% at 50% 0%, #000, transparent 75%)"
      />

      <div class="shell relative py-[clamp(4.5rem,9vw,8rem)]">
        <h2
          class="t-display text-bg max-w-[24ch]"
          style="font-size:clamp(2.25rem,4.6vw,3.75rem)"
        >
          {t.cta.heading}
        </h2>

        <div class="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
          <InstallButton size="lg" tone="void" placement="cta" />
          <p class="text-bg max-w-[26ch] text-[0.9375rem] leading-snug font-semibold">
            {t.cta.body}
          </p>
        </div>
      </div>
    </section>
  )
}
