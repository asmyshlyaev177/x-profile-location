#!/usr/bin/env node
/**
 * Scrub personal data out of the committed Playwright HAR recordings.
 *
 * WHY THIS EXISTS
 * A capture is a slice of a real logged-in X session, so a raw `.har` carries the
 * timeline of whoever recorded it: hundreds of real accounts per file with display
 * names, bios, avatars and post text, plus the recording account's own identity
 * throughout. test-proxy-recorder already redacts `cookie`, `set-cookie`,
 * `authorization` and `x-csrf-token`; that covers credentials, not identity.
 * This covers identity.
 *
 * NO REAL HANDLE APPEARS IN THIS FILE OR IN scrub.config.json — and none may be
 * added. Both are committed, so naming an account here would republish the very
 * identity the scrub removes, and naming the *recording* account would be worse
 * than leaving it in the HAR, because a config is the first thing anyone reads.
 *
 * Users are recognised by SHAPE: any object carrying a handle field. Which of
 * them keep their identity is DERIVED, not declared — a handle survives exactly
 * when a test source names it, because that is what "the suite asserts against
 * this account" looks like. Those accounts keep their handle, display name and
 * bio (the keyword tests match on real bio text) and their country, app-store
 * source and creation date, which is the data under test. Every other account in
 * a capture is an incidental third party and is pseudonymised. The recording
 * account is named by no test, so it is removed without ever being written down,
 * and an account a test stops naming is anonymised by the next run.
 *
 * "By shape" has to mean every shape and every carrier, which took two goes to
 * get right. A user reaches a capture as GraphQL's `screen_name`, as the newer
 * `core`/`legacy` split, and as Periscope's `twitter_screen_name` + `display_name`
 * — and arrives not only as a JSON response body but inlined into the HTML of
 * every server-rendered document, where X writes the signed-in account's name,
 * bio, location, avatar and date of birth into `__INITIAL_STATE__`. Recognising
 * one shape in one carrier left the recording account's display name in the
 * sidebar of every committed recording; see scrubMarkup() and userHandle().
 *
 * WHAT IT DOES NOT DO
 * It does not prune X's JavaScript. Those bundles are ~80% of a HAR's bytes, but
 * they are X's public static assets — no personal data — and the page needs them
 * to render under replay, which is what makes replay deterministic. Size is a
 * side effect here; identity is the goal.
 *
 * MAPPING
 * A handle maps to `user_<8 hex of sha256(lowercased handle)>`. Deterministic, so
 * two machines scrubbing the same capture produce identical output and re-runs are
 * no-ops, and there is no real→fake dictionary that could be committed by mistake.
 * It is pseudonymisation, not anonymisation: the mapping is reversible by anyone
 * who guesses a handle. That is why display names, bios, avatars and post text go
 * too — the hash is not the protection, the absence of anything to link it to is.
 *
 *   node scripts/scrub-recordings.mjs             scrub the recordings in place
 *   node scripts/scrub-recordings.mjs --check     exit 1 if anything is unscrubbed (CI)
 *   node scripts/scrub-recordings.mjs --stdin     scrub one recording, stdin → stdout
 *   node scripts/scrub-recordings.mjs --id <h>    print the synthetic id for a handle
 *   node scripts/scrub-recordings.mjs --verbose   per-file detail
 */
import { createHash } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RECORDINGS = path.join(ROOT, 'e2e', 'recordings')
const CONFIG = path.join(ROOT, 'e2e', 'scrub.config.json')

const CHECK = process.argv.includes('--check')
const VERBOSE = process.argv.includes('--verbose')
const STDIN = process.argv.includes('--stdin')
// indexOf returns -1 when the flag is absent, and argv[0] is the node binary —
// so guard on presence rather than reading the slot unconditionally.
const idFlag = process.argv.indexOf('--id')
const ID_OF = idFlag === -1 ? null : process.argv[idFlag + 1]

const config = JSON.parse(readFileSync(CONFIG, 'utf8'))
const DROP_MEDIA = new Set(config.dropMedia ?? [])
const TEST_SOURCES = config.testSources ?? []

/**
 * Handles the tests assert against, derived from the test sources rather than
 * declared in config. Populated by findTestSubjects() before anything is
 * rewritten. Members keep their real handle, display name and bio; everyone else
 * is pseudonymised. The recording account is named by no test, so it falls on the
 * anonymised side without appearing in any committed file.
 */
const SUBJECTS = new Set()
const isSubject = (handle) => SUBJECTS.has(String(handle).toLowerCase())

/** A handle this script has already rewritten — makes re-runs no-ops. */
const SYNTHETIC = /^user_[0-9a-f]{8}$/

// X handles are [A-Za-z0-9_]{1,15}. Explicit boundaries rather than \b, which
// treats `_` as a word character and would let a short handle rewrite the prefix
// of a longer one.
const HANDLE_TOKEN = '[A-Za-z0-9_]{1,15}'

