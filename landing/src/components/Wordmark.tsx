import BRAND_MARK from '../data/brand-mark.json'
import { useI18n } from '../i18n/context'

/**
 * The mark, reused as the site wordmark so tab, store tile and page agree.
 *
 * Geometry from `src/data/brand-mark.json`, the one place it is written — the
 * favicon is generated from the same file. The colours are this surface's own,
 * which is why that file holds a path and not an `.svg`: here the mark takes
 * `currentColor`, in the favicon it sits on its own plate.
 */
export function Wordmark({ class: cls = '' }: { class?: string }) {
  const { t, href } = useI18n()
  return (
    <a
      href={href('/')}
      class={`group inline-flex items-center gap-2.5 ${cls}`}
      aria-label={t.nav.home}
    >
      <svg
        width="26"
        height="26"
        viewBox={BRAND_MARK.viewBox}
        aria-hidden="true"
        class="text-signal shrink-0"
      >
        <rect
          width="32"
          height="32"
          rx={BRAND_MARK.radius}
          fill="currentColor"
          opacity="0.1"
        />
        <path d={BRAND_MARK.path} fill="currentColor" />
      </svg>
      <span class="text-text text-[0.9375rem] font-bold tracking-[-0.02em]">
        X-Pat
      </span>
    </a>
  )
}
