import { metaFor, routes, type RouteDef } from './routes'
import { CHROME_STORE_URL } from './utils/constants'
import {
  defaultLocale,
  localePath,
  locales,
  type LocaleDef,
} from './i18n/locales'
import type { Dict } from './i18n/dict/en'

/**
 * The live host. Moved from `x-profile-location.pages.dev` with the X-Pat
 * rename; the old project still exists and 301s here (see `redirect/`).
 *
 * If a real domain is registered later (`x-pat.app` is free), this constant and
 * the `_redirects` target in `redirect/_redirects` are the only two places that
 * need to change — everything else derives from `siteUrl`.
 */
const PRODUCTION_URL = 'https://x-pat.pages.dev/'

// Falls back to production URL when import.meta.env is unavailable (e.g. vite.config.ts load time)
const rawSiteUrl: string = import.meta.env?.VITE_SITE_URL ?? PRODUCTION_URL

/**
 * Vite loads plain `.env` in *every* mode, production builds included, and
 * `pnpm deploy` ships the dist built on whichever machine ran it. A developer's
 * local `VITE_SITE_URL=http://localhost:5173` therefore used to end up in the
 * canonical and og:url of the live site — which tells Google the real pages are
 * duplicates of a host it cannot reach. A localhost value is only ever right
 * when the build is not for production.
 */
const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(
  rawSiteUrl,
)
const resolvedSiteUrl =
  import.meta.env?.PROD && isLocalUrl ? PRODUCTION_URL : rawSiteUrl

/**
 * Always ends in exactly one `/`. VITE_SITE_URL gets written both ways by hand,
 * and every consumer here concatenates a path onto it — without normalising,
 * one spelling yields `…dev//og-image.png` and the other `…devog-image.png`.
 */
export const siteUrl: string = resolvedSiteUrl.replace(/\/*$/, '/')

/**
 * When the content last changed — the HEAD commit's date, injected by
 * `vite.config.ts` (see `scripts/build-date.mjs`).
 *
 * Deliberately not `new Date()`. This value feeds `og:updated_time`,
 * `last-modified` and schema.org `dateModified`, and a build-time clock marks
 * the site as freshly updated every time it is rebuilt — including rebuilds
 * that changed nothing. Google's guidance is that `dateModified` must reflect a
 * real change, and a date that always says "just now" is worth less than no
 * date at all.
 *
 * The `typeof` guard keeps the module importable from Node at config-load time,
 * where the `define` replacement has not happened.
 */
export const buildDate: string =
  typeof __CONTENT_LAST_MODIFIED__ === 'string'
    ? __CONTENT_LAST_MODIFIED__
    : new Date().toISOString()

/**
 * Site-level constants. Per-page title and description live in the
 * dictionaries — they were here when there was only one page, and in
 * `routes.ts` when there was only one language.
 */
export const seo = {
  /** Ignored by Google since 2009, still read by a few smaller engines. */
  keywords:
    'X Twitter profile location, country flag extension, Twitter location checker, VPN detection Twitter, where is this Twitter user from, X profile country, hide tweets by country, collapse tweets by location, X country filter, X region filter, X location filter, filter X by keyword, block affiliated accounts X, highlight new X accounts, X account age, X about this account, engagement farming X, Twitter bot check, Chrome extension',
  author: 'asmyshlyaev177',

  og: {
    type: 'website',
    image: `${siteUrl}og-image.png`,
    imageAlt:
      'An X hover card with a German flag and the word Germany added under the handle',
    imageType: 'image/png',
    imageWidth: '1200',
    imageHeight: '630',
    siteName: 'X-Pat',
    updatedTime: buildDate,
  },

  twitter: {
    card: 'summary_large_image',
    image: `${siteUrl}og-image.png`,
  },
} as const

/** `('/', en)` → siteUrl; `('/foo', ja)` → siteUrl + 'ja/foo'. */
export function canonicalFor(route: RouteDef, locale: LocaleDef): string {
  const path = localePath(locale.code, route.path)
  return path === '/' ? siteUrl : `${siteUrl}${path.slice(1)}`
}

/**
 * SoftwareApplication structured data. Deliberately no `aggregateRating`:
 * review counts belong to the store, and inventing them here would be a lie
 * Google is good at catching.
 */
export function buildJsonLd(version: string, locale: LocaleDef, t: Dict) {
  const home = metaFor(HOME, t)
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'X-Pat',
    // The pre-rename name, and still what most people search for. schema.org
    // takes it directly, which is the cheapest way to tell Google the two names
    // are one product rather than two.
    alternateName: 'X Profile Location',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome, Edge, Brave, Lemur Browser',
    description: home.description,
    inLanguage: locale.htmlLang,
    url: canonicalFor(HOME, locale),
    softwareVersion: version,
    // Real content date, not build time — see `buildDate`. Google treats a
    // `dateModified` that never matches an actual change as a reason to stop
    // trusting the field.
    dateModified: buildDate,
    installUrl: CHROME_STORE_URL,
    author: { '@type': 'Person', name: seo.author },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    privacyPolicy: `${siteUrl}privacy-policy`,
  }
}

