import { NOT_FOUND_PATH, metaFor, routes } from '../routes'
import { useT } from '../i18n/context'

/**
 * The page Cloudflare Pages serves — with a real 404 status — for a path that
 * matches no file.
 *
 * Without a `404.html` in the build output, Pages falls back to `index.html`
 * and returns **200 with the homepage**, which Google reads as a soft 404 and
 * treats those URLs as homepage duplicates. That works directly against the
 * canonical and sitemap discipline everywhere else on this site.
 *
 * English-only, and deliberately: Pages serves this one document for every
 * unmatched path on the host, including `/ja/typo`, so there is no locale to
 * read off the URL that can be trusted. The links below therefore go to the
 * English pages, and the language picker in the header is the way out.
 */
export function NotFound() {
  // English, whatever the URL said — see the note above.
  const t = useT()
  const elsewhere = routes.filter(
    (r) => !r.noindex && r.path !== NOT_FOUND_PATH,
  )

  return (
    <div class="bg-void">
      <div class="shell-narrow max-w-3xl! py-24">
        <p class="t-data">Error 404</p>
        <h1 class="t-h2 mt-4">This page doesn’t exist.</h1>
        <p class="t-lead mt-5">
          The link may be out of date, or the address slightly off. Nothing here
          moved recently — these are all the pages there are:
        </p>

        <ul class="mt-10 space-y-5">
          {elsewhere.map((r) => (
            <li key={r.path}>
              <a
                href={r.path}
                class="text-text hover:text-signal font-semibold transition-colors"
              >
                {metaFor(r, t).title}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="/"
          class="text-faint hover:text-signal mt-14 inline-flex items-center gap-2 text-sm font-medium transition-colors"
        >
          ← Back to home
        </a>
      </div>
    </div>
  )
}
