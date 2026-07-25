#!/usr/bin/env node
/**
 * Seeds a real-browser profile for the e2e suite.
 *
 * X blocks Playwright's bundled Chromium — a throwaway profile driven by an
 * automation build trips its bot checks at login and on some API routes. The
 * way around it is to never let Playwright create the session: log in by hand
 * in a real Brave/Chromium, then hand Playwright that profile *and* that same
 * binary. To the site it is the browser you logged in with, resumed.
 *
 * Usage:
 *   pnpm e2e:profile                        # Brave (default), keeps a previous login
 *   pnpm e2e:profile --browser=chromium     # brave | chromium | chrome | edge | <path>
 *   pnpm e2e:profile --reset                # discard the seed profile, log in fresh
 *   pnpm e2e:profile --url=https://x.com/home
 *
 * Flow: launches the browser on e2e/.auth/seed-profile with x.com open → you log
 * in → you close the window → the profile is copied (minus caches) to
 * e2e/.auth/profile and described in e2e/.auth/profile.json. fixtures.ts picks
 * that up on its own; no test changes needed. Everything lives under
 * e2e/.auth/, which is gitignored — the profile holds a live X session.
 *
 * Re-run it whenever X invalidates the session (403s / login redirects in tests).
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  closeSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '..', '.auth')

/** Live dir the real browser writes to. Kept between runs so you log in once. */
const SEED_DIR = path.join(AUTH_DIR, 'seed-profile')
/** Pristine copy the tests clone per run. */
const PROFILE_DIR = path.join(AUTH_DIR, 'profile')
/** Tells fixtures.ts which binary to launch the copy with. */
const MANIFEST = path.join(AUTH_DIR, 'profile.json')

// Real executables first: the /usr/bin wrappers are shell scripts, and Brave's
// does not `exec` (it runs `"$HERE/brave" "$@" || true`), so Playwright would
// end up managing the wrapper instead of the browser.
const CANDIDATES = {
  brave: [
    '/opt/brave.com/brave/brave',
    '/opt/brave.com/brave-beta/brave',
    '/usr/lib/brave-browser/brave',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    'brave-browser',
    'brave',
  ],
  chromium: [
    '/usr/lib64/chromium-browser/chromium-browser',
    '/usr/lib/chromium/chromium',
    '/usr/lib/chromium-browser/chromium-browser',
    'chromium-browser',
    'chromium',
  ],
  chrome: [
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome-stable',
    'google-chrome',
  ],
  edge: ['/opt/microsoft/msedge/msedge', 'microsoft-edge'],
}

/** Branded builds ignore --load-extension since M137 — the extension silently never loads. */
const NO_UNPACKED_EXTENSIONS = new Set(['chrome', 'edge'])

const DEFAULT_ORDER = ['brave', 'chromium', 'chrome', 'edge']

// Caches, locks and machine-specific state — none of it carries the session,
// all of it is re-created on launch. Skipping keeps the copy at a few MB.
const SKIP = new Set([
  'AutofillStates',
  'BrowserMetrics',
  'CacheStorage',
  'Cache',
  'CertificateRevocation',
  'Crash Reports',
  'Dictionaries',
  'Code Cache',
  'Crashpad',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'DevToolsActivePort',
  'GPUCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'LOCK',
  'OnDeviceHeadSuggestModel',
  'Safe Browsing',
  'Service Worker',
  'ShaderCache',
  'Subresource Filter',
  'WidevineCdm',
  'SingletonCookie',
  'SingletonLock',
  'SingletonSocket',
  'blob_storage',
  'component_crx_cache',
  'extensions_crx_cache',
  'lockfile',
  'optimization_guide_model_store',
  'segmentation_platform',
])

// ---------------------------------------------------------------------------
// Browser resolution
// ---------------------------------------------------------------------------

/** Follows a wrapper script to the real binary sitting next to it, if there is one. */
function derefWrapper(binary) {
  let resolved
  try {
    resolved = realpathSync(binary)
  } catch {
    return binary
  }

  let head = ''
  try {
    const fd = openSync(resolved, 'r')
    const buf = Buffer.alloc(2)
    readSync(fd, buf, 0, 2, 0)
    closeSync(fd)
    head = buf.toString('latin1')
  } catch {
    return resolved
  }
  if (head !== '#!') return resolved

  // /usr/bin/chromium-browser → …/chromium-browser.sh → …/chromium-browser
  // /usr/bin/brave-browser    → …/brave-browser       → …/brave
  const dir = path.dirname(resolved)
  const base = path.basename(resolved)
  const siblings = [
    base.replace(/\.sh$/, ''),
    base.replace(/(-browser)?(\.sh)?$/, ''),
    'chrome',
    'brave',
  ]
  for (const sibling of siblings) {
    const candidate = path.join(dir, sibling)
    if (candidate !== resolved && existsSync(candidate)) return candidate
  }
  return resolved
}

function resolveBinary(candidate) {
  if (candidate.includes('/'))
    return existsSync(candidate) ? derefWrapper(candidate) : null
  const which = spawnSync('which', [candidate], { encoding: 'utf-8' })
  const found = which.stdout?.trim()
  return found ? derefWrapper(found) : null
}

