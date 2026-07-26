/** The favicon glyph, reused as the site wordmark so tab, store tile and page agree. */
export function Wordmark({ class: cls = '' }: { class?: string }) {
  return (
    <a
      href="/"
      class={`group inline-flex items-center gap-2.5 ${cls}`}
      aria-label="X Profile Location — home"
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        aria-hidden="true"
        class="text-signal shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.1" />
        <path
          d="M8 8h4l4 6 4-6h4l-6 8.5L24 24h-4l-4-6-4 6H8l6.5-7.5L8 8z"
          fill="currentColor"
        />
      </svg>
      <span class="text-text text-[0.9375rem] font-bold tracking-[-0.02em]">
        X Profile Location
      </span>
    </a>
  )
}
