// Ask X about one account, once, and tell the broker what it cost. The pace is
// the service worker's — see ../prefetch/CLAUDE.md.

import {
  LOOKUP_WINDOW_MS,
  MSG,
  RATE_LIMIT_RESET_DEFAULT_MS,
  X_GRAPHQL_PATH,
} from '../constants'
import {
  answerSignature,
  getCached,
  type LocationData,
  mergeCached,
} from '../cache/cache'
import { contributeLocation } from '../cache/shared-cache'
import type { LookupReport, TabState } from '../prefetch/lookup-broker'
import { definedFacts, parseAccountFacts } from '../profile'
import { rememberBio } from './bio-cache'
import { isRateLimited, noteRateLimit, showRateLimitToast } from './overlays'

const QUERY_ID = 'XRqGa7EeokUU5kppkh13EA'
const API_BASE = `https://${X_GRAPHQL_PATH}`
const ABOUT_ACCOUNT_URL = `${API_BASE}/${QUERY_ID}/AboutAccountQuery`

let apiHeaders: Record<string, string> | null = null
export function setApiHeaders(h: Record<string, string> | null) {
  apiHeaders = h
}

// Tracks users whose location was already fetched via API this session,
// so repeat hovers skip the network and read from IDB instead.
const checkedThisSession = new Set<string>()

// A hover or swipe refetches rather than trusting a cached answer, at most once
// per handle per window — see "Asking again for the account" in CLAUDE.md.
const lastManualAt = new Map<string, number>()

function manualRefetchDue(key: string): boolean {
  const prev = lastManualAt.get(key)
  return prev === undefined || Date.now() - prev >= LOOKUP_WINDOW_MS
}

// Shared promises, keyed by lowercased handle, so concurrent processCard calls
// await one in-flight fetch instead of getting null.
const pendingMap = new Map<string, Promise<LocationData | null>>()

/** Attempted in this tab; the cross-tab answer is the broker's `asked`. */
export function answeredThisSession(userName: string): boolean {
  return checkedThisSession.has(userName.toLowerCase())
}

export function forgetSessionAnswers(): void {
  checkedThisSession.clear()
}

export function hasApiHeaders(): boolean {
  return apiHeaders !== null
}

function intHeader(resp: Response, name: string): number | null {
  const raw = resp.headers.get(name)
  if (raw === null) return null
  const n = parseInt(raw)
  return Number.isNaN(n) ? null : n
}

/** The window is counted in the service worker, not here; this side only passes
 *  on what X answered. See "Cross-tab lookup broker" in CLAUDE.md. */
function readRateHeaders(resp: Response): Partial<LookupReport> {
  return {
    status: resp.status,
    limit: intHeader(resp, 'x-rate-limit-limit'),
    remaining: intHeader(resp, 'x-rate-limit-remaining'),
    reset: intHeader(resp, 'x-rate-limit-reset'),
  }
}

export function tabState(): TabState {
  return {
    focused: document.hasFocus(),
    visible: document.visibilityState !== 'hidden',
  }
}

export async function askBroker<T>(message: object): Promise<T | null> {
  try {
    return (await chrome.runtime.sendMessage({
      ...message,
      tab: tabState(),
    })) as T
  } catch {
    // An evicted or reloading worker must never take a lookup down with it.
    return null
  }
}

function reportLookup(report: LookupReport): Promise<unknown> {
  return askBroker({ type: MSG.REPORT, report })
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name + '=([^;]*)'),
  )
  return match ? decodeURIComponent(match[1]) : null
}

function aboutAccountHeaders(
  captured: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: captured.authorization,
    'content-type': 'application/json',
    'x-twitter-client-language': captured['x-twitter-client-language'] ?? 'en',
    'x-twitter-active-user': captured['x-twitter-active-user'] ?? 'yes',
  }
  // page-script never forwards the csrf token, so in practice this is the cookie.
  const csrf = captured['x-csrf-token'] || getCookie('ct0')
  if (csrf) headers['x-csrf-token'] = csrf
  return headers
}

/** Null means no profile at all, which is not "a profile with no location". */
function toLocationData(
  json: any,
  storedBio: string | null,
): LocationData | null {
  const result = json?.data?.user_result_by_screen_name?.result ?? null
  const profile = result?.about_profile ?? null
  if (!profile) return null
  return {
    bio: storedBio,
    location: profile.account_based_in ?? null,
    locationAccurate: profile.location_accurate !== false,
    source: profile.source ?? null,
    // Same response, already paid for. This is the only place handle-change
    // history is available at all — timeline nodes don't carry it.
    facts: definedFacts(parseAccountFacts(result)),
  }
}

function votesFor(
  fresh: LocationData,
  stored: LocationData | undefined,
): number {
  const agrees =
    stored !== undefined && answerSignature(stored) === answerSignature(fresh)
  return agrees ? (stored.votes ?? 0) + 1 : 1
}

