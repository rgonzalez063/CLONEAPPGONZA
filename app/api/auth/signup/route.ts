import { NextResponse, type NextRequest } from 'next/server'
import { createLogin, hashPassword, limited, normalizeEmail, passwordProblem } from '@/lib/server/auth'
import { getDb } from '@/lib/server/db'
import { checkRequest, clientIp, err, readBody, setLoginCookie } from '@/lib/server/http'
import { credentials } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'

/** Sign up is open only while there are no users, or when ALLOW_SIGNUP=true. A private tool stays private by default. */
export async function POST(req: NextRequest) {
  const bad = checkRequest(req)
  if (bad) return bad
  if (limited(`signup:${clientIp(req)}`, 10, 3600_000)) return err(429, 'Too many attempts. Try again later.')
  const body = await readBody(req, credentials)
  if (!body.ok) return body.res
  const problem = passwordProblem(body.data.password)
  if (problem) return err(400, problem)
  try {
    const db = await getDb()
    const count = Number((await db.query<{ n: string }>('select count(*) as n from users')).rows[0].n)
    if (count > 0 && process.env.ALLOW_SIGNUP !== 'true') return err(403, 'Sign up is closed. Ask the owner of this site for an account.')
    const email = normalizeEmail(body.data.email)
    const exists = await db.query('select 1 from users where email = $1', [email])
    if (exists.rows.length) return err(409, 'An account with that email already exists.')
    const hash = await hashPassword(body.data.password)
    const u = await db.query<{ id: string }>('insert into users (email, password_hash) values ($1, $2) returning id', [email, hash])
    const { token, expires } = await createLogin(db, u.rows[0].id, req.headers.get('user-agent'))
    const res = NextResponse.json({ user: { id: u.rows[0].id, email } }, { status: 201 })
    setLoginCookie(res, token, expires)
    return res
  } catch (e) {
    console.error('signup failed', e instanceof Error ? e.message : 'unknown error')
    return err(500, 'Something went wrong on the server.')
  }
}