/**
 * Every key that carries a handle. `screen_name` is GraphQL and the legacy REST
 * shape; Periscope — X's video/spaces backend, which the timeline calls on its
 * own — answers with `twitter_screen_name` and `username` instead. Its response
 * to the token exchange is a complete profile of the signed-in account, and it
 * was invisible to a scrubber that only knew `screen_name`.
 */
const HANDLE_KEYS = ['screen_name', 'twitter_screen_name', 'username']
/** Keys holding a display name beside one of those handles. */
const NAME_KEYS = ['name', 'display_name', 'user_display_name']
/** Keys holding a single avatar or banner URL. */
const AVATAR_KEYS = [
  'profile_image_url_https',
  'profile_image_url',
  'profile_banner_url',
  'image_url',
]

/**
 * Only the unambiguous handle keys are used to *discover* accounts from raw text.
 * A bare `username` is an ordinary word in plenty of unrelated payloads, so it is
 * trusted only in a parsed object that also has a display name — see userHandle().
 */
const HANDLE_FIELD = '(?:twitter_screen_name|screen_name)'

/**
 * Scanning raw HAR text has to allow for escaped quotes. A HAR stores each
 * response body as a JSON *string*, so the body's own JSON is double-encoded: on
 * disk the field reads `\"screen_name\":\"jack\"`, never `"screen_name":"jack"`.
 * Matching only the unescaped form finds nothing at all — which is how a --check
 * can report success over a completely unscrubbed file.
 *
 * (The structural pass is unaffected: it runs on the result of JSON.parse of that
 * string, where the keys are ordinary.)
 */
const Q = '\\\\?"'
const screenNameRe = () =>
  new RegExp(`${Q}${HANDLE_FIELD}${Q}\\s*:\\s*${Q}(${HANDLE_TOKEN})${Q}`, 'g')

const PLACEHOLDER_AVATAR =
  'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
const POST_PLACEHOLDER = 'Post text removed by scrub-recordings.'
// 1x1 transparent PNG — every avatar and photo body collapses to this.
const PLACEHOLDER_IMAGE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/**
 * Tokens common enough in test code that finding one proves nothing about which
 * accounts a test asserts against. An account whose handle collides with one of
 * these is pseudonymised like any other; if that breaks a test, name the account
 * somewhere less ambiguous than a bare identifier.
 */
const SOURCE_RESERVED = new Set([
  'page',
  'test',
  'expect',
  'context',
  'helpers',
  'await',
  'async',
  'const',
  'let',
  'import',
  'export',
  'from',
  'default',
  'window',
  'document',
  'console',
  'location',
  'status',
  'options',
  'browser',
  'chrome',
  'firefox',
  'safari',
  'string',
  'number',
  'boolean',
  'object',
  'locator',
  'timeout',
  'url',
  'id',
])
/** Below this length a handle is too likely to collide with ordinary prose/code. */
const MIN_SOURCE_LEN = 5

const seen = new Map() // lowercased real handle -> synthetic

function synthetic(handle) {
  const lc = handle.toLowerCase()
  if (SYNTHETIC.test(lc)) return handle
  if (SUBJECTS.has(lc)) return handle
  if (!seen.has(lc)) {
    const hash = createHash('sha256').update(lc).digest('hex').slice(0, 8)
    seen.set(lc, `user_${hash}`)
  }
  return seen.get(lc)
}

const displayNameFor = (handle) => `User ${synthetic(handle).slice(5, 9)}`

/** A trend name this script has already rewritten — makes re-runs no-ops. */
const SYNTHETIC_TREND = /^Trend [0-9a-f]{4}$/

const syntheticTrend = (name) =>
  SYNTHETIC_TREND.test(name)
    ? name
    : `Trend ${createHash('sha256').update(name).digest('hex').slice(0, 4)}`

// ---------------------------------------------------------------------------
// Structural pass — rewrite identity fields inside parsed JSON bodies
// ---------------------------------------------------------------------------

/**
 * Fields carrying a session rather than an identity. test-proxy-recorder redacts
 * the `cookie` *header*; Periscope's token exchange returns one in the response
 * *body*, where nothing was looking for it.
 */
const CREDENTIAL_KEYS = ['cookie', 'set_cookie']

/**
 * The handle of a user-shaped object, or null when it is not one. The two
 * `screen_name` spellings are proof on their own. A bare `username` is not — it
 * is an ordinary field name in unrelated payloads — so it counts only next to a
 * display name.
 */
function userHandle(node) {
  if (typeof node.screen_name === 'string') return node.screen_name
  if (typeof node.twitter_screen_name === 'string')
    return node.twitter_screen_name
  if (
    typeof node.username === 'string' &&
    NAME_KEYS.some((k) => typeof node[k] === 'string')
  ) {
    return node.username
  }
  return null
}

