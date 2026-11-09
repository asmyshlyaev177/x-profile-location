// Shared plumbing for backup.ts, restore.ts and vacuum.ts; policy stays in the
// scripts. See "Four things that look incidental" in CLAUDE.md.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync, statfsSync } from 'node:fs'

export const SERVICE = 'x-loc-cache'
export const OWNER = 'xloc'

export interface CommandResult {
  out: string
  ok: boolean
}

export function die(...lines: string[]): never {
  for (const line of lines) console.error(line)
  process.exit(1)
}

/** stdout and stderr together, the way `2>&1` gave them to the shell. */
export function run(command: string, args: string[]): CommandResult {
  const r = spawnSync(command, args, { encoding: 'utf8' })
  return {
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
    ok: r.status === 0,
  }
}

/** The CLI creates root-owned -wal/-shm when they are absent, which stops the
 *  service writing its own — hence `asUser`. */
export function sqlite(args: string[], asUser?: string): CommandResult {
  if (asUser) return run('sudo', ['-u', asUser, 'sqlite3', ...args])
  return run('sqlite3', args)
}

export interface RowCounts {
  /** Usernames with a vote: a profile is worked out from its votes on read. */
  profiles: number | null
  votes: number | null
}

/** Reads `location_votes` alone, so it gives the same answer for an archive or
 *  file still in the layout with a `profiles` table. Unparseable is `null`. */
export function countRows(dbFile: string, asUser?: string): RowCounts {
  const counted = sqlite(
    [dbFile, 'SELECT COUNT(DISTINCT username), COUNT(*) FROM location_votes;'],
    asUser,
  )
  const [profiles = null, votes = null] = counted.ok
    ? counted.out.split('|').map((field) => {
        const n = Number(field.trim())
        return field.trim() !== '' && Number.isInteger(n) ? n : null
      })
    : []
  return { profiles, votes }
}

export interface Inspection extends RowCounts {
  integrity: string
}

/** Both checks: `integrity_check` calls an *empty* database "ok", so the counts
 *  prove the tables arrived. */
export function inspect(dbFile: string, asUser?: string): Inspection {
  const integrity = sqlite([dbFile, 'PRAGMA integrity_check;'], asUser)
  return { integrity: integrity.out, ...countRows(dbFile, asUser) }
}

/** `profiles`: the layout before votes-only, which the server refuses and
 *  vacuum.ts converts. `mixed`: a converted file the old schema ran on again. */
export type Layout = 'votes-only' | 'profiles' | 'mixed'

// Is there a `profiles` table | is there a `labels` table or a `net` column.
const LAYOUT_SQL = `SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'profiles'),
  EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'labels')
  OR EXISTS (SELECT 1 FROM pragma_table_info('location_votes') WHERE name = 'net');`

const LAYOUT_BY_TABLES: Record<string, Layout> = {
  // No tables at all is rebuilt plainly, and its null counts refuse the swap.
  '0|0': 'votes-only',
  '0|1': 'votes-only',
  '1|0': 'profiles',
  '1|1': 'mixed',
}

/** `null` when it cannot be read. */
export function layoutOf(dbFile: string, asUser?: string): Layout | null {
  const found = sqlite([dbFile, LAYOUT_SQL], asUser)
  return found.ok ? (LAYOUT_BY_TABLES[found.out.trim()] ?? null) : null
}

/** Through `id`, not `process.getuid()`, so tests can stub the root path. */
export function uid(): number {
  const r = run('id', ['-u'])
  return r.ok ? Number(r.out.trim()) : -1
}

/** The unit's own env file, overriding the caller's environment: a stale
 *  `XLOC_DB` export must not decide which database gets touched. */
