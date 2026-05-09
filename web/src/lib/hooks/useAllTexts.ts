'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { components } from '@/lib/api-types'
import {
  listEditorialTexts,
  listTexts,
  searchTexts,
  type LegalTextSort,
} from '@/lib/api/endpoints'
import { useEditorMode } from '@/lib/hooks/useEditorMode'

type LegalTextListItem = components['schemas']['LegalTextListItem']
type SearchHit = components['schemas']['SearchHit']
type LegalCategory = components['schemas']['LegalCategory']
type LegalStatus = components['schemas']['LegalStatus']

/**
 * Discriminated union — TypeScript narrows `data` based on `type`, so consumers
 * can do `if (di.type === 'text') { di.data.title_fr }` without casts.
 */
export type DisplayItem =
  | { type: 'text'; data: LegalTextListItem }
  | { type: 'hit'; data: SearchHit }

type Filters = {
  category: string
  /** Sub-filter that applies only when `category === 'code'`. */
  codeSubcategory: string
  /**
   * Decade-style year filter (e.g. "1980" = 1980-1989). The hook
   * expands this into `year_from` / `year_to` for the API so filtering
   * + the per-filter total run server-side and survive pagination.
   */
  year: string
  status: string
  /**
   * Sort key. UI surfaces both legacy human-friendly aliases ("newest",
   * "oldest", "alphabetical", "relevance") and the server-native keys
   * (publication_date, recently_*). The hook normalizes both onto the
   * server's `LegalTextSort` type before calling the API.
   */
  sort: string
}

// Re-exported from the shared filter component which owns the canonical
// type — see web/src/components/shared/EditorialFilter.tsx.
export type { EditorialStatusFilter } from '@/components/shared/EditorialFilter'
import type { EditorialStatusFilter } from '@/components/shared/EditorialFilter'

type Args = {
  q: string
  filters: Filters
  /**
   * Optional theme tags from the URL (?theme=droit_famille&theme=successions).
   * ANY-match: a text qualifies if it carries any of the listed tags.
   * Driven by the menu's Thématiques column — not a UI filter on the page.
   */
  themes?: string[]
  /** Only honored when in editor mode; ignored for the public site. */
  editorialStatus?: EditorialStatusFilter
  limit?: number
}

function parseCategory(v: string): LegalCategory | undefined {
  if (!v || v === 'all') return undefined
  return v as LegalCategory
}

function parseCodeSubcategory(v: string): string | undefined {
  if (!v || v === 'all') return undefined
  return v
}

function parseStatus(v: string): LegalStatus | undefined {
  if (!v || v === 'all') return undefined
  return v as LegalStatus
}

/**
 * Decade key ("1980") → inclusive [year_from, year_to] bounds for the
 * API. Returns nulls for "all" / unparseable so callers can fall back
 * to "no year filter".
 */
function expandDecade(v: string): { year_from?: number; year_to?: number } {
  if (!v || v === 'all') return {}
  const decade = Number.parseInt(v, 10)
  if (Number.isNaN(decade)) return {}
  return { year_from: decade, year_to: decade + 9 }
}

/**
 * Maps any sort value the UI might supply to the server's
 * `LegalTextSort`. The dropdown options drift over time; this is the
 * single normalization point so a stale "newest" / "relevance" value
 * doesn't punch through to the API as an unknown literal.
 *
 *   newest        → publication_date  (server default; newest first)
 *   relevance     → publication_date  (only meaningful with q; backend
 *                                      already weights ts_rank when q is
 *                                      present)
 *   oldest        → oldest            (server-side, added in this PR)
 *   alphabetical  → alphabetical      (server-side, added in this PR)
 *   recently_*    → pass-through
 */
function toServerSort(sort: string): LegalTextSort | undefined {
  switch (sort) {
    case 'newest':
    case 'relevance':
    case '':
    case undefined as unknown as string:
      return undefined // server default
    case 'oldest':
      return 'oldest'
    case 'alphabetical':
      return 'alphabetical'
    case 'publication_date':
    case 'recently_updated':
    case 'recently_added':
    case 'recently_published':
      return sort as LegalTextSort
    default:
      return undefined
  }
}

