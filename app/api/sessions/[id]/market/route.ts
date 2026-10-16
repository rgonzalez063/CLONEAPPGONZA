import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { err, withUser } from '@/lib/server/http'
import { listMarketFiles } from '@/lib/server/repo'

export const dynamic = 'force-dynamic'

export const GET = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => withUser(req, async ({ db, user }) => {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return err(404, 'Not found.')
  const files = await listMarketFiles(db, user.id, id)
  return files ? NextResponse.json({ files }) : err(404, 'Not found.')
})