export function loadEnvFile(
  file: string = process.env.XLOC_ENV_FILE ?? '/etc/x-loc-cache.env',
): void {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key = '', raw = ''] = match
    process.env[key] = raw.trim().replace(/^(["'])(.*)\1$/, '$2')
  }
}

export function servicePort(): string {
  return process.env.XLOC_PORT ?? '8787'
}

/** UTC, so lexical order is age order wherever these names are sorted. */
export function stamp(): string {
  const [date = '', time = ''] = new Date().toISOString().split('T')
  return `${date.replace(/-/g, '')}-${time.replace(/:/g, '').slice(0, 6)}`
}

export function bytes(file: string): number {
  return existsSync(file) ? statSync(file).size : 0
}

/** Main file plus un-checkpointed WAL. Matches dbBytes() in node-server.ts. */
export function liveBytes(dbFile: string): number {
  return bytes(dbFile) + bytes(`${dbFile}-wal`)
}

/** `du -h`, near enough: this only ever lands in a log line. */
export function humanSize(size: number): string {
  const units = ['B', 'K', 'M', 'G', 'T']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)
  return `${rounded}${units[unit]}`
}

/** For log lines: `1234` -> `1.2s`. */
export function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/** Free bytes on the filesystem holding `directory`; null when unreadable, so
 *  the caller refuses to guess. */
export function freeBytes(directory: string): number | null {
  try {
    const fs = statfsSync(directory)
    return Number(fs.bavail) * Number(fs.bsize)
  } catch {
    return null
  }
}

/** Rounded, not truncated — alert.ts rounds the same two numbers for its email. */
export function reclaimPct(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0
  return Math.round(((before - after) / before) * 100)
}

/** Takes -wal/-shm along, or SQLite replays a stale WAL over the database that
 *  replaced it. */
export function moveAside(dbFile: string, suffix: string): void {
  for (const part of ['', '-wal', '-shm']) {
    const from = `${dbFile}${part}`
    if (existsSync(from)) mv(from, `${from}${suffix}`)
  }
}

/** Through `mv`, not `renameSync`: the swap is the one step worth stubbing. */
export function mv(from: string, to: string): CommandResult {
  return run('mv', [from, to])
}

export interface SwapGuard {
  /** Set once the service is down, cleared once it is back up. */
  stopped: boolean
  /** Set the moment the new database is in place. */
  swapped: boolean
}

function removeScratch(scratch: string[]): void {
  for (const tmp of scratch) {
    for (const part of ['', '-wal', '-shm', '-journal']) {
      rmSync(`${tmp}${part}`, { force: true })
    }
  }
}

/** Only when the original is aside and nothing took its place. */
function putOriginalBack(dbFile: string, suffix: string): void {
  if (existsSync(dbFile) || !existsSync(`${dbFile}${suffix}`)) return
  console.error('putting the original database back')
  for (const part of ['', '-wal', '-shm']) {
    const aside = `${dbFile}${part}${suffix}`
    if (existsSync(aside)) mv(aside, `${dbFile}${part}`)
  }
}

function restartUnlessKept(guard: SwapGuard, keepStopped?: string[]): void {
  if (!guard.stopped) return
  if (!guard.swapped && keepStopped) {
    console.error(`the database was not modified — ${SERVICE} is left stopped`)
    for (const line of keepStopped) console.error(line)
    return
  }
  console.error(
    guard.swapped
      ? `the new database is in place — restarting ${SERVICE}`
      : `the database was not modified — restarting ${SERVICE}`,
  )
  run('systemctl', ['start', SERVICE])
}

/** Cleanup for a swap that dies half-done: the original goes back first, then
 *  the service restarts, unless `keepStopped` says how to serve the original. */
export function guardSwap(
  dbFile: string,
  suffix: string,
  scratch: string[],
  keepStopped?: string[],
): SwapGuard {
  const guard: SwapGuard = { stopped: false, swapped: false }

  process.on('exit', () => {
    removeScratch(scratch)
    if (!guard.swapped) putOriginalBack(dbFile, suffix)
    restartUnlessKept(guard, keepStopped)
  })

  // SIGTERM (a reboot) ends the process without running the exit handler.
  for (const [signal, code] of [
    ['SIGTERM', 143],
    ['SIGINT', 130],
    ['SIGHUP', 129],
  ] as const) {
    process.on(signal, () => process.exit(code))
  }

  return guard
}

/** The service answers, or it does not — ten tries, a second apart. */
export async function healthy(port: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (run('curl', ['-fsS', `localhost:${port}/healthz`]).ok) return true
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}
