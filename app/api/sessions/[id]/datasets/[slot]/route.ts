import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { err, readBody, withUser } from '@/lib/server/http'
import { patchDataset } from '@/lib/server/repo'
import { datasetPatch } from '@/lib/server/schemas'

export const dynamic = 'force-dynamic'
const MAX_PER_DATASET = 5000

export const PATCH = (req: NextRequest, { params }: { params: Promise<{ id: string; slot: string }> }) => withUser(req, async ({ db, user }) => {
  const { id, slot } = await params
  const n = Number(slot)
  if (!z.string().uuid().safeParse(id).success || !Number.isInteger(n) || n < 1 || n > 3) return err(404, 'Not found.')
  const body = await readBody(req, datasetPatch)
  if (!body.ok) return body.res
  // One transaction: if the dataset would end up over the limit, nothing is saved.
  const found = await db.tx(async (q) => {
    const ok = await patchDataset(q, user.id, id, n, body.data)
    if (!ok) return 'missing' as const
    const c = await q.query<{ n: string }>('select count(*) as n from properties p join datasets d on d.id = p.dataset_id where d.session_id = $1 and d.slot = $2', [id, n])
    if (Number(c.rows[0].n) > MAX_PER_DATASET) throw new Error('limit')
    return 'ok' as const
  }).catch((e: Error) => (e.message === 'limit' ? ('limit' as const) : Promise.reject(e)))
  if (found === 'missing') return err(404, 'Not found.')
  if (found === 'limit') return err(400, `A dataset can hold up to ${MAX_PER_DATASET.toLocaleString('en-US')} sales.`)
  return NextResponse.json({ ok: true })
})
