import { minify } from 'html-minifier-terser'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')

const files = readdirSync(dist, { recursive: true }).filter((f) =>
  String(f).endsWith('.html'),
)

for (const file of files) {
  const path = join(dist, String(file))
  const original = readFileSync(path, 'utf-8')

  const minified = await minify(original, {
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
