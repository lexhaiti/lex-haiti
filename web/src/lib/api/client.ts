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

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://127.0.0.1:8000/api/v1'

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

export async function apiGet<T>(
  path: string,
  opts?: {
    params?: Record<string, unknown>
    signal?: AbortSignal
    headers?: Record<string, string>
    next?: RequestInit['next']
    cache?: RequestInit['cache']
  },
): Promise<T> {
  const query = buildQuery(opts?.params)
  const url = `${API_BASE}${path}${query}`

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include', // carry the Auth.js session cookie
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
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
