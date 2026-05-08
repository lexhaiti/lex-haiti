'use client'

import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { type PaginatedSearchResponse, searchTexts } from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import type { components } from '@/lib/api-types'

type SearchParams = {
  q: string
  category?: components['schemas']['LegalCategory']
  code_subcategory?: components['schemas']['CodeSubcategory']
  status?: components['schemas']['LegalStatus']
  limit?: number
  offset?: number
}

export function useSearch(initial?: Partial<SearchParams>) {
  const [params, setParams] = useState<SearchParams>({
    q: initial?.q ?? '',
    category: initial?.category,
    code_subcategory: initial?.code_subcategory,
    status: initial?.status,
    limit: initial?.limit ?? 20,
    offset: initial?.offset ?? 0,
  })

  const canSearch = useMemo(() => params.q.trim().length > 0, [params.q])

  const key = canSearch
    ? [
        'search',
        params.q,
        params.category ?? '',
        params.code_subcategory ?? '',
        params.status ?? '',
        params.limit ?? 20,
        params.offset ?? 0,
      ]
    : null

  const { data, error, isLoading, mutate } = useSWR<PaginatedSearchResponse>(
    key,
    () => searchTexts(params),
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  )

  const update = useCallback((patch: Partial<SearchParams>) => {
    setParams((p) => ({
      ...p,
      ...patch,
      offset: patch.q !== undefined ? 0 : p.offset,
    }))
  }, [])

  const nextPage = useCallback(() => {
    setParams((p) => ({ ...p, offset: (p.offset ?? 0) + (p.limit ?? 20) }))
  }, [])

  const prevPage = useCallback(() => {
    setParams((p) => ({
      ...p,
      offset: Math.max(0, (p.offset ?? 0) - (p.limit ?? 20)),
    }))
  }, [])

  return {
    params,
    update,
    canSearch,
    data,
    items: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error as ApiError | undefined,
    refresh: mutate,
    nextPage,
    prevPage,
  }
}
