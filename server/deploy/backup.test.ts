// Tests for deploy/backup.ts and deploy/restore.ts.
//
// Deliberately NOT part of `pnpm test`: vitest.config.ts includes only
// `src/**`, this suite has its own config, and CI never runs it. It shells out
// to sqlite3, gzip, flock and the stub shims on PATH against real databases on
// disk — the point is to exercise the shipped scripts, not a re-implementation
// of them, so there is nothing here that a mock could stand in for.
//
//   pnpm test:deploy
//
// The load tests are the reason this file exists. The obvious alternative,
// SQLite's `.backup`, restarts from scratch whenever another connection writes,
// so on a server taking contributions it finishes only once writes stop: 11s
// against a 7.6MB database with a writer running, versus 0.03s for VACUUM INTO.
// A backup that never converges is invisible in every other test, because with
// an idle database both are fast and correct.

import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isOutOfSpace } from './alert.ts'
import { autoVacuumPct, rootRefusal } from './backup.ts'

const DEPLOY = import.meta.dirname
const SERVER = join(DEPLOY, '..')
const BACKUP = join(DEPLOY, 'backup.ts')
const RESTORE = join(DEPLOY, 'restore.ts')
const VACUUM = join(DEPLOY, 'vacuum.ts')

function available(cmd: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0
}

const MISSING = ['sqlite3', 'gzip', 'flock'].filter((c) => !available(c))

let dir = ''
let dbPath = ''
let backupDir = ''

/** A clean environment: the developer's own XLOC_* must not leak in. */
function envFor(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('XLOC_')) base[k] = v
  }
  return {
    ...base,
    // The scripts source /etc/x-loc-cache.env, which on a real box wins over
    // the caller's environment. Point that at nothing so the tests are not at
    // the mercy of whether this machine happens to be a deployment.
    XLOC_ENV_FILE: join(dir, 'absent.env'),
    XLOC_DB: dbPath,
    XLOC_BACKUP_DIR: backupDir,
    ...extra,
  }
}

function run(
  script: string,
  args: string[],
  extra: Record<string, string> = {},
) {
  const [command, argv] = script.endsWith('.ts')
    ? [process.execPath, ['--experimental-strip-types', script, ...args]]
    : ['sh', [script, ...args]]
  return spawnSync(command!, argv!, {
    env: envFor(extra),
    encoding: 'utf8',
  })
}

/** Executable shims on PATH, for the things a test cannot really do. */
function stubs(
  named: Record<string, string>,
  extra: Record<string, string> = {},
) {
  const binDir = join(dir, `stub-${Math.random().toString(36).slice(2)}`)
  mkdirSync(binDir, { recursive: true })
  for (const [name, body] of Object.entries(named)) {
    const file = join(binDir, name)
    writeFileSync(file, `#!/bin/sh\n${body}\n`)
    chmodSync(file, 0o755)
  }
  return { PATH: `${binDir}:${process.env.PATH}`, ...extra }
}

/** The real sqlite3, for stubs that intercept one query and pass the rest. */
function realSqlite3(): string {
  return spawnSync('sh', ['-c', 'command -v sqlite3'], {
    encoding: 'utf8',
  }).stdout.trim()
}

function seed(file: string, profiles: number): void {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(readFileSync(join(SERVER, 'schema.sql'), 'utf8'))
  const insProfile = db.prepare(
    'INSERT OR REPLACE INTO profiles (username, location, source, location_accurate, location_confidence, updated_at) VALUES (?,?,?,?,?,?)',
  )
  const insVote = db.prepare(
    'INSERT OR REPLACE INTO location_votes (username, client_id, location, source, location_accurate, seen_at) VALUES (?,?,?,?,?,?)',
  )
  const fill = db.transaction((n: number) => {
    for (let i = 0; i < n; i++) {
      insProfile.run(`seeded-${i}`, 'United States', 'web', 1, 1, Date.now())
      for (let c = 0; c < 3; c++) {
        insVote.run(
          `seeded-${i}`,
          `client-${c}`,
          'United States',
          'web',
          1,
          Date.now(),
        )
      }
    }
  })
  fill(profiles)
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}

describe('backup.ts — the run it refuses', () => {
  it('will not run as root, and says how to run it properly', () => {
    const refusal = rootRefusal(0, '/opt/x-loc-cache/server/deploy/backup.ts')
    expect(refusal?.[0]).toContain('refusing to run as root')
    expect(refusal?.[1]).toContain('sudo -u xloc')
  })

  it('runs for anyone else', () => {
    expect(rootRefusal(1000, '/whatever')).toBeNull()
  })
})

describe('backup.ts — the auto vacuum threshold', () => {
  it('defaults to 20% and accepts an override, 0 meaning off', () => {
    expect(autoVacuumPct(undefined)).toBe(20)
    expect(autoVacuumPct('')).toBe(20)
    expect(autoVacuumPct('35')).toBe(35)
    expect(autoVacuumPct('0')).toBe(0)
  })

  it('disables on a value that is not a percentage — a typo must never vacuum', () => {
    for (const raw of ['lots', '-5', '150', '20%']) {
      expect(autoVacuumPct(raw)).toBe(0)
    }
  })
})

/**
 * Profiles whose only votes are past the retention window — the rows the next
 * retention pass deletes, and the ones backup.ts's baseline must not count.
 */
function addExpiredProfiles(n: number): void {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  const stale = Date.now() - 61 * 24 * 60 * 60 * 1000
  const insProfile = db.prepare(
    'INSERT OR REPLACE INTO profiles (username, location, source, location_accurate, location_confidence, updated_at) VALUES (?,?,?,?,?,?)',
  )
  const insVote = db.prepare(
    'INSERT OR REPLACE INTO location_votes (username, client_id, location, source, location_accurate, seen_at) VALUES (?,?,?,?,?,?)',
  )
  const fill = db.transaction((count: number) => {
    for (let i = 0; i < count; i++) {
      insProfile.run(`expired-${i}`, 'Japan', 'web', 1, 1, stale)
      insVote.run(`expired-${i}`, 'old-client', 'Japan', 'web', 1, stale)
    }
  })
  fill(n)
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}

/**
 * Kept archives, by the exact name backup.ts gives them. Matching a bare
 * `.db.gz` would also sweep in `corrupt-evidence.db.gz`, which is not an
 * archive and is the one file whose presence means backups are failing.
 */
function archives(): string[] {
  if (!existsSync(backupDir)) return []
  return readdirSync(backupDir)
    .filter((f) => /^x-loc-cache-\d{8}-\d{6}\.db\.gz$/.test(f))
    .sort()
}

