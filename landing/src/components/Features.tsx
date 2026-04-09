import type { VNode } from 'preact'

interface Feature {
  icon: () => VNode
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: FlagIcon,
    title: 'Instant Country Flags',
    description:
      'Country flag and region appear directly in X hover cards and tweet pages — no clicks, no popups, just glanceable context.',
  },
  {
    icon: VpnIcon,
    title: 'VPN Detection',
    description:
      "When X marks a profile's location as potentially inaccurate, a ⚠ VPN badge appears so you know to take the location with a grain of salt.",
  },
  {
    icon: BlockIcon,
    title: 'Per-Country Blocking',
    description:
      'Mark specific countries in the options page to replace their flags with ⚠️ — useful for quickly spotting accounts from certain regions.',
  },
]

export function Features() {
  return (
    <section class="bg-surface pb-24 border-t border-border">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-10">
          {features.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div class="flex flex-col items-start gap-4">
      <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
        <feature.icon />
      </div>
      <div>
        <h3 class="text-base font-bold text-white mb-1">{feature.title}</h3>
        <p class="text-sm text-secondary leading-relaxed">{feature.description}</p>
      </div>
    </div>
  )
}

function FlagIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1d9bf0"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function VpnIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1d9bf0"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function BlockIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1d9bf0"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  )
}
