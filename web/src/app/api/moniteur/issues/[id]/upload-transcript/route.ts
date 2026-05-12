/**
 * Streaming proxy for Moniteur transcript upload.
 *
 * Same workaround as the regular file upload — Next.js's plain
 * /api/v1/* rewrite truncates large multipart uploads in dev.
 */
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const API_TARGET =
  process.env.LEXHAITI_API_INTERNAL_URL ?? 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  const upstream = `${API_TARGET}/api/v1/moniteur/issues/${encodeURIComponent(id)}/upload-transcript`

  const headers = new Headers()
  const ct = req.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const cookie = req.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  headers.set('x-requested-with', 'XMLHttpRequest')

  const buf = await req.arrayBuffer()
  const resp = await fetch(upstream, { method: 'POST', headers, body: buf })

  const body = await resp.arrayBuffer()
  return new Response(body, {
    status: resp.status,
    headers: {
      'content-type': resp.headers.get('content-type') ?? 'application/json',
    },
  })
}
