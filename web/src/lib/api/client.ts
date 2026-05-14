// src/lib/api/client.ts
export class ApiError extends Error {
  status: number
  url: string
  body?: unknown

  constructor(args: {
    status: number
    url: string
    message: string
    body?: unknown
  }) {
    super(args.message)
    this.name = 'ApiError'
    this.status = args.status
    this.url = args.url
    this.body = args.body
  }
}

// In the browser we want the same `/api/v1` relative path that the
// Next.js rewrites proxy to the FastAPI backend (so the dev cookie
// auth flow works without CORS noise). On the server (RSC fetches,
// route handlers, Node runtime) relative URLs are invalid — fetch
// throws "Failed to parse URL" — so we resolve to an absolute
// internal URL: API_INTERNAL_URL env var if set, else the dev backend
// at 127.0.0.1:8000.
//
// Normalize the result so the `/api/v1` path segment is always present.
// Without this, an env var set to a bare origin (e.g.
// ``NEXT_PUBLIC_API_URL=https://api.lexhaiti.org``) sends every request
// to ``/<route>`` instead of ``/api/v1/<route>`` and 404s the whole
// frontend silently. The FastAPI router is mounted at ``/api/v1`` and
// has been for the life of the project — appending here is safe.
function normalizeApiBase(raw: string): string {
  let v = raw.endsWith('/') ? raw.slice(0, -1) : raw
  try {
    const parsed = new URL(v)
    if (parsed.pathname === '' || parsed.pathname === '/') {
      v = `${parsed.origin}/api/v1`
    } else if (!/\/api\/v\d+(\/|$)/.test(parsed.pathname)) {
      v = `${v}/api/v1`
    }
  } catch {
    // Relative path (e.g. "/api/v1" from a Next.js rewrite) — leave as is.
  }
  return v
}

// On the server (Vercel RSC, route handlers), prefer API_INTERNAL_URL if
// set (e.g. a direct VPC path to the backend). Otherwise fall back to
// NEXT_PUBLIC_API_URL when it is an absolute URL — that env var IS set in
// prod (https://api.lexhaiti.org) and the browser-side already uses it.
// A relative NEXT_PUBLIC_API_URL (e.g. "/api/v1" in local dev) is NOT
// valid for server-side fetch, so we skip it and fall back to the local
// default.
const serverBase =
  process.env.API_INTERNAL_URL ??
  (process.env.NEXT_PUBLIC_API_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_API_URL
    : undefined) ??
  'http://127.0.0.1:8000/api/v1'

const API_BASE = normalizeApiBase(
  typeof window === 'undefined'
    ? serverBase
    : (process.env.NEXT_PUBLIC_API_URL ??
        process.env.NEXT_PUBLIC_API_BASE ??
        'http://127.0.0.1:8000/api/v1'),
)

/** Build a raw URL pointing at an API path. Use for endpoints that return
 *  files (PDF/DOCX exports) where the browser needs an href, not JSON. */
export function apiUrl(
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
  const p = path.startsWith('/') ? path : `/${path}`
  if (!params) return `${base}${p}`
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v))
  }
  const query = qs.toString()
  return query ? `${base}${p}?${query}` : `${base}${p}`
}

function buildQuery(params?: Record<string, unknown>) {
  if (!params) return ''
  const qs = new URLSearchParams()

  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    if (Array.isArray(v)) {
      v.forEach((item) => qs.append(k, String(item)))
      return
    }
    qs.set(k, String(v))
  })

  const s = qs.toString()
  return s ? `?${s}` : ''
}

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ---------------------------------------------------------------------------
// In-memory TTL cache for GETs
// ---------------------------------------------------------------------------
//
// Browser-only. The public-side reader navigates the same texts back
// and forth (home → article → home → article); without this, every
// repeated visit re-hits the API and the Constitution payload alone
// is ~2 MB. A small module-scope cache cuts repeat visits to a single
// round-trip until the TTL elapses or a mutation invalidates.
//
// Design:
//   - Keyed by ``method + URL`` so query-string variants are distinct
//     (``/legal-texts?category=loi`` and ``…?category=code`` cache
//     separately).
//   - Each entry stores the parsed JSON + an expiration timestamp.
//     ``DEFAULT_TTL_MS`` is short (5 min) because legal content is
//     stable but editors can mutate it; longer cache windows risk
//     stale reads after an inline edit.
//   - In-flight de-dupe: if two consumers ask for the same URL while
//     the first request is pending, the second piggybacks on its
//     promise. Cuts the "two-component-fetched-the-same-thing"
//     thundering herd.
//   - Any non-GET request flushes the whole cache. Coarse but safe:
//     after an edit, the next render gets fresh data.

