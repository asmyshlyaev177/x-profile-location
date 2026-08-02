import { routes, type RouteDef } from './routes'
import { CHROME_STORE_URL } from './utils/constants'

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

/** The homepage entry, and the source of the site-wide title/description. */
const home = routes[0]!

/**
 * Site-level constants. Per-page title and description live in `routes.ts` —
 * they were here when there was only one page.
 */
export const seo = {
  /** Ignored by Google since 2009, still read by a few smaller engines. */
  keywords:
    'X Twitter profile location, country flag extension, Twitter location checker, VPN detection Twitter, where is this Twitter user from, X profile country, hide tweets by country, collapse tweets by location, filter X by keyword, block affiliated accounts X, highlight new X accounts, X account age, X about this account, engagement farming X, Twitter bot check, Chrome extension',
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
    locale: 'en_US',
    updatedTime: buildDate,
  },

  twitter: {
    card: 'summary_large_image',
    image: `${siteUrl}og-image.png`,
  },
} as const

/** `/` → siteUrl; `/foo` → siteUrl + 'foo'. */
export function canonicalFor(route: RouteDef): string {
  return route.path === '/' ? siteUrl : `${siteUrl}${route.path.slice(1)}`
}

/**
 * SoftwareApplication structured data. Deliberately no `aggregateRating`:
 * review counts belong to the store, and inventing them here would be a lie
 * Google is good at catching.
 */
export function buildJsonLd(version: string) {
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
    url: siteUrl,
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

/**
 * FAQPage structured data, built from the same array the page renders visibly.
 * Google requires the two to match; sharing the source is what guarantees it.
 */
export function buildFaqJsonLd(route: RouteDef) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (route.faq ?? []).map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
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

/** Returns the full set of <head> elements for vite-prerender-plugin */
export function buildHeadElements(route: RouteDef, version: string) {
  const canonical = canonicalFor(route)

  // Nothing below the fold matters for a page we're asking not to be indexed.
  if (route.noindex) {
    return new Set<unknown>([
      {
        type: 'meta',
        props: { name: 'description', content: route.description },
      },
      { type: 'link', props: { rel: 'canonical', href: canonical } },
      { type: 'meta', props: { name: 'robots', content: 'noindex' } },
    ])
  }

  const elements: unknown[] = [
    jsonLdEl(buildJsonLd(version)),
    {
      type: 'meta',
      props: {
        name: 'google-site-verification',
        content: 'VGWeNcrEVDQA07xz1L_6VZjcMEip0kTWdxxpIEmmbKc',
      },
    },
    {
      type: 'meta',
      props: { name: 'description', content: route.description },
    },
    { type: 'meta', props: { name: 'keywords', content: seo.keywords } },
    { type: 'meta', props: { name: 'author', content: seo.author } },
    {
      type: 'meta',
      props: {
        name: 'robots',
        content: 'index, follow, max-image-preview:large',
      },
    },

    // Open Graph
    { type: 'meta', props: { property: 'og:type', content: seo.og.type } },
    { type: 'meta', props: { property: 'og:url', content: canonical } },
    { type: 'meta', props: { property: 'og:title', content: route.title } },
    {
      type: 'meta',
      props: { property: 'og:description', content: route.description },
    },
    { type: 'meta', props: { property: 'og:image', content: seo.og.image } },
    {
      type: 'meta',
      props: { property: 'og:image:type', content: seo.og.imageType },
    },
    {
      type: 'meta',
      props: { property: 'og:image:width', content: seo.og.imageWidth },
    },
    {
      type: 'meta',
      props: { property: 'og:image:height', content: seo.og.imageHeight },
    },
    // Alt text on the card image: read out by screen readers on X and Slack,
    // and shown when the image itself fails to load.
    {
      type: 'meta',
      props: { property: 'og:image:alt', content: seo.og.imageAlt },
    },
    {
      type: 'meta',
      props: { property: 'og:site_name', content: seo.og.siteName },
    },
    { type: 'meta', props: { property: 'og:locale', content: seo.og.locale } },

    // Twitter Card. No `twitter:site` — it takes an @handle, and the old value
    // was a URL, which Twitter's validator drops anyway.
    {
      type: 'meta',
      props: { name: 'twitter:card', content: seo.twitter.card },
    },
    { type: 'meta', props: { name: 'twitter:title', content: route.title } },
    {
      type: 'meta',
      props: { name: 'twitter:description', content: route.description },
    },
    {
      type: 'meta',
      props: { name: 'twitter:image', content: seo.twitter.image },
    },
    {
      type: 'meta',
      props: { name: 'twitter:image:alt', content: seo.og.imageAlt },
    },

    // Last modified / updated time
    {
      type: 'meta',
      props: { property: 'og:updated_time', content: buildDate },
    },
    {
      type: 'meta',
      props: { 'http-equiv': 'last-modified', content: buildDate },
    },

    // Canonical
    { type: 'link', props: { rel: 'canonical', href: canonical } },
  ]

  if (route.faq?.length) elements.push(jsonLdEl(buildFaqJsonLd(route)))

  return new Set(elements)
}
