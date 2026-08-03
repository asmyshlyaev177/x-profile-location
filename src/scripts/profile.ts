// Account facts that ride along with data we already receive.
//
// Every field here is on the `__typename: 'User'` nodes in HomeTimeline /
// TweetDetail responses *and* on the AboutAccountQuery result, both of which the
// extension already handles — so none of it costs an API call. The exception is
// `handleChanges`, which only AboutAccountQuery carries.

/**
 * The org an account is badged as belonging to — X's affiliate badge.
 *
 * `handle` is the filtering key, not `name`: an org renames itself freely and
 * the description is its own text, but the account it points at is stable.
 */
export interface Affiliation {
  handle: string | null
  name: string | null
  badgeUrl: string | null
}

export interface AccountFacts {
  /** Account creation time, epoch ms. */
  createdAt: number | null
  affiliation: Affiliation | null
  /** How many times the account has changed its @handle. */
  handleChanges: number | null
  /** X's numeric account id — stable across handle changes. */
  restId: string | null
  blueVerified: boolean | null
  /** Legacy (pre-2023) verification. */
  verified: boolean | null
  /** X verified an actual identity document. */
  identityVerified: boolean | null
  isProtected: boolean | null
  followers: number | null
}

export const EMPTY_FACTS: AccountFacts = {
  createdAt: null,
  affiliation: null,
  handleChanges: null,
  restId: null,
  blueVerified: null,
  verified: null,
  identityVerified: null,
  isProtected: null,
  followers: null,
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

// "Sun Jan 22 21:18:47 +0000 2023" — the format X has used since the v1 API.
const RE_X_DATE =
  /^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\s+(\d{4})$/

/**
 * Parse X's `created_at` to epoch ms, or null.
 *
 * Hand-rolled, not `Date.parse`: the format is outside the spec, so V8 accepting
 * it says nothing about a Firefox or Safari build — and a wrong answer here
 * becomes an account age shown next to somebody's name.
 */
export function parseXDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = RE_X_DATE.exec(value.trim())
  if (!m) return null
  const month = MONTHS[m[1].toLowerCase()]
  if (month === undefined) return null

  const [day, hour, minute, second] = [m[2], m[3], m[4], m[5]].map(Number)
  const year = Number(m[7])
  if (day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60)
    return null

  const utc = Date.UTC(year, month, day, hour, minute, second)
  // The offset is the zone the timestamp is in, so it comes back off to reach
  // UTC. X only ever sends +0000, but reading it costs nothing.
  const sign = m[6][0] === '-' ? 1 : -1
  const offsetMinutes = Number(m[6].slice(1, 3)) * 60 + Number(m[6].slice(3, 5))
  return utc + sign * offsetMinutes * 60_000
}

/** A count X sends as a string ("3"), or null for anything unusable. */
function countFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const RE_PROFILE_URL =
  /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})\/?$/

/**
 * Affiliate badges and government/identity labels share one shape:
 *
 *     { label: { badge: { url }, description, url: { url, urlType }, … } }
 *
 * No badge sends `{}`, which yields null rather than an affiliation with every
 * field empty — only one of those two answers is worth showing.
 */
export function parseAffiliation(value: unknown): Affiliation | null {
  if (!value || typeof value !== 'object') return null
  const label = (value as Record<string, unknown>).label
  if (!label || typeof label !== 'object') return null
  const l = label as Record<string, unknown>

  const name = typeof l.description === 'string' ? l.description : null
  const badge = l.badge as Record<string, unknown> | undefined
  const badgeUrl = typeof badge?.url === 'string' ? badge.url : null

  const link = l.url as Record<string, unknown> | undefined
  const href = typeof link?.url === 'string' ? link.url : null
  const handle = href
    ? (RE_PROFILE_URL.exec(href)?.[1].toLowerCase() ?? null)
    : null

  if (!name && !handle && !badgeUrl) return null
  return { handle, name, badgeUrl }
}

