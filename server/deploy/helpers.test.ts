// The pure functions behind the deploy scripts — argument parsing, name
// classification, the size arithmetic and the env loader. No processes and no
// service, so unlike backup.test.ts these say what a decision *is* rather than
// what a run does; the two together are what pin the scripts.
//
//   pnpm test:deploy

import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  archivesToPrune,
  baselineQuery,
  isOrphan,
  parseKeep,
  snapshotIsGood,
} from './backup.ts'
import {
  bytes,
  humanSize,
  inspect,
  liveBytes,
  loadEnvFile,
  moveAside,
  reclaimPct,
  stamp,
  uid,
  type Inspection,
} from './lib.ts'
import { availableArchives } from './restore.ts'
import { parseArgs } from './vacuum.ts'

const SERVER = join(import.meta.dirname, '..')
const HAS_SQLITE = spawnSync('sh', ['-c', 'command -v sqlite3']).status === 0

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'x-loc-helpers-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('parseKeep', () => {
  it('takes a positive integer', () => {
    expect(parseKeep('7')).toBe(7)
    expect(parseKeep('1')).toBe(1)
    expect(parseKeep('365')).toBe(365)
  })

  it('refuses everything that is not one', () => {
    // Each of these would otherwise reach the prune as a number: '0' deletes
    // every archive, '-1' and NaN compare false against every index so the
    // slice keeps nothing, and '007'/'1e3'/' 7 ' are typos worth reporting.
    for (const raw of ['0', '-1', '3.5', '007', '1e3', ' 7 ', '', 'seven']) {
      expect(parseKeep(raw)).toBeNull()
    }
  })
})

describe('archivesToPrune', () => {
  const names = [
    'x-loc-cache-20260101-000000.db.gz',
    'x-loc-cache-20260102-000000.db.gz',
    'x-loc-cache-20260103-000000.db.gz',
  ]

  it('drops the oldest past the keep count', () => {
    expect(archivesToPrune(names, 2)).toEqual([
      'x-loc-cache-20260101-000000.db.gz',
    ])
  })

  it('prunes nothing while there are fewer than the keep count', () => {
    expect(archivesToPrune(names, 3)).toEqual([])
    expect(archivesToPrune(names, 10)).toEqual([])
    expect(archivesToPrune([], 3)).toEqual([])
  })

  it('sorts by stamp, not by the order the directory listed them', () => {
    const shuffled = [names[2]!, names[0]!, names[1]!]
    expect(archivesToPrune(shuffled, 1)).toEqual([
      'x-loc-cache-20260102-000000.db.gz',
      'x-loc-cache-20260101-000000.db.gz',
    ])
  })

  it('never counts or prunes a file that is not an archive', () => {
    // Everything else backup.ts puts in that directory. The evidence file is
    // the one that matters: pruning it discards the proof of a corrupt source.
    const mixed = [
      ...names,
      'corrupt-evidence.db.gz',
      '.vacuum-status',
      '.backup.lock',
      'x-loc-cache-20260104-000000.db',
      'x-loc-cache-20260104-000000.db.gz.part',
    ]
    expect(archivesToPrune(mixed, 3)).toEqual([])
    expect(archivesToPrune(mixed, 1)).toEqual([
      'x-loc-cache-20260102-000000.db.gz',
      'x-loc-cache-20260101-000000.db.gz',
    ])
  })
})

describe('isOrphan', () => {
  it('claims the working files a killed run leaves behind', () => {
    for (const name of [
      'x-loc-cache-20260101-000000.db',
      'x-loc-cache-20260101-000000.db.gz.part',
      'corrupt-evidence.db.gz.part',
      '.vacuum-status.part',
    ]) {
      expect(isOrphan(name)).toBe(true)
    }
  })

  it('leaves everything that is meant to be there', () => {
    for (const name of [
      'x-loc-cache-20260101-000000.db.gz',
      'corrupt-evidence.db.gz',
      '.vacuum-status',
      '.backup.lock',
      'notes.part',
      'x-loc-cache-2026.db',
    ]) {
      expect(isOrphan(name)).toBe(false)
    }
  })
})

describe('snapshotIsGood', () => {
  const ok: Inspection = { integrity: 'ok', profiles: 10, votes: 30 }

  it('accepts a snapshot at or above the baseline', () => {
    expect(snapshotIsGood(ok, 10)).toBe(true)
    // Above it: retention took nothing, or a write landed during the copy.
    expect(snapshotIsGood(ok, 4)).toBe(true)
    expect(snapshotIsGood({ integrity: 'ok', profiles: 0, votes: 0 }, 0)).toBe(
      true,
    )
  })

  it('rejects a short one', () => {
    expect(snapshotIsGood(ok, 11)).toBe(false)
  })

  it('rejects counts it could not read, rather than comparing NaN', () => {
    expect(snapshotIsGood({ ...ok, profiles: null }, 0)).toBe(false)
    expect(snapshotIsGood({ ...ok, votes: null }, 0)).toBe(false)
  })

  it('rejects anything integrity_check did not call exactly ok', () => {
    expect(snapshotIsGood({ ...ok, integrity: 'malformed' }, 0)).toBe(false)
    expect(snapshotIsGood({ ...ok, integrity: '' }, 0)).toBe(false)
  })
})