/** The two sizes backup.ts records for the heartbeat, parsed as it writes them. */
function vacuumStatus(): Record<string, string> {
  const raw = readFileSync(join(backupDir, '.vacuum-status'), 'utf8')
  const fields: Record<string, string> = {}
  for (const line of raw.trim().split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) fields[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return fields
}

/** Main file plus any un-checkpointed WAL, the way the scripts count it. */
function liveBytes(file = dbPath): number {
  let total = 0
  for (const suffix of ['', '-wal']) {
    if (existsSync(file + suffix)) total += statSync(file + suffix).size
  }
  return total
}

/**
 * Free pages, the way a database really acquires them: one mass delete, not
 * steady churn. Retention deletes votes where new ones land, so those pages
 * come straight back — this is the one-off the whole measurement exists for.
 */
function emptyVotes(): void {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec('DELETE FROM location_votes')
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}

function corrupt(file: string): void {
  // Overwrite pages well past the header: the file still opens, and the damage
  // is only found by reading it.
  const fd = readFileSync(file)
  for (let i = 40_000; i < Math.min(80_000, fd.length); i++)
    fd[i] = (i * 7) & 0xff
  writeFileSync(file, fd)
}

/** Restore a .gz into a plain file and open it. */
function openArchive(gz: string): Database.Database {
  const out = join(dir, `opened-${Math.random().toString(36).slice(2)}.db`)
  const r = spawnSync('sh', ['-c', `gunzip -c '${gz}' > '${out}'`])
  expect(r.status).toBe(0)
  return new Database(out, { readonly: true })
}

// One transaction writes to BOTH tables, so a snapshot that caught a
// half-applied commit shows a count mismatch.
// Arguments come through the environment, not argv: with \`node -e\` there is no
// script path in argv, so the usual slice(2) silently drops the first one.
const WRITER = `
const Database = require('better-sqlite3')
const file = process.env.LOAD_DB
const seconds = process.env.LOAD_SECONDS
const db = new Database(file)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('busy_timeout = 5000')
const p = db.prepare('INSERT OR REPLACE INTO profiles (username, location, source, location_accurate, location_confidence, updated_at) VALUES (?,?,?,?,?,?)')
const v = db.prepare('INSERT OR REPLACE INTO location_votes (username, client_id, location, source, location_accurate, seen_at) VALUES (?,?,?,?,?,?)')
const tx = db.transaction(n => {
  for (let i = 0; i < 10; i++) {
    const u = 'load-' + (n + i)
    p.run(u, 'United States', 'web', 1, 1, Date.now())
    v.run(u, 'load-writer', 'United States', 'web', 1, Date.now())
  }
})
const end = Date.now() + Number(seconds) * 1000
let written = 0, errors = 0
while (Date.now() < end) { try { tx(written); written += 10 } catch { errors++ } }
console.log(JSON.stringify({ written, errors }))
`

function startWriter(seconds: number): ChildProcess {
  const child = spawn('node', ['-e', WRITER], {
    cwd: SERVER, // so require('better-sqlite3') resolves
    env: { ...process.env, LOAD_DB: dbPath, LOAD_SECONDS: String(seconds) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // A writer that dies on startup would otherwise look like a passing test.
  child.stderr?.on('data', (c: Buffer) => {
    throw new Error(`load writer failed: ${c.toString()}`)
  })
  return child
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'x-loc-backup-'))
  dbPath = join(dir, 'x-loc-cache.db')
  backupDir = join(dir, 'backups')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(MISSING.length > 0)(
  `backup.ts${MISSING.length ? ` (skipped: missing ${MISSING.join(', ')})` : ''}`,
  () => {
    it('writes a verified, restorable snapshot of every row', () => {
      seed(dbPath, 200)
      const r = run(BACKUP, [])
      expect(r.stderr).toBe('')
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('backup ok')
      // journalctl -u x-loc-backup answers "how long does it take" directly.
      expect(r.stdout).toMatch(/— snapshot \d+\.\ds, total \d+\.\ds/)

      const [only] = archives()
      expect(only).toMatch(/^x-loc-cache-\d{8}-\d{6}\.db\.gz$/)

      const restored = openArchive(join(backupDir, only!))
      expect(restored.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(restored.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual(
        { n: 200 },
      )
      expect(
        restored.prepare('SELECT COUNT(*) n FROM location_votes').get(),
      ).toEqual({ n: 600 })
      restored.close()
    })

    it('leaves no working files behind', () => {
      seed(dbPath, 50)
      expect(run(BACKUP, []).status).toBe(0)
      const stray = readdirSync(backupDir).filter(
        (f) => f.endsWith('.db') || f.endsWith('.part'),
      )
      expect(stray).toEqual([])
    })

    it('keeps the newest XLOC_BACKUP_KEEP archives and drops the rest', () => {
      seed(dbPath, 20)
      mkdirSync(backupDir, { recursive: true })
      for (const stamp of [
        '20200101-000000',
        '20210101-000000',
        '20220101-000000',
      ]) {
        writeFileSync(join(backupDir, `x-loc-cache-${stamp}.db.gz`), 'old')
      }
      expect(run(BACKUP, [], { XLOC_BACKUP_KEEP: '2' }).status).toBe(0)

      const kept = archives()
      expect(kept).toHaveLength(2)
      // Names embed a UTC stamp, so the survivors are the two newest.
      expect(kept[0]).toBe('x-loc-cache-20220101-000000.db.gz')
      expect(kept[1]).toMatch(/^x-loc-cache-20\d{6}-\d{6}\.db\.gz$/)
    })

    it('keeps five archives by default — ten days at one run every other day', () => {
      seed(dbPath, 20)
      mkdirSync(backupDir, { recursive: true })
      for (const stamp of [
        '20200101-000000',
        '20210101-000000',
        '20220101-000000',
        '20230101-000000',
        '20240101-000000',
        '20250101-000000',
      ]) {
        writeFileSync(join(backupDir, `x-loc-cache-${stamp}.db.gz`), 'old')
      }
      expect(run(BACKUP, []).status).toBe(0)

      // archives() lists oldest first: the two 2020/2021 stamps aged out and
      // tonight's is the newest of the five.
      const kept = archives()
      expect(kept).toHaveLength(5)
      expect(kept.slice(0, 4)).toEqual([
        'x-loc-cache-20220101-000000.db.gz',
        'x-loc-cache-20230101-000000.db.gz',
        'x-loc-cache-20240101-000000.db.gz',
        'x-loc-cache-20250101-000000.db.gz',
      ])
      expect(kept[4]).toMatch(/^x-loc-cache-20\d{6}-\d{6}\.db\.gz$/)
    })

    it('rejects a non-numeric XLOC_BACKUP_KEEP instead of silently never pruning', () => {
      // A value that is not a count must stop the run, not fall through to a
      // comparison that quietly reads as "keep nothing" or "prune nothing".
      seed(dbPath, 20)
      const r = run(BACKUP, [], { XLOC_BACKUP_KEEP: '7d' })
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('XLOC_BACKUP_KEEP must be a positive integer')
      expect(archives()).toEqual([])
    })

    it('rejects XLOC_BACKUP_KEEP=0, which would prune everything', () => {
      seed(dbPath, 20)
      expect(run(BACKUP, [], { XLOC_BACKUP_KEEP: '0' }).status).toBe(1)
    })

    it('records what a vacuum would reclaim, since it just measured it', () => {
      // The snapshot IS the database rebuilt from scratch, so the two sizes
      // are a measurement of what a VACUUM would hand back — not an estimate,
      // and not a second pass over the file to obtain.
      seed(dbPath, 200)
      const before = liveBytes()
      const r = run(BACKUP, [])
      expect(r.status).toBe(0)

      const status = vacuumStatus()
      expect(status.stamp).toMatch(/^\d{8}-\d{6}$/)
      expect(Number(status.live_bytes)).toBe(before)
      expect(Number(status.vacuumed_bytes)).toBeGreaterThan(0)
      // Journal line and file agree, so `journalctl -u x-loc-backup` answers
      // the question without anyone opening the status file.
      const live = Number(status.live_bytes)
      const pct = Math.round(
        ((live - Number(status.vacuumed_bytes)) / live) * 100,
      )
      expect(r.stdout).toContain(`vacuum check: ${pct}%`)
    })

    it('sees the free space a mass delete leaves behind', () => {
      seed(dbPath, 600)
      emptyVotes()
      // Measurement only: the auto vacuum below the assertions is off, so the
      // status file records the bloated live size rather than the fixed one.
      const r = run(BACKUP, [], { XLOC_AUTO_VACUUM_PCT: '0' })
      expect(r.status).toBe(0)
      expect(r.stdout).not.toContain('auto vacuum:')

      const status = vacuumStatus()
      const live = Number(status.live_bytes)
      const pct = Math.round(
        ((live - Number(status.vacuumed_bytes)) / live) * 100,
      )
      // The deleted pages stay in the file on the freelist; only the rebuild
      // gives them back. Well past the 25% the heartbeat asks about.
      expect(pct).toBeGreaterThan(25)
      expect(Number(status.vacuumed_bytes)).toBeLessThan(live)
    })

    it('never touches the live database itself, whatever it measures', () => {
      seed(dbPath, 600)
      emptyVotes()
      const before = liveBytes()
      const r = run(BACKUP, []) // default threshold: 20%
      expect(r.status).toBe(0)

      // A live in-place VACUUM holds the write lock for its whole duration, and
      // this process runs as xloc and cannot stop the service around it. It
      // records the measurement; x-loc-vacuum.service acts on it.
      expect(liveBytes()).toBe(before)
      expect(r.stdout).toContain('vacuum check:')

      const status = vacuumStatus()
      expect(Number(status.live_bytes)).toBe(before)
      expect(Number(status.vacuumed_bytes)).toBeLessThan(before)
    })

    it('reports a garbled threshold from the run that measures it', () => {
      seed(dbPath, 600)
      emptyVotes()
      const r = run(BACKUP, [], { XLOC_AUTO_VACUUM_PCT: 'lots' })
      expect(r.status).toBe(0)
      // Caught here rather than only in vacuum.ts, which runs afterwards: this
      // is the log an operator reads when a backup looks wrong.
      expect(r.stderr).toContain('XLOC_AUTO_VACUUM_PCT must be 0-100')
    })

    it('never lets the status file pass for an archive', () => {
      // It lives in the backups directory, so every glob that rotates or
      // restores archives gets to see it.
      seed(dbPath, 20)
      expect(run(BACKUP, [], { XLOC_BACKUP_KEEP: '1' }).status).toBe(0)
      expect(run(BACKUP, [], { XLOC_BACKUP_KEEP: '1' }).status).toBe(0)

      expect(existsSync(join(backupDir, '.vacuum-status'))).toBe(true)
      expect(archives()).toHaveLength(1)
      expect(readdirSync(backupDir).filter((f) => f.endsWith('.part'))).toEqual(
        [],
      )
      const usage = run(RESTORE, [], stubs({ id: 'echo 0' }))
      expect(usage.stderr).not.toContain('vacuum-status')
    })

    it('backs up a database with nothing in it yet', () => {
      // A fresh deploy: schema, no rows. The baseline is 0, and 0 profiles is
      // not short of it — a first night reporting failure would look like
      // corruption on a box that is merely new.
      seed(dbPath, 0)
      const r = run(BACKUP, [])
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('backup ok')

      const restored = openArchive(join(backupDir, archives()[0]!))
      expect(restored.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual(
        { n: 0 },
      )
      restored.close()
    })

    it('backs up a database whose every profile has already expired', () => {
      // The same 0 baseline reached the other way: every row is there and every
      // one is past the window, so the next retention pass takes all of them.
      seed(dbPath, 0)
      addExpiredProfiles(5)
      const r = run(BACKUP, [])
      expect(r.status).toBe(0)

      const restored = openArchive(join(backupDir, archives()[0]!))
      expect(restored.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual(
        { n: 5 },
      )
      restored.close()
    })

    it('sweeps what a killed run left, and only that', () => {
      seed(dbPath, 20)
      mkdirSync(backupDir, { recursive: true })
      const leftovers = [
        'x-loc-cache-20200101-000000.db',
        'x-loc-cache-20200101-000000.db.gz.part',
        'corrupt-evidence.db.gz.part',
        '.vacuum-status.part',
      ]
      // Evidence is never swept: it is the only copy of a database that failed
      // its check, and it outlives the run that produced it.
      const keepers = [
        'x-loc-cache-20200102-000000.db.gz',
        'corrupt-evidence.db.gz',
      ]
      for (const name of [...leftovers, ...keepers]) {
        writeFileSync(join(backupDir, name), 'leftover')
      }

      expect(run(BACKUP, [], { XLOC_BACKUP_KEEP: '5' }).status).toBe(0)

      for (const name of leftovers) {
        expect(existsSync(join(backupDir, name))).toBe(false)
      }
      for (const name of keepers) {
        expect(existsSync(join(backupDir, name))).toBe(true)
      }
      expect(archives()).toHaveLength(2)
    })

    it('refuses a second concurrent run rather than racing it', () => {
      seed(dbPath, 20)
      mkdirSync(backupDir, { recursive: true })
      const lock = join(backupDir, '.backup.lock')
      const holder = spawn('sh', ['-c', `flock -n '${lock}' sleep 3`])
      try {
        // Give flock time to take it; without the lock this would just succeed.
        spawnSync('sh', ['-c', 'sleep 0.3'])
        const r = run(BACKUP, [])
        expect(r.status).toBe(75)
        expect(r.stderr).toContain('another backup is already running')
        expect(archives()).toEqual([])
      } finally {
        holder.kill()
      }
    })
  },
)

describe.skipIf(MISSING.length > 0)('backup.ts — the disk preflight', () => {
  /** The same number the script reads, from the same filesystem. */
  function free(): number {
    const fs = statfsSync(backupDir)
    return Number(fs.bavail) * Number(fs.bsize)
  }

  /** Sizes are read with stat(), so a hole drives the preflight without ever
   *  filling a real disk. */
  function sparseArchive(stamp: string, size: number): void {
    const file = join(backupDir, `x-loc-cache-${stamp}.db.gz`)
    writeFileSync(file, '')
    truncateSync(file, size)
  }

  const MB = 1024 * 1024

  it('trades the oldest archives for the run, and only as many as it needs', () => {
    seed(dbPath, 200)
    mkdirSync(backupDir, { recursive: true })
    // Tonight's archive is estimated from the newest on disk, so an outsized
    // one is what puts the run past the space it has.
    sparseArchive('20260105-000000', free() + 100 * MB)
    for (const old of ['20260104', '20260103', '20260102', '20260101']) {
      sparseArchive(`${old}-000000`, 500 * MB)
    }

    // Rotation is a separate prune; a high keep leaves only the preflight's.
    const r = run(BACKUP, [], { XLOC_BACKUP_KEEP: '20' })
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('pruned x-loc-cache-20260101-000000.db.gz')
    expect(r.stderr).not.toContain('20260102')

    const kept = archives()
    expect(kept.slice(0, 4)).toEqual([
      'x-loc-cache-20260102-000000.db.gz',
      'x-loc-cache-20260103-000000.db.gz',
      'x-loc-cache-20260104-000000.db.gz',
      'x-loc-cache-20260105-000000.db.gz',
    ])
    expect(kept[4]).toMatch(/^x-loc-cache-20\d{6}-\d{6}\.db\.gz$/)
  })

  it('refuses the run rather than pruning down to the last archive', () => {
    seed(dbPath, 200)
    mkdirSync(backupDir, { recursive: true })
    const before = liveBytes()
    sparseArchive('20260105-000000', free() * 2)
    for (const old of ['20260104', '20260103', '20260102', '20260101']) {
      sparseArchive(`${old}-000000`, 1024)
    }

    const r = run(BACKUP, [])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('not enough disk for a backup')
    // Checked against the classifier rather than a copy of its strings: this is
    // the difference between an OUT OF DISK email and a generic one.
    expect(isOutOfSpace(r.stderr)).toBe(true)

    // MIN_KEEP survivors, no new archive, and nothing half-written.
    expect(archives()).toEqual([
      'x-loc-cache-20260104-000000.db.gz',
      'x-loc-cache-20260105-000000.db.gz',
    ])
    expect(
      readdirSync(backupDir).filter(
        (f) => f.endsWith('.part') || f.endsWith('.db'),
      ),
    ).toEqual([])
    expect(liveBytes()).toBe(before)
  })

  it('never spends the corruption evidence to make room', () => {
    // It is not an archive and never counts as one, so a shortfall must not
    // reach the copy closest to the onset of a fault.
    seed(dbPath, 200)
    mkdirSync(backupDir, { recursive: true })
    const evidence = join(backupDir, 'corrupt-evidence.db.gz')
    writeFileSync(evidence, 'evidence')
    sparseArchive('20260103-000000', free() * 2)
    sparseArchive('20260102-000000', 1024)
    sparseArchive('20260101-000000', 1024)

    expect(run(BACKUP, []).status).not.toBe(0)
    expect(existsSync(evidence)).toBe(true)
    expect(archives()).toHaveLength(2)
  })

  it('reports a disk that filled after the preflight passed as a disk problem', () => {
    // The estimate comes from the newest archive, and another process can eat
    // the difference while the snapshot is being written. SQLite's own words
    // have to reach the classifier, or that night gets a generic email.
    seed(dbPath, 200)
    const r = run(
      BACKUP,
      [],
      stubs({
        sqlite3: `
case "$*" in
  *"VACUUM INTO"*)
    echo "Error: near line 1: database or disk is full" >&2
    exit 1 ;;
esac
exec ${realSqlite3()} "$@"`,
      }),
    )

    expect(r.status).not.toBe(0)
    expect(isOutOfSpace(r.stderr)).toBe(true)
    expect(archives()).toEqual([])
  })

  it('takes the backup when the disk has room, however few archives there are', () => {
    // spaceNeeded() budgets twice the live file with nothing to estimate from.
    // A fresh box must still get its first backup.
    seed(dbPath, 200)
    const r = run(BACKUP, [])
    expect(r.status).toBe(0)
    expect(r.stderr).toBe('')
    expect(archives()).toHaveLength(1)
  })
})

describe.skipIf(MISSING.length > 0)(
  'backup.ts — a database it must not trust',
  () => {
    it('fails on a corrupt source, keeps the evidence, and prunes nothing', () => {
      seed(dbPath, 400)
      mkdirSync(backupDir, { recursive: true })
      writeFileSync(
        join(backupDir, 'x-loc-cache-20200101-000000.db.gz'),
        'precious',
      )
      corrupt(dbPath)

      const r = run(BACKUP, [], { XLOC_BACKUP_KEEP: '1' })
      expect(r.status).not.toBe(0)
      // KEEP=1 would have dropped the older archive had pruning been reached.
      expect(archives()).toEqual(['x-loc-cache-20200101-000000.db.gz'])
    })

    it('fails on a source with no tables, which integrity_check alone calls "ok"', () => {
      // Never seeded: sqlite3 happily reports an empty file as healthy, so the
      // COUNT probe is the only thing standing between that and a "good" backup.
      const r = run(BACKUP, [])
      expect(r.status).not.toBe(0)
      expect(archives()).toEqual([])
    })

    it('fails when the snapshot holds fewer profiles than the source did', () => {
      seed(dbPath, 300)
      mkdirSync(backupDir, { recursive: true })
      writeFileSync(
        join(backupDir, 'x-loc-cache-20200101-000000.db.gz'),
        'precious',
      )
      // Report a plausible but short count for the snapshot's COUNT query only.
      const real = spawnSync('sh', ['-c', 'command -v sqlite3'], {
        encoding: 'utf8',
      }).stdout.trim()
      const r = run(
        BACKUP,
        [],
        stubs(
          {
            sqlite3: `
case "$*" in
  *"COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes"*) echo 7; echo 9; exit 0 ;;
esac
exec ${real} "$@"`,
          },
          { XLOC_BACKUP_KEEP: '1' },
        ),
      )
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('7 in snapshot vs 300 in the source')
      expect(existsSync(join(backupDir, 'corrupt-evidence.db.gz'))).toBe(true)
      expect(archives()).toEqual(['x-loc-cache-20200101-000000.db.gz'])
    })

    it('accepts a snapshot short by exactly what retention could have taken', () => {
      // Retention can land inside the copy and take profiles whose last vote
      // just aged out. The baseline excludes exactly those 50.
      seed(dbPath, 300)
      addExpiredProfiles(50)
      const real = spawnSync('sh', ['-c', 'command -v sqlite3'], {
        encoding: 'utf8',
      }).stdout.trim()
      const r = run(
        BACKUP,
        [],
        stubs({
          sqlite3: `
case "$*" in
  *"COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes"*) echo 300; echo 900; exit 0 ;;
esac
exec ${real} "$@"`,
        }),
      )
      expect(r.stderr).toBe('')
      expect(r.status).toBe(0)
      expect(archives()).toHaveLength(1)
    })

    it('keeps ONE evidence file however many nights in a row it fails', () => {
      // Whatever gets here is usually permanent — an index out of sync with
      // its table survives VACUUM INTO verbatim — so a stamped file per run
      // would add a database-sized file every night, on the disk the live
      // database writes to, until it fills. A full disk stops the server
      // accepting contributions and leaves no room to restore into.
      seed(dbPath, 300)
      const real = spawnSync('sh', ['-c', 'command -v sqlite3'], {
        encoding: 'utf8',
      }).stdout.trim()
      const short = stubs({
        sqlite3: `
case "$*" in
  *"COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes"*) echo 7; echo 9; exit 0 ;;
esac
exec ${real} "$@"`,
      })

      for (let night = 0; night < 4; night++) {
        expect(run(BACKUP, [], short).status).toBe(1)
      }

      expect(
        readdirSync(backupDir).filter((f) => f.includes('corrupt')),
      ).toEqual(['corrupt-evidence.db.gz'])
      // Compressed, not a raw database-sized copy.
      const raw = readFileSync(join(backupDir, 'corrupt-evidence.db.gz'))
      expect([raw[0], raw[1]]).toEqual([0x1f, 0x8b]) // gzip magic
      expect(readdirSync(backupDir).filter((f) => f.endsWith('.part'))).toEqual(
        [],
      )
    })

    it('never mistakes the evidence for a restorable archive', () => {
      seed(dbPath, 50)
      mkdirSync(backupDir, { recursive: true })
      writeFileSync(join(backupDir, 'corrupt-evidence.db.gz'), 'evidence')

      // A successful run must neither count it nor prune it...
      const r = run(BACKUP, [], { XLOC_BACKUP_KEEP: '1' })
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('1 kept') // the archive, not the evidence
      expect(existsSync(join(backupDir, 'corrupt-evidence.db.gz'))).toBe(true)
      expect(archives()).toHaveLength(1)

      // ...and restore.ts must not offer it as something to restore from.
      const usage = run(RESTORE, [], stubs({ id: 'echo 0' }))
      expect(usage.stderr).toContain('available:')
      expect(usage.stderr).not.toContain('corrupt-evidence')
    })

    it('reports a corrupt live database after storing the snapshot, and prunes nothing', () => {
      // VACUUM INTO rebuilds, so a clean snapshot no longer vouches for its
      // source — this is the check that keeps the corruption monitor honest.
      // Only the live file's integrity_check is faked; everything else is real.
      seed(dbPath, 100)
      mkdirSync(backupDir, { recursive: true })
      writeFileSync(
        join(backupDir, 'x-loc-cache-20200101-000000.db.gz'),
        'precious',
      )
      const real = spawnSync('sh', ['-c', 'command -v sqlite3'], {
        encoding: 'utf8',
      }).stdout.trim()
      const r = run(
        BACKUP,
        [],
        stubs(
          {
            sqlite3: `
case "$*" in
  *integrity_check*"${dbPath}"* | *"${dbPath}"*integrity_check*)
    echo "*** in database main ***"
    echo "wrong # of entries in index sqlite_autoindex_profiles_1"
    exit 0 ;;
esac
exec ${real} "$@"`,
          },
          { XLOC_BACKUP_KEEP: '1' },
        ),
      )
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('the LIVE database failed integrity_check')
      // Tonight's snapshot is kept — a rebuilt copy of a failing database is
      // worth having — and the older archive is not pruned despite KEEP=1.
      expect(archives()).toHaveLength(2)
    })
  },
)

describe.skipIf(MISSING.length > 0)('backup.ts — under write load', () => {
  it('finishes while the database is still being written to', async () => {
    // The regression test. With `.backup` this returned only once the writer
    // stopped, because the backup API restarts on every external commit.
    seed(dbPath, 3000)
    const writer = startWriter(20)
    await new Promise((r) => setTimeout(r, 1500)) // let it build a WAL

    const started = Date.now()
    const r = run(BACKUP, [])
    const elapsed = Date.now() - started
    // Yield first: run() is spawnSync, so the event loop was blocked and the
    // writer's exit could not have been delivered yet — reading exitCode
    // straight away would report "still running" no matter what happened.
    await new Promise((r2) => setTimeout(r2, 0))
    const writerStillGoing = writer.exitCode === null
    writer.kill()

    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    // The assertion that matters is not the clock but the ordering: the
    // backup completed while writes were still arriving.
    expect(writerStillGoing).toBe(true)
    expect(elapsed).toBeLessThan(10_000)
  }, 60_000)

  it('captures no half-applied transaction, and leaves the live database intact', async () => {
    seed(dbPath, 2000)
    const writer = startWriter(12)
    const wrote = new Promise<string>((resolve) => {
      let out = ''
      writer.stdout?.on('data', (c: Buffer) => (out += c.toString()))
      writer.on('close', () => resolve(out))
    })
    await new Promise((r) => setTimeout(r, 1000))

    expect(run(BACKUP, []).status).toBe(0)
    expect(run(BACKUP, []).status).toBe(0)
    const summary = JSON.parse(await wrote) as {
      written: number
      errors: number
    }

    // The backup must not have cost the server a single write.
    expect(summary.errors).toBe(0)
    expect(summary.written).toBeGreaterThan(0)

    for (const gz of archives()) {
      const snap = openArchive(join(backupDir, gz))
      expect(snap.pragma('integrity_check', { simple: true })).toBe('ok')
      const profiles = snap
        .prepare("SELECT COUNT(*) n FROM profiles WHERE username LIKE 'load-%'")
        .get() as { n: number }
      const votes = snap
        .prepare(
          "SELECT COUNT(*) n FROM location_votes WHERE client_id = 'load-writer'",
        )
        .get() as { n: number }
      // Each writer transaction inserts one of each; a torn snapshot differs.
      expect(profiles.n).toBe(votes.n)
      snap.close()
    }

    const live = new Database(dbPath, { readonly: true })
    expect(live.pragma('integrity_check', { simple: true })).toBe('ok')
    live.close()
  }, 60_000)
})

describe.skipIf(MISSING.length > 0)('vacuum.ts', () => {
  /** systemctl/curl/chown/sudo/id, so the script can run outside a real box. */
  function vacuumStubs(log: string, extra: Record<string, string> = {}) {
    return stubs(
      {
        id: 'echo 0',
        systemctl: `echo "systemctl $*" >> '${log}'`,
        chown: `echo "chown $*" >> '${log}'`,
        curl: 'exit 0',
        sudo: 'shift 2; exec "$@"',
        ...extra,
      },
      { XLOC_PORT: '8787' },
    )
  }

  function replaced(): string[] {
    return readdirSync(dir).filter((f) => f.includes('.replaced-'))
  }

  it('--if-needed rebuilds off the backup measurement, and only past it', () => {
    seed(dbPath, 600)
    emptyVotes()
    const log = join(dir, 'systemctl.log')

    // No measurement yet: a rebuild is the last thing to do to a database no
    // backup has a verified copy of.
    const cold = run(VACUUM, ['--if-needed'], vacuumStubs(log))
    expect(cold.status).toBe(0)
    expect(cold.stdout).toContain('no measurement')

    expect(run(BACKUP, []).status).toBe(0)
    const bloated = liveBytes()
    expect(Number(vacuumStatus().live_bytes)).toBe(bloated)

    const r = run(VACUUM, ['--if-needed'], vacuumStubs(log))
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('reclaimable')
    expect(r.stdout).toContain('healthz ok')
    expect(liveBytes()).toBeLessThan(bloated)

    // The measurement it acted on is refreshed, so a second trigger is a no-op
    // rather than a second rebuild.
    expect(Number(vacuumStatus().live_bytes)).toBe(liveBytes())
    const again = run(VACUUM, ['--if-needed'], vacuumStubs(log))
    expect(again.status).toBe(0)
    expect(again.stdout).toContain('under the 20% threshold')
    expect(liveBytes()).toBe(liveBytes())
  })

  it('--if-needed does nothing when the threshold is switched off', () => {
    seed(dbPath, 600)
    emptyVotes()
    expect(run(BACKUP, []).status).toBe(0)
    const before = liveBytes()

    const r = run(VACUUM, ['--if-needed'], {
      ...vacuumStubs(join(dir, 'systemctl.log')),
      XLOC_AUTO_VACUUM_PCT: '0',
    })
    expect(r.status).toBe(0)
    expect(liveBytes()).toBe(before)
  })

  it('--if-needed hands the refreshed measurement back to xloc', () => {
    // Written as root. Left root-owned it fails every backup after it, which
    // is the whole class of failure the vacuum unit is otherwise free of.
    seed(dbPath, 600)
    emptyVotes()
    expect(run(BACKUP, []).status).toBe(0)

    const log = join(dir, 'systemctl.log')
    expect(run(VACUUM, ['--if-needed'], vacuumStubs(log)).status).toBe(0)
    expect(readFileSync(log, 'utf8')).toContain(
      `chown xloc:xloc ${join(backupDir, '.vacuum-status')}`,
    )
  })

  it('never creates the backups directory it was pointed at', () => {
    // Same reason, one step worse: a root-owned *directory* there cannot be
    // written to at all, and nothing in the backup path can repair it.
    seed(dbPath, 600)
    emptyVotes()
    const absent = join(dir, 'no-backups-here')

    const r = run(VACUUM, ['-y'], {
      ...vacuumStubs(join(dir, 'systemctl.log')),
      XLOC_BACKUP_DIR: absent,
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('compacted')
    expect(existsSync(absent)).toBe(false)
  })

  it('--if-needed still refuses a corrupt database, unattended', () => {
    // systemd triggers this path now, so it runs with nobody watching. A
    // rebuild carries the fault across and destroys what a restore needs.
    seed(dbPath, 600)
    emptyVotes()
    expect(run(BACKUP, []).status).toBe(0)

    const log = join(dir, 'systemctl.log')
    const r = run(
      VACUUM,
      ['--if-needed'],
      vacuumStubs(log, {
        sqlite3: `
case "$*" in
  *"${dbPath}"*integrity_check* | *integrity_check*"${dbPath}"*)
    echo "*** in database main ***"
    echo "wrong # of entries in index sqlite_autoindex_profiles_1"
    exit 0 ;;
esac
exec ${realSqlite3()} "$@"`,
      }),
    )

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('do NOT compact it')
    expect(existsSync(log)).toBe(false) // the service was never stopped
    expect(replaced()).toEqual([])
  })

  it('rebuilds the database, verifies it, and keeps the original beside it', () => {
    seed(dbPath, 600)
    emptyVotes()
    const before = liveBytes()
    const log = join(dir, 'systemctl.log')

    const r = run(VACUUM, ['-y'], vacuumStubs(log))
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('healthz ok')
    expect(r.stdout).toContain('compacted')

    // The point of the exercise.
    expect(liveBytes()).toBeLessThan(before)

    const order = readFileSync(log, 'utf8')
    expect(order).toContain('systemctl stop x-loc-cache')
    expect(order).toContain('systemctl start x-loc-cache')
    expect(order.indexOf('stop')).toBeLessThan(order.indexOf('start'))
    // Owned by the service user before it becomes the service's database.
    expect(order).toContain('chown xloc:xloc')

    // Rollback is a mv away until the operator deletes it — and the path the
    // script prints for that is a file that exists, holding the bigger
    // original rather than a copy of what just replaced it.
    const original = r.stdout.match(/kept as (\S+)/)![1]!
    expect(existsSync(original)).toBe(true)
    expect(statSync(original).size).toBeGreaterThan(statSync(dbPath).size)

    const db = new Database(dbPath)
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(db.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({
      n: 600,
    })
    // And the server can write to what it was handed.
    db.prepare('INSERT INTO profiles (username, location) VALUES (?, ?)').run(
      'after-vacuum',
      'Somewhere',
    )
    db.close()
  })

  it('leaves nothing of the old database beside the new one', () => {
    // A -wal belongs to the file it was written for. Left in place across the
    // swap it is something SQLite would try to replay over a database it knows
    // nothing about. SQLite removes it itself on a clean close; the move-aside
    // loop covers the times there is no clean close, like a hard-killed server.
    seed(dbPath, 100)
    writeFileSync(`${dbPath}-wal`, 'stale')
    const log = join(dir, 'systemctl.log')

    expect(run(VACUUM, ['-y'], vacuumStubs(log)).status).toBe(0)

    expect(existsSync(`${dbPath}-wal`)).toBe(false)
    expect(existsSync(`${dbPath}-shm`)).toBe(false)
    expect(readdirSync(dir).filter((f) => f.startsWith('vacuum-'))).toEqual([])

    const db = new Database(dbPath)
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(db.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({
      n: 100,
    })
    db.close()
  })

  it('refuses to compact a corrupt database, without stopping the service', () => {
    // Rebuilding a corrupt file carries the fault across and destroys the
    // evidence. Restoring is the answer, and that needs the original intact.
    seed(dbPath, 100)
    const log = join(dir, 'systemctl.log')
    const r = run(
      VACUUM,
      ['-y'],
      vacuumStubs(log, {
        sqlite3: `
case "$*" in
  *"${dbPath}"*integrity_check* | *integrity_check*"${dbPath}"*)
    echo "*** in database main ***"
    echo "wrong # of entries in index sqlite_autoindex_profiles_1"
    exit 0 ;;
esac
exec ${realSqlite3()} "$@"`,
      }),
    )

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('do NOT compact it')
    expect(r.stderr).toContain('Restore')
    expect(existsSync(log)).toBe(false) // the service was never stopped
    expect(replaced()).toEqual([])
  })

  it('restarts the service and keeps the original when the rebuild is short', () => {
    seed(dbPath, 300)
    const log = join(dir, 'systemctl.log')
    const r = run(
      VACUUM,
      ['-y'],
      vacuumStubs(log, {
        // Only the rebuilt file's counts are faked; that query runs against
        // nothing else.
        sqlite3: `
case "$*" in
  *"COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes"*) echo 7; echo 9; exit 0 ;;
esac
exec ${realSqlite3()} "$@"`,
      }),
    )

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('failed verification')
    expect(r.stderr).toContain('7 rebuilt vs 300 live')
    // Stopped, so it must come back — and nothing may have been swapped.
    const order = readFileSync(log, 'utf8')
    expect(order).toContain('systemctl start x-loc-cache')
    expect(r.stderr).toContain('the database was not modified')
    expect(replaced()).toEqual([])
    expect(readdirSync(dir).filter((f) => f.startsWith('vacuum-'))).toEqual([])

    const db = new Database(dbPath, { readonly: true })
    expect(db.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({
      n: 300,
    })
    db.close()
  })

  it('puts the original back if it dies in the one-mv window', () => {
    // Between moving the database aside and putting the rebuilt one in its
    // place there is exactly one mv. Dying there and restarting the service
    // would leave it opening a database that is not there — SQLite creates an
    // empty one, and the server starts answering from it while the real file
    // sits beside it under another name.
    seed(dbPath, 300)
    const log = join(dir, 'systemctl.log')
    const realMv = spawnSync('sh', ['-c', 'command -v mv'], {
      encoding: 'utf8',
    }).stdout.trim()
    const r = run(
      VACUUM,
      ['-y'],
      vacuumStubs(log, {
        // Only the swap itself; the move-aside and the rollback both pass
        // through, since neither has the rebuilt file as its source.
        mv: `
case "$1" in
  */vacuum-*.db) echo "mv: simulated failure" >&2; exit 1 ;;
esac
exec ${realMv} "$@"`,
      }),
    )

    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('putting the original database back')
    expect(existsSync(dbPath)).toBe(true)
    expect(replaced()).toEqual([])
    expect(readFileSync(log, 'utf8')).toContain('systemctl start x-loc-cache')

    const db = new Database(dbPath, { readonly: true })
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(db.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({
      n: 300,
    })
    db.close()
  })

  it('will not run unattended without being told to', () => {
    // spawnSync gives it a pipe, not a terminal — the same as cron or a
    // half-written unit file would. Stopping the service is not something to
    // do because a prompt went unanswered.
    seed(dbPath, 20)
    const log = join(dir, 'systemctl.log')
    const r = run(VACUUM, [], vacuumStubs(log))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('not a terminal')
    expect(existsSync(log)).toBe(false)
  })

  it('refuses a database that is not there, before stopping the service', () => {
    const log = join(dir, 'systemctl.log')
    const r = run(VACUUM, ['-y'], vacuumStubs(log))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no database at')
    expect(existsSync(log)).toBe(false)
  })

  it('refuses to run as a normal user, before touching anything', () => {
    seed(dbPath, 20)
    const r = run(VACUUM, ['-y'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('run as root')
  })

  it('rejects an argument it does not understand rather than ignoring it', () => {
    seed(dbPath, 20)
    const r = run(VACUUM, ['--force'], vacuumStubs(join(dir, 'systemctl.log')))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('usage:')
  })
})

describe.skipIf(MISSING.length > 0)('restore.ts', () => {
  /** systemctl/curl/chown/sudo/id, so the script can run outside a real box. */
  function restoreStubs(log: string) {
    return stubs({
      id: 'echo 0',
      systemctl: `echo "systemctl $*" >> '${log}'`,
      chown: `echo "chown $*" >> '${log}'`,
      curl: 'exit 0',
      sudo: 'shift 2; exec "$@"',
    })
  }

  it('rejects a bad archive without stopping the service', () => {
    seed(dbPath, 50)
    const log = join(dir, 'systemctl.log')
    const empty = join(dir, 'x-loc-cache-19700101-000000.db.gz')
    // Valid gzip, empty database inside: integrity_check calls it "ok".
    spawnSync('sh', ['-c', `printf '' | gzip > '${empty}'`])

    const r = run(RESTORE, [empty], restoreStubs(log))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('service untouched')
    expect(existsSync(log)).toBe(false)
    // No temp file left beside the live database.
    expect(readdirSync(dir).filter((f) => f.startsWith('restore-'))).toEqual([])
  })

  it('rejects an archive that is not gzip at all', () => {
    seed(dbPath, 50)
    const log = join(dir, 'systemctl.log')
    const bogus = join(dir, 'x-loc-cache-19700101-000000.db.gz')
    writeFileSync(bogus, 'not gzip')

    const r = run(RESTORE, [bogus], restoreStubs(log))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('could not unpack')
    expect(r.stderr).toContain('service untouched')
    // A zlib stack trace is the wrong thing to hand someone mid-incident.
    expect(r.stderr).not.toContain('at Zlib')
    expect(existsSync(log)).toBe(false)
    expect(readdirSync(dir).filter((f) => f.startsWith('restore-'))).toEqual([])

    const live = new Database(dbPath, { readonly: true })
    expect(live.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({
      n: 50,
    })
    live.close()
  })

  it('lists the available archives when called with no argument', () => {
    seed(dbPath, 20)
    expect(run(BACKUP, []).status).toBe(0)
    const r = run(RESTORE, [], restoreStubs(join(dir, 'unused.log')))
    expect(r.status).toBe(1)
    // The listing goes to stderr; a reversed redirect would send it to
    // /dev/null and report an empty list mid-incident.
    expect(r.stderr).toContain('available:')
    expect(r.stderr).toContain(archives()[0]!)
  })

  it('refuses to run as a normal user, before touching anything', () => {
    seed(dbPath, 20)
    expect(run(BACKUP, []).status).toBe(0)
    const r = run(RESTORE, [join(backupDir, archives()[0]!)])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('run as root')
    // Not even unpacked: nothing may land beside the live database.
    expect(readdirSync(dir).filter((f) => f.startsWith('restore-'))).toEqual([])
  })

  it('puts the original back and restarts the service if the swap fails', () => {
    // The one-mv window: between the move-aside and the swap there is no
    // database, and a restart there has SQLite create an empty one.
    seed(dbPath, 80)
    expect(run(BACKUP, []).status).toBe(0)
    const log = join(dir, 'systemctl.log')
    const realMv = spawnSync('sh', ['-c', 'command -v mv'], {
      encoding: 'utf8',
    }).stdout.trim()

    const r = run(
      RESTORE,
      [join(backupDir, archives()[0]!)],
      stubs({
        id: 'echo 0',
        systemctl: `echo "systemctl $*" >> '${log}'`,
        chown: `echo "chown $*" >> '${log}'`,
        curl: 'exit 0',
        sudo: 'shift 2; exec "$@"',
        // Only the swap itself; the move-aside and the rollback both pass
        // through, since neither has the unpacked file as its source.
        mv: `
case "$1" in
  */restore-*.db) echo "mv: simulated failure" >&2; exit 1 ;;
esac
exec ${realMv} "$@"`,
      }),
    )

    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('putting the original database back')
    expect(existsSync(dbPath)).toBe(true)
    expect(readdirSync(dir).some((f) => f.includes('.replaced-'))).toBe(false)
    expect(readdirSync(dir).filter((f) => f.startsWith('restore-'))).toEqual([])
    expect(readFileSync(log, 'utf8')).toContain('systemctl start x-loc-cache')

    // What came back is the original, not an empty file.
    const back = new Database(dbPath, { readonly: true })
    expect(back.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(back.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({
      n: 80,
    })
    back.close()
  })

  it('fails loudly when the restarted service never answers', () => {
    // The swap worked; the thing it exists to produce did not.
    seed(dbPath, 40)
    expect(run(BACKUP, []).status).toBe(0)
    const log = join(dir, 'systemctl.log')

    const r = run(
      RESTORE,
      [join(backupDir, archives()[0]!)],
      stubs({
        id: 'echo 0',
        systemctl: `echo "systemctl $*" >> '${log}'`,
        chown: `echo "chown $*" >> '${log}'`,
        curl: 'exit 7', // never comes up
        sudo: 'shift 2; exec "$@"',
      }),
    )

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('healthz FAILED')
    expect(r.stdout).not.toContain('healthz ok')
    // It verified before the swap; rolling it back would hide which half broke.
    expect(existsSync(dbPath)).toBe(true)
    expect(readdirSync(dir).some((f) => f.includes('.replaced-'))).toBe(true)
  }, 30_000)

  it('restores the snapshot, discarding a stale WAL rather than replaying it', () => {
    seed(dbPath, 100)
    expect(run(BACKUP, []).status).toBe(0)

    // A write that lands after the snapshot: it must NOT survive the restore,
    // or the moved-aside WAL was replayed over the restored file.
    const live = new Database(dbPath)
    live.pragma('journal_mode = WAL')
    live
      .prepare('INSERT INTO profiles (username, location) VALUES (?, ?)')
      .run('written-after-the-backup', 'Nowhere')
    live.close()
    writeFileSync(`${dbPath}-wal`, 'stale')

    const log = join(dir, 'systemctl.log')
    const r = run(RESTORE, [join(backupDir, archives()[0]!)], restoreStubs(log))
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('healthz ok')

    const order = readFileSync(log, 'utf8')
    expect(order).toContain('systemctl stop x-loc-cache')
    expect(order).toContain('systemctl start x-loc-cache')

    // The replaced files are kept, not deleted.
    expect(readdirSync(dir).some((f) => f.includes('.replaced-'))).toBe(true)

    const restored = new Database(dbPath)
    restored.pragma('journal_mode = WAL')
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(restored.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({
      n: 100,
    })
    expect(
      restored
        .prepare(
          "SELECT COUNT(*) n FROM profiles WHERE username = 'written-after-the-backup'",
        )
        .get(),
    ).toEqual({ n: 0 })
    // And the server can write to what it was handed.
    restored
      .prepare('INSERT INTO profiles (username, location) VALUES (?, ?)')
      .run('after-restore', 'Somewhere')
    restored.close()
  })
})
