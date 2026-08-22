// SQLite backend — a D1-shaped adapter over better-sqlite3, implementing only
// db-types.ts. See "The Node deployment" in CLAUDE.md.

import Database from 'better-sqlite3'
import type { Statement } from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db, DbBoundStatement, DbStatement } from './db-types.ts'

export interface SqliteConfig {
  /** File path, or ':memory:' for tests. */
  path: string
  /** SQLite page cache ceiling. Real resident memory once the DB is big enough. */
  cacheMb: number
  /** Address space backed by the OS page cache, reclaimed under pressure —
   *  safe well above free RAM, unlike cacheMb. */
  mmapMb: number
}

export const DEFAULT_SQLITE_CONFIG = {
  cacheMb: 256,
  mmapMb: 512,
  busyTimeoutMs: 5000,
} as const

class BoundStatement implements DbBoundStatement {
  #stmt: Statement
  #args: unknown[]

  constructor(stmt: Statement, args: unknown[]) {
    this.#stmt = stmt
    this.#args = args
  }

  /** Exposed for SqliteDb.batch, which needs to run these inside a transaction. */
  exec(): void {
    this.#stmt.run(...(this.#args as never[]))
  }

  // `async` only so a driver error rejects rather than throwing synchronously,
  // which is D1's contract. The body never yields.
  async all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> {
    return { results: this.#stmt.all(...(this.#args as never[])) as T[] }
  }

  async run(): Promise<unknown> {
    return this.#stmt.run(...(this.#args as never[]))
  }
}

class PreparedStatement extends BoundStatement implements DbStatement {
  #stmt: Statement

  constructor(stmt: Statement) {
    super(stmt, [])
    this.#stmt = stmt
  }

  bind(...values: unknown[]): DbBoundStatement {
    return new BoundStatement(this.#stmt, values)
  }
}

export class SqliteDb implements Db {
  #db: Database.Database
  // Statement cache: SQL text varies with batch size, so it is capped and
  // evicted oldest-first.
  #cache = new Map<string, Statement>()
  #cacheLimit = 512

  constructor(db: Database.Database) {
    this.#db = db
  }

  prepare(sql: string): DbStatement {
    let stmt = this.#cache.get(sql)
    if (!stmt) {
      stmt = this.#db.prepare(sql)
      if (this.#cache.size >= this.#cacheLimit) {
        const oldest = this.#cache.keys().next()
        if (!oldest.done) this.#cache.delete(oldest.value)
      }
      this.#cache.set(sql, stmt)
    }
    return new PreparedStatement(stmt)
  }

  /** D1 batches in one implicit transaction; this is a real one. */
  async batch(statements: DbBoundStatement[]): Promise<unknown> {
    const tx = this.#db.transaction((list: DbBoundStatement[]) => {
      for (const s of list) (s as BoundStatement).exec()
    })
    tx(statements)
    return []
  }

  /** Hand back the driver for lifecycle work (checkpointing, PRAGMA optimize). */
  get raw(): Database.Database {
    return this.#db
  }

  close(): void {
    // Updates SQLite's internal stats so the planner starts warm next boot.
    this.#db.pragma('optimize')
    this.#db.close()
  }
}

/** Open (creating if absent) and apply schema.sql, which is idempotent — there
 *  is no separate migration step to forget on a fresh box. */
export function openDatabase(config: SqliteConfig): SqliteDb {
  const db = new Database(config.path)

  // WAL + synchronous=NORMAL: reads proceed during a write, at the cost of the
  // last few contributions on a crash. See CLAUDE.md.
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma(`busy_timeout = ${DEFAULT_SQLITE_CONFIG.busyTimeoutMs}`)
  // Negative cache_size is a size in KiB rather than a page count.
  db.pragma(`cache_size = -${Math.max(1, config.cacheMb) * 1024}`)
  db.pragma(`mmap_size = ${Math.max(0, config.mmapMb) * 1024 * 1024}`)
  db.pragma('temp_store = MEMORY')

  db.exec(readFileSync(join(import.meta.dirname, '..', 'schema.sql'), 'utf8'))

  return new SqliteDb(db)
}
