/**
 * Every page on the site, as plain data.
 *
 * Deliberately free of JSX imports: `vite.config.ts` reads this at config-load
 * time to derive `additionalPrerenderRoutes`, and pulling a component tree into
 * the Node-side config would drag Preact and the whole `.tsx` graph through
 * esbuild for no reason. `app.tsx` owns the path → component mapping instead.
 *
 * Adding a page means adding an entry here, one branch in `app.tsx`, and
 * nothing else — the head, the canonical, the prerender list and the sitemap
 * all follow from this array.
 */

export interface FaqItem {
  q: string
  a: string
}

export interface RouteDef {
  /** Leading slash, no trailing slash (except the root itself). */
  path: string
  title: string
  /** Under ~160 chars — anything past that is truncated in results. */
  description: string
  /** Keeps the page out of the sitemap and marks it `noindex`. */
  noindex?: boolean
  /**
   * Rendered visibly by `<Faq>` *and* emitted as FAQPage structured data from
   * the same array. Keeping one source is not tidiness — schema that doesn't
   * match the visible copy is a manual-action risk.
   */
  faq?: FaqItem[]
}

export const routes: RouteDef[] = [
  {
    path: '/',
    title: 'X Profile Location — see the country of any X profile',
    description:
      "Puts a country flag on every X profile, from X's own data. Warns on likely VPNs, hides tweets by country, and needs no account. Free for Chrome.",
    faq: [
      {
        q: 'How do I see what country an X account is from?',
        a: 'X stores a country for every account and exposes it under “About this account”, but only one profile at a time and only if you open the menu. This extension reads that same field and puts the flag straight into the hover card and the timeline, so you see it without clicking anything.',
      },
      {
        q: 'Can I tell if an X account is using a VPN?',
        a: 'X marks some accounts as having a location it cannot verify. The extension surfaces that as a ⚠ VPN badge next to the flag. It means X itself is unsure about the country, not that a VPN is proven.',
      },
      {
        q: 'Can I hide or collapse tweets from certain countries?',
        a: 'Yes. Pick the countries or regions in the options page and choose whether matching tweets collapse behind a “Show” button or disappear entirely. Collapse is the default, so nothing is ever silently removed from your timeline.',
      },
      {
        q: 'Does it need my X password or an API key?',
        a: 'Neither. It reuses the X session already in your browser to make the same request the site makes when it shows you a profile. There is no login, no API key, and no account of ours.',
      },
      {
        q: 'Is the location accurate?',
        a: 'It is exactly as accurate as X’s own data, because it is X’s own data. The extension does not guess from an IP address or consult any outside database. Where X flags a location as unverified, so does the extension.',
      },
    ],
  },
  {
    path: '/x-about-this-account',
    title: 'X “About this account”: how to see it, and see it faster',
    description:
      'X shows every account’s country under “About this account” — one profile at a time, behind a menu. Here’s where to find it, and how to get it inline instead.',
    faq: [
      {
        q: 'What is “About this account” on X?',
        a: 'A panel X added that shows where an account is based, when it joined, how many times it has changed its handle, and which app store it signed up through. It is the same country field this extension reads.',
      },
      {
        q: 'Where is “About this account”?',
        a: 'Open a profile, tap the ⋯ menu in the top right of the profile header, and choose “About this account”. On the web it is in the same overflow menu next to the Follow button.',
      },
      {
        q: 'Why can’t I see “About this account” for some users?',
        a: 'X does not return a country for every account — older or less active accounts often have nothing on file. When the field is genuinely empty, no tool can fill it in, including this one.',
      },
      {
        q: 'How do I see the country without opening every profile?',
        a: 'That is the gap this extension closes. It reads the same field and renders it as a flag in the hover card and, optionally, inline in the timeline — so scanning a thread of eighty replies does not mean eighty menu visits.',
      },
    ],
  },
  {
    path: '/spot-engagement-farming',
    title: 'How to spot engagement farming and reply spam on X',
    description:
      'The signals that separate a real reply from a farmed one on X: account age, follower ratio, posting patterns, and where the account is actually based.',
    faq: [
      {
        q: 'What is engagement farming on X?',
        a: 'Posting replies designed to harvest impressions rather than say anything — generic agreement, recycled outrage, or a stock phrase pasted under whichever post is trending. Since X began paying out on impressions there is a direct financial motive for it.',
      },
      {
        q: 'How can you tell if an X reply is from a bot or a farm?',
        a: 'No single signal is conclusive. The useful ones stack: an account following thousands while followed by dozens, created weeks ago, replying within seconds to large accounts, with a bio full of flags and emoji. Any one of those alone is normal; three together rarely is.',
      },
      {
        q: 'What follower-to-following ratio suggests a farmed account?',
        a: 'Following far more accounts than follow back — a ratio well under 0.1 — is the classic pattern, because mass-following is the cheapest way to get noticed. Plenty of ordinary new accounts look the same, so treat it as one input rather than a verdict.',
      },
      {
        q: 'Does the extension detect engagement farming?',
        a: 'Not directly. What it does is surface the account’s country and VPN status inline, which is the one signal you otherwise cannot see at all without opening each profile. The rest of the signals on this page are still a judgement call you make yourself.',
      },
    ],
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy — X Profile Location',
    description: 'Privacy Policy for the X Profile Location browser extension.',
    noindex: true,
  },
]

/** Root is the fallback, so an unknown path renders the homepage as before. */
export function resolveRoute(pathname: string): RouteDef {
  const path =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/'
  return routes.find((r) => r.path === path) ?? routes[0]!
}

/** Paths the prerender plugin should emit. */
export const prerenderPaths: string[] = routes.map((r) => r.path)
