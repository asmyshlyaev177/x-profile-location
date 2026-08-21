#!/usr/bin/env -S node --experimental-strip-types
// Pull, reinstall if needed, re-sync the systemd units, restart, verify:
//
//   sudo /opt/x-loc-cache/server/deploy/update.ts
//
// The three steps a hand-run upgrade forgets, in the order that matters:
//
//   * `npm install` after package.json moved, or after a Node major upgrade —
//     better-sqlite3 is native, and an unrebuilt one fails at startup with
//     ERR_DLOPEN_FAILED rather than at pull time.
//   * the unit files. They live in git and run from /etc/systemd/system, so a
//     pull that changes an ExecStart= changes nothing until they are copied and
//     systemd is reloaded. A timer that only fires at 23:30 reports that as
//     status=203/EXEC the following morning.
//   * /healthz. A service that came back up is not the same as one that works.
//
// A failed health check rolls the tree back to the commit it started from and
// restarts, so the box is never left on a version that does not serve.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  SERVICE,
  die,
  healthy,
  loadEnvFile,
  run,
  uid,
  type CommandResult,
} from './lib.ts'

const REPO = process.env.XLOC_REPO ?? '/opt/x-loc-cache'
const UNIT_DIR = process.env.XLOC_UNIT_DIR ?? '/etc/systemd/system'
// The interpreter systemd names in ExecStart=, not whatever `node` resolves to
// in this shell — the native module has to be built for that one.
const NODE = process.env.XLOC_NODE ?? '/usr/bin/node'
const NPM = process.env.XLOC_NPM ?? '/usr/bin/npm'
const ENV_FILE = process.env.XLOC_ENV_FILE ?? '/etc/x-loc-cache.env'

const INSTALL_TRIGGERS = new Set([
  'server/package.json',
  'server/package-lock.json',
])

/** A native module built for the wrong ABI only shows up when something loads it. */
export function needsInstall(changed: string[]): boolean {
  return changed.some((f) => INSTALL_TRIGGERS.has(f))
}

export function isUnitFile(name: string): boolean {
  return /\.(service|timer)$/.test(name)
}

/**
 * Only units this box already installed. A new one upstream is reported, never
 * copied in: `x-loc-heartbeat` and `x-loc-alert@` are opt-in and want an env
 * file that may not exist here.
 */
export function unitPlan(
  repoUnits: string[],
  installed: (name: string) => boolean,
): { update: string[]; unseen: string[] } {
  const update: string[] = []
  const unseen: string[] = []
  for (const name of repoUnits.filter(isUnitFile)) {
    if (installed(name)) update.push(name)
    else unseen.push(name)
  }
  return { update, unseen }
}

function envKeys(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
    .filter((key): key is string => key !== undefined)
}

/** Settings added upstream that this box's env file has never heard of. */
export function missingEnvKeys(example: string, live: string): string[] {
  const have = new Set(envKeys(live))
  return [...new Set(envKeys(example))].filter((key) => !have.has(key))
}

function git(...args: string[]): CommandResult {
  return run('git', ['-C', REPO, ...args])
}

function head(): string {
  const r = git('rev-parse', 'HEAD')
  if (!r.ok) die(`not a git checkout: ${REPO}`, r.out)
  return r.out.trim()
}

function changedFiles(from: string, to: string): string[] {
  if (from === to) return []
  const r = git('diff', '--name-only', `${from}..${to}`)
  return r.ok ? r.out.split('\n').filter(Boolean) : []
}

/** Explicit PATH so npm binds the native module to NODE, not the shell's node. */
function npmInstall(): CommandResult {
  return run('env', [
    'PATH=/usr/bin:/bin',
    NPM,
    '--prefix',
    join(REPO, 'server'),
    'install',
    '--omit=dev',
  ])
}

function abiOk(): boolean {
  const module = join(REPO, 'server/node_modules/better-sqlite3')
  if (!existsSync(module)) return false
  return run(NODE, [
    '-e',
    `new (require(${JSON.stringify(module)}))(':memory:')`,
  ]).ok
}

