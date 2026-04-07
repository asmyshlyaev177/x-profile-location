// Falls back to production URL when import.meta.env is unavailable (e.g. vite.config.ts load time)
export const siteUrl: string =
  import.meta.env?.VITE_SITE_URL ?? 'https://x-profile-location.vercel.app'

export const seo = {
  title: 'X Profile Location — See Where Every X Profile Is From',
  description:
    'Browser extension that shows the real country of any X / Twitter profile as a flag emoji on hover cards. Includes VPN detection, mobile app source, and per-country blocking.',
  keywords:
    'X Twitter profile location, country flag extension, Twitter location checker, VPN detection Twitter, where is this Twitter user from, X profile country, Chrome extension, Firefox extension',
  author: 'asmyshlyaev177',

  og: {
    type: 'website',
    url: siteUrl,
    image: `${siteUrl}/og-image.png`,
    imageWidth: '1200',
    imageHeight: '630',
    siteName: 'X Profile Location',
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
