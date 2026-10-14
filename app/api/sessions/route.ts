import { NextResponse, type NextRequest } from 'next/server'
import { readBody, withUser } from '@/lib/server/http'
import { createSession, listSessions } from '@/lib/server/repo'
import { newSession } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) => withUser(req, async ({ db, user }) => NextResponse.json({ sessions: await listSessions(db, user.id) }))

export const POST = (req: NextRequest) => withUser(req, async ({ db, user }) => {
  const body = await readBody(req, newSession)
  if (!body.ok) return body.res
  return NextResponse.json({ session: await createSession(db, user.id, body.data) }, { status: 201 })
})
