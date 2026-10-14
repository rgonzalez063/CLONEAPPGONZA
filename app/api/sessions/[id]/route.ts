import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { err, readBody, withUser } from '@/lib/server/http'
import { deleteSession, getSession, patchSession } from '@/lib/server/repo'
import { sessionPatch } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'
type P = { params: Promise<{ id: string }> }
const uuid = z.string().uuid()

export const GET = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!uuid.safeParse(id).success) return err(404, 'Not found.')
  const s = await getSession(db, user.id, id)
  return s ? NextResponse.json({ session: s }) : err(404, 'Not found.')
})

export const PATCH = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!uuid.safeParse(id).success) return err(404, 'Not found.')
  const body = await readBody(req, sessionPatch)
  if (!body.ok) return body.res
  const ok = await patchSession(db, user.id, id, body.data)
  return ok ? NextResponse.json({ ok: true }) : err(404, 'Not found.')
})

export const DELETE = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!uuid.safeParse(id).success) return err(404, 'Not found.')
  return (await deleteSession(db, user.id, id)) ? NextResponse.json({ ok: true }) : err(404, 'Not found.')
})
