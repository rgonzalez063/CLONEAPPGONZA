import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { COOKIE, hashToken } from '@/lib/server/auth'
import { clearLoginCookie, readBody, withUser } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/** Signs out this browser, or every browser when everywhere is true. */
export async function POST(req: NextRequest) {
  return withUser(req, async ({ db, user }) => {
    const body = await readBody(req, z.object({ everywhere: z.boolean().optional() }))
    if (!body.ok) return body.res
    if (body.data.everywhere) await db.query('delete from auth_sessions where user_id = $1', [user.id])
    else await db.query('delete from auth_sessions where token_hash = $1', [hashToken(req.cookies.get(COOKIE)?.value ?? '')])
    const res = NextResponse.json({ ok: true })
    clearLoginCookie(res)
    return res
  })
}
