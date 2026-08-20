// Tests for deploy/alert.ts — the failure/corruption email.
//
// Runs under `pnpm test:deploy` with the backup tests. Most of it is pure
// (config parsing, subject choice, body assembly); the send path is exercised
// once against a real SMTP server on localhost, so the nodemailer wiring is
// covered rather than assumed.

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import type { AddressInfo, Server, Socket } from 'node:net'
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CORRUPTION_MARKERS,
  DEFAULT_VACUUM_ALERT_PCT,
  VACUUM_STATUS_FILE,
  buildFailureMessage,
  buildReportMessage,
  collectBackupStats,
  isCorruption,
  readAlertPct,
  readConfig,
  readVacuumStatus,
  send,
} from './alert.ts'

const BASE = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'bot@example.com',
  SMTP_PASS: 'app-password',
  NOTIFY_TO: 'ops@example.com',
}

describe('readConfig', () => {
  it('returns null when SMTP_HOST is absent, so alerting is simply off', () => {
    expect(readConfig({})).toBeNull()
    expect(readConfig({ SMTP_HOST: '   ' })).toBeNull()
  })

  it('throws when half-configured rather than pretending to work', () => {
    expect(() => readConfig({ SMTP_HOST: 'smtp.example.com' })).toThrow(
      /SMTP_USER, SMTP_PASS, NOTIFY_TO are not/,
    )
    expect(() => readConfig({ ...BASE, SMTP_PASS: '' })).toThrow(
      /SMTP_PASS is not/,
    )
  })

  it('infers implicit TLS from the port, and lets it be overridden', () => {
    expect(readConfig(BASE)!.secure).toBe(true) // default port 465
    expect(readConfig({ ...BASE, SMTP_PORT: '587' })!.secure).toBe(false)
    expect(
      readConfig({ ...BASE, SMTP_PORT: '587', SMTP_SECURE: 'true' })!.secure,
    ).toBe(true)
  })

  it('rejects a port that is not a port', () => {
    expect(() => readConfig({ ...BASE, SMTP_PORT: 'yes' })).toThrow(
      /must be a port number/,
    )
    expect(() => readConfig({ ...BASE, SMTP_PORT: '70000' })).toThrow(
      /must be a port number/,
    )
  })

  it('splits several recipients and defaults From to the authenticated user', () => {
    const c = readConfig({ ...BASE, NOTIFY_TO: 'a@x.com, b@y.com ,' })!
    expect(c.to).toEqual(['a@x.com', 'b@y.com'])
    expect(c.from).toBe('bot@example.com')
  })
})

describe('classifying a failure', () => {
  // The alert reads backup.ts's own words. If those are reworded and these are
  // not, a corruption alert quietly degrades into a generic failure alert —
  // which is the difference between "look now" and "look tomorrow".
  it('matches strings backup.ts actually prints', () => {
    const script = readFileSync(join(import.meta.dirname, 'backup.ts'), 'utf8')
    for (const marker of CORRUPTION_MARKERS) {
      expect(script, `backup.ts no longer prints "${marker}"`).toContain(marker)
    }
  })

  it('recognises live-database corruption', () => {
    expect(
      isCorruption(
        'x-loc-backup: the LIVE database failed integrity_check — it is corrupt.',
      ),
    ).toBe(true)
  })

  it('recognises a failed snapshot verification', () => {
    expect(isCorruption('snapshot verification FAILED.')).toBe(true)
  })

  it('does not cry corruption over an ordinary failure', () => {
    expect(isCorruption('flock not found — install util-linux')).toBe(false)
  })
})

