/**
 * Every page on the site, as plain data.
 *
 * Deliberately free of JSX imports: `vite.config.ts` reads this at config-load
 * time to derive `additionalPrerenderRoutes`, and pulling a component tree into
 * the Node-side config would drag Preact and the whole `.tsx` graph through
 * esbuild for no reason. `app.tsx` owns the path → component mapping instead.
 *
 * Since the site went multilingual this file holds only the *structural* half
 * of a page — its path, whether it is indexable, and which files date it. The
 * title, description and FAQ moved into `i18n/dict/*`, keyed by `dictKey`,
 * because there are now fifteen of each and they have to stay in step.
 *
 * Adding a page means adding an entry here, a `pages.<key>` block in every
 * dictionary, one branch in `app.tsx`, and nothing else — the head, the
 * canonical, the hreflang set, the prerender list and the sitemap all follow.
 */

// Only the locale *table* is imported here, never the dictionaries: this
// module is in the client bundle, and pulling `dicts.ts` in would drag all
// fifteen languages along with it. Anything needing copy takes a `Dict` as an
// argument instead — see `metaFor`.
import { defaultLocale, localePath } from './i18n/locales'
import type { Dict } from './i18n/dict/en'

export interface FaqItem {
  q: string
  a: string
}

export interface RouteDef {
  /** Leading slash, no trailing slash (except the root itself). */
  path: string
  /**
   * Where this page's copy lives, under `Dict['pages']`.
   *
   * Its presence is also what makes a page multilingual: a route with a key is
   * rendered in every shipping locale, one without it is English-only. The two
   * pages without one are the privacy policy and the 404, and that is not a
   * coincidence — both are `noindex`, so a translation would buy no search
   * visibility, and machine-translated legal text is a liability rather than a
   * courtesy.
   */
  dictKey?: keyof Dict['pages']
  /** Keeps the page out of the sitemap and marks it `noindex`. */
  noindex?: boolean
  /** English title, for the `noindex` pages that have no dictionary entry. */
  title?: string
  /** English description, same. */
  description?: string
  /**
   * Files whose newest commit dates this page, relative to `landing/`. Read by
   * `scripts/build-date.mjs`, which turns them into the sitemap's per-URL
   * `<lastmod>`.
   *
   * Listing them by hand rather than deriving them keeps `<lastmod>` meaning
   * "this page changed" instead of "something in the bundle changed": the
   * homepage should not claim freshness because a guide page was edited. This
   * file is deliberately excluded from its own routes' sources for the same
   * reason — see the note in `getRouteLastmods`.
   *
   * The dictionaries are excluded too, and for a sharper version of the same
   * reason: one file per language means a fix to the Thai homepage would
   * otherwise restamp all fifteen.
   */
  sources?: string[]
}

/**
 * The 404 page's path is also its filename in `dist`, which is the whole point
 * of it: `flatten-routes.mjs` turns the prerendered `404/index.html` into
 * `404.html`, and that name is what makes Cloudflare Pages serve it with a 404
 * status instead of falling back to the homepage with a 200.
 */
export const NOT_FOUND_PATH = '/404'

export const routes: RouteDef[] = [
  {
    path: '/',
    dictKey: 'home',
    sources: [
      'src/components/Hero.tsx',
      'src/components/Screenshots.tsx',
      'src/components/RateBudget.tsx',
      'src/components/HowItWorks.tsx',
      'src/components/SeeItInAction.tsx',
      'src/components/Trust.tsx',
      'src/components/ComparisonTeaser.tsx',
      'src/components/CTA.tsx',
      'src/data/comparison.ts',
    ],
  },
  {
    path: '/x-about-this-account',
    dictKey: 'aboutThisAccount',
    sources: ['src/components/AboutThisAccount.tsx'],
  },
  {
    path: '/spot-engagement-farming',
    dictKey: 'engagementFarming',
    sources: ['src/components/EngagementFarming.tsx'],
  },
  {
    path: '/x-rate-limit',
    dictKey: 'rateLimit',
    sources: ['src/components/RateLimit.tsx', 'src/components/RateBudget.tsx'],
  },
  {
    // The exact phrase someone types when they already have one of these
    // installed and it is not doing what they wanted. Matching the query in the
    // slug is worth more here than a tidier /compare would be.
    path: '/x-posed-alternative',
    dictKey: 'comparison',
    sources: [
      'src/components/Comparison.tsx',
      'src/components/ComparisonTable.tsx',
      'src/data/comparison.ts',
    ],
  },
  {
    path: '/privacy-policy',
    sources: ['src/components/PrivacyPolicy.tsx'],
    title: 'Privacy Policy — X-Pat',
    description: 'Privacy Policy for the X-Pat browser extension.',
    noindex: true,
  },
  {
    path: NOT_FOUND_PATH,
    sources: ['src/components/NotFound.tsx'],
    title: 'Page not found — X-Pat',
    description: 'That page does not exist on this site.',
    noindex: true,
  },
]

/** The pages that exist in every language. */
export const localizedRoutes: RouteDef[] = routes.filter((r) => r.dictKey)

/**
 * A route's `<title>` and description, given a dictionary.
 *
 * Takes the `Dict` rather than a locale code so this module never has to reach
 * into the registry — that is what keeps all fifteen languages out of the
 * client bundle. Falls back to the English strings carried on the route itself
 * for the two pages that have no dictionary entry.
 */
export function metaFor(
  route: RouteDef,
  t: Dict,
): { title: string; description: string; faq: readonly FaqItem[] } {
  if (!route.dictKey) {
    return {
      title: route.title ?? '',
      description: route.description ?? '',
      faq: [],
    }
  }
  const page = t.pages[route.dictKey]
  return { title: page.title, description: page.description, faq: page.faq }
}

/**
 * An unknown path resolves to the 404 route rather than the homepage. Both the
 * prerendered document and the client render then say the same thing — before
 * this, the page hydrated into the homepage under whatever URL was typed.
 *
 * The locale has already been stripped by `splitLocale` before this is called,
 * so `/ja/x-posed-alternative` arrives here as `/x-posed-alternative`.
 */
export function resolveRoute(routePath: string): RouteDef {
  const path =
    routePath.length > 1 ? routePath.replace(/\/+$/, '') : routePath || '/'
  return (
    routes.find((r) => r.path === path) ??
    routes.find((r) => r.path === NOT_FOUND_PATH)!
  )
}

/**
 * Paths the prerender plugin should emit: every route in English, plus every
 * localisable route in every other shipping locale.
 *
 * Imported by `vite.config.ts`, so it must stay derivable without rendering
 * anything.
 */
export function prerenderPathsFor(localeCodes: string[]): string[] {
  const paths = routes.map((r) => r.path)
  for (const code of localeCodes) {
    if (code === defaultLocale.code) continue
    for (const route of localizedRoutes) {
      paths.push(localePath(code, route.path))
    }
  }
  return paths
}
