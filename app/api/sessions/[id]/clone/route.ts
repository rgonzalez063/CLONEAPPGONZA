import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { err, withUser } from '@/lib/server/http'
import { cloneSession } from '@/lib/server/repo'

export const dynamic = 'force-dynamic'

export const POST = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return err(404, 'Not found.')
  const copy = await db.tx((q) => cloneSession(q, user.id, id)) // all or nothing
  return copy ? NextResponse.json({ session: { id: copy.id, name: copy.name } }, { status: 201 }) : err(404, 'Not found.')
})
