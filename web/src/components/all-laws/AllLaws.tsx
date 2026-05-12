'use client'

import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useT } from '@/i18n/useT'
import { AllLawsUI } from '@/components/all-laws/AllLawsUI'
import { EditorialFilter } from '@/components/shared/EditorialFilter'
import {
  useAllTexts,
  type EditorialStatusFilter,
} from '@/lib/hooks/useAllTexts'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { CardStyle } from '@/components/shared/LawCard'

type Filters = {
  category: string
  codeSubcategory: string
  year: string
  status: string
  sort: string
}

const toSupportedLang = (l?: string): 'fr' | 'ht' => (l === 'ht' ? 'ht' : 'fr')

export default function AllLaws() {
  const { t, language } = useT()
  const lang = toSupportedLang(language)
  const searchParams = useSearchParams()

  const [viewMode, setViewMode] = useState<CardStyle>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchTerm, setActiveSearchTerm] = useState('')
  // Theme tags from the URL (?theme=...). Driven by the header Thématiques
  // menu — not a UI control on this page.
  const [themes, setThemes] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>({
    category: 'all',
    codeSubcategory: 'all',
    year: 'all',
    status: 'all',
    sort: 'newest',
  })
  // Editor-only: switch between published / drafts / all.
  const { isEditor } = useEditorMode()
  const [editorialStatus, setEditorialStatus] =
    useState<EditorialStatusFilter>('all')

  // Parse URL params and seed the page's filter state. We REPLACE the
  // entire filter object on every URL change rather than merge in —
  // otherwise, navigating from ``/lois?category=constitution&theme=foo``
  // to ``/lois?category=loi`` (or to plain ``/lois``) would leave the
  // old ``category`` / ``theme`` values stuck because the conditional
  // spread didn't clear missing params. The user-facing symptom was:
  // clicking "Codes & Lois → Lois" while already on the constitution
  // page didn't actually switch filters until a hard refresh.
  useEffect(() => {
    if (!searchParams) return

    const q = searchParams.get('q')
    const category = searchParams.get('category')
    const codeSubcategory = searchParams.get('code_subcategory')
    const sort = searchParams.get('sort')
    const status = searchParams.get('status')
    const themeParams = searchParams.getAll('theme')

    if (q !== null) {
      setSearchQuery(q)
      setActiveSearchTerm(q)
    } else {
      setSearchQuery('')
      setActiveSearchTerm('')
    }

    setThemes(themeParams)

    setFilters({
      category: category ?? 'all',
      codeSubcategory: codeSubcategory ?? 'all',
      year: 'all',
      status: status ?? 'all',
      sort: sort ?? 'newest',
    })

    // Editorial status (Tous / Publiés / Brouillons) is editor-only
    // state, not URL-driven — but it should also reset on a fresh
    // nav into /lois so the editor doesn't carry over a draft filter
    // across category switches.
    setEditorialStatus('all')
  }, [searchParams])

  const { items, total, isLoading, loadMore, canLoadMore, refresh } =
    useAllTexts({
      q: searchQuery,
      filters,
      themes,
      lang,
      limit: 24,
      editorialStatus: isEditor ? editorialStatus : undefined,
    })

  const handleSearch = () => {
    setActiveSearchTerm(searchQuery)
    refresh()
  }

  // Note: do NOT auto-clear `activeSearchTerm` whenever `searchQuery`
  // becomes empty. That effect used to wipe the URL-driven search on
  // initial mount because `searchQuery` starts at '' before the
  // searchParams effect populates it. The H1's "you are searching for X"
  // mode now reliably reflects either the URL ?q=… or the last submitted
  // input value. Clearing happens through the URL effect (q absent) or
  // the user re-submitting an empty query — both already handled above.

  return (
    <AllLawsUI
      t={t}
      lang={lang}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onSearch={handleSearch}
      cardStyle={viewMode}
      onViewModeChange={setViewMode}
      filters={filters}
      onFiltersChange={setFilters}
      themes={themes}
      onThemesChange={setThemes}
      isLoading={isLoading}
      laws={items}
      total={total}
      onLoadMore={loadMore}
      canLoadMore={canLoadMore}
      activeSearchTerm={activeSearchTerm}
      editorialSlot={
        isEditor ? (
          <EditorialFilter
            value={editorialStatus}
            onChange={setEditorialStatus}
          />
        ) : null
      }
    />
  )
}
