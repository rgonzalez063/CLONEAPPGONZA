import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { err, readBody, withUser } from '@/lib/server/http'
import { addEvents, listEvents } from '@/lib/server/repo'
import { eventsInput } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'
type P = { params: Promise<{ id: string }> }
const uuid = z.string().uuid()

export const GET = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!uuid.safeParse(id).success) return err(404, 'Not found.')
  const events = await listEvents(db, user.id, id, 5000)
  return events ? NextResponse.json({ events }) : err(404, 'Not found.')
})

export const POST = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!uuid.safeParse(id).success) return err(404, 'Not found.')
  const body = await readBody(req, eventsInput)
  if (!body.ok) return body.res
  return (await addEvents(db, user.id, id, body.data.events)) ? NextResponse.json({ ok: true }, { status: 201 }) : err(404, 'Not found.')
})
