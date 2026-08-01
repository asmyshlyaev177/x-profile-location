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
 * Users are recognised by SHAPE: any object carrying a `screen_name`. Which of
 * them keep their identity is DERIVED, not declared — a handle survives exactly
 * when a test source names it, because that is what "the suite asserts against
 * this account" looks like. Those accounts keep their handle, display name and
 * bio (the keyword tests match on real bio text) and their country, app-store
 * source and creation date, which is the data under test. Every other account in
 * a capture is an incidental third party and is pseudonymised. The recording
 * account is named by no test, so it is removed without ever being written down,
 * and an account a test stops naming is anonymised by the next run.
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
 *   node scripts/scrub-recordings.mjs --id <h>    print the synthetic id for a handle
 *   node scripts/scrub-recordings.mjs --verbose   per-file detail
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RECORDINGS = path.join(ROOT, 'e2e', 'recordings')
const CONFIG = path.join(ROOT, 'e2e', 'scrub.config.json')

const CHECK = process.argv.includes('--check')
const VERBOSE = process.argv.includes('--verbose')
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
  new RegExp(`${Q}screen_name${Q}\\s*:\\s*${Q}(${HANDLE_TOKEN})${Q}`, 'g')

const PLACEHOLDER_AVATAR =
  'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
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
  'page', 'test', 'expect', 'context', 'helpers', 'await', 'async', 'const',
  'let', 'import', 'export', 'from', 'default', 'window', 'document', 'console',
  'location', 'status', 'options', 'browser', 'chrome', 'firefox', 'safari',
  'string', 'number', 'boolean', 'object', 'locator', 'timeout', 'url', 'id',
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

// ---------------------------------------------------------------------------
// Structural pass — rewrite identity fields inside parsed JSON bodies
// ---------------------------------------------------------------------------

/**
 * Walk any JSON value and rewrite the identity fields of every user-shaped object
 * found. X returns users in two shapes — a flat `legacy`-style object carrying
 * `screen_name` beside `name`/`description`, and the newer split of
 * `core: { screen_name, name }` with `avatar: { image_url }` as siblings — so both
 * are handled where they are found rather than assuming one schema.
 */
function walk(node, stats) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, stats)
    return
  }
  if (!node || typeof node !== 'object') return

  // Shape A: screen_name directly on this object, name/description beside it.
  if (typeof node.screen_name === 'string') {
    rewriteUser(node, node.screen_name, stats)
  }

  // Shape B: core.screen_name, with avatar/legacy as siblings of `core`.
  if (node.core && typeof node.core.screen_name === 'string') {
    const handle = node.core.screen_name
    rewriteUser(node.core, handle, stats)
    if (node.avatar && typeof node.avatar.image_url === 'string') {
      node.avatar.image_url = PLACEHOLDER_AVATAR
      stats.avatars++
    }
    if (node.legacy && typeof node.legacy === 'object') {
      rewriteUser(node.legacy, handle, stats)
    }
  }

  // Post text — nothing asserts on it, and it is the most personal payload here.
  for (const key of ['full_text', 'text']) {
    if (typeof node[key] === 'string' && node[key].length > 0) {
      // Tweet objects carry an id_str/rest_id sibling; the guard keeps us off
      // unrelated `text` fields (labels, tooltips, i18n strings).
      if (typeof node.id_str === 'string' || typeof node.rest_id === 'string') {
        node[key] = 'Post text removed by scrub-recordings.'
        stats.posts++
      }
    }
  }

  for (const value of Object.values(node)) walk(value, stats)
}

