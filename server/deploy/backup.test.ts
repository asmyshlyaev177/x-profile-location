// Tests for deploy/backup.sh and deploy/restore.sh.
//
// Deliberately NOT part of `pnpm test`: vitest.config.ts includes only
// `src/**`, this suite has its own config, and CI never runs it. It shells out
// to sqlite3, dash, gzip and flock against real databases on disk — the point
// is to exercise the shipped scripts, not a re-implementation of them, so
// there is nothing here that a mock could stand in for.
//
//   pnpm test:deploy
//
// The load tests are the reason this file exists. `.backup` — what these
// scripts used to use — restarts from scratch whenever another connection
// writes, so on a server taking contributions it finished only once writes
// stopped: 11s against a 7.6MB database with a writer running, versus 0.03s for
// VACUUM INTO. A backup that never converges is invisible in every other test,
// because with an idle database both are fast and correct.

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
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const DEPLOY = import.meta.dirname
const SERVER = join(DEPLOY, '..')
const BACKUP = join(DEPLOY, 'backup.sh')
const RESTORE = join(DEPLOY, 'restore.sh')

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
  return spawnSync('sh', [script, ...args], {
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

/**
 * Kept archives, by the exact name backup.sh gives them. Matching a bare
 * `.db.gz` would also sweep in `corrupt-evidence.db.gz`, which is not an
 * archive and is the one file whose presence means backups are failing.
 */
function archives(): string[] {
  if (!existsSync(backupDir)) return []
  return readdirSync(backupDir)
    .filter((f) => /^x-loc-cache-\d{8}-\d{6}\.db\.gz$/.test(f))
    .sort()
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
  `backup.sh${MISSING.length ? ` (skipped: missing ${MISSING.join(', ')})` : ''}`,
  () => {
    it('writes a verified, restorable snapshot of every row', () => {
      seed(dbPath, 200)
      const r = run(BACKUP, [])
      expect(r.stderr).toBe('')
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('backup ok')

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

    it('rejects a non-numeric XLOC_BACKUP_KEEP instead of silently never pruning', () => {
      // `[ 7d -lt 1 ]` is a test *error* in dash, which an `if` reads as false —
      // the guard has to be a case, or rotation quietly stops forever.
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

    it('refuses to run as root', () => {
      // Root leaves the backups directory root-owned, and every later run as
      // xloc then fails to write into it.
      seed(dbPath, 20)
      const r = run(BACKUP, [], stubs({ id: 'echo 0' }))
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('refusing to run as root')
      expect(archives()).toEqual([])
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

describe.skipIf(MISSING.length > 0)(
  'backup.sh — a database it must not trust',
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

      // ...and restore.sh must not offer it as something to restore from.
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

describe.skipIf(MISSING.length > 0)('backup.sh — under write load', () => {
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

describe.skipIf(MISSING.length > 0)('restore.sh', () => {
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
