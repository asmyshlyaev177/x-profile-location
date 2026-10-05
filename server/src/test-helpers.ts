// For the tests that run a server entry point as its own process, and those
// that need the tables production held before they went WITHOUT ROWID.

import Database from 'better-sqlite3'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'

// Copied from production's file, not derived from schema.sql: a column added
// there later would otherwise appear in the "old" tables too, and a conversion
// that cannot fill it would still pass.
const ROWID_SCHEMA = `
CREATE TABLE profiles (
  username            TEXT    PRIMARY KEY,
  location            TEXT,
  source              TEXT,
  location_accurate   INTEGER NOT NULL DEFAULT 1,
  location_confidence INTEGER NOT NULL DEFAULT 0,
  updated_at          INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE location_votes (
  username          TEXT    NOT NULL,
  client_id         TEXT    NOT NULL,
  location          TEXT,
  source            TEXT,
  location_accurate INTEGER NOT NULL DEFAULT 1,
  seen_at           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (username, client_id)
);`

/** The layout production keeps until vacuum.ts converts it, and that every
 *  archive from before then restores to. */
export function createRowidDatabase(path: string): Database.Database {
  const db = new Database(path)
  db.exec(ROWID_SCHEMA)
  return db
}

export async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const { port } = probe.address() as { port: number }
  await new Promise((done) => probe.close(done))
  return port
}

export interface ServerProcess {
  child: ChildProcess
  /** Everything written to stdout and stderr so far. */
  output(): string
}

/** Runs `node <args>`, resolving once the server logs that it is listening. */
export function startServer(
  args: string[],
  env: Record<string, string>,
): Promise<ServerProcess> {
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      XLOC_HOST: '127.0.0.1',
      XLOC_STATS_INTERVAL_HOURS: '0',
      ...env,
    },
  })
  let output = ''
  return new Promise((ready, fail) => {
    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      if (output.includes('listening on'))
        ready({ child, output: () => output })
    }
    child.stdout!.on('data', onData)
    child.stderr!.on('data', onData)
    child.once('exit', (code) => fail(new Error(`exited ${code}:\n${output}`)))
  })
}

/** SIGTERM, which drains and logs the shutdown stats line; resolves with the
 *  exit code. */
export function stopServer(child: ChildProcess): Promise<number | null> {
  const exited = new Promise<number | null>((done) => child.once('exit', done))
  child.kill('SIGTERM')
  return exited
}