/** What a lookup ended up costing the shared window, for the broker's ledger. */
type LookupCost = Omit<LookupReport, 'userName'>

const NOTHING_SPENT: LookupCost = { spent: false }

/** What can be answered with no request, or `undefined` when one has to go out.
 *  A revalidation is bought on purpose, so it never lands here. */
function answerWithoutAsking(
  userName: string,
  stored: LocationData | undefined,
  revalidate: boolean,
): LocationData | null | undefined {
  if (revalidate) return undefined
  // Bio-only entries (location: null, source: null) fall through.
  if (stored?.location || stored?.source) return stored
  // Already asked X this session — whatever IDB has is the whole answer.
  if (checkedThisSession.has(userName.toLowerCase())) return stored ?? null
  return undefined
}

async function runLookup(
  userName: string,
  capturedHeaders: Record<string, string> | null,
  revalidate: boolean,
): Promise<{ data: LocationData | null; cost: LookupCost }> {
  const stored = await getCached(userName)

  const settled = answerWithoutAsking(userName, stored, revalidate)
  if (settled !== undefined) return { data: settled, cost: NOTHING_SPENT }

  // A refetch that cannot go out still shows the last answer — but a bio-only
  // entry is not one, and would cost the caller its rate-limit badge.
  const storedAnswer = stored?.location || stored?.source ? stored : undefined
  const fallbackData = revalidate ? (storedAnswer ?? null) : null

  // Don't attempt without intercepted headers — avoids failures before
  // the page-script captures the session.
  if (!capturedHeaders) return { data: fallbackData, cost: NOTHING_SPENT }

  if (isRateLimited()) {
    showRateLimitToast()
    return { data: fallbackData, cost: NOTHING_SPENT }
  }

  try {
    const variables = JSON.stringify({ screenName: userName })
    const url = `${ABOUT_ACCOUNT_URL}?variables=${encodeURIComponent(variables)}`

    const resp = await fetch(url, {
      method: 'GET',
      headers: aboutAccountHeaders(capturedHeaders),
      credentials: 'include',
    })
    const cost: LookupCost = { spent: true, ...readRateHeaders(resp) }

    if (resp.status === 429) {
      noteRateLimit(
        cost.reset
          ? cost.reset * 1000
          : Date.now() + RATE_LIMIT_RESET_DEFAULT_MS,
      )
      return { data: fallbackData, cost }
    }

    if (!resp.ok) return { data: fallbackData, cost }

    checkedThisSession.add(userName.toLowerCase())
    cost.ok = true

    const data = toLocationData(await resp.json(), stored?.bio ?? null)
    if (!data) return { data: stored ?? null, cost }
    data.votes = votesFor(data, stored)

    rememberBio(userName, null, null, data.facts)
    await mergeCached(userName, data)
    // Share this first-hand result so other users can skip the X call.
    contributeLocation(userName, data)
    return { data, cost }
  } catch {
    // A request that threw still left the window; only X can say by how much.
    return { data: fallbackData, cost: { spent: true } }
  }
}

export async function fetchLocationData(
  userName: string,
  opts: { granted?: boolean; revalidate?: boolean; manual?: boolean } = {},
): Promise<LocationData | null> {
  const key = userName.toLowerCase()
  if (pendingMap.has(key)) {
    // The broker is holding this handle for us and no request will follow, so
    // hand the slot straight back rather than let it time out.
    if (opts.granted) await reportLookup({ userName, spent: false })
    return pendingMap.get(key)!
  }

  const manual = opts.manual === true && manualRefetchDue(key)
  const revalidate = opts.revalidate === true || manual

  // Capture snapshot so the IIFE always uses the headers that were valid at
  // call time, even if apiHeaders is updated mid-flight.
  const capturedHeaders = apiHeaders

  const promise = (async (): Promise<LocationData | null> => {
    const { data, cost } = await runLookup(
      userName,
      capturedHeaders,
      revalidate,
    )
    // Stamped on the request, not on the gesture: a hover that found the window
    // closed asked X nothing, and the next one should be free to try.
    if (manual && cost.spent) lastManualAt.set(key, Date.now())
    // Nothing went out and the broker is holding nothing for us — every hover
    // over a cached account lands here, and each report would wake the worker.
    if (!cost.spent && !opts.granted) return data

    const reported = reportLookup({ userName, ...cost })
    // A granted lookup waits, so the broker knows the cost before handing out
    // the next handle; a hover never waits on an evicted worker's cold start.
    if (opts.granted) await reported
    return data
  })()

  pendingMap.set(key, promise)
  promise.finally(() => pendingMap.delete(key))
  return promise
}

export function __resetLookup(): void {
  apiHeaders = null
  checkedThisSession.clear()
  lastManualAt.clear()
  pendingMap.clear()
}