/**
 * Walk any JSON value and rewrite the identity fields of every user-shaped object
 * found. X returns users in three shapes — a flat `legacy`-style object carrying
 * `screen_name` beside `name`/`description`, the newer split of
 * `core: { screen_name, name }` with `avatar: { image_url }` as siblings, and
 * Periscope's `twitter_screen_name`/`display_name` — so all three are handled
 * where they are found rather than assuming one schema.
 */
function walk(node, stats) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, stats)
    return
  }
  if (!node || typeof node !== 'object') return

  for (const key of CREDENTIAL_KEYS) {
    if (typeof node[key] === 'string' && node[key]) {
      node[key] = ''
      stats.credentials++
    }
  }

  // Shape A: a handle directly on this object, name/description beside it.
  const handle = userHandle(node)
  if (handle !== null) rewriteUser(node, handle, stats)

  // A trend is a `name` with `trend_metadata` beside it (X also marks it
  // `__typename: 'TimelineTrend'`, but the shape is the thing).
  if (typeof node.name === 'string' && isObject(node.trend_metadata)) {
    rewriteTrend(node, stats)
  }
  // The name is welded into the timeline entry's id as well as into the trend.
  if (typeof node.entryId === 'string' && node.entryId.includes(TREND_ENTRY)) {
    const cut = node.entryId.lastIndexOf(TREND_ENTRY) + TREND_ENTRY.length
    const id = syntheticTrend(node.entryId.slice(cut))
    if (node.entryId.slice(cut) !== id) stats.trends++
    node.entryId = node.entryId.slice(0, cut) + id
  }
  // An opaque blob that base64-encodes whatever the entry is about — the trend
  // name included, so a rewritten trend hands it straight back. Nothing renders
  // from it; it is the payload of X's "not interested in this" control.
  if (typeof node.feedbackMetadata === 'string' && node.feedbackMetadata) {
    node.feedbackMetadata = ''
    stats.trends++
  }

  // Shape B: core.screen_name, with avatar/legacy as siblings of `core`.
  if (node.core && typeof node.core.screen_name === 'string') {
    const nested = node.core.screen_name
    rewriteUser(node.core, nested, stats)
    if (node.avatar) blankAvatar(node.avatar, 'image_url', stats)
    if (node.legacy && typeof node.legacy === 'object') {
      rewriteUser(node.legacy, nested, stats)
    }
  }

  // Post text — nothing asserts on it, and it is the most personal payload here.
  // Tweet objects carry an id_str/rest_id sibling; the guard keeps us off
  // unrelated `text` fields (labels, tooltips, i18n strings).
  const isTweet =
    typeof node.id_str === 'string' || typeof node.rest_id === 'string'
  for (const key of ['full_text', 'text']) {
    if (!isTweet || typeof node[key] !== 'string' || !node[key]) continue
    if (node[key] !== POST_PLACEHOLDER) stats.posts++
    node[key] = POST_PLACEHOLDER
  }

  for (const value of Object.values(node)) walk(value, stats)
}

const isObject = (v) => Boolean(v) && typeof v === 'object'

/** How a timeline entry id carries the trend it is for. */
const TREND_ENTRY = '-trend-'

/**
 * Rewrite one trend out of the sidebar.
 *
 * Trends are public, but *which* trends X chose to show is not: the panel is
 * personalised to where the viewer is, and labels them "Trending in <country>"
 * to say so. Left alone it puts the recording account in a country as reliably as
 * the profile field this already blanks, only from the other direction — so the
 * name, the label and the search URLs all go.
 *
 * The `cd` request param is dropped rather than rewritten: it is a base64 blob
 * that encodes the trend name, so leaving it would hand back what the rename took
 * away.
 */
function rewriteTrend(node, stats) {
  const id = syntheticTrend(node.name)
  if (node.name !== id) stats.trends++
  node.name = id

  const meta = node.trend_metadata
  if (typeof meta.domain_context === 'string') meta.domain_context = 'Trending'
  for (const holder of [meta.url, node.trend_url]) {
    if (!isObject(holder)) continue
    if (typeof holder.url === 'string') {
      holder.url =
        `twitter://search/?query=${encodeURIComponent(id)}` +
        '&src=trend_click&pc=true&vertical=trends'
    }
    for (const param of holder.urtEndpointOptions?.requestParams ?? []) {
      if (typeof param?.value === 'string') param.value = ''
    }
  }
}

/** Blank one avatar/banner URL, counting it only when it actually changed. */
function blankAvatar(obj, key, stats) {
  if (typeof obj[key] !== 'string') return
  if (obj[key] !== PLACEHOLDER_AVATAR) stats.avatars++
  obj[key] = PLACEHOLDER_AVATAR
}

