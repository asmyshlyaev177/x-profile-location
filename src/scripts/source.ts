// X's `source` field, classified once.
//
// The field is a single string that packs two facts together — which app store
// the account's device is signed into, and which country that store is set to:
//
//     "Japan App Store"      → iOS, Japan
//     "Japan Android App"    → Android, Japan
//     "web"                  → browser, no country
//     null                   → X told us nothing
//
// The store country is the strongest location signal X gives out — a store
// region is far more work to change than a stated location — which is why
// content.tsx prefers it over `account_based_in`.

export type SourcePlatform = 'ios' | 'android' | 'web' | 'unknown'

export interface SourceInfo {
  platform: SourcePlatform
  /** The store's country, present only for the two mobile platforms. */
  country: string | null
  /** Whatever X actually said, for the tooltip. */
  raw: string | null
}

const RE_APP_STORE = /^(.*?)\s*app\s+store$/i
const RE_ANDROID = /^(.*?)\s*android\s+app$/i
const RE_WEB = /^web$/i

/** The single place `source` is interpreted. */
export function classifySource(source: string | null | undefined): SourceInfo {
  const raw = typeof source === 'string' && source.trim() !== '' ? source : null
  if (!raw) return { platform: 'unknown', country: null, raw: null }

  const trimmed = raw.trim()

  const ios = RE_APP_STORE.exec(trimmed)
  if (ios) return { platform: 'ios', country: ios[1].trim() || null, raw }

  const android = RE_ANDROID.exec(trimmed)
  if (android) {
    return { platform: 'android', country: android[1].trim() || null, raw }
  }

  if (RE_WEB.test(trimmed)) return { platform: 'web', country: null, raw }

  return { platform: 'unknown', country: null, raw }
}

/** The store country, or null when the source doesn't name one. */
export function sourceCountry(
  source: string | null | undefined,
): string | null {
  return classifySource(source).country
}

// --- glyphs -----------------------------------------------------------------
// Drawn rather than emoji (📱/🍎): the OS renders emoji, so the same character is
// a different picture per platform and several have no distinct Apple/Android
// glyph at all. An inline SVG is identical everywhere and inherits
// `currentColor`, so it follows X's dim and lights-out themes.
//
// Flat monochrome silhouettes — no brand colours, no suggestion the extension
// comes from Apple or Google.

const SVG_NS = 'http://www.w3.org/2000/svg'

const APPLE_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'

// The Android robot head rather than the Play store triangle. At 13px the
// triangle is an anonymous wedge — it only reads as "Google Play" at the size
// and in the colours the store uses, neither of which apply here. The robot
// head survives being small and monochrome, which is the whole job.
const ANDROID_PATH =
  'M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396'

// A globe: outline, equator, and one meridian ellipse. Composed from primitives
// rather than a traced path so it stays legible at 12px, where a detailed
// world map turns into a smudge.
const GLOBE_PARTS: Array<[tag: string, attrs: Record<string, string>]> = [
  ['circle', { cx: '12', cy: '12', r: '9.25' }],
  ['path', { d: 'M2.75 12h18.5' }],
  ['path', { d: 'M12 2.75a14 14 0 0 1 0 18.5a14 14 0 0 1 0-18.5z' }],
]

function svgRoot(label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '1em')
  svg.setAttribute('height', '1em')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.classList.add('x-loc-glyph')
  // The <title> is for anyone reading the DOM; the row that holds the glyph
  // carries the real accessible name.
  const title = document.createElementNS(SVG_NS, 'title')
  title.textContent = label
  svg.appendChild(title)
  return svg
}

function filledGlyph(label: string, d: string): SVGSVGElement {
  const svg = svgRoot(label)
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'currentColor')
  svg.appendChild(path)
  return svg
}

function globeGlyph(label: string): SVGSVGElement {
  const svg = svgRoot(label)
  for (const [tag, attrs] of GLOBE_PARTS) {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value)
    }
    el.setAttribute('fill', 'none')
    el.setAttribute('stroke', 'currentColor')
    el.setAttribute('stroke-width', '1.6')
    svg.appendChild(el)
  }
  return svg
}

/** Human-readable name for a platform, used in tooltips and the account card. */
export function platformLabel(platform: SourcePlatform): string {
  switch (platform) {
    case 'ios':
      return 'App Store'
    case 'android':
      // "Android", not "Google Play", to match both the glyph and what X
      // actually says — the raw value is "<country> Android App".
      return 'Android'
    case 'web':
      return 'Web'
    default:
      return 'Unknown'
  }
}

/**
 * The glyph for a platform, or null for `unknown` — an account X says nothing
 * about should show nothing, not a question mark that looks like a finding.
 */
export function buildSourceGlyph(
  platform: SourcePlatform,
): SVGSVGElement | null {
  switch (platform) {
    case 'ios':
      return filledGlyph('App Store', APPLE_PATH)
    case 'android':
      return filledGlyph('Android', ANDROID_PATH)
    case 'web':
      return globeGlyph('Web')
    default:
      return null
  }
}
