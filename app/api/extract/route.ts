import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { limited } from '@/lib/server/auth'
import { ExtractError, modelName, newClient, runExtraction } from '@/lib/server/extract'
import { FileProblem, MAX_FILE_BYTES, prepareFile } from '@/lib/server/fileText'
import { err, readBody, withUser } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const MAX_BODY = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4096

const input = z.object({
  target: z.enum(['subject', 'sales', 'market']),
  fileName: z.string().min(1).max(200),
  mediaType: z.string().max(120).default(''),
  data: z.string().min(4), // the file, base64
}).strict()

/** Says whether a key looks set up, so the screen can explain what to do before a scan is tried. */
export const GET = (req: NextRequest) => withUser(req, async () => NextResponse.json({
  model: modelName(), keyInEnvironment: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), maxMegabytes: MAX_FILE_BYTES / 1048576,
}))

export const POST = (req: NextRequest) => withUser(req, async ({ user }) => {
  const body = await readBody(req, input, MAX_BODY)
  if (!body.ok) return body.res
  if (limited(`extract:${user.id}`, 40, 60 * 60 * 1000)) return err(429, 'That is a lot of scans in an hour. Wait a while and try again.')
  try {
    const bytes = Buffer.from(body.data.data, 'base64')
    const file = prepareFile(body.data.fileName, body.data.mediaType, bytes)
    const result = await runExtraction(newClient(), body.data.target, body.data.fileName, file)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof FileProblem) return err(400, e.message)
    if (e instanceof ExtractError) return err(e.status, e.message)
    console.error('scan failed', e instanceof Error ? e.message : 'unknown error')
    return err(500, 'The scan failed.')
  }
}, { maxBody: MAX_BODY })
