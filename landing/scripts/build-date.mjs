// When the site's content last actually changed, read from git rather than the
// clock.
//
// `seo.ts` used to export `new Date().toISOString()`, which fed `og:updated_time`,
// `last-modified` and every `<lastmod>` in the sitemap. That marks the whole site
// as freshly updated on every rebuild — including a rebuild that only changed a
// dependency — and a freshness signal that moves without the content moving is
// one crawlers learn to discount. Worse, it is indistinguishable from lying about
// it, and Google's guidance on `dateModified` is explicit that the date must
// correspond to a real change.
//
// Imported by `vite.config.ts` at config-load time, so it must stay plain Node
// with no dependencies.

import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LANDING = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Run a git command from the landing package, or return '' when git is not
 * usable — a source tarball, or a CI checkout made without a `.git` directory.
 * Every caller falls back to the current time, so the build never breaks over
 * this; it just loses the precision.
 */
function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: LANDING,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

/**
 * ISO-8601 date of the newest commit that touched the site's own files, or
 * now when git is unavailable.
 *
 * Scoped, not HEAD: this package shares a repository with the extension, and
 * a version bump there is not a change to any page here — yet `dateModified`,
 * `og:updated_time` and the sitemap's fallback all moved on every one. HEAD
 * is the fallback for a clone that could not be deepened (see
 * `ensureHistory`), where a path-scoped log may find nothing.
 */
export function getContentLastModified() {
  ensureHistory()
  const iso = (
    git('log -1 --format=%cI -- src public index.html') ||
    git('log -1 --format=%cI')
  ).trim()
  return iso ? new Date(iso).toISOString() : new Date().toISOString()
}

/**
 * Cloudflare Pages builds from a shallow clone, where `git log` knows one
 * commit, no source has a date, and every route falls back to HEAD — the
 * deployed sitemap stamped all 75 URLs with a version-bump commit. Deepen once
 * if the remote allows it; when it does not, the fallback stands.
 */
function ensureHistory() {
  if (git('rev-parse --is-shallow-repository').trim() !== 'true') return
  git('fetch --unshallow --quiet')
}

/**
 * Newest commit date per tracked file under `landing/`, keyed by path relative
 * to that directory.
 *
 * One `git log` walk rather than one call per file. It is only a handful of
 * files today, but a per-file spawn is the kind of thing that quietly turns a
 * two-second build into a twenty-second one as the site grows.
 */
function fileDates() {
  ensureHistory()
  // `--relative` emits paths relative to the landing package, matching the
  // `sources` entries in routes.ts.
  const log = git('log --relative --format=%x00%cI --name-only -- src public')
  /** @type {Map<string, string>} */
  const dates = new Map()
  if (!log) return dates

  let current = null
  for (const line of log.split('\n')) {
    if (line.startsWith('\0')) {
      current = new Date(line.slice(1).trim()).toISOString()
      continue
    }
    const path = line.trim()
    // Commits come newest-first, so the first date seen for a path is its newest.
    if (path && current && !dates.has(path)) dates.set(path, current)
  }
  return dates
}

/**
 * A `{ '/route': Date }` map for `vite-plugin-sitemap`'s `lastmod` option, and
 * the same dates for anything else that wants per-page freshness.
 *
 * A route's date is the newest commit across the files named in its `sources`.
 *
 * `src/routes.ts` is deliberately *not* folded in, even though each page's
 * title, description and FAQ live there. Every route would then inherit that
 * one file's date, so editing a single page's title would mark all five pages
 * as freshly updated — the precise signal this whole module exists to avoid.
 * The cost is that a metadata-only edit does not move `<lastmod>`, which is the
 * lesser error and arguably correct: Google asks that the date reflect a
 * substantive change rather than any change at all.
 *
 * A file with no git date (never committed, or the whole checkout has no git)
 * contributes nothing, so a route consisting entirely of new files falls back
 * to the HEAD date. That is the honest answer: the content is as new as the
 * commit being built.
 */
export function getRouteLastmods(routes) {
  const dates = fileDates()
  const fallback = getContentLastModified()

  /** @type {Record<string, Date>} */
  const out = {}
  for (const route of routes) {
    const stamps = (route.sources ?? [])
      .map((s) => dates.get(s))
      .filter(Boolean)
    const newest = stamps.length
      ? stamps.reduce((a, b) => (a > b ? a : b))
      : fallback
    out[route.path] = new Date(newest)
  }
  return out
}
