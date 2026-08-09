// The catalogues, checked against the code that reads them.
//
// Fourteen of the fifteen locales are translated outside this repo, so nothing
// stops a file coming back with a key renamed, a `$1` dropped, or a whole
// message missing — and every one of those is invisible until somebody with
// that browser language opens the popup. `t()` falls back to the key, which is
// ugly on screen and silent in CI. This is what makes it loud instead.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../../package.json'
import { baseManifest } from '../manifests/base.manifest'
import { UI_LOCALES } from './i18n'

const LOCALES_DIR = join(import.meta.dirname, '../../public/_locales')
const SRC_DIR = join(import.meta.dirname, '..')

/** What ships, and what the language picker offers — one list, not two. */
const EXPECTED_LOCALES = [...UI_LOCALES].sort()

interface Entry {
  message: string
  description?: string
}

function read(locale: string): Record<string, Entry> {
  return JSON.parse(
    readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8'),
  )
}

const locales = readdirSync(LOCALES_DIR).sort()
const catalogues = new Map(locales.map((l) => [l, read(l)]))
const en = catalogues.get('en')!

/** `$1`…`$9` used by a message, as a sorted string for comparison. */
function placeholders(message: string): string {
  return [...new Set(message.match(/\$\d/g) ?? [])].sort().join('')
}

// Keys assembled at runtime, so no literal `t('…')` mentions them. The value
// is where they are built, for whoever has to find them.
const DYNAMIC_KEYS: Record<string, string> = {
  trustReports1: 'options.tsx — t(`trustReports${n}`)',
  trustReports2: 'options.tsx — t(`trustReports${n}`)',
  trustReports3: 'options.tsx — t(`trustReports${n}`)',
  regionEastAsiaPacific: 'location-names.ts — REGION_MESSAGE',
  regionEasternEuropeNonEu: 'location-names.ts — REGION_MESSAGE',
}

/** The keys the manifest substitutes rather than the code looking up. */
function manifestKeys(): string[] {
  return [
    ...JSON.stringify(baseManifest).matchAll(/__MSG_([A-Za-z0-9_@]+)__/g),
  ].map((m) => m[1])
}

/** Every `t('key')` literal in the source, plus the two indirect routes in. */
function usedKeys(): Set<string> {
  const found = new Set([...Object.keys(DYNAMIC_KEYS), ...manifestKeys()])
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path)
        continue
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
        continue
      }
      // Comment-only lines dropped first: the comments explaining this very
      // convention write `t('key')`, and a scanner that believed them would
      // demand a message called "key".
      const code = readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
        .join('\n')
      for (const m of code.matchAll(/\bt\(\s*'([A-Za-z0-9_@]+)'/g)) {
        found.add(m[1])
      }
    }
  }
  walk(SRC_DIR)
  return found
}

describe('message catalogues', () => {
  it('ships every locale the landing page does', () => {
    expect(locales).toEqual(EXPECTED_LOCALES)
  })

  it('holds appDesc to the package description', () => {
    // The manifest reads `__MSG_appDesc__`, so package.json is no longer the
    // source of it — but it is still what npm and the repo show.
    expect(en.appDesc.message).toBe(pkg.description)
  })

  it('explains every substitution to translators', () => {
    // Not every message needs a note — "Settings card title." told nobody
    // anything the key had not already said, and a rule that demands one
    // everywhere only teaches translators to skip them. A `$1` is different:
    // it is the one thing a translator can silently break, so what it holds
    // has to be written down.
    const unexplained = Object.entries(en)
      .filter(
        ([, entry]) => /\$\d/.test(entry.message) && !entry.description?.trim(),
      )
      .map(([key]) => key)
    expect(unexplained).toEqual([])
  })

  describe.each(locales)('%s', (locale) => {
    const catalogue = catalogues.get(locale)!

    it('carries no descriptions — English is the only file that needs them', () => {
      // The browser ignores them, and fifteen copies of the same English notes
      // were a third of what `_locales` weighed. Translators read `en`.
      if (locale === 'en') return
      const documented = Object.entries(catalogue)
        .filter(([, entry]) => entry.description !== undefined)
        .map(([key]) => key)
      expect(documented).toEqual([])
    })

    it('names its own locale, so uiLocale() cannot disagree with it', () => {
      // The one message that is not a translation. It is how the extension
      // knows which language its country names should be in — the browser's
      // own UI-language APIs report the wrong one.
      expect(catalogue.localeTag.message).toBe(locale.replace('_', '-'))
    })
  })

  describe.each(locales.filter((l) => l !== 'en'))('%s', (locale) => {
    const catalogue = catalogues.get(locale)!

    it('has exactly the English key set', () => {
      expect(Object.keys(catalogue).sort()).toEqual(Object.keys(en).sort())
    })

    it('keeps every substitution', () => {
      const drifted = Object.entries(en)
        .filter(
          ([key, entry]) =>
            catalogue[key] &&
            placeholders(catalogue[key].message) !==
              placeholders(entry.message),
        )
        .map(([key]) => key)
      expect(drifted).toEqual([])
    })

    it('leaves no message empty', () => {
      const empty = Object.entries(catalogue)
        .filter(([, entry]) => !entry.message?.trim())
        .map(([key]) => key)
      expect(empty).toEqual([])
    })

    it('fits the 50-character store name limit AMO enforces', () => {
      expect(catalogue.appName.message.length).toBeLessThanOrEqual(50)
    })
  })
})

describe('messages and the code that reads them', () => {
  const used = usedKeys()

  it('defines every key the source asks for', () => {
    const missing = [...used].filter((key) => !(key in en)).sort()
    expect(missing).toEqual([])
  })

  it('has no message nothing reads', () => {
    const unused = Object.keys(en)
      .filter((key) => !used.has(key))
      .sort()
    expect(unused).toEqual([])
  })

  it('defines every message the manifest substitutes', () => {
    const referenced = manifestKeys()
    expect(referenced.length).toBeGreaterThan(0)
    expect(referenced.filter((key) => !(key in en))).toEqual([])
  })

  it('declares default_locale, which __MSG__ substitution requires', () => {
    expect(baseManifest.default_locale).toBe('en')
    expect(locales).toContain(baseManifest.default_locale)
  })
})
