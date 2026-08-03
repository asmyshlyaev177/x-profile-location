/**
 * The comparison table, as plain data.
 *
 * One source, three surfaces: the /x-posed-alternative page renders every row,
 * the homepage renders the `headline` subset, and `vite.config.ts` writes the
 * same subset into the repo README between markers. A table that disagrees with
 * itself across three places is worse than no table at all — on a page whose
 * entire value is being trusted as fair.
 *
 * Deliberately free of JSX imports for the same reason `routes.ts` is: the Vite
 * config loads this at config time to generate the README block.
 *
 * ── Rules for editing ────────────────────────────────────────────────────────
 *
 * 1. Every cell is checkable by a reader in under a minute. Store listings and
 *    public repos only — never a claim that rests on having read someone's
 *    minified bundle, and never an inference about code we cannot see.
 * 2. `'unstated'` is not a polite `'no'`. It means the listing does not say, and
 *    it renders as "not stated" rather than a cross. Closed-source extensions
 *    get the benefit of the doubt; the alternative is calling a feature absent
 *    because its author did not write a sentence about it.
 * 3. Rows X-Pat loses stay in. `losses` below is the honest-broker section, and
 *    it is the reason the rest of the page is believable. A comparison page that
 *    wins every row reads as marketing and converts like marketing.
 * 4. Re-check `SCRAPED` before shipping any edit. Install counts move, and a
 *    stale figure presented as current is the one error that looks deliberate.
 */

/** `yes` renders a check, `no` a cross, `unstated` a muted dash. */
export type Cell = 'yes' | 'no' | 'unstated' | string

export interface Competitor {
  /** Short label for the column head. */
  short: string
  /** Full store name, used in prose and in the sources list. */
  name: string
  storeUrl: string
  /** Repo URL when the source is public, `null` when it is not. */
  repoUrl: string | null
}

export interface Row {
  label: string
  /** Shown under the label on the full page; omitted on the condensed table. */
  note?: string
  /** Keyed by `Competitor.short`, plus `'X-Pat'` for our own column. */
  cells: Record<string, Cell>
  /** Included in the homepage and README subset. */
  headline?: boolean
}

/**
 * When the store figures below were last read by hand. The page prints this —
 * an undated competitive claim ages into a false one, and saying when you
 * looked is the cheapest way to stay honest about it.
 */
export const SCRAPED = '2026-08-02'

export const COMPETITORS: Competitor[] = [
  {
    short: 'X-Posed',
    name: 'X-Posed: Account Location & Device Info',
    storeUrl:
      'https://chromewebstore.google.com/detail/x-posed-account-location/oodhljjldjdhcdopjpmfgbaoibpancfk',
    repoUrl: 'https://github.com/xaitax/x-account-location-device',
  },
  {
    short: 'Flags & Time',
    name: 'X/Twitter Location Flags, Time & Blocker',
    storeUrl:
      'https://chromewebstore.google.com/detail/xtwitter-location-flags-t/dgodabjkaifjlhpcapiohikkklnailla',
    repoUrl: null,
  },
  {
    short: 'Region Blocker',
    name: 'X Region Blocker',
    storeUrl:
      'https://chromewebstore.google.com/detail/x-region-blocker/phecamgncbadibaifmbghnhdoagdalel',
    repoUrl: null,
  },
]

/** Our own column, kept out of `COMPETITORS` so the table head can lead with it. */
export const SELF = 'X-Pat'

export const ROWS: Row[] = [
  {
    label: 'Country shown inline, without opening a menu',
    note: "Read from X's own “About this account” data, not guessed from an IP address.",
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'unstated',
    },
  },
  {
    label: 'Warning when X cannot verify the location',
    // No backticks in `note` — these strings render as plain text on the page,
    // so markdown syntax arrives as literal punctuation.
    note: 'X marks some accounts as having a location it cannot verify. That is X declining to confirm the country — not proof of a VPN, and nobody here can prove one.',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'unstated',
    },
  },
  {
    label: 'Sign-up source — Apple, Google Play or web',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    label: 'Account age',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    label: 'Handle-change count',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    label: 'Hide or collapse by country and region',
    note: 'Collapse behind a “Show” button is the default here, because a timeline that silently drops posts is one you cannot audit.',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'yes',
    },
  },
  {
    label: 'Language filter',
    note: "X's per-post language field is unreliable enough that shipping a filter on top of it generates bug reports. Deliberately not built yet.",
    cells: {
      'X-Pat': 'no',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    label: 'Always-show allowlist and per-rule exceptions',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    label: 'Shared cache, so flags survive the rate limit',
    note: 'X allows one browser about 50 profile lookups per 15 minutes. Without a shared cache that ceiling is the whole experience.',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'no',
    },
  },
  {
    label: 'Cache server source published',
    note: 'The server that receives contributions, not just the extension that sends them. Ours is in the same repo, with deploy docs — you can read it, or run your own.',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'no',
      'Flags & Time': 'no',
      'Region Blocker': 'n/a',
    },
  },
  {
    label: 'Cached entries cross-checked between installs',
    note: 'Ours keeps per-install votes and serves the consensus, with a confidence threshold you can raise. X-Posed documents storing the last accepted value for a handle.',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'no',
      'Flags & Time': 'unstated',
      'Region Blocker': 'n/a',
    },
  },
  {
    label: 'Extension source published',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'no',
      'Region Blocker': 'no',
    },
  },
  {
    label: 'Automated test suite in the repo',
    note: 'Unit, end-to-end against recorded traffic, and visual regression. The number is what CI runs on every push.',
    headline: true,
    cells: {
      'X-Pat': '609 tests',
      'X-Posed': 'none',
      'Flags & Time': 'n/a',
      'Region Blocker': 'n/a',
    },
  },
  {
    label: 'Firefox',
    cells: {
      'X-Pat': 'no',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'no',
    },
  },
  {
    label: 'iPhone / iPad companion app',
    cells: {
      'X-Pat': 'no',
      'X-Posed': 'yes',
      'Flags & Time': 'no',
      'Region Blocker': 'no',
    },
  },
]

/**
 * Where the competition is genuinely ahead.
 *
 * This section is load-bearing. A reader arriving from “x-posed alternative”
 * already suspects the page is a sales pitch, and the fastest way to lose them
 * is a grid of fifteen ticks. Naming the three things X-Posed does better buys
 * the credibility that the rows above spend.
 */
export const LOSSES: { title: string; body: string }[] = [
  {
    title: 'X-Posed is the mature one',
    body: 'Roughly 7,000 Chrome installs against our handful, four years of releases, and a community cache holding millions of profiles where ours holds thousands. A bigger cache genuinely means more instant flags on day one. That is a real advantage and it is not close.',
  },
  {
    title: 'It ships on more surfaces',
    body: 'Firefox desktop, Firefox for Android, and a companion iPhone app. X-Pat is Chromium-only today — Chrome, Edge, Brave, and Lemur on Android. Firefox is planned, iOS is not.',
  },
  {
    title: 'It has a language filter',
    body: "We do not, on purpose. X's per-post language field is wrong often enough that filtering on it produces posts vanishing for no visible reason. That is a defensible call rather than a missing feature — but if filtering by language is what you came for, X-Posed has it and we do not.",
  },
]
