/**
 * Streaming proxy for Moniteur PDF metadata extraction.
 *
 * The plain Next.js rewrite (next.config.ts → /api/v1/* → backend) chokes
 * on large multipart uploads in dev mode — anything over a few megabytes
 * fails with a generic 500 before reaching FastAPI. We bypass that here
 * by reading the request body and re-streaming it to the backend, with
 * a generous body-size limit explicitly opted in.
 *
 * Cookies are forwarded so the backend's Auth.js dependency still
 * resolves the editor session.
 */
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
// Disable Next's automatic body parsing — we want the raw stream so we
// can hand it to fetch() without round-tripping through formData parser.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const API_TARGET =
  process.env.LEXHAITI_API_INTERNAL_URL ?? 'http://localhost:8000'

export async function POST(req: NextRequest): Promise<Response> {
  const upstream = `${API_TARGET}/api/v1/moniteur/extract-metadata`

  // Forward the cookie + content-type (must include the multipart boundary)
  // to the backend. Drop hop-by-hop headers and the host header so the
  // backend resolves its own.
  const headers = new Headers()
  const ct = req.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const cookie = req.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  // Backend requires this header for CSRF protection on cookie-auth mutations
  headers.set('x-requested-with', 'XMLHttpRequest')

  // Buffer the body — fetch() with a stream body needs HTTP/2 or the
  // duplex hint, which next-server doesn't always honor. Buffering is
  // fine for the cover-page extract: the file is bounded to one upload
  // and we already cap downstream OCR to 2 pages.
  const buf = await req.arrayBuffer()

  const resp = await fetch(upstream, {
    method: 'POST',
    headers,
    body: buf,
  })

  // Pipe response straight back. Don't transform — the backend already
  // returns JSON or a structured error.
  const body = await resp.arrayBuffer()
  return new Response(body, {
    status: resp.status,
    headers: {
      'content-type': resp.headers.get('content-type') ?? 'application/json',
    },
  })
}