function rewriteUser(obj, handle, stats) {
  const id = synthetic(handle)
  // A test subject keeps its identity: the suite navigates to it by handle and
  // the keyword tests match on its real bio text.
  const subject = isSubject(handle)

  for (const key of HANDLE_KEYS) {
    if (typeof obj[key] !== 'string') continue
    if (obj[key] !== id) stats.handles++
    obj[key] = id
  }
  if (!subject) {
    for (const key of NAME_KEYS) {
      if (typeof obj[key] !== 'string') continue
      if (obj[key] !== displayNameFor(handle)) stats.names++
      obj[key] = displayNameFor(handle)
    }
    if (typeof obj.description === 'string') {
      if (obj.description !== '') stats.bios++
      obj.description = ''
    }
    // The bio's links outlive the bio: X keeps them parsed out into `entities`,
    // expanded_url and all, so blanking `description` alone leaves the personal
    // site or list the account linked to.
    if (obj.entities?.description?.urls?.length) {
      obj.entities.description.urls = []
      stats.bios++
    }
    // A date of birth is the strongest identifier a profile carries, and X
    // inlines the signed-in account's into every document it renders. Deleted
    // rather than blanked: not knowing someone's birthday is the normal state of
    // every other user object in a capture.
    if (obj.birthdate) {
      delete obj.birthdate
      stats.pii++
    }
  }
  for (const key of AVATAR_KEYS) blankAvatar(obj, key, stats)
  // Periscope sends sized variants as an array rather than one URL per key.
  if (Array.isArray(obj.profile_image_urls)) {
    for (const variant of obj.profile_image_urls) {
      if (!variant || typeof variant !== 'object') continue
      for (const key of ['url', 'ssl_url']) blankAvatar(variant, key, stats)
    }
  }
  // Self-declared profile fields that can carry a real name or personal site.
  // (X's *account* country lives in about_profile.account_based_in, which this
  // never touches — that value is what the tests assert on.)
  if (!subject) {
    if (typeof obj.location === 'string' && obj.location) obj.location = ''
    if (typeof obj.url === 'string' && obj.url.includes('t.co')) obj.url = ''
  }
}

// ---------------------------------------------------------------------------
// Textual pass — handles in URLs, entity mentions, nested JSON strings
// ---------------------------------------------------------------------------

/**
 * Replace every known handle wherever it appears as a whole token. The structural
 * pass cannot reach handles inside a URL path, a percent-encoded GraphQL
 * `variables` blob, or a JSON string that itself contains JSON — and those matter:
 * `routeFromHAR` matches on the request URL, so a rewritten body behind an
 * unrewritten URL would simply fail to match at replay.
 *
 * Applied only to URLs and JSON bodies. X's JS bundles are never touched: they
 * hold no personal data, and blind token replacement inside minified code is a
 * good way to corrupt it.
 */
function rewriteText(text, stats) {
  if (!text) return text
  let out = text
  for (const [lc, fake] of seen) out = replaceToken(out, lc, fake, stats)
  return out
}

