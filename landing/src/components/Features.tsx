import type { VNode } from 'preact'

interface Feature {
  icon: () => VNode
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: PerfIcon,
    title: 'Performance',
    description:
      'Built with a slim rendering engine that optimizes interface output while you browse — zero lag, zero bloat.',
  },
  {
    icon: PrivacyIcon,
    title: 'Privacy',
    description:
      'Your data stays on your machine. We never store, transmit, or sell your browsing or profile data.',
  },
  {
    icon: SyncIcon,
    title: 'Seamless Sync',
    description:
      'Access your curated profiles from any device with secure, end-to-end encrypted cloud sync.',
  },
]

export function Features() {
  return (
    <section class="bg-[#edeef7] pb-24">
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
      <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b0b12]/8">
        <feature.icon />
      </div>
      <div>
        <h3 class="text-base font-bold text-[#0b0b12] mb-1">{feature.title}</h3>
        <p class="text-sm text-[#0b0b12]/60 leading-relaxed">{feature.description}</p>
      </div>
    </div>
  )
}

function PerfIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00d4c0"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

function PrivacyIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00d4c0"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00d4c0"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
  )
}
