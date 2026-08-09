/**
 * Post-build HTML minification, and the one attribute the prerenderer cannot
 * write.
 *
 * Note on inlining the stylesheet: it was tried and measured worse. Inlining
 * removes a render-blocking round trip but grows every document by ~9 kB
 * gzipped, and Lighthouse scored the inlined build 99 against 100 for the
 * external sheet (FCP 1.2s vs 1.1s). Chrome discovers the sheet early enough
 * that the smaller document wins. Leave the <link> alone.
 */
import { minify } from 'html-minifier-terser'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')

/**
 * Right-to-left scripts, by ISO 639 primary subtag.
 *
 * `vite-prerender-plugin` writes `head.lang` onto `<html lang>` but has no
 * equivalent for `dir`, so it is derived here from the tag the prerenderer
 * already put in the document. Reading it back out of the HTML rather than
 * importing the locale table keeps this script plain Node with no build step
 * of its own — and the rule really is a property of the language, not of this
 * site's config, which is why the list is the full one rather than just `ar`.
 *
 * Without this the Arabic pages render LTR: the text still reads correctly
 * because the browser bidi-resolves the runs, but the layout — nav order,
 * list bullets, the language menu's anchor — all sit on the wrong side.
 */
const RTL = new Set([
  'ar',
  'he',
  'fa',
  'ur',
  'ps',
  'sd',
  'ug',
  'yi',
  'dv',
  'ckb',
])

/** `<html lang="zh-Hans">` → `zh`. */
function primarySubtag(html) {
  const m = /<html[^>]*\slang="([^"]+)"/i.exec(html)
  return m ? m[1].split('-')[0].toLowerCase() : null
}

const files = readdirSync(dist, { recursive: true }).filter((f) =>
  String(f).endsWith('.html'),
)

for (const file of files) {
  const path = join(dist, String(file))
  const original = readFileSync(path, 'utf-8')

  const lang = primarySubtag(original)
  const withDir =
    lang && RTL.has(lang) && !/<html[^>]*\sdir=/i.test(original)
      ? original.replace(/<html\b/i, '<html dir="rtl"')
      : original

  const minified = await minify(withDir, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: true,
  })

  writeFileSync(path, minified)

  const saved = original.length - minified.length
  const pct = ((saved / original.length) * 100).toFixed(1)
  console.log(
    `✓ ${file}  ${original.length} → ${minified.length} bytes  (${pct}% saved)`,
  )
}
