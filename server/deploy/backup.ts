#!/usr/bin/env -S node --experimental-strip-types
// Nightly snapshot, verified and rotated, as the xloc user and never root. The
// order of the steps is load-bearing — see CLAUDE.md.

import { spawnSync } from 'node:child_process'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { VOTE_RETENTION_MS } from '../src/index.ts'
import {
  bytes,
  die,
  freeBytes,
  humanSize,
  inspect,
  liveBytes,
  loadEnvFile,
  reclaimPct,
  secs,
  sqlite,
  stamp,
  uid,
  type Inspection,
} from './lib.ts'

const ARCHIVE_RE = /^x-loc-cache-\d{8}-\d{6}\.db\.gz$/
const WORKING_RE = /^x-loc-cache-\d{8}-\d{6}\.db$/
const LEFTOVER_PARTS = new Set([
  'corrupt-evidence.db.gz.part',
  '.vacuum-status.part',
])

/** `null` when the value is unusable, so the caller reports rather than prunes. */
export function parseKeep(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null
  return Number(raw)
}

/** At or above this share reclaimable, the run compacts the live file too.
 *  0 disables; a value that is not a percentage disables with a warning, since
 *  a typo must never trigger a rebuild the operator meant to switch off. */
export function autoVacuumPct(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 20
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 0 && n <= 100) return n
  console.error(
    `XLOC_AUTO_VACUUM_PCT must be 0-100, got '${raw}' — auto vacuum disabled for this run`,
  )
  return 0
}

/** A root run leaves the backups directory root-owned, failing every xloc run after it. */
export function rootRefusal(userId: number, self: string): string[] | null {
  if (userId !== 0) return null
  return [
    'refusing to run as root — use: sudo systemctl start x-loc-backup.service',
    `(or sudo -u xloc ${self})`,
  ]
}

/** The baseline a snapshot must not come in under: profiles with a vote still
 *  inside the window, which retention cannot touch mid-copy. */
export function baselineQuery(now: number): string {
  return `SELECT COUNT(*) FROM profiles p WHERE EXISTS (
    SELECT 1 FROM location_votes v
     WHERE v.username = p.username
       AND v.seen_at >= ${now - VOTE_RETENTION_MS});`
}

/** inspect()'s two checks plus the baseline, which is what proves it is not short. */
export function snapshotIsGood(found: Inspection, baseline: number): boolean {
  return (
    found.integrity === 'ok' &&
    found.profiles !== null &&
    found.votes !== null &&
    found.profiles >= baseline
  )
}

/** Names embed a UTC timestamp, so lexical order is age order: newest first. */
export function archivesToPrune(names: string[], keep: number): string[] {
  return names
    .filter((n) => ARCHIVE_RE.test(n))
    .sort((a, b) => b.localeCompare(a))
    .slice(keep)
}

/** Leftovers from a run killed too hard for its handlers; only stamped names
 *  and .part files match, so a kept archive is never at risk. */
export function isOrphan(name: string): boolean {
  if (WORKING_RE.test(name)) return true
  if (LEFTOVER_PARTS.has(name)) return true
  return (
    name.endsWith('.part') && ARCHIVE_RE.test(name.slice(0, -'.part'.length))
  )
}

/** Whole file, then rename, so nothing ever reads a half-written archive. */
async function gzipTo(source: string, target: string): Promise<void> {
  await pipeline(
    createReadStream(source),
    createGzip(),
    createWriteStream(`${target}.part`),
  )
  renameSync(`${target}.part`, target)
}

/** One run at a time — a hand-run alongside the timer shares the orphan sweep.
 *  Returns only in the re-executed child, which holds the lock. */