describe('buildFailureMessage', () => {
  const input = {
    unit: 'x-loc-backup.service',
    host: 'vps-1',
    when: '2026-08-06T12:00:00.000Z',
    properties: 'ActiveState=failed\nResult=exit-code',
    journal: 'flock not found — install util-linux',
  }

  it('names the unit and host in the subject', () => {
    const m = buildFailureMessage(input, '[x-pat-cache]')
    expect(m.subject).toBe('[x-pat-cache] x-loc-backup.service failed on vps-1')
  })

  it('escalates the subject when the database is the problem', () => {
    const m = buildFailureMessage(
      {
        ...input,
        journal: 'the LIVE database failed integrity_check — it is corrupt.',
      },
      '[x-pat-cache]',
    )
    expect(m.subject).toBe('[x-pat-cache] DATABASE CORRUPTION on vps-1')
    // Leads with the action, and with the fact that history is intact.
    expect(m.text).toMatch(
      /^The integrity check failed\. Do NOT repair in place\./,
    )
    expect(m.text).toContain('restore.ts')
    expect(m.text).toContain('were NOT pruned')
  })

  it('carries the journal and unit state for diagnosis', () => {
    const m = buildFailureMessage(input, '[x-pat-cache]')
    expect(m.text).toContain('Result=exit-code')
    expect(m.text).toContain('flock not found')
    expect(m.text).toContain('Host:  vps-1')
  })

  it('honours a custom subject prefix', () => {
    expect(buildFailureMessage(input, '[prod]').subject).toMatch(/^\[prod\] /)
  })
})

describe('the weekly heartbeat', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  function archive(name: string, bytes: number, ageHours: number): void {
    const file = join(dir, name)
    writeFileSync(file, Buffer.alloc(bytes))
    const when = new Date(Date.now() - ageHours * 3_600_000)
    utimesSync(file, when, when)
  }

  it('counts only real archives, never the corruption evidence', () => {
    // corrupt-evidence.db.gz means backups are *failing*. Counting it as a
    // healthy archive — which a bare `.db.gz` filter does — would report
    // "backups healthy" on the strength of the file that proves they are not.
    dir = mkdtempSync(join(tmpdir(), 'x-loc-hb-'))
    archive('x-loc-cache-20260806-000000.db.gz', 1_048_576, 3)
    archive('corrupt-evidence.db.gz', 4_194_304, 1)

    const stats = collectBackupStats(dir, Date.now())
    expect(stats.count).toBe(1)
    expect(stats.newest).toBe('x-loc-cache-20260806-000000.db.gz')
    expect(stats.totalMb).toBe(1)
  })

  it('reports the newest archive and the total on disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-loc-hb-'))
    archive('x-loc-cache-20260801-000000.db.gz', 1_048_576, 72)
    archive('x-loc-cache-20260806-000000.db.gz', 2_097_152, 3)
    writeFileSync(join(dir, 'notes.txt'), 'ignored')

    const stats = collectBackupStats(dir, Date.now())
    expect(stats.count).toBe(2)
    expect(stats.newest).toBe('x-loc-cache-20260806-000000.db.gz')
    expect(stats.newestAgeHours).toBeGreaterThanOrEqual(2.9)
    expect(stats.newestAgeHours).toBeLessThanOrEqual(3.1)
    expect(stats.totalMb).toBe(3)
  })

  it('says healthy when a recent archive exists', () => {
    const m = buildReportMessage(
      {
        stats: {
          count: 7,
          newest: 'x-loc-cache-20260806-000000.db.gz',
          newestAgeHours: 5,
          totalMb: 210,
        },
        host: 'vps-1',
        when: '2026-08-06T12:00:00.000Z',
      },
      '[x-pat-cache]',
    )
    expect(m.subject).toBe('[x-pat-cache] backups healthy on vps-1')
    expect(m.text).toContain('Archives kept:   7')
  })

  it('says STALE when the newest is too old, or there are none at all', () => {
    const old = buildReportMessage(
      {
        stats: { count: 3, newest: 'x.db.gz', newestAgeHours: 100, totalMb: 9 },
        host: 'vps-1',
        when: 'now',
      },
      '[x-pat-cache]',
    )
    expect(old.subject).toContain('STALE')
    expect(old.text).toContain('list-timers')

    const none = buildReportMessage(
      {
        stats: { count: 0, newest: null, newestAgeHours: null, totalMb: 0 },
        host: 'vps-1',
        when: 'now',
      },
      '[x-pat-cache]',
    )
    expect(none.subject).toContain('STALE')
  })

  it('honours a custom staleness threshold', () => {
    const stats = {
      count: 1,
      newest: 'x.db.gz',
      newestAgeHours: 30,
      totalMb: 1,
    }
    const base = { stats, host: 'vps-1', when: 'now' }
    expect(buildReportMessage(base, '[x]').subject).toContain('healthy') // 48h default
    expect(
      buildReportMessage({ ...base, staleAfterHours: 24 }, '[x]').subject,
    ).toContain('STALE')
  })

  it('treats a missing backups directory as stale, not as a crash', () => {
    const stats = collectBackupStats('/nonexistent/backups', Date.now())
    expect(stats).toEqual({
      count: 0,
      newest: null,
      newestAgeHours: null,
      totalMb: 0,
    })
  })
})

