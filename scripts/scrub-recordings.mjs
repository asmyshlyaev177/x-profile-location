#!/usr/bin/env node
// Scrub personal data out of the committed HAR recordings; flags and rules in
// CLAUDE.md. NO REAL HANDLE MAY BE ADDED HERE OR TO scrub.config.json.
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

/** Handles the tests assert against, derived from the test sources rather than
 *  declared. Members keep their identity; everyone else is pseudonymised. */
const SUBJECTS = new Set()
const isSubject = (handle) => SUBJECTS.has(String(handle).toLowerCase())

/** A handle this script has already rewritten — makes re-runs no-ops. */
const SYNTHETIC = /^user_[0-9a-f]{8}$/

// Explicit boundaries rather than \b, which treats `_` as a word character and
// would let a short handle rewrite the prefix of a longer one.
const HANDLE_TOKEN = '[A-Za-z0-9_]{1,15}'

/** Every key that carries a handle, across GraphQL, the legacy shape and
 *  Periscope — see "Every shape, every carrier" in CLAUDE.md. */
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

/** Only unambiguous keys discover accounts from raw text; a bare `username` is
 *  trusted only beside a display name. */
const HANDLE_FIELD = '(?:twitter_screen_name|screen_name)'

/** Raw HAR text is double-encoded, so the escaped form is what appears on disk.
 *  Matching only the unescaped one finds nothing — see CLAUDE.md. */
const Q = '\\\\?"'
const screenNameRe = () =>
  new RegExp(`${Q}${HANDLE_FIELD}${Q}\\s*:\\s*${Q}(${HANDLE_TOKEN})${Q}`, 'g')

const PLACEHOLDER_AVATAR =
  'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
const POST_PLACEHOLDER = 'Post text removed by scrub-recordings.'
// 1x1 transparent PNG — every avatar and photo body collapses to this.
const PLACEHOLDER_IMAGE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/** Tokens common enough in test code that finding one proves nothing. A handle
 *  colliding with one is pseudonymised like any other. */
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

// Structural pass — rewrite identity fields inside parsed JSON bodies

/** Session fields in a response *body* — the recorder only redacts headers. */
const CREDENTIAL_KEYS = ['cookie', 'set_cookie']

/** The handle of a user-shaped object, or null. A `screen_name` is proof on its
 *  own; a bare `username` counts only next to a display name. */
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

/** Walk any JSON value and rewrite every user-shaped object found, in all three
 *  shapes X returns them in. */
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
  // Base64-encodes the trend name, so a rewritten trend hands it straight back.
  // Nothing renders from it.
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

  // Post text, guarded by an id_str/rest_id sibling so unrelated `text` fields
  // (labels, tooltips, i18n) are left alone.
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

/** Rewrite one trend out of the sidebar: which trends X chose is personalisation
 *  ("Trending in <country>"). See CLAUDE.md. */
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
    // X keeps bio links parsed into `entities`, so blanking `description` alone
    // leaves the personal site the account linked to.
    if (obj.entities?.description?.urls?.length) {
      obj.entities.description.urls = []
      stats.bios++
    }
    // Deleted rather than blanked: not knowing a birthday is the normal state
    // of every other user object in a capture.
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
  // Self-declared fields only; about_profile.account_based_in is never touched,
  // because that value is what the tests assert on.
  if (!subject) {
    if (typeof obj.location === 'string' && obj.location) obj.location = ''
    if (typeof obj.url === 'string' && obj.url.includes('t.co')) obj.url = ''
  }
}

// Textual pass — handles in URLs, entity mentions, nested JSON strings

/** Every known handle as a whole token, in URLs and JSON bodies only — never in
 *  X's JS bundles. See "What else goes, and why" in CLAUDE.md. */
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

// Markup — the state blob X inlines into every server-rendered document

/** Where a user-shaped object may start inside markup. */
const markupAnchorRe = () => new RegExp(`"${HANDLE_FIELD}"\\s*:`, 'g')

/** The structural pass over `__INITIAL_STATE__` in a server-rendered document,
 *  located by balancing braces and confirmed by JSON.parse. See CLAUDE.md. */
function scrubMarkup(text, stats) {
  const anchors = [...text.matchAll(markupAnchorRe())].map((m) => m.index)
  if (anchors.length === 0) return text

  const { chains, closeOf } = braceChains(text, anchors)
  const spans = new Map()
  for (const anchor of anchors) {
    // Outermost first: a user split across `core`/`legacy`/`avatar` has to
    // reach walk() in one piece.
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

/** Open `{` positions per anchor, outermost first, tracking string literals. A
 *  heuristic, but fail-safe: a misread slice does not parse. */
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

/** Re-escapes `</script` and U+2028/9, which JSON.stringify does not; both
 *  forms stay valid JSON. */
const inlineSafe = (json) =>
  json
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

// Per-entry processing

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

  // Markup gets both passes; each half alone has already shipped a leak. See
  // "Every shape, every carrier" in CLAUDE.md.
  if (isMarkup(mime) && content.text) {
    content.text = scrubMarkup(content.text, stats)
    content.text = rewriteText(content.text, stats)
    content.size = content.text.length
  }
}

/** Every entry whatever its content type: an avatar path can carry a handle, and
 *  the request still has to match at replay. */
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

// Discovery — learn every handle before rewriting anything

/** X's reserved first-path segments, which look exactly like handles — `i`
 *  above all. */
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

/** Build the mapping over the whole corpus first, treating a `screen_name` field
 *  as the only proof a token is an account — see CLAUDE.md for why. */
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

  // Deliberately does NOT map: SUBJECTS is only known after the test sources
  // are read, and mapping here would rewrite the accounts tests assert on.
  return byScreenName
}

// Test sources

/** Mark every handle a test source names as a subject, before any rewriting.
 *  Only handles occurring in the recordings count. */
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

// Main

const harFiles = () =>
  readdirSync(RECORDINGS)
    .filter((f) => f.endsWith('.har'))
    .map((f) => path.join(RECORDINGS, f))
    .sort()

/** Lazily, so discovery never holds the whole corpus in memory at once. */
function* readEach(files) {
  for (const file of files) yield readFileSync(file, 'utf8')
}

/** Scrub one recording stdin → stdout, which is how an already-committed one is
 *  fixed inside a history rewrite. See CLAUDE.md and CONTRIBUTING.md. */
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

/** What a run changed; counters move only when a value did. `unparsed` is left
 *  out of the report — a property of the capture, not of the scrub. */
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

/** Named: the bare parse error says only "Unexpected end of JSON input", and the
 *  usual cause is a recording the proxy is still flushing. */
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

/** Drop a client-event beacon's whole body: it reports one person's session,
 *  none of it is under test. See CLAUDE.md. */
function scrubTelemetry(entry, stats) {
  const body = entry.request?.postData
  if (typeof body?.text !== 'string' || !body.text) return
  if (!body.text.includes('client_event')) return
  body.text = ''
  if (Array.isArray(body.params)) body.params = []
  stats.telemetry++
}

/** Handles still in raw text that this has not rewritten; subjects excluded,
 *  since they are real handles on purpose. */
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

    // --check asks one question: would scrubbing this change anything? See
    // "--check asks one question" in CLAUDE.md.
    if (CHECK) {
      if (out !== raw)
        offenders.push({ file, stats, leftover: residualHandles(raw) })
      bytesAfter += before
      continue
    }

    // Temp file then rename: writeFileSync truncates first, and a half-written
    // HAR fails to parse on every later run.
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

// Exported so the passes can be tested against fixtures: --check cannot prove
// the script knows a shape it has never seen.
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