export function useAllTexts(args: Args & { lang: 'fr' | 'ht' }) {
  const limit = args.limit ?? 24
  const { q, filters, themes, lang, editorialStatus = 'all' } = args
  const { isEditor } = useEditorMode()

  const [items, setItems] = useState<DisplayItem[]>([])
  const [total, setTotal] = useState<number | undefined>(undefined)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [error, setError] = useState<Error | null>(null)

  const requestId = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      const id = ++requestId.current
      setStatus('loading')
      setError(null)

      try {
        const category = parseCategory(filters.category)
        const codeSubcategory = parseCodeSubcategory(filters.codeSubcategory)
        const statusFilter = parseStatus(filters.status)
        const queryStr = q.trim()
        const yearRange = expandDecade(filters.year)
        const sortKey = toServerSort(filters.sort)

        let page: DisplayItem[] = []
        let newTotal = 0

        if (isEditor) {
          // Editor mode — see all editorial statuses (or filter by toggle).
          // listEditorialTexts doesn't currently expose year_from/year_to /
          // sort; if it gains them, plumb them through here too.
          const res = await listEditorialTexts({
            q: queryStr || undefined,
            category,
            code_subcategory: codeSubcategory as
              | components['schemas']['CodeSubcategory']
              | undefined,
            status: statusFilter,
            editorial_status:
              editorialStatus === 'all' ? undefined : editorialStatus,
            limit,
            offset: nextOffset,
          })
          page = (res.items ?? []).map((item) => ({
            type: 'text' as const,
            data: item,
          }))
          newTotal = res.total
        } else if (queryStr) {
          // Public + query → deep search with snippets. The /search
          // endpoint doesn't currently expose year_from/year_to/sort;
          // sort is implicitly relevance + ts_rank. Year-range and
          // explicit sort fall back to server defaults until the
          // endpoint exposes the params.
          const res = await searchTexts({
            q: queryStr,
            category,
            code_subcategory: codeSubcategory as
              | components['schemas']['CodeSubcategory']
              | undefined,
            status: statusFilter,
            limit,
            offset: nextOffset,
          })
          page = (res.items ?? []).map((hit) => ({
            type: 'hit' as const,
            data: hit,
          }))
          newTotal = res.total
        } else {
          // Public + no query → straight list. All narrowing + sort
          // happens server-side, so `total` is the truthful "how many
          // texts match my filters" number and pagination stays stable
          // across page loads.
          const res = await listTexts({
            category,
            code_subcategory: codeSubcategory as
              | components['schemas']['CodeSubcategory']
              | undefined,
            status: statusFilter,
            theme: themes && themes.length ? themes : undefined,
            year_from: yearRange.year_from,
            year_to: yearRange.year_to,
            sort: sortKey,
            limit,
            offset: nextOffset,
          })
          page = (res.items ?? []).map((item) => ({
            type: 'text' as const,
            data: item,
          }))
          newTotal = res.total
        }

        if (id !== requestId.current) return

        setTotal(newTotal)
        setItems((prev) => (append ? [...prev, ...page] : page))
        setOffset(nextOffset)
        setStatus('success')
      } catch (e) {
        if (id !== requestId.current) return
        setStatus('error')
        setError(e instanceof Error ? e : new Error('Request failed'))
      }
    },
    [
      q,
      filters.category,
      filters.codeSubcategory,
      filters.status,
      filters.year,
      filters.sort,
      themes?.join(','),
      limit,
      isEditor,
      editorialStatus,
    ],
  )

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchPage(0, false)
    }, 250)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
    // Re-fetch when ANY narrowing or ordering filter changes — every
    // input that influences the API call goes here so a filter change
    // produces a fresh paginated result set rather than a sorted slice
    // of the previous one.
  }, [
    q,
    filters.category,
    filters.codeSubcategory,
    filters.status,
    filters.year,
    filters.sort,
    themes?.join(','),
    fetchPage,
  ])

  const loadMore = useCallback(() => {
    fetchPage(offset + limit, true)
  }, [fetchPage, offset, limit])

  const canLoadMore = useMemo(() => {
    if (typeof total !== 'number') return false
    return items.length < total
  }, [items.length, total])

  // Filtering and sorting now happen server-side in fetchPage(), so the
  // hook surfaces `items` as-is. The previous client-side post-process
  // (clientFilterAndSort) couldn't survive pagination correctly — sorting
  // a 24-item batch by year doesn't sort the next batch the same way, so
  // "Plus anciens" would mix epochs as the user paged.
  const displayItems = items

  // `lang` is no longer used inside the hook (the client-side
  // alphabetical sort is gone), but we keep it in the public API so the
  // existing call sites don't need changes.
  void lang

  return {
    status,
    error,
    items: displayItems,
    total,
    loadMore,
    canLoadMore,
    isLoading: status === 'loading',
    refresh: () => fetchPage(0, false),
  }
}
