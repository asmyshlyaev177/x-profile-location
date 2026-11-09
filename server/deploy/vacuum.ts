#!/usr/bin/env -S node --experimental-strip-types
// Compact the cache database, converting a file with a `profiles` table to
// votes-only: `sudo .../deploy/vacuum.ts [-y]`. See CLAUDE.md, README "Compacting".

import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { autoVacuumPct } from './backup.ts'
import {
  VACUUM_STATUS_FILE,
  readVacuumStatus,
  writeVacuumStatus,
  type VacuumStatus,
} from './alert.ts'
import {
  OWNER,
  SERVICE,
  bytes,
  countRows,
  die,
  freeBytes,
  guardSwap,
  healthy,
  humanSize,
  inspect,
  layoutOf,
  liveBytes,
  loadEnvFile,
  moveAside,
  mv,
  reclaimPct,
  run,
  secs,
  servicePort,
  sqlite,
  stamp,
  uid,
  type CommandResult,
  type Inspection,
} from './lib.ts'

// Through .read: as an argument, the CLI takes schema.sql's opening `--` for
// an option and refuses the whole file.
const READ_SCHEMA = `.read '${join(import.meta.dirname, '..', 'schema.sql')}'`
const READ_VOTES_ONLY = `.read '${join(import.meta.dirname, 'votes-only.sql')}'`

// Votes the conversion did not carry over as they were: missing, or label ids
// that do not resolve to the old text. IS NOT, so a NULL compares as a value;
// quote(), because an INTEGER column's affinity makes the text '1' equal 1.
const MISMATCHES_SQL = `SELECT COUNT(*) FROM live.location_votes o
  LEFT JOIN main.location_votes n USING (username, client_id)
  LEFT JOIN main.labels l ON l.id = n.location
  LEFT JOIN main.labels s ON s.id = n.source
 WHERE n.seen_at IS NULL
    OR quote(l.text) IS NOT quote(o.location) OR (n.location IS NOT NULL AND l.id IS NULL)
    OR quote(s.text) IS NOT quote(o.source) OR (n.source IS NOT NULL AND s.id IS NULL)
    OR n.location_accurate IS NOT o.location_accurate
    OR n.seen_at IS NOT o.seen_at;`

function vacuumInto(dbFile: string, tmp: string): CommandResult {
  return sqlite(
    ['-cmd', '.timeout 5000', dbFile, `VACUUM INTO '${tmp}'`],
    OWNER,
  )
}

/** A new file from schema.sql, filled by votes-only.sql in one transaction:
 *  -bail exits at the first failed statement, so COMMIT never runs. */
function votesOnlyInto(dbFile: string, tmp: string): CommandResult {
  return sqlite(
    [
      '-bail',
      '-cmd',
      '.timeout 5000',
      tmp,
      READ_SCHEMA,
      `ATTACH '${dbFile}' AS live;`,
      'BEGIN;',
      READ_VOTES_ONLY,
      'COMMIT;',
    ],
    OWNER,
  )
}

/** Then VACUUM INTO, because INSERT leaves the key's pages ~89% full where a
 *  rebuild fills them: 157.2 MB against 139.6 MB on the 2026-11-09 copy. */
export function convertInto(
  dbFile: string,
  converted: string,
  tmp: string,
): CommandResult {
  const conversion = votesOnlyInto(dbFile, converted)
  if (!conversion.ok) return conversion
  const packed = vacuumInto(converted, tmp)
  rmSync(converted, { force: true })
  return packed
}

/** Counts cannot see a vote that kept its key and lost its label; this reads
 *  every vote back through `labels`. `null` when it could not be counted. */
export function conversionMismatches(
  dbFile: string,
  tmp: string,
): number | null {
  const r = sqlite([tmp, `ATTACH '${dbFile}' AS live;`, MISMATCHES_SQL], OWNER)
  const n = Number(r.out)
  return r.ok && r.out !== '' && Number.isInteger(n) ? n : null
}

export interface VacuumArgs {
  assumeYes: boolean
  /** Never prompts: the x-loc-vacuum unit runs it with no terminal. */
  ifNeeded: boolean
}

/** `null` for anything this does not understand, so it reports rather than runs. */
export function parseArgs(argv: string[]): VacuumArgs | null {
  let assumeYes = false
  let ifNeeded = false
  for (const flag of argv) {
    if ((flag === '-y' || flag === '--yes') && !assumeYes) assumeYes = true
    else if (flag === '--if-needed' && !ifNeeded) ifNeeded = true
    else return null
  }
  return { assumeYes: assumeYes || ifNeeded, ifNeeded }
}

/** Rebuild only on a measurement a verified backup left behind, past the same
 *  threshold it was recorded against. */
export function needsRebuild(
  status: VacuumStatus | null,
  threshold: number,
): boolean {
  if (status === null || threshold === 0) return false
  return status.reclaimPct >= threshold
}

