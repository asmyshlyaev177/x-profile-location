export const siteUrl = 'https://asmyshlyaev177.github.io/x-profile-location'

export const seo = {
  title: 'X Profile Viewer — Your Browser, Reimagined',
  description:
    'Browse X / Twitter profiles with a beautiful reading mode, smart curation dashboard, and seamless sync across all your devices.',
  keywords:
    'X, Twitter, profile viewer, browser extension, reading mode, curation, Chrome extension, Firefox extension',
  author: 'asmyshlyaev177',

  og: {
    type: 'website',
    url: siteUrl,
    image: `${siteUrl}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    siteName: 'X Profile Viewer',
  },

  twitter: {
    card: 'summary_large_image',
    site: '@asmyshlyaev177',
    image: `${siteUrl}/og-image.png`,
  },
} as const

/** Returns the full set of <head> elements for vite-prerender-plugin */
export function buildHeadElements() {
  return new Set([
    { type: 'meta', props: { name: 'description', content: seo.description } },
    { type: 'meta', props: { name: 'keywords', content: seo.keywords } },
    { type: 'meta', props: { name: 'author', content: seo.author } },

    // Open Graph
    { type: 'meta', props: { property: 'og:type', content: seo.og.type } },
    { type: 'meta', props: { property: 'og:url', content: seo.og.url } },
    { type: 'meta', props: { property: 'og:title', content: seo.title } },
    { type: 'meta', props: { property: 'og:description', content: seo.description } },
    { type: 'meta', props: { property: 'og:image', content: seo.og.image } },
    { type: 'meta', props: { property: 'og:image:width', content: seo.og.imageWidth } },
    { type: 'meta', props: { property: 'og:image:height', content: seo.og.imageHeight } },
    { type: 'meta', props: { property: 'og:site_name', content: seo.og.siteName } },

    // Twitter Card
    { type: 'meta', props: { name: 'twitter:card', content: seo.twitter.card } },
    { type: 'meta', props: { name: 'twitter:site', content: seo.twitter.site } },
    { type: 'meta', props: { name: 'twitter:title', content: seo.title } },
    { type: 'meta', props: { name: 'twitter:description', content: seo.description } },
    { type: 'meta', props: { name: 'twitter:image', content: seo.twitter.image } },

    // Canonical
    { type: 'link', props: { rel: 'canonical', href: seo.og.url } },
  ])
}