describe('the vacuum measurement', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  function status(body: string): string {
    dir = mkdtempSync(join(tmpdir(), 'x-loc-vac-'))
    writeFileSync(join(dir, VACUUM_STATUS_FILE), body)
    return dir
  }

  it('derives the reclaimable share from the two sizes backup.ts writes', () => {
    const v = readVacuumStatus(
      status('stamp=20260806-233000\nlive_bytes=400\nvacuumed_bytes=300\n'),
    )
    expect(v).toEqual({
      liveBytes: 400,
      vacuumedBytes: 300,
      reclaimPct: 25,
      stamp: '20260806-233000',
    })
  })

  it('reports nothing at all when no backup has measured yet', () => {
    expect(readVacuumStatus('/nonexistent/backups')).toBeNull()
    dir = mkdtempSync(join(tmpdir(), 'x-loc-vac-'))
    expect(readVacuumStatus(dir)).toBeNull()
  })

  it('reports nothing rather than a wrong number from a garbled file', () => {
    // A half-written file is the realistic case — a run killed between the
    // open and the flush. A fabricated percentage here sends somebody to stop
    // the service for no reason, so anything unparseable has to read as
    // "unknown", not as a value.
    expect(readVacuumStatus(status('live_bytes=400\n'))).toBeNull()
    expect(
      readVacuumStatus(status('live_bytes=\nvacuumed_bytes=300\n')),
    ).toBeNull()
    expect(
      readVacuumStatus(status('live_bytes=lots\nvacuumed_bytes=300\n')),
    ).toBeNull()
    expect(
      readVacuumStatus(status('live_bytes=-400\nvacuumed_bytes=300\n')),
    ).toBeNull()
    // Nothing to divide by, so there is no share to report.
    expect(
      readVacuumStatus(status('live_bytes=0\nvacuumed_bytes=0\n')),
    ).toBeNull()
  })

  it('never reports negative bloat', () => {
    // A rebuilt file can come out marginally larger than a freshly-packed
    // small one; that is 0% reclaimable, not -3%.
    const v = readVacuumStatus(status('live_bytes=1000\nvacuumed_bytes=1030\n'))
    expect(v!.reclaimPct).toBe(0)
  })

  it('falls back to the default threshold rather than letting a typo silence it', () => {
    expect(readAlertPct(undefined)).toBe(DEFAULT_VACUUM_ALERT_PCT)
    expect(readAlertPct('')).toBe(DEFAULT_VACUUM_ALERT_PCT)
    expect(readAlertPct('twenty')).toBe(DEFAULT_VACUUM_ALERT_PCT)
    expect(readAlertPct('0')).toBe(DEFAULT_VACUUM_ALERT_PCT)
    expect(readAlertPct('101')).toBe(DEFAULT_VACUUM_ALERT_PCT)
    expect(readAlertPct('40')).toBe(40)
  })
})