const DEFAULT_TTL_MS = 5 * 60 * 1000

type CacheEntry = { expiresAt: number; data: unknown }
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

function cacheKey(method: string, url: string): string {
  return `${method} ${url}`
}

/** Drop all cached responses. Called automatically after any mutation. */
export function clearApiCache(): void {
  if (typeof window === 'undefined') return
  cache.clear()
  inflight.clear()
}

export async function apiGet<T>(
  path: string,
  opts?: {
    params?: Record<string, unknown>
    signal?: AbortSignal
    headers?: Record<string, string>
    next?: RequestInit['next']
    cache?: RequestInit['cache']
    /**
     * Override the default TTL (5 min) for this call. ``0`` disables
     * caching entirely — useful for inline-edit refetches that need
     * a guaranteed fresh read.
     */
    cacheTtlMs?: number
  },
): Promise<T> {
  const query = buildQuery(opts?.params)
  const url = `${API_BASE}${path}${query}`
  const key = cacheKey('GET', url)
  const ttl = opts?.cacheTtlMs ?? DEFAULT_TTL_MS
  const useCache =
    typeof window !== 'undefined' && ttl > 0 && opts?.cache !== 'no-store'

  if (useCache) {
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) {
      return hit.data as T
    }
    const pending = inflight.get(key) as Promise<T> | undefined
    if (pending) return pending
  }

  const fetchPromise = (async () => {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(opts?.headers ?? {}),
      },
      signal: opts?.signal,
      next: opts?.next,
      cache: opts?.cache ?? 'no-store',
    })

    if (!res.ok) {
      const body = await safeJson(res)
      throw new ApiError({
        status: res.status,
        url,
        message: `Request failed (${res.status})`,
        body,
      })
    }

    return (await res.json()) as T
  })()

  if (useCache) {
    inflight.set(key, fetchPromise as Promise<unknown>)
    try {
      const data = await fetchPromise
      cache.set(key, { expiresAt: Date.now() + ttl, data })
      return data
    } finally {
      inflight.delete(key)
    }
  }
  return fetchPromise
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  opts?: {
    signal?: AbortSignal
    headers?: Record<string, string>
  },
): Promise<T> {
  return apiSend<T>('POST', path, body, opts)
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  opts?: {
    signal?: AbortSignal
    headers?: Record<string, string>
  },
): Promise<T> {
  return apiSend<T>('PATCH', path, body, opts)
}

export async function apiDelete<T = void>(
  path: string,
  opts?: {
    signal?: AbortSignal
    headers?: Record<string, string>
  },
): Promise<T> {
  return apiSend<T>('DELETE', path, undefined, opts)
}

/**
 * POST a multipart/form-data body. Used for file uploads (Moniteur PDFs,
 * raw documents in the editorial import flow). Don't set Content-Type —
 * the browser fills it in with the boundary token automatically.
 */
export async function apiPostForm<T>(
  path: string,
  formData: FormData,
  opts?: {
    signal?: AbortSignal
    headers?: Record<string, string>
  },
): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts?.headers ?? {}),
    },
    body: formData,
    signal: opts?.signal,
  })

  if (!res.ok) {
    const errBody = await safeJson(res)
    throw new ApiError({
      status: res.status,
      url,
      message: `Upload failed (${res.status})`,
      body: errBody,
    })
  }
  // Multipart upload mutates server state; invalidate the GET cache so
  // the next read pulls fresh data.
  clearApiCache()
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  opts?: {
    signal?: AbortSignal
    headers?: Record<string, string>
  },
): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts?.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts?.signal,
  })

  if (!res.ok) {
    const errBody = await safeJson(res)
    throw new ApiError({
      status: res.status,
      url,
      message: `Request failed (${res.status})`,
      body: errBody,
    })
  }
  // Any successful mutation invalidates the read cache so the next
  // GET sees the change without callers needing to thread `bypassCache`
  // through their refetch helpers.
  clearApiCache()
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
