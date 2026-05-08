import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiGet } from './client'

const ORIGINAL_FETCH = global.fetch

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('apiGet', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = ORIGINAL_FETCH
  })

  it('builds the URL from base + path', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await apiGet('/legal-texts/quick-access')

    expect(global.fetch).toHaveBeenCalledOnce()
    const [url] = vi.mocked(global.fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/legal-texts\/quick-access$/)
  })

  it('serializes simple query params', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await apiGet('/legal-texts/', {
      params: { q: 'paternité', limit: 10, offset: 0 },
    })

    const [url] = vi.mocked(global.fetch).mock.calls[0]
    const u = new URL(String(url))
    expect(u.searchParams.get('q')).toBe('paternité')
    expect(u.searchParams.get('limit')).toBe('10')
    expect(u.searchParams.get('offset')).toBe('0')
  })

  it('omits undefined / null params', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await apiGet('/legal-texts/', {
      params: { q: 'x', category: undefined, status: null },
    })

    const [url] = vi.mocked(global.fetch).mock.calls[0]
    const u = new URL(String(url))
    expect(u.searchParams.get('q')).toBe('x')
    expect(u.searchParams.has('category')).toBe(false)
    expect(u.searchParams.has('status')).toBe(false)
  })

  it('appends array params as repeated keys', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await apiGet('/legal-texts/', {
      params: { categories: ['constitution', 'code'] },
    })

    const [url] = vi.mocked(global.fetch).mock.calls[0]
    const u = new URL(String(url))
    expect(u.searchParams.getAll('categories')).toEqual([
      'constitution',
      'code',
    ])
  })

  it('throws ApiError on non-2xx with parsed body', async () => {
    // Use mockImplementation so each call returns a fresh Response — bodies
    // can only be consumed once.
    vi.mocked(global.fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ detail: 'not found' }, { status: 404 })),
    )

    await expect(apiGet('/legal-texts/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      body: { detail: 'not found' },
    })
    await expect(
      apiGet('/legal-texts/missing'),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