function replaceToken(text, from, to, stats) {
  // Case-insensitive: X echoes handles back with whatever casing the client sent,
  // so one account shows up as `Zgldz` in a URL and `zgldz` in a body.
  const re = new RegExp(
    `(?<![A-Za-z0-9_])${escapeRe(from)}(?![A-Za-z0-9_])`,
    'gi',
  )
  return text.replace(re, () => {
    stats.tokens++
    return to
  })
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---------------------------------------------------------------------------
// Markup — the state blob X inlines into every server-rendered document
// ---------------------------------------------------------------------------

/** Where a user-shaped object may start inside markup. */
const markupAnchorRe = () => new RegExp(`"${HANDLE_FIELD}"\\s*:`, 'g')

/**
 * A server-rendered x.com document carries `__INITIAL_STATE__={…}`, and inside it
 * the signed-in account's display name, bio, location, avatar, banner and date of
 * birth. Markup used to get the textual pass and nothing else — which rewrote the
 * handle, because the handle is a token the mapping knows, and left every one of
 * those fields untouched. That is what put the recording account's name in the
 * sidebar of all 29 committed recordings.
 *
 * So markup gets the structural pass too: find the JSON around each user-shaped
 * anchor, hand the parsed object to walk(), and splice the result back.
 *
 * Nothing here trusts a variable name or a script tag. The blob is located by
 * balancing braces out from the anchor and confirmed by JSON.parse before a byte
 * moves — so a document this cannot make sense of is left exactly as markup was
 * left before, rather than corrupted by a guess.
 */
function scrubMarkup(text, stats) {
  const anchors = [...text.matchAll(markupAnchorRe())].map((m) => m.index)
  if (anchors.length === 0) return text

  const { chains, closeOf } = braceChains(text, anchors)
  const spans = new Map()
  for (const anchor of anchors) {
    // Outermost first: a user split across sibling keys (`core`, `legacy`,
    // `avatar`) has to reach walk() in one piece, and the nearest enclosing
    // object is only `core`.
    for (const open of chains.get(anchor) ?? []) {
      const close = closeOf.get(open)
      if (close === undefined || close < anchor) continue
      let parsed
      try {
        parsed = JSON.parse(text.slice(open, close + 1))
      } catch {
        continue
      }
      spans.set(open, { open, close, parsed })
      break
    }
  }
  if (spans.size === 0) {
    stats.unparsed++
    return text
  }

  const outer = [...spans.values()].filter(
    (s) =>
      ![...spans.values()].some(
        (other) =>
          other !== s && other.open <= s.open && other.close >= s.close,
      ),
  )
  // Right to left, so the offsets of the spans still to come stay valid.
  let out = text
  for (const span of outer.sort((a, b) => b.open - a.open)) {
    walk(span.parsed, stats)
    out =
      out.slice(0, span.open) +
      inlineSafe(JSON.stringify(span.parsed)) +
      out.slice(span.close + 1)
  }
  return out
}

/**
 * For each anchor, the `{` positions still open at that point (outermost first),
 * plus where every `{` is closed.
 *
 * One forward pass that tracks JSON string literals, so a brace inside a bio or a
 * URL does not count. The document is HTML with inline script rather than JSON,
 * so this is a heuristic — but a fail-safe one: where it reads the nesting wrong
 * the slice it proposes does not parse, and scrubMarkup rewrites nothing.
 */
function braceChains(text, anchors) {
  const wanted = new Set(anchors)
  const chains = new Map()
  const closeOf = new Map()
  const stack = []
  let inString = false

  for (let i = 0; i < text.length; i++) {
    // Anchors sit on the opening quote of a key, so the snapshot is taken
    // before this character is classified.
    if (wanted.has(i)) chains.set(i, [...stack])
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') stack.push(i)
    else if (c === '}') {
      const open = stack.pop()
      if (open !== undefined) closeOf.set(open, i)
    }
  }
  return { chains, closeOf }
}

/**
 * The blob sits in a <script>, where a literal `</script` inside a string closes
 * the tag early and a raw U+2028/U+2029 is not a legal JS string character.
 * JSON.stringify escapes neither. Both forms below are still valid JSON, so a
 * later run parses back exactly what this wrote.
 */
const inlineSafe = (json) =>
  json
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

// ---------------------------------------------------------------------------
// Per-entry processing
// ---------------------------------------------------------------------------

const isJsonish = (mime) =>
  /json|text\/plain/.test(mime || '') &&
  !/application\/javascript/.test(mime || '')

const isImage = (mime) => (mime || '').startsWith('image/')

// Markup, not script: `application/javascript` must never reach the textual pass.
const isMarkup = (mime) => /^text\/(html|xml)|xhtml/.test(mime || '')

function scrubEntry(entry, stats) {
  const mime = (entry.response?.content?.mimeType || '').split(';')[0]
  const content = entry.response?.content
  if (!content) return

  // Media: keep the entry so the request still resolves, drop the payload.
  if (DROP_MEDIA.has(mime)) {
    if (content.text) {
      stats.bytesDropped += content.text.length
      content.text = ''
      content.size = 0
      stats.media++
    }
    return
  }

  if (isImage(mime)) {
    if (content.text && content.text !== PLACEHOLDER_IMAGE_B64) {
      stats.bytesDropped += content.text.length
      content.text = PLACEHOLDER_IMAGE_B64
      content.encoding = 'base64'
      content.size = PLACEHOLDER_IMAGE_B64.length
      stats.images++
    }
    return
  }

  if (isJsonish(mime) && content.text) {
    try {
      const parsed = JSON.parse(content.text)
      walk(parsed, stats)
      content.text = JSON.stringify(parsed)
    } catch {
      // Not valid JSON despite the mime type — the textual pass still applies.
      stats.unparsed++
    }
    content.text = rewriteText(content.text, stats)
    content.size = content.text.length
    return
  }

  // Markup gets both passes. X server-renders the signed-in account into the
  // document — inlined initial state, meta tags — so skipping HTML entirely left
  // that account's handle in every capture, which is what the first version of
  // this script did; and running only the textual pass over it rewrote the handle
  // while leaving the name, bio, location, avatar and birthdate beside it, which
  // is what the second version did.
  if (isMarkup(mime) && content.text) {
    content.text = scrubMarkup(content.text, stats)
    content.text = rewriteText(content.text, stats)
    content.size = content.text.length
  }
}

/**
 * URLs are rewritten for *every* entry whatever its content type: an avatar or a
 * media segment can carry the handle in its path, and the request still has to
 * match at replay.
 */
function scrubUrls(entry, stats) {
  if (entry.request?.url)
    entry.request.url = rewriteText(entry.request.url, stats)
  // Referer carries the profile or status URL the request came from, so it holds
  // handles that appear nowhere else in the entry.
  for (const h of entry.request?.headers ?? []) {
    if (
      /^(referer|referrer|origin)$/i.test(h.name) &&
      typeof h.value === 'string'
    ) {
      h.value = rewriteText(h.value, stats)
    }
  }
  for (const q of entry.request?.queryString ?? []) {
    if (typeof q.value === 'string') q.value = rewriteText(q.value, stats)
  }
  for (const h of entry.response?.headers ?? []) {
    if (/^location$/i.test(h.name) && typeof h.value === 'string') {
      h.value = rewriteText(h.value, stats)
    }
  }
  if (entry.request?.postData?.text) {
    entry.request.postData.text = rewriteText(
      entry.request.postData.text,
      stats,
    )
  }
}

// ---------------------------------------------------------------------------
// Discovery — learn every handle before rewriting anything
// ---------------------------------------------------------------------------

/**
 * X reserves a set of first-path segments that look exactly like handles in a
 * URL. `x.com/i/api/graphql` is the one that matters most here — `i` is X's
 * internal namespace, not an account.
 */
const RESERVED_PATHS = new Set([
  'i',
  'home',
  'explore',
  'notifications',
  'messages',
  'settings',
  'search',
  'compose',
  'intent',
  'share',
  'login',
  'logout',
  'signup',
  'about',
  'tos',
  'privacy',
  'help',
  'download',
  'hashtag',
  'account',
  'session',
  'oauth',
  'status',
  'statuses',
  'widgets',
  'following',
  'followers',
  'lists',
  'topics',
  'bookmarks',
  'jobs',
  'communities',
  'premium',
  'x',
  'twitter',
])

/**
 * Build the mapping before anything is rewritten — the textual pass can only
 * replace handles it already knows, and a handle may appear in a URL in one file
 * before any user object introduces it. Scanning the whole corpus first is also
 * what keeps the mapping consistent between files.
 *
 * A `screen_name` field is the ONLY thing treated as proof that a token is an
 * account. URLs are read too, but purely to cross-check: a first path segment is
 * mapped only when some response also presents it as a screen_name.
 *
 * That rule is load-bearing rather than fussy. `x.com/i/status/…` makes `i` look
 * like a handle, and `i` occurs ~125,000 times as a standalone token in a single
 * recording — mapping it would rewrite every `x.com/i/api/graphql` URL and
 * corrupt the whole corpus. The same trap waits behind any short or dictionary
 * word someone uses as a handle, so the guard is general, not a list of the ones
 * already seen.
 */
function discover(texts) {
  const byScreenName = new Set()
  const byUrl = new Set()
  const urlRe = new RegExp(`x\\.com\\\\?/(${HANDLE_TOKEN})\\\\?/`, 'g')

  // An iterable of strings rather than a list of paths, so the corpus can be
  // streamed a file at a time and a single recording can arrive on stdin.
  for (const raw of texts) {
    for (const m of raw.matchAll(screenNameRe())) byScreenName.add(m[1])
    for (const m of raw.matchAll(urlRe)) byUrl.add(m[1])
  }

  const lower = new Set([...byScreenName].map((h) => h.toLowerCase()))
  const urlOnly = [...byUrl].filter(
    (h) => !lower.has(h.toLowerCase()) && !RESERVED_PATHS.has(h.toLowerCase()),
  )
  if (urlOnly.length && VERBOSE) {
    console.warn(
      `  ! ${urlOnly.length} token(s) look like handles in a URL but never appear ` +
        `as a screen_name, so they are left alone: ${urlOnly.slice(0, 10).join(', ')}`,
    )
  }

  // Deliberately does NOT build the mapping. synthetic() consults SUBJECTS, and
  // SUBJECTS is only known after the test sources are read — mapping here would
  // assign every future subject a synthetic id, and the textual pass would then
  // faithfully rewrite the very accounts the tests assert against.
  return byScreenName
}

// ---------------------------------------------------------------------------
// Test sources
// ---------------------------------------------------------------------------

/**
 * Read the test sources and mark every handle they name as a subject. Runs before
 * any rewriting, so the mapping is settled by the time a byte moves.
 *
 * Only handles that actually occur in the recordings are considered, so an
 * ordinary English word in a comment cannot promote a random account. The
 * length and reserved-word guards then drop handles too code-like to distinguish
 * from an identifier — those get pseudonymised like anyone else, and the warning
 * says so rather than letting a test quietly break.
 */
function findTestSubjects(discovered) {
  const sources = TEST_SOURCES.flatMap((pattern) => expandGlob(pattern))
  const text = sources.map((f) => readFileSync(f, 'utf8')).join('\n')
  const ambiguous = []

  for (const handle of discovered) {
    const lc = handle.toLowerCase()
    const re = new RegExp(
      `(?<![A-Za-z0-9_])${escapeRe(lc)}(?![A-Za-z0-9_])`,
      'i',
    )
    if (!re.test(text)) continue
    if (lc.length < MIN_SOURCE_LEN || SOURCE_RESERVED.has(lc)) {
      ambiguous.push(handle)
      continue
    }
    SUBJECTS.add(lc)
  }

  if (ambiguous.length) {
    console.warn(
      `  ! ${ambiguous.length} handle(s) appear in test sources but are too short ` +
        `or too code-like to treat as subjects, so they are pseudonymised: ` +
        ambiguous.join(', '),
    )
  }
  return sources.length
}

/** Minimal `dir/*.ext` glob — enough for the patterns this config accepts. */
function expandGlob(pattern) {
  const [dir, base] = [path.dirname(pattern), path.basename(pattern)]
  const abs = path.join(ROOT, dir)
  if (!base.includes('*')) return [path.join(abs, base)]
  const re = new RegExp(`^${base.split('*').map(escapeRe).join('.*')}$`)
  return readdirSync(abs)
    .filter((f) => re.test(f))
    .map((f) => path.join(abs, f))
    .sort()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const harFiles = () =>
  readdirSync(RECORDINGS)
    .filter((f) => f.endsWith('.har'))
    .map((f) => path.join(RECORDINGS, f))
    .sort()

/** Lazily, so discovery never holds the whole corpus in memory at once. */
function* readEach(files) {
  for (const file of files) yield readFileSync(file, 'utf8')
}

/**
 * Scrub one recording from stdin to stdout.
 *
 * This is how a recording that is already committed gets fixed: a history rewrite
 * pipes every historical `.har` blob through it, so the repair is done by the code
 * that scrubs the working tree rather than by a second implementation of the same
 * rules in whatever language the rewrite tool speaks. See "Fixing a recording
 * already in history" in CONTRIBUTING.md.
 *
 *   git filter-repo --blob-callback '<pipe HAR blobs through this>'
 *
 * Subjects come from the test sources as they are *now*, not as they were at the
 * commit the blob came from: today's policy applied uniformly. An account the
 * suite has since stopped naming is pseudonymised in the old recording too, which
 * is the safe direction to be wrong in.
 */
function scrubStdin() {
  const raw = readFileSync(0, 'utf8')
  const discovered = discover([raw])
  findTestSubjects(discovered)
  for (const handle of discovered) {
    if (!SYNTHETIC.test(handle.toLowerCase())) synthetic(handle)
  }
  // Nothing but the recording may reach stdout — the caller is reading it as the
  // new blob. Every other message in this script goes to stderr already.
  process.stdout.write(scrubHar(parseHar('<stdin>', raw), blankStats()))
}

/**
 * What a run changed. Every counter is incremented only when a value actually
 * moved, never merely because the field was there — otherwise a clean recording
 * reports work it did not do, and --check cannot say what it found.
 *
 * `unparsed` is the exception and is left out of that report: it counts bodies
 * this cannot read, which is a property of the capture, not of the scrub.
 */
const STAT_KEYS = [
  'handles',
  'names',
  'bios',
  'pii',
  'trends',
  'telemetry',
  'credentials',
  'avatars',
  'posts',
  'images',
  'media',
  'tokens',
  'unparsed',
  'bytesDropped',
]

/** A zeroed counter set, for a caller scrubbing one thing rather than a corpus. */
export function blankStats() {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0]))
}

