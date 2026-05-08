/**
 * Streaming proxy for Moniteur PDF upload.
 *
 * Same workaround as the extract-metadata route — Next.js's plain
 * /api/v1/* rewrite truncates large multipart uploads in dev. Real
 * Moniteur issues are 30-80 MB, so we re-stream the body server-side.
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
  const upstream = `${API_TARGET}/api/v1/moniteur/issues/${encodeURIComponent(id)}/upload`

  const headers = new Headers()
  const ct = req.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const cookie = req.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  // Backend requires this header for CSRF protection on cookie-auth mutations
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
