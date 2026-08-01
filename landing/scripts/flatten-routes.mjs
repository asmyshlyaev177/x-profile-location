/**
 * Rewrites `dist/<route>/index.html` to `dist/<route>.html`.
 *
 * Cloudflare Pages picks the canonical URL shape from the file layout, and the
 * two layouts disagree with each other:
 *
 *   about/index.html  →  /about  301s to  /about/   (trailing slash wins)
 *   about.html        →  /about/ 301s to  /about    (extension-less wins)
 *
 * The prerender plugin emits the first shape, but `canonicalFor`, the sitemap
 * and every internal link emit the slash-less URL. So each canonical named a
 * URL the server would not serve directly, and after the rename that turned
 * every migrated deep link into a two-hop chain:
 *
 *   old/x-about-this-account →301→ new/x-about-this-account →308→ new/x-about-this-account/
 *
 * Flattening the output makes the slash-less URL the one that returns 200,
 * which is the shape the rest of the codebase already assumes. Fixing it from
 * this end rather than by appending slashes everywhere keeps the change to one
 * file: no canonical, sitemap, or link edits, and nothing to keep in sync.
 *
 * The root `index.html` is left alone — `/` is already the URL it serves.
 */
import { readdirSync, renameSync, rmdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')

// Deepest first, so a nested route is flattened before its parent directory is
// considered for removal. No nested routes exist today; this costs one sort.
const indexFiles = readdirSync(dist, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('index.html') && f !== 'index.html')
  .sort((a, b) => b.split('/').length - a.split('/').length)

for (const file of indexFiles) {
  const dir = dirname(file)
  renameSync(join(dist, file), join(dist, `${dir}.html`))
  rmdirSync(join(dist, dir))
  console.log(`✓ ${file} → ${dir}.html`)
}
