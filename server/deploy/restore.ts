#!/usr/bin/env -S node --experimental-strip-types
// Restore the cache database from a backup taken by backup.ts:
//
//   sudo /opt/x-loc-cache/server/deploy/restore.ts \
//     /var/lib/x-loc-cache/backups/x-loc-cache-<stamp>.db.gz
//
// Verifies the archive BEFORE stopping the service, so a bad one costs no
// downtime, then swaps it in, restarts and health-checks. What it replaced is
// kept as *.replaced-<stamp>; delete those once the restore has proven out.

import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import {
  OWNER,
  SERVICE,
  die,
  guardSwap,
  healthy,
  inspect,
  loadEnvFile,
  moveAside,
  mv,
  run,
  servicePort,
  sqlite,
  stamp,
  uid,
} from './lib.ts'

const ARCHIVE_RE = /^x-loc-cache-\d{8}-\d{6}\.db\.gz$/

/** What an operator gets for a missing argument, or a typo in one. */
export function availableArchives(backupDir: string): string[] {
  if (!existsSync(backupDir)) return []
  return readdirSync(backupDir)
    .filter((name) => ARCHIVE_RE.test(name))
    .sort()
    .map((name) => join(backupDir, name))
}

async function gunzipTo(source: string, target: string): Promise<void> {
  await pipeline(
    createReadStream(source),
    createGunzip(),
    createWriteStream(target),
  )
}

async function main(): Promise<void> {
  loadEnvFile()

  const DB = process.env.XLOC_DB ?? '/var/lib/x-loc-cache/x-loc-cache.db'
  const BACKUP_DIR =
    process.env.XLOC_BACKUP_DIR ?? '/var/lib/x-loc-cache/backups'
  const PORT = servicePort()

  const archive = process.argv[2]
  if (!archive || !existsSync(archive)) {
    console.error(`usage: ${process.argv[1]} <backup.db.gz>`)
    console.error('available:')
    for (const path of availableArchives(BACKUP_DIR)) console.error(path)
    process.exit(1)
  }

  if (uid() !== 0) {
    die('run as root — it drives systemctl and chowns the database')
  }

  const STAMP = stamp()
  // Same directory as the database, so the final mv is atomic (one filesystem).
  const TMP = join(dirname(DB), `restore-${STAMP}.db`)

  const guard = guardSwap(DB, `.replaced-${STAMP}`, TMP)

  // A file that is not gzip at all reaches this as a zlib error; an operator
  // mid-incident is owed the name of the problem, not a stack trace.
  await gunzipTo(archive, TMP).catch((err: unknown) =>
    die(
      `could not unpack ${archive}, service untouched.`,
      String(err instanceof Error ? err.message : err),
    ),
  )

  const found = inspect(TMP)
  if (found.integrity !== 'ok' || found.profiles === null) {
    die(
      'backup failed verification, service untouched.',
      `integrity_check: ${found.integrity}`,
    )
  }

  run('systemctl', ['stop', SERVICE])
  guard.stopped = true

  // Kept, not deleted: it is either corrupt evidence or the state being rolled
  // back.
  moveAside(DB, `.replaced-${STAMP}`)

  run('chown', [`${OWNER}:${OWNER}`, TMP])
  const swap = mv(TMP, DB)
  if (!swap.ok) die(`could not put the restored database in place: ${swap.out}`)
  guard.swapped = true

  run('systemctl', ['start', SERVICE])
  guard.stopped = false

  if (!(await healthy(PORT))) {
    die(`healthz FAILED — journalctl -u ${SERVICE} -n 50`)
  }
  console.log('healthz ok')

  const counted = sqlite(
    [
      DB,
      'SELECT (SELECT COUNT(*) FROM profiles) AS profiles, (SELECT COUNT(*) FROM location_votes) AS votes;',
    ],
    OWNER,
  )
  console.log(counted.out)
  console.log(
    `restored ${archive} -> ${DB}; previous files kept as ${DB}.replaced-${STAMP}`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