function syncUnits(): string[] {
  const source = join(REPO, 'server/deploy')
  const repoUnits = readdirSync(source)
  const { update, unseen } = unitPlan(repoUnits, (name) =>
    existsSync(join(UNIT_DIR, name)),
  )

  const copied = update.filter((name) => {
    const from = join(source, name)
    const to = join(UNIT_DIR, name)
    if (readFileSync(from, 'utf8') === readFileSync(to, 'utf8')) return false
    // root is running this, so the copy is root-owned without being told.
    const r = run('install', ['-m', '644', from, to])
    if (!r.ok) die(`could not install ${name}: ${r.out}`)
    return true
  })

  for (const name of unseen) {
    console.log(`note: ${name} exists upstream but is not installed here`)
  }
  return copied
}

function warnAboutNewSettings(): void {
  const example = join(REPO, 'server/deploy/x-loc-cache.env.example')
  if (!existsSync(example) || !existsSync(ENV_FILE)) return
  const missing = missingEnvKeys(
    readFileSync(example, 'utf8'),
    readFileSync(ENV_FILE, 'utf8'),
  )
  if (missing.length === 0) return
  console.log(
    `note: ${ENV_FILE} does not set ${missing.join(', ')} — defaults apply; see deploy/x-loc-cache.env.example`,
  )
}

/** Back to the commit that was serving a minute ago, and prove that one works. */
async function rollback(to: string, port: string): Promise<never> {
  console.error(`healthz FAILED — rolling back to ${to.slice(0, 7)}`)
  const reset = git('reset', '--hard', to)
  if (!reset.ok) {
    die(
      `could not roll back: ${reset.out}`,
      `Do it by hand: git -C ${REPO} reset --hard ${to} && systemctl restart ${SERVICE}`,
    )
  }
  if (!abiOk()) npmInstall()
  syncUnits()
  run('systemctl', ['daemon-reload'])
  run('systemctl', ['restart', SERVICE])

  if (await healthy(port)) {
    die(
      `rolled back to ${to.slice(0, 7)} and it is serving again.`,
      `The pulled version is still in git — journalctl -u ${SERVICE} -n 50 says why it failed.`,
    )
  }
  die(
    `rolled back to ${to.slice(0, 7)} and it is STILL not serving — this is not the new code.`,
    `journalctl -u ${SERVICE} -n 50`,
  )
}

interface Pulled {
  before: string
  after: string
  changed: string[]
}

function pull(): Pulled {
  const before = head()
  const result = git('pull', '--ff-only')
  if (!result.ok) {
    die(
      `git pull failed — nothing was changed: ${result.out}`,
      'A diverged tree needs a decision this script will not make for you.',
    )
  }
  const after = head()
  const changed = changedFiles(before, after)

  if (after === before) console.log(`already at ${after.slice(0, 7)}`)
  else {
    console.log(
      `${before.slice(0, 7)} -> ${after.slice(0, 7)} (${changed.length} files)`,
    )
  }
  return { before, after, changed }
}

/**
 * The ABI check runs on every pass, not only when package.json moved: a Node
 * major upgrade breaks the native module without touching the repo at all.
 */
function ensureDependencies(changed: string[]): void {
  const stale = !abiOk()
  if (!needsInstall(changed) && !stale) return

  console.log(
    stale
      ? 'native module will not load — reinstalling'
      : 'dependencies changed — reinstalling',
  )
  const install = npmInstall()
  if (!install.ok) die(`npm install failed — service untouched: ${install.out}`)
  if (abiOk()) return
  die(
    `better-sqlite3 still will not load under ${NODE} — service untouched.`,
    'Check that npm and ExecStart= name the same Node; see README step 4.',
  )
}

async function main(): Promise<void> {
  if (uid() !== 0) {
    die('run as root — it writes to /etc/systemd/system and drives systemctl')
  }
  loadEnvFile()
  const PORT = process.env.XLOC_PORT ?? '8787'

  const { before, after, changed } = pull()
  ensureDependencies(changed)

  const copied = syncUnits()
  if (copied.length > 0) {
    console.log(`units updated: ${copied.join(', ')}`)
    const reload = run('systemctl', ['daemon-reload'])
    if (!reload.ok) die(`daemon-reload failed: ${reload.out}`)
  }

  const restart = run('systemctl', ['restart', SERVICE])
  if (!restart.ok) die(`could not restart ${SERVICE}: ${restart.out}`)

  if (!(await healthy(PORT))) await rollback(before, PORT)

  warnAboutNewSettings()
  console.log(`healthz ok — ${SERVICE} is serving ${after.slice(0, 7)}`)
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
