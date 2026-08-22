// The slice of the D1 API this server uses. Declared here, not imported from
// workers-types, which cannot coexist with @types/node in tsconfig `types`.

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
