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
 * config loads this at build time to generate the README block.
 *
 * Since the site went multilingual this file holds the *verifiable* half of a
 * row — which product does what — and the readable half (`label`, `note`) lives
 * in `i18n/dict/*` under `comparison.rows.<id>`. The split is not cosmetic: a
 * cell is a checkable claim about someone else's software and must stay
 * identical in every language, while the sentence describing it must not.
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
 * 3. Rows X-Pat loses stay in. `LOSS_IDS` below is the honest-broker section,
 *    and it is the reason the rest of the page is believable. A comparison page
 *    that wins every row reads as marketing and converts like marketing.
 * 4. Re-check `SCRAPED` before shipping any edit. Install counts move, and a
 *    stale figure presented as current is the one error that looks deliberate.
 * 5. Adding a row means adding its `id` here *and* a `comparison.rows.<id>`
 *    entry to all fifteen dictionaries. TypeScript enforces the second half.
 */

import type { Dict } from '../i18n/dict/en'

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

export type RowId = keyof Dict['comparison']['rows']

export interface Row {
  /** Key into `Dict['comparison']['rows']`, where the label and note live. */
  id: RowId
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
    id: 'inlineCountry',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'unstated',
    },
  },
  {
    id: 'vpnWarning',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'unstated',
    },
  },
  {
    id: 'signupSource',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    id: 'accountAge',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    id: 'handleChanges',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    id: 'hideByCountry',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'yes',
    },
  },
  {
    id: 'languageFilter',
    cells: {
      'X-Pat': 'no',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    id: 'allowlist',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'unstated',
      'Region Blocker': 'unstated',
    },
  },
  {
    id: 'sharedCache',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'no',
    },
  },
  {
    id: 'cacheServerSource',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'no',
      'Flags & Time': 'no',
      'Region Blocker': 'n/a',
    },
  },
  {
    id: 'crossChecked',
    headline: true,
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'no',
      'Flags & Time': 'unstated',
      'Region Blocker': 'n/a',
    },
  },
  {
    id: 'extensionSource',
    cells: {
      'X-Pat': 'yes',
      'X-Posed': 'yes',
      'Flags & Time': 'no',
      'Region Blocker': 'no',
    },
  },
  {
    id: 'testSuite',
    headline: true,
    cells: {
      // Not a tick but a count, and it is copy as much as data — so the string
      // itself comes from the dictionary, where "609 tests" can become
      // "609 اختبارات" without the row's meaning moving.
      'X-Pat': 'testCount',
      'X-Posed': 'none',
      'Flags & Time': 'n/a',
      'Region Blocker': 'n/a',
    },
  },
  {
    id: 'firefox',
    cells: {
      'X-Pat': 'no',
      'X-Posed': 'yes',
      'Flags & Time': 'yes',
      'Region Blocker': 'no',
    },
  },
  {
    id: 'iosApp',
    cells: {
      'X-Pat': 'no',
      'X-Posed': 'yes',
      'Flags & Time': 'no',
      'Region Blocker': 'no',
    },
  },
]

/**
 * Where the competition is genuinely ahead, in render order.
 *
 * This section is load-bearing. A reader arriving from “x-posed alternative”
 * already suspects the page is a sales pitch, and the fastest way to lose them
 * is a grid of fifteen ticks. Naming the three things X-Posed does better buys
 * the credibility that the rows above spend. The prose is in the dictionaries
 * under `comparison.losses`.
 */
export const LOSS_IDS = [
  'mature',
  'surfaces',
  'languageFilter',
] as const satisfies readonly (keyof Dict['comparison']['losses'])[]
