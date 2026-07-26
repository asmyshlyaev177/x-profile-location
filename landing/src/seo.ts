// Falls back to production URL when import.meta.env is unavailable (e.g. vite.config.ts load time)
const rawSiteUrl: string =
  import.meta.env?.VITE_SITE_URL ?? 'https://x-profile-location.pages.dev/'

/**
 * Always ends in exactly one `/`. VITE_SITE_URL gets written both ways by hand,
 * and every consumer here concatenates a path onto it — without normalising,
 * one spelling yields `…dev//og-image.png` and the other `…devog-image.png`.
 */
export const siteUrl: string = rawSiteUrl.replace(/\/*$/, '/')

export const buildDate = new Date().toISOString()

export const seo = {
  /** 53 chars — brand first, then the phrase people actually search for. */
  title: 'X Profile Location — see the country of any X profile',

  /**
   * 144 chars. The previous one ran to 236 and was cut off mid-sentence in
   * every SERP; anything past ~160 is wasted.
   */
  description:
    "Puts a country flag on every X profile, from X's own data. Warns on likely VPNs, hides tweets by country, and needs no account. Free for Chrome.",

  /** Ignored by Google since 2009, still read by a few smaller engines. */
  keywords:
    'X Twitter profile location, country flag extension, Twitter location checker, VPN detection Twitter, where is this Twitter user from, X profile country, hide tweets by country, collapse tweets by location, Chrome extension',
  author: 'asmyshlyaev177',

  og: {
    type: 'website',
    url: siteUrl,
    image: `${siteUrl}og-image.png`,
    imageAlt:
      'An X hover card with a German flag and the word Germany added under the handle',
    imageType: 'image/png',
    imageWidth: '1200',
    imageHeight: '630',
    siteName: 'X Profile Location',
    locale: 'en_US',
    updatedTime: buildDate,
  },

  twitter: {
    card: 'summary_large_image',
    image: `${siteUrl}og-image.png`,
  },
} as const

/**
 * SoftwareApplication structured data. Deliberately no `aggregateRating`:
 * review counts belong to the store, and inventing them here would be a lie
 * Google is good at catching.
 */
export function buildJsonLd(version: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'X Profile Location',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome, Edge, Brave, Lemur Browser',
    description: seo.description,
    url: siteUrl,
    softwareVersion: version,
    installUrl:
      'https://chromewebstore.google.com/detail/x-profile-location/mooomapkphlmpilnlcnpoilondlppbhi',
    author: { '@type': 'Person', name: seo.author },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    privacyPolicy: `${siteUrl}privacy-policy`,
  }
}

/** Returns the full set of <head> elements for vite-prerender-plugin */
export function buildHeadElements(version: string) {
  return new Set([
    // SoftwareApplication structured data. `textContent` is the prerender
    // plugin's escape hatch for elements that carry a body rather than attrs.
    {
      type: 'script',
      props: {
        type: 'application/ld+json',
        textContent: JSON.stringify(buildJsonLd(version)),
      },
    },
    {
      type: 'meta',
      props: {
        name: 'google-site-verification',
        content: 'VGWeNcrEVDQA07xz1L_6VZjcMEip0kTWdxxpIEmmbKc',
      },
    },
    { type: 'meta', props: { name: 'description', content: seo.description } },
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
    { type: 'meta', props: { property: 'og:url', content: seo.og.url } },
    { type: 'meta', props: { property: 'og:title', content: seo.title } },
    {
      type: 'meta',
      props: { property: 'og:description', content: seo.description },
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
    { type: 'meta', props: { name: 'twitter:title', content: seo.title } },
    {
      type: 'meta',
      props: { name: 'twitter:description', content: seo.description },
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
    { type: 'link', props: { rel: 'canonical', href: seo.og.url } },
  ])
}
