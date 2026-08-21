// Shared plumbing for backup.ts, restore.ts and vacuum.ts. Policy stays in the
// scripts.
//
// SQLite goes through the `sqlite3` CLI, not better-sqlite3: a Node major
// upgrade without a rebuild takes the native module down, which is exactly the
// outage where backups still have to run (alert.ts avoids SQLite for the same
// reason). systemctl/sudo/chown/mv/curl stay spawned commands — they are
// privileged steps either way, and the tests stub each one on PATH.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'

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

/**
 * The CLI creates root-owned -wal/-shm beside a WAL database when they are
 * absent, which stops the service writing its own — hence `asUser`.
 */
export function sqlite(args: string[], asUser?: string): CommandResult {
  if (asUser) return run('sudo', ['-u', asUser, 'sqlite3', ...args])
  return run('sqlite3', args)
}

export interface Inspection {
  integrity: string
  profiles: number | null
  votes: number | null
}

/**
 * Both checks, because neither covers the other: `integrity_check` calls an
 * *empty* database "ok" — a failed `VACUUM INTO` leaves exactly that — so the
 * counts prove the tables arrived. An unparseable count is `null`, never a
 * number, so it cannot sail through the comparison meant to catch it.
 */
export function inspect(dbFile: string, asUser?: string): Inspection {
  const integrity = sqlite([dbFile, 'PRAGMA integrity_check;'], asUser)
  const counted = sqlite(
    [
      dbFile,
      'SELECT COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes;',
    ],
    asUser,
  )
  const [profiles = null, votes = null] = counted.ok
    ? counted.out.split('\n').map((line) => {
        const n = Number(line.trim())
        return Number.isInteger(n) ? n : null
      })
    : []
  return { integrity: integrity.out, profiles, votes }
}

/** Through `id`, not `process.getuid()`, so tests can stub the root path. */
export function uid(): number {
  const r = run('id', ['-u'])
  return r.ok ? Number(r.out.trim()) : -1
}

/**
 * The unit's own env file, so a hand-run agrees with the timer. It overrides the
 * caller's environment on purpose — a stale `XLOC_DB` export must not decide
 * which database gets touched — so not `process.loadEnvFile`, which would leave
 * an already-set variable alone.
 */
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

/** Rounded, not truncated — alert.ts rounds the same two numbers for its email. */
export function reclaimPct(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0
  return Math.round(((before - after) / before) * 100)
}

/**
 * Takes -wal/-shm along: a WAL left behind belongs to a file that no longer
 * exists, and SQLite would replay it over the database that replaced it.
 */
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

/**
 * Cleanup for a swap that dies half-done. Between moving the old database aside
 * and moving the new one in there is a window one `mv` wide; dying inside it
 * leaves no database, and a restart there has SQLite create an empty one and
 * answer from it. So the original goes back first, and the service is restarted
 * whatever happened. Returns the flags the caller flips as it goes.
 */
export function guardSwap(
  dbFile: string,
  suffix: string,
  tmp: string,
): SwapGuard {
  const guard: SwapGuard = { stopped: false, swapped: false }

  process.on('exit', () => {
    for (const part of ['', '-wal', '-shm']) {
      rmSync(`${tmp}${part}`, { force: true })
    }

    if (
      !guard.swapped &&
      !existsSync(dbFile) &&
      existsSync(`${dbFile}${suffix}`)
    ) {
      console.error('putting the original database back')
      for (const part of ['', '-wal', '-shm']) {
        const aside = `${dbFile}${part}${suffix}`
        if (existsSync(aside)) mv(aside, `${dbFile}${part}`)
      }
    }

    if (!guard.stopped) return
    console.error(
      guard.swapped
        ? `the new database is in place — restarting ${SERVICE}`
        : `the database was not modified — restarting ${SERVICE}`,
    )
    run('systemctl', ['start', SERVICE])
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