/** @returns {{ name: string, executablePath: string }} */
function pickBrowser(requested) {
  // An explicit path wins; we can't tell what it is, so trust the caller.
  if (requested?.includes('/')) {
    const resolved = resolveBinary(requested)
    if (!resolved) throw new Error(`No such browser binary: ${requested}`)
    const name =
      DEFAULT_ORDER.find((n) => resolved.toLowerCase().includes(n)) ?? 'custom'
    return { name, executablePath: resolved }
  }

  const order = requested ? [requested] : DEFAULT_ORDER
  for (const name of order) {
    const candidates = CANDIDATES[name]
    if (!candidates)
      throw new Error(
        `Unknown browser "${name}". Use ${DEFAULT_ORDER.join(' | ')} or a path.`,
      )
    for (const candidate of candidates) {
      const resolved = resolveBinary(candidate)
      if (resolved) return { name, executablePath: resolved }
    }
    if (requested)
      throw new Error(
        `${name} is not installed (looked for ${candidates.join(', ')})`,
      )
  }
  throw new Error(
    `No Chromium-based browser found. Tried: ${DEFAULT_ORDER.join(', ')}`,
  )
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function launch(executablePath, url) {
  const args = [
    `--user-data-dir=${SEED_DIR}`,
    // Cookies are encrypted at rest with a key from the OS keyring unless the
    // password store is forced to `basic`, which uses Chromium's built-in
    // fallback key. Playwright always launches with `basic`, so seeding under
    // the keyring would hand the tests cookies they cannot decrypt.
    '--password-store=basic',
    '--use-mock-keychain',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    // Profile-syncing would pull this throwaway profile into a real account.
    '--disable-sync',
    url,
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', () => resolve())
    // Ctrl-C closes the browser too; stay alive so the copy step still runs.
    process.on('SIGINT', () => {})
  })
}

/**
 * Heuristic login check: cookie names and hosts are stored as plain text in the
 * SQLite file (only the values are encrypted), so the session shows up as a
 * literal byte match. Also scans the WAL, where a recent write may still sit.
 */
async function hasXSession() {
  const base = path.join(SEED_DIR, 'Default', 'Cookies')
  for (const file of [base, `${base}-wal`, `${base}-journal`]) {
    if (!existsSync(file)) continue
    const buf = await readFile(file)
    if (buf.includes('auth_token') && buf.includes('.x.com')) return true
  }
  return false
}

/** Component-updater payloads (Brave's ad-block lists alone are ~25 MB) sit at the
 *  profile root under their extension id and are re-downloaded when missing. The
 *  id alphabet is a-p, which is what tells them apart from ordinary directories. */
const isComponent = (src) =>
  path.dirname(src) === SEED_DIR && /^[a-p]{32}$/.test(path.basename(src))

async function copyProfile() {
  await rm(PROFILE_DIR, { recursive: true, force: true })
  await cp(SEED_DIR, PROFILE_DIR, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)) && !isComponent(src),
  })
}

function dirSize(dir) {
  const du = spawnSync('du', ['-sh', dir], { encoding: 'utf-8' })
  return du.stdout?.split('\t')[0]?.trim() ?? '?'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const flag = (name) =>
  argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=')
const has = (name) => argv.includes(`--${name}`)

const { name, executablePath } = pickBrowser(
  flag('browser') ?? process.env.E2E_BROWSER,
)
const url = flag('url') ?? 'https://x.com/i/flow/login'

if (NO_UNPACKED_EXTENSIONS.has(name)) {
  console.warn(
    `\n[seed] WARNING: ${name} ignores --load-extension (removed in M137), so the\n` +
      `[seed] extension will not load during the tests. Seed with Brave or Chromium instead.\n`,
  )
}

if (has('reset')) await rm(SEED_DIR, { recursive: true, force: true })
await mkdir(SEED_DIR, { recursive: true })

const returning = await hasXSession()
console.log(`\n[seed] browser: ${name} (${executablePath})`)
console.log(
  `[seed] profile: ${SEED_DIR}${returning ? ' (existing X session found)' : ''}`,
)
console.log(
  `\n[seed] Log in to X in the window that opens, then CLOSE THE BROWSER to save.\n` +
    `[seed] Closing it flushes the cookie database — killing this script does not.\n`,
)

await launch(executablePath, url)

if (!(await hasXSession())) {
  console.error(
    `\n[seed] No X session in the profile — nothing was copied.\n` +
      `[seed] Log in fully (past any 2FA / "verify it's you" step) before closing the browser.\n`,
  )
  process.exit(1)
}

await copyProfile()
await writeFile(
  MANIFEST,
  `${JSON.stringify(
    {
      browser: name,
      executablePath,
      profileDir: PROFILE_DIR,
      seededAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
)

console.log(`\n[seed] Copied to ${PROFILE_DIR} (${dirSize(PROFILE_DIR)})`)
console.log(`[seed] Wrote ${MANIFEST}`)
console.log(
  `[seed] Done — \`pnpm test:e2e\` now runs on ${name} with this session.\n`,
)
