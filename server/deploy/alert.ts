// Email alerting for the cache server and its backups.
//
// Two modes, both driven by systemd:
//
//   alert.ts <unit>     a unit failed — sent from OnFailure= (see
//                       x-loc-alert@.service). Catches everything, including
//                       what backup.sh cannot report about itself: an OOM kill,
//                       a missing interpreter, a timeout.
//   alert.ts --report   the weekly heartbeat (x-loc-heartbeat.timer). Its
//                       *absence* is the signal — a failure alert can only fire
//                       if something ran, so a timer that never fires is
//                       silent. This is what notices that.
//
// Deliberately touches no SQLite: nodemailer is pure JS with no native module,
// so this still sends when better-sqlite3 is what broke — a Node major upgrade
// without `npm install` takes down the server, and that is precisely the
// outage the email has to survive.
//
// Configured from /etc/x-loc-alert.env; the variable names match the ones a
// nodemailer setup already uses, so credentials can be copied across as-is.
// Unconfigured is not an error — it logs and exits 0, so a deployment that
// wants no email does not collect a failed unit every time.

import { spawnSync } from 'node:child_process'
import { hostname } from 'node:os'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer from 'nodemailer'

export interface AlertConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  to: string[]
  from: string
  subjectPrefix: string
}

/**
 * Strings backup.sh prints when the *data* is at fault rather than the run.
 * `alert.test.ts` asserts each one still appears in backup.sh — renaming a
 * message there without this would silently downgrade a corruption alert to a
 * generic failure, which is the difference between "look now" and "look later".
 */
export const CORRUPTION_MARKERS = [
  'the LIVE database failed integrity_check',
  'snapshot verification FAILED',
] as const

/** Absent config is not a failure; half-written config is. */
export function readConfig(env: NodeJS.ProcessEnv): AlertConfig | null {
  const host = env.SMTP_HOST?.trim()
  if (!host) return null

  const missing = (['SMTP_USER', 'SMTP_PASS', 'NOTIFY_TO'] as const).filter(
    (k) => !env[k]?.trim(),
  )
  if (missing.length > 0) {
    throw new Error(
      `SMTP_HOST is set but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not — alerting is half-configured`,
    )
  }

  const port = Number(env.SMTP_PORT ?? 465)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `SMTP_PORT must be a port number, got ${JSON.stringify(env.SMTP_PORT)}`,
    )
  }

  const user = env.SMTP_USER!.trim()
  return {
    host,
    port,
    // Implicit TLS on 465, STARTTLS on 587 — the usual pairing, overridable.
    secure: env.SMTP_SECURE ? env.SMTP_SECURE.trim() === 'true' : port === 465,
    user,
    pass: env.SMTP_PASS!,
    to: env
      .NOTIFY_TO!.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    from: env.NOTIFY_FROM?.trim() || user,
    subjectPrefix: env.XLOC_ALERT_PREFIX?.trim() || '[x-pat-cache]',
  }
}

export function isCorruption(journal: string): boolean {
  return CORRUPTION_MARKERS.some((m) => journal.includes(m))
}

function runText(cmd: string, args: string[]): string {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15_000 })
    return (
      (r.stdout ?? '').trim() ||
      (r.stderr ?? '').trim() ||
      `(${cmd} produced nothing)`
    )
  } catch (err) {
    return `(${cmd} failed: ${String(err)})`
  }
}

export interface FailureInput {
  unit: string
  host: string
  when: string
  properties: string
  journal: string
}

export function buildFailureMessage(
  input: FailureInput,
  prefix: string,
): { subject: string; text: string } {
  const corrupt = isCorruption(input.journal)
  const subject = corrupt
    ? `${prefix} DATABASE CORRUPTION on ${input.host}`
    : `${prefix} ${input.unit} failed on ${input.host}`

  // Lead with what to do. A failure email read on a phone should say whether
  // this can wait until morning before it says anything else.
  const lead = corrupt
    ? [
        'The integrity check failed. Do NOT repair in place.',
        '',
        'Restore the newest verified backup:',
        '  ls -lh /var/lib/x-loc-cache/backups/',
        '  sudo /opt/x-loc-cache/server/deploy/restore.sh <newest>.db.gz',
        '',
        'Backups were NOT pruned on this run, so the full history is intact.',
      ]
    : [
        `${input.unit} entered a failed state.`,
        '',
        'If this is x-loc-backup.service, no verified snapshot was taken —',
        'the previous archives are untouched, but tonight has no new one.',
      ]

  return {
    subject,
    text: [
      ...lead,
      '',
      `Host:  ${input.host}`,
      `Unit:  ${input.unit}`,
      `Time:  ${input.when}`,
      '',
      '--- unit state ---',
      input.properties,
      '',
      '--- last journal lines ---',
      input.journal,
      '',
      `-- sent by ${import.meta.filename}`,
    ].join('\n'),
  }
}

