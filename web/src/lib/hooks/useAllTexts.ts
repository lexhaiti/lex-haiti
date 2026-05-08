'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { components } from '@/lib/api-types'
import {
  listEditorialTexts,
  listTexts,
  searchTexts,
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
  year: string // UI only — client-side decade filter
  status: string
  sort: string // UI only
}

/** Editorial status filter — UI option, lifted out of the regular filter set. */
export type EditorialStatusFilter = 'all' | 'published' | 'draft'

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

function getYear(item: LegalTextListItem): number | null {
  if (item.publication_date) {
    const y = Number.parseInt(item.publication_date.slice(0, 4), 10)
    return Number.isNaN(y) ? null : y
  }
  return null
}

function titleForLang(item: LegalTextListItem, lang: 'fr' | 'ht') {
  return lang === 'ht' ? (item.title_ht ?? item.title_fr) : item.title_fr
}

function clientFilterAndSort(
  items: DisplayItem[],
  filters: Filters,
  lang: 'fr' | 'ht',
) {
  let result = [...items]

  const getText = (di: DisplayItem): LegalTextListItem =>
    di.type === 'text'
      ? (di.data as LegalTextListItem)
      : (di.data as SearchHit).text

  if (filters.year !== 'all') {
    const decade = Number.parseInt(filters.year, 10)
    if (!Number.isNaN(decade)) {
      result = result.filter((x) => {
        const y = getYear(getText(x))
        if (y == null) return false
        return y >= decade && y < decade + 10
      })
    }
  }

  switch (filters.sort) {
    case 'newest':
      result.sort(
        (a, b) => (getYear(getText(b)) ?? -1) - (getYear(getText(a)) ?? -1),
      )
      break
    case 'oldest':
      result.sort(
        (a, b) =>
          (getYear(getText(a)) ?? 999999) - (getYear(getText(b)) ?? 999999),
      )
      break
    case 'alphabetical':
      result.sort((a, b) =>
        titleForLang(getText(a), lang).localeCompare(
          titleForLang(getText(b), lang),
        ),
      )
      break
    default:
      break
  }

  return result
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

        let page: DisplayItem[] = []
        let newTotal = 0

        if (isEditor) {
          // Editor mode — see all editorial statuses (or filter by toggle).
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
          // Public + query → deep search with snippets
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
          // Public + no query → straight list (filters to published)
          const res = await listTexts({
            category,
            code_subcategory: codeSubcategory as
              | components['schemas']['CodeSubcategory']
              | undefined,
            status: statusFilter,
            theme: themes && themes.length ? themes : undefined,
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
    [q, filters.category, filters.codeSubcategory, filters.status, themes?.join(','), limit, isEditor, editorialStatus],
  )

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchPage(0, false)
    }, 250)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [q, filters.category, filters.codeSubcategory, filters.status, themes?.join(','), fetchPage])

  const loadMore = useCallback(() => {
    fetchPage(offset + limit, true)
  }, [fetchPage, offset, limit])

  const canLoadMore = useMemo(() => {
    if (typeof total !== 'number') return false
    return items.length < total
  }, [items.length, total])

  const displayItems = useMemo(() => {
    return clientFilterAndSort(items, filters, lang)
  }, [items, filters, lang])

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
