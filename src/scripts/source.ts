// X's `source` string ("Japan App Store", "web", null), classified once. The
// store country outranks `account_based_in` — see "API" in CLAUDE.md.

import { t } from './i18n'

export type SourcePlatform = 'ios' | 'android' | 'web' | 'unknown'

export interface SourceInfo {
  platform: SourcePlatform
  country: string | null
  /** Whatever X actually said, for the tooltip. */
  raw: string | null
}

const RE_APP_STORE = /^(.*?)\s*app\s+store$/i
const RE_ANDROID = /^(.*?)\s*android\s+app$/i
const RE_WEB = /^web$/i

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

// --- glyphs -----------------------------------------------------------------
// Drawn, not emoji: the OS decides what 📱/🍎 look like. Monochrome and
// `currentColor`, so they follow X's themes and claim no brand.

const SVG_NS = 'http://www.w3.org/2000/svg'

const APPLE_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'

// The robot head, not the Play triangle: at 13px and monochrome the triangle is
// an anonymous wedge.
const ANDROID_PATH =
  'M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396'

// Primitives rather than a traced path: a detailed world map is a smudge at 12px.
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
  // Decorative here — the row that holds the glyph carries the accessible name.
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

export function platformLabel(platform: SourcePlatform): string {
  switch (platform) {
    case 'ios':
      return 'App Store'
    case 'android':
      // Matches what X says: the raw value is "<country> Android App".
      return 'Android'
    case 'web':
      return t('platformWeb')
    default:
      return t('platformUnknown')
  }
}

/** Null for `unknown`: nothing to show beats a mark that looks like a finding. */
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