describe.skipIf(!HAS_SQLITE)('baselineQuery', () => {
  function seeded(seenAt: number[]): string {
    const file = join(dir, 'baseline.db')
    const db = new Database(file)
    db.exec(readFileSync(join(SERVER, 'schema.sql'), 'utf8'))
    const profile = db.prepare(
      'INSERT INTO profiles (username, location) VALUES (?, ?)',
    )
    const vote = db.prepare(
      'INSERT INTO location_votes (username, client_id, location, source, location_accurate, seen_at) VALUES (?,?,?,?,?,?)',
    )
    seenAt.forEach((at, i) => {
      profile.run(`user-${i}`, 'Peru')
      vote.run(`user-${i}`, 'client', 'Peru', 'web', 1, at)
    })
    db.close()
    return file
  }

  function baseline(file: string, now: number): number {
    const r = spawnSync('sqlite3', [file, baselineQuery(now)], {
      encoding: 'utf8',
    })
    expect(r.status).toBe(0)
    return Number(r.stdout.trim())
  }

  const RETENTION = 60 * 24 * 60 * 60 * 1000

  it('counts only profiles retention cannot take', () => {
    const now = Date.UTC(2026, 5, 1)
    const file = seeded([
      now - 1000,
      now - RETENTION + 1000,
      now - RETENTION - 1000,
    ])
    expect(baseline(file, now)).toBe(2)
  })

  it('counts a vote sitting exactly on the window', () => {
    // The retention DELETE is `seen_at < cutoff`, so a vote at the cutoff
    // survives; a baseline that excluded it would be short by that profile and
    // could only ever be too forgiving, never wrong.
    const now = Date.UTC(2026, 5, 1)
    expect(baseline(seeded([now - RETENTION]), now)).toBe(1)
  })

  it('is 0 for a database of nothing but expired profiles', () => {
    const now = Date.UTC(2026, 5, 1)
    const file = seeded([now - RETENTION - 1, now - RETENTION - 2])
    expect(baseline(file, now)).toBe(0)
  })
})

describe('parseArgs', () => {
  it('understands no flag and both spellings of yes', () => {
    expect(parseArgs([])).toEqual({ assumeYes: false })
    expect(parseArgs(['-y'])).toEqual({ assumeYes: true })
    expect(parseArgs(['--yes'])).toEqual({ assumeYes: true })
  })

  it('refuses anything else, rather than ignoring it', () => {
    // '--force' reads as consent; running the interactive path instead would
    // be surprising, and running the compaction would be worse.
    for (const argv of [['--force'], ['-y', 'extra'], ['-Y'], ['yes'], ['']]) {
      expect(parseArgs(argv)).toBeNull()
    }
  })
})

describe('availableArchives', () => {
  it('is empty for a directory that is not there', () => {
    expect(availableArchives(join(dir, 'absent'))).toEqual([])
  })

  it('lists archives oldest first, by full path, and nothing else', () => {
    const backups = join(dir, 'backups')
    mkdirSync(backups)
    for (const name of [
      'x-loc-cache-20260102-000000.db.gz',
      'x-loc-cache-20260101-000000.db.gz',
      'corrupt-evidence.db.gz',
      '.vacuum-status',
      'x-loc-cache-20260103-000000.db',
    ]) {
      writeFileSync(join(backups, name), 'x')
    }
    expect(availableArchives(backups)).toEqual([
      join(backups, 'x-loc-cache-20260101-000000.db.gz'),
      join(backups, 'x-loc-cache-20260102-000000.db.gz'),
    ])
  })
})

describe('humanSize', () => {
  it('switches unit at 1024, and keeps a decimal only below 10', () => {
    expect(humanSize(0)).toBe('0B')
    expect(humanSize(1023)).toBe('1023B')
    expect(humanSize(1024)).toBe('1.0K')
    expect(humanSize(1536)).toBe('1.5K')
    expect(humanSize(10 * 1024)).toBe('10K')
    expect(humanSize(1024 ** 3)).toBe('1.0G')
    // Past the last unit it keeps counting in it rather than inventing one.
    expect(humanSize(4096 * 1024 ** 4)).toBe('4096T')
  })
})