function rewriteUser(obj, handle, stats) {
  const id = synthetic(handle)
  // A test subject keeps its identity: the suite navigates to it by handle and
  // the keyword tests match on its real bio text.
  const subject = isSubject(handle)

  if (typeof obj.screen_name === 'string') {
    if (obj.screen_name !== id) stats.handles++
    obj.screen_name = id
  }
  if (!subject && typeof obj.name === 'string') {
    obj.name = displayNameFor(handle)
    stats.names++
  }
  if (!subject && typeof obj.description === 'string') {
    obj.description = ''
    stats.bios++
  }
  for (const key of [
    'profile_image_url_https',
    'profile_image_url',
    'profile_banner_url',
    'image_url',
  ]) {
    if (typeof obj[key] === 'string') {
      obj[key] = PLACEHOLDER_AVATAR
      stats.avatars++
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
// Per-entry processing
// ---------------------------------------------------------------------------

const isJsonish = (mime) =>
  /json|text\/plain/.test(mime || '') && !/application\/javascript/.test(mime || '')

const isImage = (mime) => /^image\//.test(mime || '')

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

  // Markup gets the textual pass but no structural walk. X server-renders the
  // signed-in account into the document (inlined initial state, meta tags), so
  // skipping HTML leaves the recording account's handle in every capture — which
  // is exactly what the first run of this script did.
  if (isMarkup(mime) && content.text) {
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
  if (entry.request?.url) entry.request.url = rewriteText(entry.request.url, stats)
  // Referer carries the profile or status URL the request came from, so it holds
  // handles that appear nowhere else in the entry.
  for (const h of entry.request?.headers ?? []) {
    if (/^(referer|referrer|origin)$/i.test(h.name) && typeof h.value === 'string') {
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
    entry.request.postData.text = rewriteText(entry.request.postData.text, stats)
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
  'i', 'home', 'explore', 'notifications', 'messages', 'settings', 'search',
  'compose', 'intent', 'share', 'login', 'logout', 'signup', 'about', 'tos',
  'privacy', 'help', 'download', 'hashtag', 'account', 'session', 'oauth',
  'status', 'statuses', 'widgets', 'following', 'followers', 'lists', 'topics',
  'bookmarks', 'jobs', 'communities', 'premium', 'x', 'twitter',
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
function discover(files) {
  const byScreenName = new Set()
  const byUrl = new Set()
  const urlRe = new RegExp(`x\\.com\\\\?/(${HANDLE_TOKEN})\\\\?/`, 'g')

  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
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
    const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(lc)}(?![A-Za-z0-9_])`, 'i')
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

  const files = harFiles()
  if (files.length === 0) {
    console.error(`No .har files in ${RECORDINGS}`)
    process.exit(1)
  }

  const discovered = discover(files)
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

  const keys = [
    'handles', 'names', 'bios', 'avatars', 'posts',
    'images', 'media', 'tokens', 'unparsed', 'bytesDropped',
  ]
  const totals = Object.fromEntries(keys.map((k) => [k, 0]))
  let bytesBefore = 0
  let bytesAfter = 0
  const offenders = []

  for (const file of files) {
    const before = statSync(file).size
    bytesBefore += before
    const raw = readFileSync(file, 'utf8')

    // --check inspects what is on disk and rewrites nothing. Checking the
    // scrubbed output instead would pass unconditionally — it would prove the
    // scrubber works, never that the committed file went through it.
    if (CHECK) {
      const leftover = residualHandles(raw)
      if (leftover.length) offenders.push({ file, leftover })
      bytesAfter += before
      continue
    }

    const har = JSON.parse(raw)
    const stats = Object.fromEntries(keys.map((k) => [k, 0]))
    for (const entry of har.log.entries) {
      scrubUrls(entry, stats)
      scrubEntry(entry, stats)
    }
    const out = JSON.stringify(har)
    writeFileSync(file, out)
    bytesAfter += statSync(file).size

    for (const k of keys) totals[k] += stats[k]
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
      for (const { file, leftover } of offenders) {
        console.error(
          `  ${path.basename(file)}: ${leftover.length} handle(s)` +
            (VERBOSE ? ` — ${leftover.join(', ')}` : ''),
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
      `  images blanked ${totals.images} · media dropped ${totals.media} · ` +
      `url/text tokens ${totals.tokens}`,
  )
  console.log(
    `  ${(bytesBefore / 1e6).toFixed(1)} MB → ${(bytesAfter / 1e6).toFixed(1)} MB ` +
      `(${(((bytesBefore - bytesAfter) / bytesBefore) * 100).toFixed(1)}% smaller)`,
  )
  console.log('\n✓ scrubbed — now verify: pnpm test:e2e')
}

main()