function relaunchUnderLock(lock: string): void {
  if (process.env.XLOC_BACKUP_LOCKED) return
  if (spawnSync('sh', ['-c', 'command -v flock']).status !== 0) {
    die('flock not found — install util-linux; refusing to run unserialised')
  }
  // Re-exec rather than exec, so the busy case can still explain itself.
  // -E gives "lock held" a status distinct from a real failure.
  const relaunch = spawnSync(
    'flock',
    [
      '-n',
      '-E',
      '75',
      lock,
      process.execPath,
      ...process.execArgv,
      import.meta.filename,
    ],
    { stdio: 'inherit', env: { ...process.env, XLOC_BACKUP_LOCKED: '1' } },
  )
  if (relaunch.status === 75) {
    console.error(`another backup is already running (${lock})`)
  }
  process.exit(relaunch.status ?? 1)
}

/** ONE compressed copy, not one per night: it shares a disk with the live
 *  database, and the first copy is closest to the onset. */
async function keepEvidence(snapshot: string, evidence: string): Promise<void> {
  if (existsSync(evidence)) {
    console.error(
      `Evidence from an earlier failure is already at ${evidence} — kept that one.`,
    )
    return
  }
  await gzipTo(snapshot, evidence)
  console.error(
    `Evidence kept at ${evidence} (never auto-pruned; delete by hand).`,
  )
}

async function main(): Promise<void> {
  loadEnvFile()

  const DB = process.env.XLOC_DB ?? '/var/lib/x-loc-cache/x-loc-cache.db'
  const BACKUP_DIR =
    process.env.XLOC_BACKUP_DIR ?? '/var/lib/x-loc-cache/backups'

  const refusal = rootRefusal(uid(), process.argv[1] ?? '')
  if (refusal) die(...refusal)

  const keep = parseKeep(process.env.XLOC_BACKUP_KEEP ?? '7')
  if (keep === null) {
    die(
      `XLOC_BACKUP_KEEP must be a positive integer without a leading zero, got '${process.env.XLOC_BACKUP_KEEP}'`,
    )
  }

  mkdirSync(BACKUP_DIR, { recursive: true })

  relaunchUnderLock(join(BACKUP_DIR, '.backup.lock'))

  const startedAt = Date.now()
  const STAMP = stamp()
  const SNAP = join(BACKUP_DIR, `x-loc-cache-${STAMP}.db`)
  // Unstamped and deliberately not archive-shaped: neither the prune, the
  // sweep, the kept-count nor restore.ts's listing may treat it as one.
  const EVIDENCE = join(BACKUP_DIR, 'corrupt-evidence.db.gz')
  // For the weekly heartbeat. Dotfile for the same reason as .backup.lock.
  const STATUS = join(BACKUP_DIR, '.vacuum-status')

  for (const name of readdirSync(BACKUP_DIR).filter(isOrphan)) {
    rmSync(join(BACKUP_DIR, name), { force: true })
  }

  let sweepWorkingFiles = true
  process.on('exit', () => {
    if (!sweepWorkingFiles) return
    rmSync(SNAP, { force: true })
    rmSync(`${SNAP}.gz.part`, { force: true })
  })
  // SIGTERM ends the process without running the exit handler, leaking a
  // DB-sized snapshot.
  for (const [signal, code] of [
    ['SIGTERM', 143],
    ['SIGINT', 130],
    ['SIGHUP', 129],
  ] as const) {
    process.on(signal, () => process.exit(code))
  }

  const baseline = sqlite([DB, baselineQuery(Date.now())])

  // VACUUM INTO, *not* .backup, which never converges under load — see
  // CLAUDE.md for the measurements.
  const snapshotStartedAt = Date.now()
  const snapshot = sqlite([
    '-cmd',
    '.timeout 5000',
    DB,
    `VACUUM INTO '${SNAP}'`,
  ])
  if (!snapshot.ok) die(`VACUUM INTO failed: ${snapshot.out}`)
  const snapshotMs = Date.now() - snapshotStartedAt

  const found = inspect(SNAP)
  if (!snapshotIsGood(found, Number(baseline.out))) {
    console.error('snapshot verification FAILED.')
    console.error(`integrity_check: ${found.integrity}`)
    console.error(
      `profiles: ${found.profiles} in snapshot vs ${baseline.out} in the source still backed by a vote inside the retention window`,
    )
    await keepEvidence(SNAP, EVIDENCE)
    process.exit(1)
  }

  // The gap between the two files is what a VACUUM would hand back. Read here
  // because compression deletes it; the threshold lives in alert.ts.
  const live = liveBytes(DB)
  const rebuilt = bytes(SNAP)

  await gzipTo(SNAP, `${SNAP}.gz`)
  rmSync(SNAP, { force: true })
  sweepWorkingFiles = false

  // The source too, because neither check subsumes the other, and after the
  // snapshot is stored — a copy of a failing database is worth having.
  const source = sqlite([DB, 'PRAGMA integrity_check;'])
  if (source.out !== 'ok') {
    die(
      'the LIVE database failed integrity_check — it is corrupt.',
      `Tonight's snapshot is stored at ${SNAP}.gz and nothing was pruned.`,
      "Restore per README 'Restore'; do not repair in place.",
      source.out,
    )
  }

  for (const old of archivesToPrune(readdirSync(BACKUP_DIR), keep)) {
    rmSync(join(BACKUP_DIR, old), { force: true })
  }
  const kept = readdirSync(BACKUP_DIR).filter((n) => ARCHIVE_RE.test(n)).length

  console.log(
    `backup ok: ${SNAP}.gz (${humanSize(bytes(`${SNAP}.gz`))}, ${found.profiles} profiles / ${found.votes} votes), ${kept} kept — snapshot ${secs(snapshotMs)}, total ${secs(Date.now() - startedAt)}`,
  )
  console.log(
    `vacuum check: ${reclaimPct(live, rebuilt)}% of the database is reclaimable (${live} live, ${rebuilt} rebuilt)`,
  )

  // Compact the live file while the verified archive is already on disk, so
  // the worst a bad rebuild can do is what tonight's backup restores. A plain
  // VACUUM off a second connection needs no service stop; writers wait behind
  // the sub-second rebuild (measured in README's VACUUM INTO table) instead of
  // being refused. A failure is logged and retried by the next nightly run.
  const liveNow = await autoVacuum(DB, live, rebuilt)

  // Only on a run that got all the way through, and as plain text: the
  // heartbeat has to keep working when SQLite is what broke.
  writeFileSync(
    `${STATUS}.part`,
    `stamp=${STAMP}\nlive_bytes=${liveNow}\nvacuumed_bytes=${rebuilt}\n`,
  )
  renameSync(`${STATUS}.part`, STATUS)
}

