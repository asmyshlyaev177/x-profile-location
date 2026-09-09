#!/usr/bin/env -S node --experimental-strip-types
// Compact the cache database: `sudo .../deploy/vacuum.ts [-y]`, by hand and
// never on a timer. See CLAUDE.md and "Compacting the database" in README.md.

import { existsSync } from 'node:fs'
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
  die,
  freeBytes,
  guardSwap,
  healthy,
  humanSize,
  inspect,
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
} from './lib.ts'

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

  const STAMP = stamp()
  // Same directory as the database, so the final mv is atomic (one filesystem).
  const TMP = join(dirname(DB), `vacuum-${STAMP}.db`)
  const guard = guardSwap(DB, `.replaced-${STAMP}`, TMP)

  const stoppedAt = Date.now()
  run('systemctl', ['stop', SERVICE])
  guard.stopped = true

  // Counted with the service down, so nothing can change it before the
  // comparison — which is what makes a shorter rebuild proof of a bad copy.
  const source = sqlite([DB, 'SELECT COUNT(*) FROM profiles;'], OWNER)
  const sourceProfiles = Number(source.out)

  // The whole of the downtime: 0.6 s on a 236 MB database, scaling with it.
  const rebuildStartedAt = Date.now()
  const rebuild = sqlite(
    ['-cmd', '.timeout 5000', DB, `VACUUM INTO '${TMP}'`],
    OWNER,
  )
  if (!rebuild.ok)
    die(`VACUUM INTO failed — keeping the original: ${rebuild.out}`)
  const rebuildMs = Date.now() - rebuildStartedAt

  // The checks backup.ts runs on a snapshot, plus the count taken above.
  const found = inspect(TMP, OWNER)
  const short = found.profiles === null || found.profiles < sourceProfiles
  if (found.integrity !== 'ok' || found.votes === null || short) {
    die(
      'the rebuilt database failed verification — keeping the original.',
      `integrity_check: ${found.integrity}`,
      `profiles: ${found.profiles} rebuilt vs ${sourceProfiles} live`,
    )
  }

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
    die(
      `healthz FAILED — journalctl -u ${SERVICE} -n 50`,
      `To put the original back: systemctl stop ${SERVICE}`,
      `  mv ${DB}.replaced-${STAMP} ${DB} && systemctl start ${SERVICE}`,
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
    `compacted ${DB}: ${before} -> ${after} bytes (${reclaimPct(before, after)}% reclaimed), ${found.profiles} profiles / ${found.votes} votes — rebuild ${secs(rebuildMs)}, service down ${secs(downtimeMs)}`,
  )
  console.log(
    `the original is kept as ${DB}.replaced-${STAMP} — delete it once this has proven out`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