/**
 * Pull the facts off a User node — timeline or AboutAccountQuery alike, since
 * the second is a User node with an `about_profile` attached.
 *
 * Takes `unknown` and checks every field: this is X's response shape, which
 * changes between deploys, and the failure mode has to be a missing badge rather
 * than a content script that throws mid-timeline.
 */
export function parseAccountFacts(node: unknown): AccountFacts {
  if (!node || typeof node !== 'object') return { ...EMPTY_FACTS }
  const u = node as Record<string, unknown>

  const core = u.core as Record<string, unknown> | undefined
  const legacy = u.legacy as Record<string, unknown> | undefined
  const privacy = u.privacy as Record<string, unknown> | undefined
  const verification = u.verification as Record<string, unknown> | undefined
  const verificationInfo = u.verification_info as
    | Record<string, unknown>
    | undefined
  const about = u.about_profile as Record<string, unknown> | undefined
  const usernameChanges = about?.username_changes as
    | Record<string, unknown>
    | undefined

  // Affiliate badge (org) or identity label (government/official). Both at once
  // is vanishingly rare, so the affiliate one wins.
  const affiliation =
    parseAffiliation(u.affiliates_highlighted_label) ??
    parseAffiliation(u.identity_profile_labels_highlighted_label)

  return {
    createdAt: parseXDate(core?.created_at ?? legacy?.created_at),
    affiliation,
    handleChanges: countFrom(usernameChanges?.count),
    restId: typeof u.rest_id === 'string' ? u.rest_id : null,
    blueVerified:
      typeof u.is_blue_verified === 'boolean' ? u.is_blue_verified : null,
    verified:
      typeof verification?.verified === 'boolean'
        ? verification.verified
        : typeof legacy?.verified === 'boolean'
          ? legacy.verified
          : null,
    identityVerified:
      typeof verificationInfo?.is_identity_verified === 'boolean'
        ? verificationInfo.is_identity_verified
        : null,
    isProtected:
      typeof privacy?.protected === 'boolean'
        ? privacy.protected
        : typeof legacy?.protected === 'boolean'
          ? legacy.protected
          : null,
    followers: countFrom(legacy?.followers_count),
  }
}

/** True when the facts carry nothing worth storing or showing. */
export function hasFacts(facts: AccountFacts): boolean {
  return (
    facts.createdAt !== null ||
    facts.affiliation !== null ||
    facts.handleChanges !== null ||
    facts.restId !== null ||
    facts.blueVerified !== null ||
    facts.verified !== null ||
    facts.identityVerified !== null ||
    facts.isProtected !== null ||
    facts.followers !== null
  )
}

/**
 * Only the fields carrying a value, so a merge can't blank what a richer earlier
 * sighting supplied — a timeline node has no `username_changes`, an
 * AboutAccountQuery result no `followers_count`.
 */
export function definedFacts(facts: AccountFacts): Partial<AccountFacts> {
  const out: Partial<AccountFacts> = {}
  for (const [key, value] of Object.entries(facts)) {
    if (value !== null) (out as Record<string, unknown>)[key] = value
  }
  return out
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days since the account was created, or null. */
export function accountAgeDays(
  createdAt: number | null | undefined,
  now: number = Date.now(),
): number | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  return Math.max(0, Math.floor((now - createdAt) / DAY_MS))
}

/**
 * Account age at the resolution a reader uses it: days, then months, then years.
 * "4271d" is the same fact as "11y" and nobody reads it that way.
 */
export function formatAccountAge(
  createdAt: number | null | undefined,
  now: number = Date.now(),
): string | null {
  const days = accountAgeDays(createdAt, now)
  if (days === null) return null
  if (days < 1) return 'today'
  if (days < 60) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 24) return `${months}mo`
  return `${Math.floor(days / 365)}y`
}

/** Follower counts the way X itself abbreviates them. */
export function formatFollowers(
  count: number | null | undefined,
): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
    return null
  }
  if (count < 1000) return String(count)
  if (count < 1_000_000) {
    const k = count / 1000
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`
  }
  const m = count / 1_000_000
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`
}
