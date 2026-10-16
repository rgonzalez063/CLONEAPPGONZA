import { NextResponse, type NextRequest } from 'next/server'
import { err, withUser } from '@/lib/server/http'
import { listPriorChoices } from '@/lib/server/repo'

export const dynamic = 'force-dynamic'

/** The signed-in user's own earlier adjustments on properties in the same zip code within a year of an effective date. */
export const GET = (req: NextRequest) => withUser(req, async ({ db, user }) => {
  const url = new URL(req.url)
  const zip = (url.searchParams.get('zip') ?? '').trim().slice(0, 20)
  const effective = url.searchParams.get('effective') ?? ''
  const exclude = url.searchParams.get('exclude') ?? ''
  if (!zip || !/^\d{4}-\d{2}-\d{2}$/.test(effective)) return err(400, 'Give a zip code and an effective date.')
  return NextResponse.json({ priors: await listPriorChoices(db, user.id, zip, effective, /^[0-9a-f-]{36}$/.test(exclude) ? exclude : null) })
})
