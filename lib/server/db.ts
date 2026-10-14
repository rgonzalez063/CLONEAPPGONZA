import fs from 'node:fs'
import path from 'node:path'

/**
 * One small interface over two Postgres drivers:
 * - DATABASE_URL set: node-postgres, for a hosted database (Supabase, Neon, RDS, ...).
 * - otherwise: PGlite, a real Postgres compiled to WebAssembly, stored under .data/ for local use.
 */
export type Row = Record<string, unknown>
export interface Queryable { query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; exec(sql: string): Promise<void> }
export interface Db extends Queryable { tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>; close(): Promise<void> }

async function migrate(q: Queryable, dir: string) {
  await q.exec('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())')
  const done = new Set((await q.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name))
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    await q.exec(fs.readFileSync(path.join(dir, file), 'utf8'))
    await q.query('insert into schema_migrations (name) values ($1)', [file])
  }
}

const migrationsDir = () => path.join(process.cwd(), 'migrations')

async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  if (dataDir) fs.mkdirSync(path.dirname(dataDir), { recursive: true })
  const pg = new PGlite(dataDir)
  await pg.waitReady
  const wrap = (c: { query: PGliteLike['query']; exec: (sql: string) => Promise<unknown> }): Queryable => ({
    exec: async (sql: string) => { await c.exec(sql) },
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await c.query(sql, params as unknown[])).rows as T[] }),
  })
  const db: Db = {
    ...wrap(pg),
    tx: (fn) => pg.transaction(async (t) => fn(wrap(t))),
    close: () => pg.close(),
  }
  await migrate(db, migrationsDir())
  return db
}
type PGliteLike = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

async function openPg(url: string): Promise<Db> {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: url, max: 5 })
  const db: Db = {
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params as unknown[])).rows as T[] }),
    exec: async (sql: string) => { await pool.query(sql) },
    tx: async (fn) => {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const out = await fn({
          query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await c.query(sql, params as unknown[])).rows as T[] }),
          exec: async (sql: string) => { await c.query(sql) },
        })
        await c.query('commit')
        return out
      } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
    },
    close: () => pool.end(),
  }
  await migrate(db, migrationsDir())
  return db
}

/** An isolated in-memory database with the schema applied. Used by tests. */
export const openMemoryDb = () => openPglite(undefined)

const g = globalThis as unknown as { __asupDb?: Promise<Db> }
export function getDb(): Promise<Db> {
  if (!g.__asupDb) {
    g.__asupDb = process.env.DATABASE_URL ? openPg(process.env.DATABASE_URL) : openPglite(path.join(process.cwd(), '.data', 'pglite'))
    g.__asupDb.catch(() => { g.__asupDb = undefined })
  }
  return g.__asupDb
}
