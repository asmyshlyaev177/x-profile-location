// SQLite backend — a D1-shaped adapter over better-sqlite3.
//
// Implements exactly the interface in db-types.ts, which is all index.ts uses,
// so the request handlers are shared verbatim with the Cloudflare Worker build.
//
// better-sqlite3 is synchronous: every query blocks the event loop for the few
// microseconds it takes. That is the right trade here — these are single-index
// lookups on a small table, and a synchronous driver means no connection pool,
// no await interleaving, and a batch() that is a real transaction rather than a
// best-effort sequence.

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
  /**
   * Memory-mapped I/O ceiling. Unlike cacheMb this is address space backed by
   * the OS page cache, so the kernel reclaims it under pressure — safe to set
   * well above free RAM.
   */
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

  // These are `async` purely so a driver error surfaces as a rejected promise
  // rather than a synchronous throw — D1's contract, and what the caller's
  // `await` expects. The body itself never yields.
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
  // Statement cache. The handlers build SQL with a variable number of `IN (?,…)`
  // placeholders, so the text varies with batch size — bounded at ~2 × MAX_BATCH
  // distinct strings, but capped anyway so a future caller can't grow it without
  // limit. Eviction is oldest-first (Map preserves insertion order).
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

  /**
   * D1's batch() runs its statements in one implicit transaction; better-sqlite3
   * gives us a real one. Only write statements are ever batched by index.ts.
   */
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
    // Lets SQLite update its internal stats so the query planner starts warm
    // next boot. Cheap, and the docs recommend it before closing a long-lived
    // connection.
    this.#db.pragma('optimize')
    this.#db.close()
  }
}

/**
 * Open (creating if absent) the cache database and apply the schema. schema.sql
 * is all `CREATE TABLE IF NOT EXISTS`, so this is idempotent and there is no
 * separate migration step to forget on a fresh box.
 */
export function openDatabase(config: SqliteConfig): SqliteDb {
  const db = new Database(config.path)

  // WAL lets the read path (the hot one) proceed while a contribution is
  // writing. synchronous=NORMAL trades an fsync per commit for the OS's
  // durability guarantees — on a crash the last few contributions can be lost,
  // which for a best-effort crowdsourced cache is a fine trade for the write
  // throughput. It is *not* corruption-prone; WAL still recovers cleanly.
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
