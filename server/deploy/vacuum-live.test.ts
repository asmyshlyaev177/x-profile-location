// deploy/vacuum.ts against the real server, with real traffic hitting it.
//
// The rest of the deploy suite drives the scripts against databases on disk and
// stubs systemctl. That leaves two questions it cannot answer, and they are the
// two that matter for a script whose whole job is to replace the file the
// server is reading:
//
//   1. Does the server actually work afterwards? A rebuilt database that opens
//      in better-sqlite3 is not the same claim as one the server boots on,
//      serves reads from and accepts writes into.
//   2. What happens to requests arriving while it runs? The design trades a
//      few seconds of downtime for not losing writes, and that is only worth
//      anything if it is true.
//
// So this boots `src/node-server.ts` for real, points a stand-in systemctl at
// the actual process, leaves curl unstubbed so the script's own health check is
// a real one, and keeps contributing over HTTP throughout.
//
//   pnpm test:deploy

import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const DEPLOY = import.meta.dirname
const SERVER = join(DEPLOY, '..')
const VACUUM = join(DEPLOY, 'vacuum.ts')

function available(cmd: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0
}

// curl is not stubbed here — vacuum.ts's healthz loop is one of the things
// under test — so unlike backup.test.ts it is a genuine requirement.
const MISSING = ['sqlite3', 'curl'].filter((c) => !available(c))

let dir = ''
let dbPath = ''
let port = 0
let binDir = ''
let pidFile = ''
let serverLog = ''

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port: p } = probe.address() as AddressInfo
      probe.close(() => resolve(p))
    })
  })
}

/**
 * A systemctl that really starts and stops the server. `stop` sends SIGTERM and
 * waits for the process to be gone, which is what systemd does and what makes
 * the rebuild safe: the script must not read the database out from under a
 * process still writing to it.
 */
function writeStubs(): void {
  binDir = join(dir, 'bin')
  mkdirSync(binDir, { recursive: true })
  const write = (name: string, body: string): void => {
    const file = join(binDir, name)
    writeFileSync(file, `#!/bin/sh\n${body}\n`)
    chmodSync(file, 0o755)
  }

  write('id', 'echo 0')
  write('chown', 'exit 0') // xloc does not exist on a dev box
  write('sudo', 'shift 2\nexec "$@"')
  write(
    'systemctl',
    `
case "$1" in
  stop)
    if [ -f '${pidFile}' ]; then
      pid="$(cat '${pidFile}')"
      kill -TERM "$pid" 2>/dev/null || true
      n=0
      while kill -0 "$pid" 2>/dev/null; do
        n=$((n + 1))
        if [ "$n" -gt 200 ]; then echo "server did not exit" >&2; exit 1; fi
        sleep 0.05
      done
      rm -f '${pidFile}'
    fi
    ;;
  start)
    ( cd '${SERVER}' && XLOC_DB='${dbPath}' XLOC_PORT='${port}' \\
        XLOC_RATE_LIMIT=0 XLOC_STATS_INTERVAL_HOURS=0 \\
        exec node --experimental-strip-types src/node-server.ts \\
    ) >> '${serverLog}' 2>&1 &
    echo $! > '${pidFile}'
    ;;
esac
exit 0`,
  )
}

function systemctl(action: 'start' | 'stop'): void {
  const r = spawnSync(
    'sh',
    [join(binDir, 'systemctl'), action, 'x-loc-cache'],
    {
      encoding: 'utf8',
    },
  )
  expect(r.status, r.stderr).toBe(0)
}

