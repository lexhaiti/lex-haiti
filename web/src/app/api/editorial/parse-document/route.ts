/**
 * Streaming proxy for editorial document parsing.
 *
 * Same pattern as the Moniteur metadata extraction proxy — bypasses the
 * Next.js dev rewrite body-size limit for large PDF uploads. See
 * web/src/app/api/moniteur/extract-metadata/route.ts for rationale.
 *
 * Cookies are forwarded so the backend's EditorialUser dependency
 * resolves the editor session.
 */
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const API_TARGET =
  process.env.LEXHAITI_API_INTERNAL_URL ?? 'http://localhost:8000'

export async function POST(req: NextRequest): Promise<Response> {
  const upstream = `${API_TARGET}/api/v1/editorial/parse-document`

  const headers = new Headers()
  const ct = req.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const cookie = req.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  // Backend requires this header for CSRF protection on cookie-auth mutations
  headers.set('x-requested-with', 'XMLHttpRequest')

  // Buffer the body — same approach as the Moniteur proxy
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