describe('reporting the vacuum measurement', () => {
  const HEALTHY = {
    stats: {
      count: 7,
      newest: 'x-loc-cache-20260806-000000.db.gz',
      newestAgeHours: 5,
      totalMb: 210,
    },
    host: 'vps-1',
    when: '2026-08-06T12:00:00.000Z',
  }
  /** 402.7 MB live, 330.3 MB rebuilt — 18%, comfortably under the threshold. */
  const SETTLED = {
    liveBytes: 422_000_000,
    vacuumedBytes: 346_000_000,
    reclaimPct: 18,
    stamp: '20260806-233000',
  }
  const BLOATED = { ...SETTLED, vacuumedBytes: 253_200_000, reclaimPct: 40 }

  it('carries the number every week, whether or not it is actionable', () => {
    const m = buildReportMessage({ ...HEALTHY, vacuum: SETTLED }, '[x]')
    expect(m.text).toContain('DB reclaimable:  18% (72.5 MB of 402.5 MB)')
    // Under the threshold it is a fact, not a request: the subject and the
    // lead line stay exactly as they are on any other quiet week.
    expect(m.subject).toBe('[x] backups healthy on vps-1')
    expect(m.text).toContain('Nothing to do')
    expect(m.text).not.toContain('vacuum.ts')
  })

  it('says so in the subject once it is worth the stop', () => {
    const m = buildReportMessage({ ...HEALTHY, vacuum: BLOATED }, '[x]')
    expect(m.subject).toBe(
      '[x] backups healthy on vps-1 (database 40% reclaimable)',
    )
    expect(m.text).toContain('DB reclaimable:  40%')
    // Leads with the finding, and the body says exactly what to run.
    expect(m.text).toMatch(/^Backups are current\. The database has 40%/)
    expect(m.text).toContain('deploy/vacuum.ts')
    expect(m.text).toContain('keeps the old file')
  })

  it('honours a threshold raised past the reading', () => {
    const m = buildReportMessage(
      { ...HEALTHY, vacuum: BLOATED, vacuumAlertPct: 50 },
      '[x]',
    )
    expect(m.subject).toBe('[x] backups healthy on vps-1')
    expect(m.text).toContain('DB reclaimable:  40%')
  })

  it('lets a stale backup own the subject, and still reports the number', () => {
    // Backups that stopped are the thing to fix this week; reclaimable disk
    // can wait, and two findings in one subject line reads as neither.
    const m = buildReportMessage(
      {
        ...HEALTHY,
        stats: { ...HEALTHY.stats, newestAgeHours: 100 },
        vacuum: BLOATED,
      },
      '[x]',
    )
    expect(m.subject).toBe('[x] backups are STALE on vps-1')
    expect(m.subject).not.toContain('reclaimable')
    expect(m.text).toContain('DB reclaimable:  40%')
    expect(m.text).not.toContain('vacuum.ts')
  })

  it('distinguishes "not measured yet" from "nothing to reclaim"', () => {
    // An upgraded box has no reading until its next backup runs. Omitting the
    // line entirely would make that look identical to 0%.
    const m = buildReportMessage(HEALTHY, '[x]')
    expect(m.text).toContain('DB reclaimable:  (not measured yet)')
    expect(m.subject).toBe('[x] backups healthy on vps-1')
  })
})

