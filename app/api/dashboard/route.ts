import { NextResponse, type NextRequest } from 'next/server'
import { withUser } from '@/lib/server/http'
import { dashboardSummary } from '@/lib/server/repo'

export const dynamic = 'force-dynamic'

/** Account-wide figures for the signed-in user. Counts and medians only; nobody else's data is ever included. */
export const GET = (req: NextRequest) => withUser(req, async ({ db, user }) => NextResponse.json(await dashboardSummary(db, user.id)))