export interface BackupStats {
  count: number
  newest: string | null
  newestAgeHours: number | null
  totalMb: number
}

/** Reads the backups directory directly — no database access, on purpose. */
export function collectBackupStats(
  backupDir: string,
  now: number,
): BackupStats {
  let files: string[] = []
  try {
    files = readdirSync(backupDir).filter((f) => f.endsWith('.db.gz'))
  } catch {
    return { count: 0, newest: null, newestAgeHours: null, totalMb: 0 }
  }
  let bytes = 0
  let newest: string | null = null
  let newestMs = 0
  for (const f of files) {
    try {
      const s = statSync(join(backupDir, f))
      bytes += s.size
      if (s.mtimeMs > newestMs) {
        newestMs = s.mtimeMs
        newest = f
      }
    } catch {
      // Raced with a prune; it just doesn't count toward the total.
    }
  }
  return {
    count: files.length,
    newest,
    newestAgeHours: newest
      ? Math.round(((now - newestMs) / 3_600_000) * 10) / 10
      : null,
    totalMb: Math.round((bytes / 1_048_576) * 10) / 10,
  }
}

export interface ReportInput {
  stats: BackupStats
  host: string
  when: string
  /** Older than this and the heartbeat reports STALE instead of healthy. */
  staleAfterHours?: number
}

export function buildReportMessage(
  input: ReportInput,
  prefix: string,
): { subject: string; text: string } {
  const { stats, host, when, staleAfterHours = 48 } = input
  const stale =
    stats.count === 0 ||
    stats.newestAgeHours === null ||
    stats.newestAgeHours > staleAfterHours
  const subject = stale
    ? `${prefix} backups are STALE on ${host}`
    : `${prefix} backups healthy on ${host}`

  return {
    subject,
    text: [
      stale
        ? `No backup newer than ${staleAfterHours}h. Check: systemctl list-timers x-loc-backup`
        : 'Backups are current. Nothing to do — this is the weekly heartbeat.',
      '',
      `Host:            ${host}`,
      `Time:            ${when}`,
      `Archives kept:   ${stats.count}`,
      `Newest:          ${stats.newest ?? '(none)'}`,
      `Newest age:      ${stats.newestAgeHours === null ? '(n/a)' : `${stats.newestAgeHours}h`}`,
      `Total on disk:   ${stats.totalMb} MB`,
      '',
      'If this email stops arriving, the heartbeat timer itself has stopped —',
      'that silence is the thing it exists to make noticeable.',
    ].join('\n'),
  }
}

export async function send(
  config: AlertConfig,
  message: { subject: string; text: string },
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    // A hung SMTP server must not hold the unit open indefinitely.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  try {
    await transport.sendMail({
      from: config.from,
      to: config.to.join(', '),
      subject: message.subject,
      text: message.text,
    })
  } finally {
    transport.close()
  }
}

async function main(): Promise<void> {
  let config: AlertConfig | null
  try {
    config = readConfig(process.env)
  } catch (err) {
    console.error(`[x-loc-alert] ${(err as Error).message}`)
    process.exit(1)
  }
  if (!config) {
    console.log('[x-loc-alert] no SMTP_HOST configured — nothing to send')
    return
  }

  const arg = process.argv[2]
  if (!arg) {
    console.error('[x-loc-alert] usage: alert.ts <unit> | --report')
    process.exit(2)
  }

  const host = hostname()
  const when = new Date().toISOString()
  const message =
    arg === '--report'
      ? buildReportMessage(
          {
            stats: collectBackupStats(
              process.env.XLOC_BACKUP_DIR ?? '/var/lib/x-loc-cache/backups',
              Date.now(),
            ),
            host,
            when,
          },
          config.subjectPrefix,
        )
      : buildFailureMessage(
          {
            unit: arg,
            host,
            when,
            properties: runText('systemctl', [
              'show',
              arg,
              '-p',
              'ActiveState',
              '-p',
              'Result',
              '-p',
              'ExecMainStatus',
              '-p',
              'NRestarts',
            ]),
            journal: runText('journalctl', [
              '-u',
              arg,
              '-n',
              '40',
              '--no-pager',
              '-o',
              'short-iso',
            ]),
          },
          config.subjectPrefix,
        )

  try {
    await send(config, message)
    console.log(
      `[x-loc-alert] sent "${message.subject}" to ${config.to.join(', ')}`,
    )
  } catch (err) {
    // Never echo the config: the password is in it.
    console.error(`[x-loc-alert] send failed: ${(err as Error).message}`)
    process.exit(1)
  }
}

// Only run when executed, so the pure builders above can be imported by tests.
if (process.argv[1] === import.meta.filename) {
  await main()
}
