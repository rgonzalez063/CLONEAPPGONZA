import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { err, readBody, withUser } from '@/lib/server/http'
import { deleteMarketFile, putMarketFile } from '@/lib/server/repo'
import { marketFile } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string; slot: string }> }
const valid = (id: string, slot: string) => z.string().uuid().safeParse(id).success && ['1', '2'].includes(slot)

export const PUT = (req: NextRequest, { params }: Params) => withUser(req, async ({ db, user }) => {
  const { id, slot } = await params
  if (!valid(id, slot)) return err(404, 'Not found.')
  const body = await readBody(req, marketFile)
  if (!body.ok) return body.res
  const ok = await putMarketFile(db, user.id, id, Number(slot), body.data)
  return ok ? NextResponse.json({ ok: true }) : err(404, 'Not found.')
})

export const DELETE = (req: NextRequest, { params }: Params) => withUser(req, async ({ db, user }) => {
  const { id, slot } = await params
  if (!valid(id, slot)) return err(404, 'Not found.')
  await deleteMarketFile(db, user.id, id, Number(slot))
  return NextResponse.json({ ok: true })
})