async function healthy(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`)
      if (res.ok) return true
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

interface Attempt {
  username: string
  ok: boolean
  /** When it was sent, so the outage can be measured rather than counted. */
  at: number
  ms: number
  /** Why it failed — the distinction between "refused" and "hung" lives here. */
  cause?: string
}

const LOAD_INTERVAL_MS = 20

/**
 * One contribution. `ok` means the server answered 200 — and a 200 here is a
 * promise the vote was stored, provided the client stays inside its budget
 * (CONTRIB_HANDLE_LIMIT distinct handles, which every caller below does):
 * over budget the write is dropped silently and still answers 200.
 */
async function contribute(
  username: string,
  clientId: string,
): Promise<Attempt> {
  const started = Date.now()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/loc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId,
        entries: [{ u: username, loc: 'United States', src: 'web', acc: true }],
      }),
    })
    return { username, ok: res.ok, at: started, ms: Date.now() - started }
  } catch (err) {
    const cause = err as { cause?: { code?: string }; code?: string }
    return {
      username,
      ok: false,
      at: started,
      ms: Date.now() - started,
      cause: cause.cause?.code ?? cause.code ?? String(err),
    }
  }
}

/**
 * Traffic that does not stop for the maintenance window. Every caller stays
 * inside one client's handle budget, so a 200 keeps meaning "stored".
 */
function startLoad(clientId: string): {
  attempts: Attempt[]
  stop: () => Promise<void>
} {
  const attempts: Attempt[] = []
  const state = { running: true }
  const loop = (async () => {
    for (let i = 0; state.running; i++) {
      attempts.push(await contribute(`during_${i % 50}`, clientId))
      await new Promise((r) => setTimeout(r, LOAD_INTERVAL_MS))
    }
  })()
  return {
    attempts,
    stop: async () => {
      state.running = false
      await loop
    },
  }
}

/** vacuum.ts, spawned async — spawnSync would freeze the load loop with it. */
function runVacuum(): Promise<{
  code: number | null
  out: string
  err: string
}> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', VACUUM, '-y'],
      {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          XLOC_ENV_FILE: join(dir, 'absent.env'),
          XLOC_DB: dbPath,
          XLOC_PORT: String(port),
        },
      },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += String(c)))
    child.stderr.on('data', (c) => (err += String(c)))
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

function liveBytes(): number {
  let total = 0
  for (const suffix of ['', '-wal']) {
    if (existsSync(dbPath + suffix)) total += statSync(dbPath + suffix).size
  }
  return total
}

/**
 * Bulk rows straight into the file, because the point is the size of it —
 * going through the API for these would measure the API. `keep: false` deletes
 * them again, which is what leaves the free pages a compaction reclaims.
 */
function fillProfiles(count: number, keep = true): void {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  const ins = db.prepare(
    'INSERT INTO profiles (username, location, source, location_accurate, location_confidence, updated_at) VALUES (?,?,?,?,?,?)',
  )
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      ins.run(`bulk_${i}`, 'United States', 'web', 1, 1, Date.now())
    }
  })()
  if (!keep)
    db.exec("DELETE FROM profiles WHERE username LIKE 'bulk!_%' ESCAPE '!'")
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}

/** Rows straight from the file, to check against what the server acknowledged. */
function storedVotes(): Set<string> {
  const db = new Database(dbPath, { readonly: true })
  const rows = db.prepare('SELECT username FROM location_votes').all() as {
    username: string
  }[]
  db.close()
  return new Set(rows.map((r) => r.username))
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'x-loc-live-'))
  dbPath = join(dir, 'x-loc-cache.db')
  pidFile = join(dir, 'server.pid')
  serverLog = join(dir, 'server.log')
  port = await freePort()
  writeStubs()
})

afterEach(() => {
  if (existsSync(pidFile)) {
    try {
      process.kill(Number(readFileSync(pidFile, 'utf8').trim()), 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(MISSING.length > 0)(
  `vacuum.ts — live server${MISSING.length ? ` (skipped: missing ${MISSING.join(', ')})` : ''}`,
  () => {
    it('serves from the compacted database, and loses nothing it acknowledged', async () => {
      systemctl('start')
      expect(await healthy(), readFileSync(serverLog, 'utf8')).toBe(true)

      // Fill it through the real API, then delete most of it the way a
      // shortened retention window would — free pages there is something to
      // reclaim from, so the run is a real one and not a no-op.
      const seeded: string[] = []
      for (let i = 0; i < 60; i++) {
        const a = await contribute(`before_${i}`, 'seed-client')
        expect(a.ok).toBe(true)
        seeded.push(a.username)
      }
      // 200 does not by itself mean "stored" — an unparseable handle or a
      // client over budget is dropped silently and still answers 200. Prove
      // the acknowledgements correspond to rows before trusting them as the
      // baseline for what must survive.
      expect(storedVotes()).toEqual(new Set(seeded))
      fillProfiles(40_000, false)
      const before = liveBytes()

      const load = startLoad('load-client')
      const r = await runVacuum()
      await load.stop()
      const attempts = load.attempts

      expect(r.err).toBe('')
      expect(r.code).toBe(0)
      expect(r.out).toContain('healthz ok')
      expect(liveBytes()).toBeLessThan(before)

      // 1. The server is up, on the file that replaced the one it booted on.
      expect(await healthy(), readFileSync(serverLog, 'utf8')).toBe(true)

      // 2. Nothing it ever acknowledged is missing from the compacted file.
      //    This is the property the stop buys: a snapshot of a *live* database
      //    would have dropped every write between the snapshot and the swap.
      const stored = storedVotes()
      const acknowledged = [
        ...seeded,
        ...attempts.filter((a) => a.ok).map((a) => a.username),
      ]
      expect(acknowledged.length).toBeGreaterThan(seeded.length)
      const lost = [...new Set(acknowledged)].filter((u) => !stored.has(u))
      expect(lost).toEqual([])

      // 3. It reads and writes after the swap, over HTTP, not just in a driver.
      const read = await fetch(`http://127.0.0.1:${port}/v1/loc/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usernames: seeded.slice(0, 10) }),
      })
      expect(read.ok).toBe(true)
      const served = (await read.json()) as { profiles: { u: string }[] }
      expect(served.profiles.map((p) => p.u).sort()).toEqual(
        seeded.slice(0, 10).sort(),
      )

      const after = await contribute('after_the_vacuum', 'seed-client')
      expect(after.ok).toBe(true)
      expect(storedVotes().has('after_the_vacuum')).toBe(true)

      const stats = await fetch(`http://127.0.0.1:${port}/v1/stats`)
      expect(stats.ok).toBe(true)

      // 4. And the file the server is now serving from is sound.
      const db = new Database(dbPath, { readonly: true })
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      db.close()
    }, 120_000)

    it('refuses requests for the length of the swap, and does not hang them', async () => {
      // The cost side of the same trade. Requests during the window are
      // refused — not queued, not held open until they time out — because the
      // listener is gone. A client that cannot reach the server keeps its
      // votes and re-contributes; a client left hanging does neither.
      systemctl('start')
      expect(await healthy(), readFileSync(serverLog, 'utf8')).toBe(true)
      for (let i = 0; i < 20; i++) {
        expect((await contribute(`before_${i}`, 'seed-client')).ok).toBe(true)
      }
      expect(storedVotes().size).toBe(20)
      // A database with something in it, so the rebuild is real work rather
      // than an instant no-op — the measurement below is only interesting to
      // the extent the file is.
      fillProfiles(200_000)

      const dbMb = Math.round((liveBytes() / 1_048_576) * 10) / 10
      const load = startLoad('load-client')

      const started = Date.now()
      const r = await runVacuum()
      const scriptMs = Date.now() - started
      await load.stop()
      const attempts = load.attempts
      expect(r.code).toBe(0)

      const refused = attempts.filter((a) => !a.ok)
      // If nothing failed, the window was never observed and the rest of this
      // test proves nothing about it.
      expect(refused.length).toBeGreaterThan(0)

      // Refused, not hung. A connection to a port nobody is listening on comes
      // straight back; a request left hanging on a socket that will never be
      // answered is the failure mode that costs a client its votes, because it
      // neither succeeds nor returns in time to be retried.
      expect(refused.every((a) => a.cause === 'ECONNREFUSED')).toBe(true)
      const slowest = Math.max(...refused.map((a) => a.ms))
      expect(slowest).toBeLessThan(1000)

      // The outage is contiguous — one window, not the service flapping.
      const first = attempts.indexOf(refused[0]!)
      expect(attempts.slice(first, first + refused.length)).toEqual(refused)

      // Traffic resumes on its own once the service is back — no client-side
      // recovery, no restart, just the next request.
      const tail = attempts.slice(-3)
      expect(tail.every((a) => a.ok)).toBe(true)

      // "How long is the stop" is the whole question this design answers, so
      // print it rather than only asserting a bound. Client-visible downtime
      // is shorter than the script's own runtime: vacuum.ts polls /healthz on
      // a 1 s tick, so it keeps waiting after the server is already serving.
      const last = refused[refused.length - 1]!
      const outageMs = last.at + last.ms - refused[0]!.at
      console.log(
        `[vacuum] ${dbMb} MB database: ${refused.length} requests refused over ${outageMs}ms (sampled every ${LOAD_INTERVAL_MS}ms), script ${scriptMs}ms, slowest failure ${slowest}ms`,
      )
    }, 120_000)
  },
)