const describe = (stats) =>
  STAT_KEYS.filter((k) => !/^(unparsed|bytesDropped)$/.test(k) && stats[k])
    .map((k) => `${k}:${stats[k]}`)
    .join(' ') || 'differs byte-for-byte'

/**
 * Named, because the bare parse error says only "Unexpected end of JSON input" —
 * and the usual cause is scrubbing a recording the proxy is still flushing, where
 * knowing *which* file is the whole answer.
 */
function parseHar(file, raw) {
  try {
    const har = JSON.parse(raw)
    if (!Array.isArray(har?.log?.entries)) {
      throw new Error('no log.entries array — not a HAR?')
    }
    return har
  } catch (err) {
    console.error(`\n✗ ${path.basename(file)}: ${err.message}`)
    console.error(
      '\nIf this recording was just captured, the proxy may not have finished\n' +
        'writing it. Re-run the scrub; if it persists, re-record that one test.',
    )
    process.exit(1)
  }
}

/** Scrub a parsed HAR in place and return the bytes it should be stored as. */
function scrubHar(har, stats) {
  for (const entry of har.log.entries) {
    scrubUrls(entry, stats)
    scrubTelemetry(entry, stats)
    scrubEntry(entry, stats)
  }
  return JSON.stringify(har)
}

/**
 * Drop the body of a client-event beacon.
 *
 * X's client posts back what it rendered, so the sidebar's trend names arrive a
 * second time as a percent-encoded blob in a *request* — and along with them,
 * what was on screen and what was clicked. The whole body goes rather than the
 * names within it, for two reasons: it is the report of one person's session and
 * none of it is under test, and matching names would need every trend in the
 * capture known in advance, which is impossible when a recording is scrubbed on
 * its own — as it is when one is repaired inside a history rewrite.
 */
