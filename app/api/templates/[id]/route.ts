import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { err, readBody, withUser } from '@/lib/server/http'
import { deleteTemplate, getTemplate, updateTemplate } from '@/lib/server/repo'
import { templateInput } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'
type P = { params: Promise<{ id: string }> }
const uuid = z.string().uuid()

export const GET = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  const t = uuid.safeParse(id).success ? await getTemplate(db, user.id, id) : null
  return t ? NextResponse.json({ template: t }) : err(404, 'Not found.')
})

export const PUT = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!uuid.safeParse(id).success) return err(404, 'Not found.')
  const body = await readBody(req, templateInput.partial())
  if (!body.ok) return body.res
  try {
    const t = await updateTemplate(db, user.id, id, body.data)
    return t ? NextResponse.json({ template: t }) : err(404, 'Not found.')
  } catch (e) { return /unique|duplicate/i.test(e instanceof Error ? e.message : '') ? err(409, 'You already have a template with that name for this MLS and property type.') : Promise.reject(e) }
})

export const DELETE = (req: NextRequest, { params }: P) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!uuid.safeParse(id).success) return err(404, 'Not found.')
  return (await deleteTemplate(db, user.id, id)) ? NextResponse.json({ ok: true }) : err(404, 'Not found.')
})
