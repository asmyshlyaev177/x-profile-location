import { InstallButton } from './InstallButton'

/* The one fold where colour carries the whole surface. Cyan is the mark; the
   page has been saving it for this. */
export function CTA() {
  return (
    <section class="bg-signal relative overflow-hidden">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 opacity-[0.16]"
        style="background-image:radial-gradient(var(--color-void) 1.5px, transparent 1.5px);background-size:26px 26px;-webkit-mask-image:radial-gradient(120% 100% at 50% 0%, #000, transparent 75%);mask-image:radial-gradient(120% 100% at 50% 0%, #000, transparent 75%)"
      />

      <div class="shell relative py-[clamp(4.5rem,9vw,8rem)]">
        <h2
          class="t-display text-void"
          style="font-size:clamp(2.25rem,4.6vw,3.75rem);max-width:24ch"
        >
          Stop guessing where the timeline comes from.
        </h2>

        <div class="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
          <InstallButton size="lg" tone="void" />
          <p class="text-void/75 max-w-[26ch] text-[0.9375rem] leading-snug font-semibold">
            Free, and it works the moment it installs. There’s no account to
            create.
          </p>
        </div>
      </div>
    </section>
  )
}
