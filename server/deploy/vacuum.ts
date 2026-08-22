#!/usr/bin/env -S node --experimental-strip-types
// Compact the cache database: `sudo .../deploy/vacuum.ts [-y]`, by hand and
// never on a timer. See CLAUDE.md and "Compacting the database" in README.md.

import { existsSync, statfsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  OWNER,
  SERVICE,
  bytes,
  die,
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
  servicePort,
  sqlite,
  stamp,
  uid,
} from './lib.ts'

/** `null` for anything this does not understand, so it reports rather than runs. */
export function parseArgs(argv: string[]): { assumeYes: boolean } | null {
  const [flag, ...rest] = argv
  if (rest.length > 0) return null
  if (flag === undefined) return { assumeYes: false }
  if (flag === '-y' || flag === '--yes') return { assumeYes: true }
  return null
}

/** The rebuild sits beside the original, so this is the one script that can
 *  fill the disk the server writes to. */
function freeBytes(directory: string): number | null {
  try {
    const fs = statfsSync(directory)
    return Number(fs.bavail) * Number(fs.bsize)
  } catch {
    return null
  }
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

async function main(): Promise<void> {
  loadEnvFile()

  const DB = process.env.XLOC_DB ?? '/var/lib/x-loc-cache/x-loc-cache.db'
  const PORT = servicePort()

  const args = parseArgs(process.argv.slice(2))
  if (args === null) die(`usage: ${process.argv[1]} [-y]`)

  const before = preflight(DB)
  if (!args.assumeYes) await confirmOrExit(DB)

  const STAMP = stamp()
  // Same directory as the database, so the final mv is atomic (one filesystem).
  const TMP = join(dirname(DB), `vacuum-${STAMP}.db`)
  const guard = guardSwap(DB, `.replaced-${STAMP}`, TMP)

  run('systemctl', ['stop', SERVICE])
  guard.stopped = true

  // Counted with the service down, so nothing can change it before the
  // comparison — which is what makes a shorter rebuild proof of a bad copy.
  const source = sqlite([DB, 'SELECT COUNT(*) FROM profiles;'], OWNER)
  const sourceProfiles = Number(source.out)

  // The whole of the downtime: 0.6 s on a 236 MB database, scaling with it.
  const rebuild = sqlite(
    ['-cmd', '.timeout 5000', DB, `VACUUM INTO '${TMP}'`],
    OWNER,
  )
  if (!rebuild.ok)
    die(`VACUUM INTO failed — keeping the original: ${rebuild.out}`)

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

  if (!(await healthy(PORT))) {
    die(
      `healthz FAILED — journalctl -u ${SERVICE} -n 50`,
      `To put the original back: systemctl stop ${SERVICE}`,
      `  mv ${DB}.replaced-${STAMP} ${DB} && systemctl start ${SERVICE}`,
    )
  }
  console.log('healthz ok')

  const after = bytes(DB)
  console.log(
    `compacted ${DB}: ${before} -> ${after} bytes (${reclaimPct(before, after)}% reclaimed), ${found.profiles} profiles / ${found.votes} votes`,
  )
  console.log(
    `the original is kept as ${DB}.replaced-${STAMP} — delete it once this has proven out`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