describe('reclaimPct', () => {
  it('is the share the rebuild handed back, rounded', () => {
    expect(reclaimPct(100, 75)).toBe(25)
    expect(reclaimPct(3, 1)).toBe(67)
  })

  it('is 0 rather than negative when the rebuild is no smaller', () => {
    expect(reclaimPct(100, 100)).toBe(0)
    expect(reclaimPct(100, 120)).toBe(0)
    expect(reclaimPct(0, 0)).toBe(0)
  })
})

describe('bytes / liveBytes', () => {
  it('counts a missing file as 0 instead of throwing', () => {
    expect(bytes(join(dir, 'absent'))).toBe(0)
    expect(liveBytes(join(dir, 'absent'))).toBe(0)
  })

  it('adds the un-checkpointed WAL to the main file', () => {
    const file = join(dir, 'db')
    writeFileSync(file, 'x'.repeat(100))
    expect(liveBytes(file)).toBe(100)
    writeFileSync(`${file}-wal`, 'y'.repeat(30))
    expect(liveBytes(file)).toBe(130)
  })
})

describe('moveAside', () => {
  it('takes -wal and -shm along, so nothing is replayed over the new file', () => {
    const file = join(dir, 'db')
    for (const part of ['', '-wal', '-shm']) {
      writeFileSync(`${file}${part}`, part || 'main')
    }
    moveAside(file, '.replaced-x')
    for (const part of ['', '-wal', '-shm']) {
      expect(bytes(`${file}${part}`)).toBe(0)
      expect(readFileSync(`${file}${part}.replaced-x`, 'utf8')).toBe(
        part || 'main',
      )
    }
  })

  it('does nothing at all when there is nothing to move', () => {
    expect(() => moveAside(join(dir, 'absent'), '.replaced-x')).not.toThrow()
    expect(bytes(join(dir, 'absent.replaced-x'))).toBe(0)
  })
})

describe('loadEnvFile', () => {
  const KEY = 'XLOC_TEST_ONLY'

  afterEach(() => {
    delete process.env[KEY]
  })

  it('overrides what is already in the environment', () => {
    // A stale `export XLOC_DB` in the operator's shell must not decide which
    // database gets compacted; the unit's env file is the authority.
    process.env[KEY] = 'from-the-shell'
    const file = join(dir, 'env')
    writeFileSync(file, `${KEY}=from-the-file\n`)
    loadEnvFile(file)
    expect(process.env[KEY]).toBe('from-the-file')
  })

  it('strips one layer of matching quotes', () => {
    const file = join(dir, 'env')
    writeFileSync(file, `${KEY}="/var/lib/x loc/db"\n`)
    loadEnvFile(file)
    expect(process.env[KEY]).toBe('/var/lib/x loc/db')
  })

  it('skips comments and anything that is not an assignment', () => {
    const file = join(dir, 'env')
    writeFileSync(file, `# ${KEY}=commented\n\n  \nnonsense\n`)
    loadEnvFile(file)
    expect(process.env[KEY]).toBeUndefined()
  })

  it('is a no-op for a file that is not there', () => {
    expect(() => loadEnvFile(join(dir, 'absent'))).not.toThrow()
  })
})

describe('stamp', () => {
  it('is a UTC stamp that sorts by age', () => {
    const s = stamp()
    expect(s).toMatch(/^\d{8}-\d{6}$/)
    expect('20200101-000000' < s).toBe(true)
  })
})

describe('uid', () => {
  it('agrees with the process it is asked about', () => {
    expect(uid()).toBe(process.getuid?.())
  })
})

describe.skipIf(!HAS_SQLITE)('inspect', () => {
  it('reads integrity and both counts from a real database', () => {
    const file = join(dir, 'real.db')
    const db = new Database(file)
    db.exec(readFileSync(join(SERVER, 'schema.sql'), 'utf8'))
    db.prepare('INSERT INTO profiles (username, location) VALUES (?, ?)').run(
      'someone',
      'Peru',
    )
    db.close()
    expect(inspect(file)).toEqual({ integrity: 'ok', profiles: 1, votes: 0 })
  })

  it('reports nulls, never NaN, for a file with no such tables', () => {
    // A failed VACUUM INTO leaves an empty file, which integrity_check calls
    // "ok" — the counts are the only thing that catches it, so they must not
    // come back as a number the comparison can pass.
    const file = join(dir, 'empty.db')
    writeFileSync(file, '')
    const found = inspect(file)
    expect(found.profiles).toBeNull()
    expect(found.votes).toBeNull()
  })

  it('reports nulls for a file that is not a database at all', () => {
    const file = join(dir, 'garbage.db')
    writeFileSync(file, 'this is not a database')
    const found = inspect(file)
    expect(found.integrity).not.toBe('ok')
    expect(found.profiles).toBeNull()
    expect(found.votes).toBeNull()
  })
})