/** The homepage entry — the source of the site-wide description and URL. */
const HOME: RouteDef = routes[0]!

/**
 * FAQPage structured data, built from the same array the page renders visibly.
 * Google requires the two to match; sharing the source is what guarantees it —
 * and in a translated site that guarantee is worth more, not less, because the
 * failure mode is schema in one language over copy in another.
 */
export function buildFaqJsonLd(route: RouteDef, locale: LocaleDef, t: Dict) {
  const { faq } = metaFor(route, t)
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale.htmlLang,
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

function metaEl(props: Record<string, string>) {
  return { type: 'meta', props }
}

function jsonLdEl(data: unknown) {
  return {
    type: 'script',
    props: {
      type: 'application/ld+json',
      // `textContent` is the prerender plugin's escape hatch for elements that
      // carry a body rather than attributes.
      textContent: JSON.stringify(data),
    },
  }
}

/**
 * `hreflang` for every language this page exists in, plus `x-default`.
 *
 * Emitted on all fifteen documents and listing all fifteen — the annotation is
 * only valid if it is reciprocal, and a page that names its alternates without
 * being named back by them is ignored. `x-default` points at English, which is
 * both the default and the version served from the bare path.
 *
 * Pages with no dictionary entry (the privacy policy, the 404) exist in one
 * language, so they get nothing: an `hreflang` set of one is noise.
 */
function alternateEls(route: RouteDef) {
  if (!route.dictKey) return []
  const links = locales.map((l) => ({
    type: 'link',
    props: {
      rel: 'alternate',
      hreflang: l.htmlLang,
      href: canonicalFor(route, l),
    },
  }))
  links.push({
    type: 'link',
    props: {
      rel: 'alternate',
      hreflang: 'x-default',
      href: canonicalFor(route, defaultLocale),
    },
  })
  return links
}

/** Returns the full set of <head> elements for vite-prerender-plugin */
export function buildHeadElements(
  route: RouteDef,
  locale: LocaleDef,
  version: string,
  t: Dict,
) {
  const canonical = canonicalFor(route, locale)
  const { title, description, faq } = metaFor(route, t)

  // Nothing below the fold matters for a page we're asking not to be indexed.
  if (route.noindex) {
    return new Set<unknown>([
      metaEl({ name: 'description', content: description }),
      { type: 'link', props: { rel: 'canonical', href: canonical } },
      metaEl({ name: 'robots', content: 'noindex' }),
    ])
  }

  const elements: unknown[] = [
    jsonLdEl(buildJsonLd(version, locale, t)),
    metaEl({
      name: 'google-site-verification',
      content: 'VGWeNcrEVDQA07xz1L_6VZjcMEip0kTWdxxpIEmmbKc',
    }),
    metaEl({ name: 'description', content: description }),
    metaEl({ name: 'keywords', content: seo.keywords }),
    metaEl({ name: 'author', content: seo.author }),
    metaEl({
      name: 'robots',
      content: 'index, follow, max-image-preview:large',
    }),

    // Open Graph
    metaEl({ property: 'og:type', content: seo.og.type }),
    metaEl({ property: 'og:url', content: canonical }),
    metaEl({ property: 'og:title', content: title }),
    metaEl({ property: 'og:description', content: description }),
    metaEl({ property: 'og:image', content: seo.og.image }),
    metaEl({ property: 'og:image:type', content: seo.og.imageType }),
    metaEl({ property: 'og:image:width', content: seo.og.imageWidth }),
    metaEl({ property: 'og:image:height', content: seo.og.imageHeight }),
    // Alt text on the card image: read out by screen readers on X and Slack,
    // and shown when the image itself fails to load.
    metaEl({ property: 'og:image:alt', content: seo.og.imageAlt }),
    metaEl({ property: 'og:site_name', content: seo.og.siteName }),
    metaEl({ property: 'og:locale', content: locale.ogLocale }),

    // Twitter Card. No `twitter:site` — it takes an @handle, and the old value
    // was a URL, which Twitter's validator drops anyway.
    metaEl({ name: 'twitter:card', content: seo.twitter.card }),
    metaEl({ name: 'twitter:title', content: title }),
    metaEl({ name: 'twitter:description', content: description }),
    metaEl({ name: 'twitter:image', content: seo.twitter.image }),
    metaEl({ name: 'twitter:image:alt', content: seo.og.imageAlt }),

    // Last modified / updated time
    metaEl({ property: 'og:updated_time', content: buildDate }),
    metaEl({ 'http-equiv': 'last-modified', content: buildDate }),

    // Canonical
    { type: 'link', props: { rel: 'canonical', href: canonical } },
  ]

  // `og:locale:alternate` is the Open Graph half of the same statement the
  // hreflang block makes, and Facebook/LinkedIn read it rather than hreflang.
  if (route.dictKey) {
    for (const l of locales) {
      if (l.code === locale.code) continue
      elements.push(
        metaEl({ property: 'og:locale:alternate', content: l.ogLocale }),
      )
    }
  }

  elements.push(...alternateEls(route))

  if (faq.length) elements.push(jsonLdEl(buildFaqJsonLd(route, locale, t)))

  return new Set(elements)
}
