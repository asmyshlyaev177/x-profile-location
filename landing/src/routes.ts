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
   * Files whose newest commit dates this page, relative to `landing/`. Read by
   * `scripts/build-date.mjs`, which turns them into the sitemap's per-URL
   * `<lastmod>`.
   *
   * Listing them by hand rather than deriving them keeps `<lastmod>` meaning
   * "this page changed" instead of "something in the bundle changed": the
   * homepage should not claim freshness because a guide page was edited. This
   * file is deliberately excluded from its own routes' sources for the same
   * reason — see the note in `getRouteLastmods`.
   */
  sources?: string[]
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
    // Brand first, then the exact phrase the old name ranked for. Keeping
    // "X Profile Location" in the title is the whole reason a rename doesn't
    // have to cost the literal-match traffic — same tactic as the store title.
    title: 'X-Pat — X Profile Location: see the country of any X profile',
    description:
      "A country flag on every X profile, from X's own data. VPN warnings, and hide or highlight posts by country, organisation, age or bio keyword. Free for Chrome.",
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
        q: 'Can I filter by anything other than country?',
        a: 'Yes. You can block every account X badges as belonging to an organisation, mark accounts younger than a threshold you pick, and highlight accounts whose name or bio matches your keywords — or whose bio is mostly flag emoji. Age and keyword rules only ever mark a post; they never take it away. An allowlist and per-rule exceptions cover the accounts you want spared.',
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
    sources: ['src/components/AboutThisAccount.tsx'],
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
    sources: ['src/components/EngagementFarming.tsx'],
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
    // The exact phrase someone types when they already have one of these
    // installed and it is not doing what they wanted. Matching the query in the
    // slug is worth more here than a tidier /compare would be.
    path: '/x-posed-alternative',
    sources: [
      'src/components/Comparison.tsx',
      'src/components/ComparisonTable.tsx',
      'src/data/comparison.ts',
    ],
    title: 'X-Posed alternative: X-Pat compared, feature by feature',
    description:
      'An honest comparison of X-Pat against X-Posed and the two other most-installed X location extensions — including the three things X-Posed does better.',
    faq: [
      {
        q: 'What is the best X-Posed alternative?',
        a: 'It depends what you need. X-Posed is the most established option and has a language filter, Firefox builds and an iPhone app that X-Pat does not. X-Pat differs on the shared cache: its server is published and self-hostable, cached entries are cross-checked between installs before being served, and lookups carry no identifier the server could use to build a profile of what you looked at.',
      },
      {
        q: 'Is X-Pat open source?',
        a: 'Yes, MIT licensed, and so is the cache server it talks to — both live in the same repository, with deployment docs for Cloudflare Workers and for a plain VPS. X-Posed also publishes its extension under MIT; what it does not publish is the Worker that receives community-cache contributions.',
      },
      {
        q: 'Do these extensions need my X password?',
        a: 'None of the ones compared here do. They reuse the X session already open in your browser to make the same request X makes when it shows you a profile. There is no login, no API key and no third-party account.',
      },
      {
        q: 'Why does the flag stop appearing halfway down a thread?',
        a: 'X allows one browser about fifty account lookups every fifteen minutes, and a busy thread contains more accounts than that. Extensions that hit the ceiling simply stop filling in flags. A shared cache is what avoids it — most profiles cost no lookup at all because someone else already resolved them — and X-Pat additionally reserves the last thirty percent of the window for accounts you hover yourself.',
      },
      {
        q: 'Can the cache server tell what accounts I looked at?',
        a: "Not X-Pat's. Lookups are sent as a plain list of handles with no identifier attached, so there is nothing for the server to join them against. Contributions do carry an anonymous per-install id, because the consensus model needs to know that two votes came from two different installs, and that id covers only the handles you personally resolved from X rather than everything you read.",
      },
    ],
  },
  {
    path: '/privacy-policy',
    sources: ['src/components/PrivacyPolicy.tsx'],
    title: 'Privacy Policy — X-Pat',
    description: 'Privacy Policy for the X-Pat browser extension.',
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
