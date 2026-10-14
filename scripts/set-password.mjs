// Sets a new password for an existing account. There is no email provider, so this is the reset path.
// Usage:  node scripts/set-password.mjs you@example.com "a new long password"
// Uses DATABASE_URL when set, otherwise the local database under .data/pglite. Stop the app first when using the local one.
import crypto from 'node:crypto'
import path from 'node:path'
import { promisify } from 'node:util'

const [email, password] = process.argv.slice(2)
if (!email || !password || password.length < 10) { console.error('Usage: node scripts/set-password.mjs EMAIL "PASSWORD (10+ characters)"'); process.exit(1) }
const scrypt = promisify(crypto.scrypt)
const salt = crypto.randomBytes(16)
const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })
const hash = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`
const norm = email.trim().toLowerCase()

let run, close
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  run = (sql, params) => pool.query(sql, params); close = () => pool.end()
} else {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite(path.join(process.cwd(), '.data', 'pglite'))
  run = (sql, params) => db.query(sql, params); close = () => db.close()
}
const r = await run('update users set password_hash = $1 where email = $2 returning id', [hash, norm])
if (!r.rows.length) { console.error('No account with that email.'); await close(); process.exit(1) }
await run('delete from auth_sessions where user_id = $1', [r.rows[0].id]) // sign out everywhere
console.log('Password changed. Every existing login for that account was ended.')
await close()