function scrubTelemetry(entry, stats) {
  const body = entry.request?.postData
  if (typeof body?.text !== 'string' || !body.text) return
  if (!body.text.includes('client_event')) return
  body.text = ''
  if (Array.isArray(body.params)) body.params = []
  stats.telemetry++
}

/**
 * Handles still present in raw text that this script has not rewritten. Test
 * subjects are excluded: they are real handles on purpose, and flagging them
 * would make --check permanently red on a correctly scrubbed file.
 */
function residualHandles(text) {
  const out = new Set()
  for (const m of text.matchAll(screenNameRe())) {
    const h = m[1]
    if (SYNTHETIC.test(h.toLowerCase())) continue
    if (isSubject(h)) continue
    out.add(h)
  }
  return [...out]
}

function main() {
  if (ID_OF && !ID_OF.startsWith('--')) {
    console.log(synthetic(ID_OF))
    return
  }
  if (STDIN) return scrubStdin()

  const files = harFiles()
  if (files.length === 0) {
    console.error(`No .har files in ${RECORDINGS}`)
    process.exit(1)
  }

  const discovered = discover(readEach(files))
  const sourceCount = findTestSubjects(discovered)
  // Only now is it safe to allocate ids: subjects are known, so synthetic()
  // returns their real handle and they never enter the replacement map.
  for (const handle of discovered) {
    if (!SYNTHETIC.test(handle.toLowerCase())) synthetic(handle)
  }
  const remaining = [...discovered].filter(
    (h) => !SYNTHETIC.test(h.toLowerCase()) && !isSubject(h),
  )
  console.log(
    `${files.length} recordings · ${discovered.size} handles seen · ` +
      `${SUBJECTS.size} named by tests (kept) · ${remaining.length} to pseudonymise ` +
      `· ${sourceCount} test sources scanned`,
  )

  const totals = blankStats()
  let bytesBefore = 0
  let bytesAfter = 0
  const offenders = []

  for (const file of files) {
    const before = statSync(file).size
    bytesBefore += before
    const raw = readFileSync(file, 'utf8')
    const har = parseHar(file, raw)
    const stats = blankStats()
    const out = scrubHar(har, stats)

    // --check asks one question of what is on disk: would scrubbing it change
    // anything? A file that survives its own scrubber unchanged has been through
    // it; one that does not, has not — whatever the reason, and including the
    // fields no regex over raw text can see. (Searching for leftover handles
    // instead is what let a document keep the recording account's display name
    // for as long as its handle beside it had already been rewritten.)
    if (CHECK) {
      if (out !== raw)
        offenders.push({ file, stats, leftover: residualHandles(raw) })
      bytesAfter += before
      continue
    }

    // Written via a temp file and renamed: writeFileSync truncates first, so a
    // crash mid-write leaves a half-written HAR that fails to parse on the next
    // run — turning one bad recording into a permanently stuck scrub.
    const tmp = `${file}.tmp`
    writeFileSync(tmp, out)
    renameSync(tmp, file)
    bytesAfter += statSync(file).size

    for (const k of STAT_KEYS) totals[k] += stats[k]
    if (VERBOSE) {
      console.log(
        `  ${path.basename(file).slice(0, 56).padEnd(56)} ` +
          `${(before / 1e6).toFixed(1)}MB → ${(Buffer.byteLength(out) / 1e6).toFixed(1)}MB ` +
          `handles:${stats.handles} bios:${stats.bios} imgs:${stats.images}`,
      )
    }
  }

  if (CHECK) {
    if (offenders.length) {
      console.error(`\n✗ unscrubbed identities in ${offenders.length} file(s):`)
      for (const { file, stats, leftover } of offenders) {
        console.error(
          `  ${path.basename(file)}: ${describe(stats)}` +
            (leftover.length && VERBOSE ? ` — ${leftover.join(', ')}` : ''),
        )
      }
      console.error('\nRun: node scripts/scrub-recordings.mjs')
      process.exit(1)
    }
    console.log('\n✓ no unscrubbed identities')
    return
  }

  console.log(
    `\n  handles ${totals.handles} · names ${totals.names} · bios ${totals.bios} · ` +
      `avatars ${totals.avatars} · posts ${totals.posts}\n` +
      `  birthdates ${totals.pii} · trends ${totals.trends} · ` +
      `event beacons ${totals.telemetry} · session blobs ${totals.credentials} · ` +
      `images blanked ${totals.images} · media dropped ${totals.media} · ` +
      `url/text tokens ${totals.tokens}`,
  )
  console.log(
    `  ${(bytesBefore / 1e6).toFixed(1)} MB → ${(bytesAfter / 1e6).toFixed(1)} MB ` +
      `(${(((bytesBefore - bytesAfter) / bytesBefore) * 100).toFixed(1)}% smaller)`,
  )
  console.log('\n✓ scrubbed — now verify: pnpm test:e2e')
}

// Only when run as a command. The scrubbing itself is exported so it can be
// tested against fixtures: --check proves a committed recording went through this
// script, and cannot prove the script knows about a shape it has never seen —
// nothing about a clean corpus goes red when a pass is dropped from the code.
if (process.argv[1] === fileURLToPath(import.meta.url)) main()

export {
  scrubEntry,
  scrubMarkup,
  scrubTelemetry,
  walk,
  userHandle,
  synthetic,
  SUBJECTS,
}
