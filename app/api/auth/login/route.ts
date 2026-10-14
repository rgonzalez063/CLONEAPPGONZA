import { NextResponse, type NextRequest } from 'next/server'
import { createLogin, dummyHash, limited, normalizeEmail, verifyPassword } from '@/lib/server/auth'
import { getDb } from '@/lib/server/db'
import { checkRequest, clientIp, err, readBody, setLoginCookie } from '@/lib/server/http'
import { credentials } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const bad = checkRequest(req)
  if (bad) return bad
  const body = await readBody(req, credentials)
  if (!body.ok) return body.res
  const email = normalizeEmail(body.data.email)
  const ip = clientIp(req)
  if (limited(`login:${ip}:${email}`, 8, 15 * 60_000) || limited(`login-ip:${ip}`, 40, 15 * 60_000)) return err(429, 'Too many attempts. Wait a few minutes and try again.')
  try {
    const db = await getDb()
    const u = await db.query<{ id: string; password_hash: string }>('select id, password_hash from users where email = $1', [email])
    const ok = await verifyPassword(body.data.password, u.rows[0]?.password_hash ?? (await dummyHash()))
    if (!u.rows[0] || !ok) return err(401, 'That email and password do not match.')
    const { token, expires } = await createLogin(db, u.rows[0].id, req.headers.get('user-agent'))
    const res = NextResponse.json({ user: { id: u.rows[0].id, email } })
    setLoginCookie(res, token, expires)
    return res
  } catch (e) {
    console.error('login failed', e instanceof Error ? e.message : 'unknown error')
    return err(500, 'Something went wrong on the server.')
  }
}
