import { NextResponse, type NextRequest } from 'next/server'
import type { ZodType } from 'zod'
import { COOKIE, SESSION_DAYS, userForToken } from './auth'
import { getDb, type Db } from './db'

export const MAX_BODY = 12 * 1024 * 1024

export const err = (status: number, message: string) => NextResponse.json({ error: message }, { status })

export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local').slice(0, 60)

/** Blocks cross-site form posts: JSON only, and the Origin (when sent) must be this site. */
export function checkRequest(req: NextRequest): NextResponse | null {
  if (req.method === 'GET' || req.method === 'HEAD') return null
  const type = req.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) return err(415, 'Send JSON.')
  const origin = req.headers.get('origin')
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    try { if (new URL(origin).host !== host) return err(403, 'Cross-site requests are not allowed.') } catch { return err(403, 'Bad origin.') }
  }
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY) return err(413, 'That request is too large.')
  return null
}

export async function readBody<T>(req: NextRequest, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  const text = await req.text()
  if (text.length > MAX_BODY) return { ok: false, res: err(413, 'That request is too large.') }
  let raw: unknown
  try { raw = text ? JSON.parse(text) : {} } catch { return { ok: false, res: err(400, 'That is not valid JSON.') } }
  const r = schema.safeParse(raw)
  if (!r.success) return { ok: false, res: err(400, `Invalid input: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`) }
  return { ok: true, data: r.data }
}

export interface Ctx { db: Db; user: { id: string; email: string } }

/** Runs a handler for the signed-in user, or answers 401. Also applies the request checks. */
export async function withUser(req: NextRequest, fn: (c: Ctx) => Promise<NextResponse>): Promise<NextResponse> {
  const bad = checkRequest(req)
  if (bad) return bad
  try {
    const db = await getDb()
    const user = await userForToken(db, req.cookies.get(COOKIE)?.value)
    if (!user) return err(401, 'Please sign in.')
    return await fn({ db, user })
  } catch (e) {
    console.error('request failed', e instanceof Error ? e.message : 'unknown error') // never log request bodies or user data
    return err(500, 'Something went wrong on the server.')
  }
}

export function setLoginCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires, maxAge: SESSION_DAYS * 86400 })
}
export const clearLoginCookie = (res: NextResponse) => res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
