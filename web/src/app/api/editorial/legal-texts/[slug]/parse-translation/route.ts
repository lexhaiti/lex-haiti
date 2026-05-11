/**
 * Streaming proxy for the translation-parse endpoint.
 *
 * Same buffer-and-forward pattern as /api/editorial/parse-document —
 * bypasses Next.js dev rewrite's body-size limit for large PDF uploads.
 * See web/src/app/api/moniteur/extract-metadata/route.ts for rationale.
 */
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const API_TARGET =
  process.env.LEXHAITI_API_INTERNAL_URL ?? 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params
  const upstream = `${API_TARGET}/api/v1/editorial/legal-texts/${encodeURIComponent(slug)}/parse-translation`

  const headers = new Headers()
  const ct = req.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const cookie = req.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  headers.set('x-requested-with', 'XMLHttpRequest')

  const buf = await req.arrayBuffer()

  const resp = await fetch(upstream, {
    method: 'POST',
    headers,
    body: buf,
  })

  const body = await resp.arrayBuffer()
  return new Response(body, {
    status: resp.status,
    headers: {
      'content-type': resp.headers.get('content-type') ?? 'application/json',
    },
  })
}
