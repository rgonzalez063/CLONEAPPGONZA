import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { limited, verifyPassword } from '@/lib/server/auth'
import { clearLoginCookie, err, readBody, withUser } from '@/lib/server/http'
import { deleteUser } from '@/lib/server/repo'

export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) => withUser(req, async ({ user }) => NextResponse.json({ user }))

/** Deletes the account and everything under it. Needs the password again. */
export const DELETE = (req: NextRequest) => withUser(req, async ({ db, user }) => {
  const body = await readBody(req, z.object({ password: z.string().min(1).max(200) }))
  if (!body.ok) return body.res
  if (limited(`delete:${user.id}`, 5, 15 * 60_000)) return err(429, 'Too many attempts. Wait a few minutes and try again.')
  const row = await db.query<{ password_hash: string }>('select password_hash from users where id = $1', [user.id])
  if (!row.rows[0] || !(await verifyPassword(body.data.password, row.rows[0].password_hash))) return err(403, 'That password is not right.')
  await deleteUser(db, user.id)
  const res = NextResponse.json({ ok: true })
  clearLoginCookie(res)
  return res
})
