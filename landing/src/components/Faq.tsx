import type { FaqItem } from '../routes'

/**
 * Native `<details>` on purpose: the answers must be in the prerendered HTML
 * whether or not hydration ever runs, and this page defers hydration to idle.
 * A JS accordion would put the crawlable half of the page behind a click.
 *
 * The same array is emitted as FAQPage structured data in `seo.ts` — never
 * reword one without the other.
 */
export function Faq({
  items,
  heading = 'Questions people actually ask',
  id = 'faq',
}: {
  items: FaqItem[]
  heading?: string
  id?: string
}) {
  if (!items.length) return null

  return (
    <section id={id} class="bg-ink-1 hairline band relative scroll-mt-24">
      {/* Same measure as the prose sections on the guide pages, so an article
          and the questions under it share one left edge. */}
      <div class="shell-narrow max-w-3xl!">
        <h2 class="t-h2 reveal max-w-[24ch]">{heading}</h2>

        {/* Not a <dl>: the question has to sit inside <summary> to be the
            control, and <dt> is only valid as a direct child of <dl>. */}
        <div class="border-hair mt-12 border-t">
          {items.map((item, i) => (
            <details
              key={item.q}
              class="border-hair reveal group border-b"
              style={`animation-delay:${Math.min(i, 4) * 70}ms`}
            >
              {/* `list-none` kills the triangle in Firefox, the webkit
                  pseudo-element kills it in Safari and Chrome. Both needed. */}
              <summary class="flex cursor-pointer list-none items-start gap-4 py-5 [&::-webkit-details-marker]:hidden">
                <h3 class="text-text flex-1 text-[1.0625rem] font-semibold">
                  {item.q}
                </h3>
                {/* A plus that becomes a minus. Two rules beat an icon font. */}
                <span
                  aria-hidden="true"
                  class="text-signal relative mt-1 h-4 w-4 shrink-0"
                >
                  <span class="bg-signal absolute top-1/2 left-0 h-px w-4 -translate-y-1/2" />
                  <span class="bg-signal absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 transition-transform duration-200 group-open:scale-y-0" />
                </span>
              </summary>
              <p class="t-body max-w-[62ch] pb-6">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