/** Returns the live size the status file should record: post-VACUUM when one
 *  ran, tonight's measurement otherwise. */
async function autoVacuum(
  db: string,
  live: number,
  rebuilt: number,
): Promise<number> {
  const threshold = autoVacuumPct(process.env.XLOC_AUTO_VACUUM_PCT)
  const pct = reclaimPct(live, rebuilt)
  if (threshold === 0 || pct < threshold) return live

  const free = freeBytes(dirname(db))
  if (free === null || free < rebuilt) {
    console.error(
      `auto vacuum skipped: needs ${humanSize(rebuilt)} free beside the database, ${free === null ? 'unknown' : humanSize(free)} available`,
    )
    return live
  }

  const vacuumStartedAt = Date.now()
  const compacted = sqlite(['-cmd', '.timeout 15000', db, 'VACUUM;'])
  if (!compacted.ok) {
    console.error(
      `auto vacuum failed (the backup itself is fine): ${compacted.out}`,
    )
    return live
  }
  const liveNow = liveBytes(db)
  console.log(
    `auto vacuum: ${pct}% >= ${threshold}%, compacted the live database ${live} -> ${liveNow} bytes in ${secs(Date.now() - vacuumStartedAt)}`,
  )
  return liveNow
}

// The tests import the helpers above; only a direct run backs anything up.
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
