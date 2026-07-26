// The slice of the D1 API this server actually uses.
//
// Declaring it here rather than importing D1Database from
// @cloudflare/workers-types is what lets index.ts run unmodified on both
// backends: Cloudflare's D1Database satisfies these shapes structurally, and
// so does the better-sqlite3 adapter in sqlite.ts. It also keeps the package
// off workers-types in tsconfig `types`, which cannot coexist with @types/node
// (both declare global fetch/Request/Response).

export interface DbBoundStatement {
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

export interface DbStatement extends DbBoundStatement {
  bind(...values: unknown[]): DbBoundStatement
}

export interface Db {
  prepare(sql: string): DbStatement
  /** Runs every statement in one implicit transaction (D1 semantics). */
  batch(statements: DbBoundStatement[]): Promise<unknown>
}