/** Everything that must hold before the service is stopped, so a refusal costs
 *  no downtime. Returns the size the rebuild is measured against. */
function preflight(dbFile: string): number {
  if (uid() !== 0) {
    die('run as root — it drives systemctl and chowns the database')
  }
  if (!existsSync(dbFile)) die(`no database at ${dbFile}`)

  const before = liveBytes(dbFile)
  const free = freeBytes(dirname(dbFile))
  if (free === null) {
    die(`could not read free space for ${dirname(dbFile)} — refusing to guess`)
  }
  if (free < before) {
    die(
      `not enough free space: the rebuild needs ${Math.ceil(before / 1024)}KB beside the database, ${Math.floor(free / 1024)}KB free`,
    )
  }

  // Compacting a corrupt database is the one thing never to do here: the
  // rebuild carries the fault across and destroys the evidence. Restore instead.
  const live = sqlite([dbFile, 'PRAGMA integrity_check;'], OWNER)
  if (live.out !== 'ok') {
    die(
      'the live database failed integrity_check — do NOT compact it.',
      "Restore the newest backup per README 'Restore'; the service is untouched.",
      live.out,
    )
  }

  return before
}

/** A pipe means cron or a half-written unit file, never an answered prompt. */
async function confirmOrExit(dbFile: string): Promise<void> {
  if (!process.stdin.isTTY) {
    die('not a terminal — re-run with -y if you meant this non-interactively')
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl
    .question(
      `Stop ${SERVICE}, rebuild ${dbFile} (${humanSize(bytes(dbFile))}), and restart? [y/N] `,
    )
    .finally(() => rl.close())
  if (/^y(es)?$/i.test(answer.trim())) return
  console.log('aborted; nothing was touched.')
  process.exit(1)
}

/** Logged either way: unattended, so the journal is the only place a decision
 *  not to rebuild shows up. */
function wantedByLastBackup(backupDir: string, dbFile: string): boolean {
  const status = readVacuumStatus(backupDir)
  const threshold = autoVacuumPct(process.env.XLOC_AUTO_VACUUM_PCT)
  if (!needsRebuild(status, threshold)) {
    console.log(
      status === null
        ? `nothing to do: no measurement in ${backupDir} — has a backup run?`
        : `nothing to do: ${status.reclaimPct}% reclaimable, under the ${threshold}% threshold`,
    )
    return false
  }
  console.log(
    `${status!.reclaimPct}% of ${dbFile} is reclaimable — rebuilding, which stops ${SERVICE} for the duration`,
  )
  return true
}

interface LiveCounts {
  profiles: number
  votes: number
}

/** Counted with the service down, so nothing can change them before the
 *  comparison — which is what makes any difference proof of a bad rebuild. */
function countLive(dbFile: string): LiveCounts {
  const { profiles, votes } = countRows(dbFile, OWNER)
  if (profiles === null || votes === null) {
    die('could not count the live database — keeping it')
  }
  return { profiles, votes }
}

/** The checks backup.ts runs on a snapshot, plus the counts taken before. */
function verifyRebuild(tmp: string, live: LiveCounts): Inspection {
  const found = inspect(tmp, OWNER)
  const differs = found.profiles !== live.profiles || found.votes !== live.votes
  if (found.integrity !== 'ok' || differs) {
    die(
      'the rebuilt database failed verification — keeping the original.',
      `integrity_check: ${found.integrity}`,
      `usernames with a vote: ${found.profiles} rebuilt vs ${live.profiles} live`,
      `votes: ${found.votes} rebuilt vs ${live.votes} live`,
    )
  }
  return found
}

function verifyConversion(dbFile: string, tmp: string): void {
  const mismatches = conversionMismatches(dbFile, tmp)
  if (mismatches === 0) return
  die(
    'the converted database failed the content check — keeping the original.',
    `${mismatches ?? 'an uncountable number of'} votes do not read back as the live file holds them`,
  )
}

/** What a conversion does differently from a compaction, decided once. */
interface Rebuild {
  into: (dbFile: string, converted: string, tmp: string) => CommandResult
  verify: (dbFile: string, tmp: string) => void
  /** Printed in place of restarting the service on the untouched original. */
  keepStopped?: string[]
  /** What serves the original once it is put back. */
  serveOriginal: string
  done: string
}

const COMPACTION: Rebuild = {
  into: (dbFile, _converted, tmp) => vacuumInto(dbFile, tmp),
  verify: () => undefined,
  serveOriginal: `systemctl start ${SERVICE}`,
  done: 'compacted',
}

// The code checked out refuses the old layout, so the original needs the commit
// from before the pull, which git pull leaves at ORIG_HEAD.
const SERVE_OLD_LAYOUT = `git -C ${resolve(import.meta.dirname, '..', '..')} reset --hard ORIG_HEAD && systemctl start ${SERVICE}`

const CONVERSION: Rebuild = {
  into: convertInto,
  verify: verifyConversion,
  keepStopped: [
    'The code checked out refuses the old layout, so starting it would only crash-loop. To serve the original on the code from before your git pull:',
    `  ${SERVE_OLD_LAYOUT}`,
    'ORIG_HEAD moves on every pull, a no-op one too: after a second pull, take the commit from git reflog.',
  ],
  serveOriginal: SERVE_OLD_LAYOUT,
  done: 'converted to the votes-only layout and compacted',
}

/** Decided before the service stops, so a file it will not rebuild costs no
 *  downtime. Converting a mixed file would turn its label ids into labels. */
function rebuildFor(dbFile: string): Rebuild {
  const layout = layoutOf(dbFile, OWNER)
  if (layout === null)
    die(`could not list the tables of ${dbFile} — keeping it`)
  if (layout === 'mixed') {
    die(
      `${dbFile} has a profiles table beside the votes-only tables: code from before votes-only ran on it after it was converted, and wrote to it.`,
      `Restore an archive (${join(import.meta.dirname, 'restore.ts')}) or the ${dbFile}.replaced-<stamp> the conversion kept, then run this again. The service is untouched.`,
    )
  }
  return layout === 'profiles' ? CONVERSION : COMPACTION
}

async function main(): Promise<void> {
  loadEnvFile()

  const DB = process.env.XLOC_DB ?? '/var/lib/x-loc-cache/x-loc-cache.db'
  const PORT = servicePort()

  const args = parseArgs(process.argv.slice(2))
  if (args === null) die(`usage: ${process.argv[1]} [-y] [--if-needed]`)

  const BACKUP_DIR =
    process.env.XLOC_BACKUP_DIR ?? '/var/lib/x-loc-cache/backups'

  if (args.ifNeeded && !wantedByLastBackup(BACKUP_DIR, DB)) return

  const before = preflight(DB)
  if (!args.assumeYes) await confirmOrExit(DB)
  const rebuild = rebuildFor(DB)

  const STAMP = stamp()
  // Same directory as the database, so the final mv is atomic (one filesystem).
  const TMP = join(dirname(DB), `vacuum-${STAMP}.db`)
  const CONVERTED = join(dirname(DB), `convert-${STAMP}.db`)
  const guard = guardSwap(
    DB,
    `.replaced-${STAMP}`,
    [TMP, CONVERTED],
    rebuild.keepStopped,
  )

  const stoppedAt = Date.now()
  run('systemctl', ['stop', SERVICE])
  guard.stopped = true

  const live = countLive(DB)

  // The whole of the downtime: 0.6 s on a 236 MB database, scaling with it.
  const rebuildStartedAt = Date.now()
  const built = rebuild.into(DB, CONVERTED, TMP)
  if (!built.ok) die(`the rebuild failed — keeping the original: ${built.out}`)
  const rebuildMs = Date.now() - rebuildStartedAt

  const found = verifyRebuild(TMP, live)
  rebuild.verify(DB, TMP)

  // Everything that can fail has; from here to the swap is a single mv.
  run('chown', [`${OWNER}:${OWNER}`, TMP])
  moveAside(DB, `.replaced-${STAMP}`)

  const swap = mv(TMP, DB)
  if (!swap.ok) die(`could not put the rebuilt database in place: ${swap.out}`)
  guard.swapped = true

  run('systemctl', ['start', SERVICE])
  guard.stopped = false
  const downtimeMs = Date.now() - stoppedAt

  if (!(await healthy(PORT))) {
    // A -wal left now belongs to the rebuilt file: never replay it over the original.
    die(
      `healthz FAILED — journalctl -u ${SERVICE} -n 50`,
      `To put the original back: systemctl stop ${SERVICE}`,
      `  rm -f ${DB}-wal ${DB}-shm && mv ${DB}.replaced-${STAMP} ${DB}`,
      `  ${rebuild.serveOriginal}`,
    )
  }
  console.log('healthz ok')

  const after = bytes(DB)
  // Refresh, or the heartbeat keeps asking for a compaction that already ran.
  // Never creates the directory, and hands the file back: this is root, and
  // root-owned state there fails every xloc backup after it.
  if (existsSync(BACKUP_DIR)) {
    writeVacuumStatus(BACKUP_DIR, {
      stamp: STAMP,
      liveBytes: after,
      vacuumedBytes: after,
    })
    run('chown', [`${OWNER}:${OWNER}`, join(BACKUP_DIR, VACUUM_STATUS_FILE)])
  }
  console.log(
    `${rebuild.done} ${DB}: ${before} -> ${after} bytes (${reclaimPct(before, after)}% reclaimed), ${found.profiles} profiles / ${found.votes} votes — rebuild ${secs(rebuildMs)}, service down ${secs(downtimeMs)}`,
  )
  console.log(
    `the original is kept as ${DB}.replaced-${STAMP} — delete it once this has proven out`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