describe('send', () => {
  let server: Server | null = null
  afterEach(() => {
    server?.close()
    server = null
  })

  /**
   * A throwaway SMTP server. Enough of the protocol for nodemailer to complete
   * a session, so the transport is genuinely exercised — the point is to catch
   * a wiring mistake that message-building tests cannot see.
   */
  function smtpSink(): Promise<{ port: number; received: Promise<string> }> {
    return new Promise((resolve) => {
      let resolveMail: (v: string) => void
      const received = new Promise<string>((r) => (resolveMail = r))

      server = createServer((socket: Socket) => {
        let body = ''
        let inData = false
        socket.write('220 localhost ESMTP test\r\n')
        socket.on('data', (chunk) => {
          const text = chunk.toString()
          if (inData) {
            body += text
            if (body.includes('\r\n.\r\n')) {
              inData = false
              socket.write('250 OK queued\r\n')
              resolveMail(body)
            }
            return
          }
          for (const line of text.split('\r\n').filter(Boolean)) {
            const verb = line.split(' ')[0]!.toUpperCase()
            if (verb === 'EHLO' || verb === 'HELO') {
              socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n')
            } else if (verb === 'AUTH') {
              socket.write('235 authenticated\r\n')
            } else if (verb === 'MAIL' || verb === 'RCPT') {
              socket.write('250 OK\r\n')
            } else if (verb === 'DATA') {
              inData = true
              socket.write('354 send it\r\n')
            } else if (verb === 'QUIT') {
              socket.write('221 bye\r\n')
              socket.end()
            } else {
              socket.write('250 OK\r\n')
            }
          }
        })
        socket.on('error', () => {})
      })
      server.listen(0, '127.0.0.1', () => {
        resolve({ port: (server!.address() as AddressInfo).port, received })
      })
    })
  }

  it('delivers a message an SMTP server actually accepts', async () => {
    const { port, received } = await smtpSink()
    await send(
      {
        host: '127.0.0.1',
        port,
        secure: false,
        user: 'bot@example.com',
        pass: 'app-password',
        to: ['ops@example.com', 'second@example.com'],
        from: 'bot@example.com',
        subjectPrefix: '[x-pat-cache]',
      },
      {
        subject: '[x-pat-cache] DATABASE CORRUPTION on vps-1',
        text: 'Do NOT repair in place.',
      },
    )

    const raw = await received
    expect(raw).toContain('Subject: [x-pat-cache] DATABASE CORRUPTION on vps-1')
    expect(raw).toContain('ops@example.com')
    expect(raw).toContain('second@example.com')
    expect(raw).toContain('Do NOT repair in place.')
    // The password authenticates the session; it must never ride along in it.
    expect(raw).not.toContain('app-password')
  }, 20_000)

  it('rejects rather than hangs when the mail server is unreachable', async () => {
    await expect(
      send(
        {
          host: '127.0.0.1',
          port: 1, // nothing listens here
          secure: false,
          user: 'u',
          pass: 'p',
          to: ['ops@example.com'],
          from: 'u@example.com',
          subjectPrefix: '[x]',
        },
        { subject: 's', text: 't' },
      ),
    ).rejects.toThrow()
  }, 20_000)

  /** The script as systemd invokes it, not just its exported pieces. */
  function cli(
    args: string[],
    env: Record<string, string>,
  ): Promise<{ code: number | null; out: string; err: string }> {
    return new Promise((resolve) => {
      // Async, never spawnSync: the SMTP sink above lives in this process's
      // event loop, and a synchronous spawn would block it into a timeout.
      const child = spawn(
        'node',
        [
          '--experimental-strip-types',
          join(import.meta.dirname, 'alert.ts'),
          ...args,
        ],
        { env: { ...process.env, ...env } },
      )
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += String(c)))
      child.stderr.on('data', (c) => (err += String(c)))
      child.on('close', (code) => resolve({ code, out, err }))
    })
  }

  const OFF = { SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', NOTIFY_TO: '' }

  it('exits 0 when unconfigured, so a no-email deploy collects no failed units', async () => {
    const r = await cli(['--report'], OFF)
    expect(r.code).toBe(0)
    expect(r.out).toContain('nothing to send')
  }, 20_000)

  it('exits non-zero when half-configured', async () => {
    const r = await cli(['--report'], { ...OFF, SMTP_HOST: 'smtp.example.com' })
    expect(r.code).toBe(1)
    expect(r.err).toContain('half-configured')
  }, 20_000)

  it('exits 2 with usage when given no argument', async () => {
    const r = await cli([], { ...OFF, ...BASE })
    expect(r.code).toBe(2)
    expect(r.err).toContain('usage:')
  }, 20_000)

  it('sends the heartbeat end to end', async () => {
    const { port, received } = await smtpSink()
    const dir = mkdtempSync(join(tmpdir(), 'x-loc-cli-'))
    try {
      writeFileSync(
        join(dir, 'x-loc-cache-20260806-120000.db.gz'),
        Buffer.alloc(1024),
      )
      const r = await cli(['--report'], {
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        SMTP_SECURE: 'false',
        SMTP_USER: 'bot@example.com',
        SMTP_PASS: 'app-password',
        NOTIFY_TO: 'ops@example.com',
        XLOC_BACKUP_DIR: dir,
      })
      expect(r.code).toBe(0)
      expect(r.out).toContain('sent')
      const raw = await received
      expect(raw).toContain('backups healthy')
      expect(raw).not.toContain('app-password')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20_000)
})
