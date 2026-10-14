import { NextResponse, type NextRequest } from 'next/server'
import { err, readBody, withUser } from '@/lib/server/http'
import { createTemplate, listTemplates } from '@/lib/server/repo'
import { templateInput } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest) => withUser(req, async ({ db, user }) => {
  const u = new URL(req.url)
  return NextResponse.json({ templates: await listTemplates(db, user.id, { mls: u.searchParams.get('mls') ?? undefined, propertyType: u.searchParams.get('propertyType') ?? undefined }) })
})

export const POST = (req: NextRequest) => withUser(req, async ({ db, user }) => {
  const body = await readBody(req, templateInput)
  if (!body.ok) return body.res
  try { return NextResponse.json({ template: await createTemplate(db, user.id, body.data) }, { status: 201 }) }
  catch (e) { return /unique|duplicate/i.test(e instanceof Error ? e.message : '') ? err(409, 'You already have a template with that name for this MLS and property type.') : Promise.reject(e) }
})
