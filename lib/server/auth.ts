import crypto from 'node:crypto'
import { promisify } from 'node:util'
import type { Queryable } from './db'

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>
const N = 16384, R = 8, P = 1, LEN = 64

export const MIN_PASSWORD = 10
export const SESSION_DAYS = 30
export const COOKIE = 'asup_session'

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(pw, salt, LEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), Buffer.from(hash, 'base64').length, { N: Number(n), r: Number(r), p: Number(p) })
  const want = Buffer.from(hash, 'base64')
  return key.length === want.length && crypto.timingSafeEqual(key, want)
}

/** A hash to compare against when the email is unknown, so timing does not reveal which emails exist. */
let dummy: Promise<string> | null = null
export const dummyHash = () => (dummy ??= hashPassword('not-a-real-password'))

export const newToken = () => crypto.randomBytes(32).toString('base64url')
export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

export const normalizeEmail = (e: string) => e.trim().toLowerCase()

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (pw.length > 200) return 'That password is too long.'
  return null
}

export async function createLogin(q: Queryable, userId: string, userAgent: string | null): Promise<{ token: string; expires: Date }> {
  const token = newToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000)
  await q.query('insert into auth_sessions (user_id, token_hash, user_agent, expires_at) values ($1, $2, $3, $4)', [userId, hashToken(token), userAgent?.slice(0, 200) ?? null, expires.toISOString()])
  return { token, expires }
}

export async function userForToken(q: Queryable, token: string | undefined): Promise<{ id: string; email: string } | null> {
  if (!token) return null
  const r = await q.query<{ id: string; email: string }>(
    'select u.id, u.email from auth_sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()', [hashToken(token)])
  return r.rows[0] ?? null
}

// ------------------------------------------------------------------ rate limit (per process)
const hits = new Map<string, number[]>()
/** Returns true when the caller is over the limit. Keeps only the hits inside the window. */
export function limited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) { hits.set(key, recent); return true }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
  return false
}
export const resetLimits = () => hits.clear()
