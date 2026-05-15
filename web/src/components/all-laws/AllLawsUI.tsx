'use client'

import React from 'react'
import Link from 'next/link'
import { FileText, Grid3X3, List, Loader2, Plus, Search, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import LawFilters from '@/components/all-laws/LawFilter'
import type { components } from '@/lib/api-types'
import { CardStyle, LawCard } from '@/components/shared/LawCard'
import type { DisplayItem } from '@/lib/hooks/useAllTexts'
import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { EmptyState } from '@/components/shared/EmptyState'
import { themeDescription, themeLabel } from '@/lib/themes'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
// Reuse the centralised label maps. Keep these renamed locals so the
// downstream code (existence checks, indexed reads) stays untouched.
import {
  CATEGORY_LABELS_PLURAL as CATEGORY_LABELS,
  SUBCATEGORY_LABELS,
} from '@/lib/legal/labels'

type LegalTextListItem = components['schemas']['LegalTextListItem']

/**
 * Title shown in the page hero — reflects the active filter (theme >
 * code subcategory > category) so the H1 matches what the user clicked
 * to land here. Falls back to null when no filter is applied.
 *
 * Theme takes precedence: arriving via /lois?theme=droit_fiscal should
 * read "Droit Fiscal", not "Tous les textes juridiques".
 */
function filterTitle(
  filters: { category: string; codeSubcategory: string },
  themes: string[],
  lang: 'fr' | 'ht',
): string | null {
  if (themes.length === 1) {
    const label = themeLabel(themes[0], lang)
    if (label) return label
  }
  const cat = filters.category && filters.category !== 'all' ? filters.category : null
  const sub =
    filters.codeSubcategory && filters.codeSubcategory !== 'all'
      ? filters.codeSubcategory
      : null
  if (cat === 'code' && sub && SUBCATEGORY_LABELS[sub]) {
    return SUBCATEGORY_LABELS[sub][lang]
  }
  if (cat && CATEGORY_LABELS[cat]) {
    return CATEGORY_LABELS[cat][lang]
  }
  return null
}

/**
 * Subtitle shown under the H1. For a single theme we use the curated
 * one-liner from `THEME_DESCRIPTIONS` so visitors get a sense of what's
 * in this domain without clicking through. Falls back to null (caller
 * renders the generic "Explorez l'ensemble de la législation…").
 */
function filterSubtitle(themes: string[], lang: 'fr' | 'ht'): string | null {
  if (themes.length === 1) {
    return themeDescription(themes[0], lang)
  }
  return null
}

function buildBreadcrumbs(
  lang: 'fr' | 'ht',
  category: string | undefined,
  codeSubcategory: string | undefined,
  themes: string[],
) {
  const home = { label: lang === 'fr' ? 'Accueil' : 'Akèy', href: '/' }
  const lawsLeaf = { label: lang === 'fr' ? 'Lois' : 'Lwa' }
  const lawsLink = { label: lawsLeaf.label, href: '/lois' }

  // Theme breadcrumb beats category — when both are set, we prioritize the
  // theme path because that's how the user arrived (megamenu / chip).
  if (themes.length === 1) {
    const label = themeLabel(themes[0], lang)
    if (label) {
      return [
        home,
        {
          label: lang === 'fr' ? 'Thématiques' : 'Tèm yo',
          href: '/thematiques',
        },
        { label },
      ]
    }
  }

  const catKey = category && category !== 'all' ? category : null
  const subKey =
    codeSubcategory && codeSubcategory !== 'all' ? codeSubcategory : null

  if (catKey === 'code' && subKey && SUBCATEGORY_LABELS[subKey]) {
    // Accueil > Lois > Codes > Code Pénal
    return [
      home,
      lawsLink,
      { label: CATEGORY_LABELS.code[lang], href: '/lois?category=code' },
      { label: SUBCATEGORY_LABELS[subKey][lang] },
    ]
  }
  if (catKey && CATEGORY_LABELS[catKey]) {
    // Accueil > Lois > Constitution
    return [home, lawsLink, { label: CATEGORY_LABELS[catKey][lang] }]
  }
  // Accueil > Lois
  return [home, lawsLeaf]
}

type Props = {
  t?: (key: string) => string
  lang: 'fr' | 'ht'

  searchQuery: string
  onSearchQueryChange: (v: string) => void
  onSearch?: () => void

  cardStyle: CardStyle
  onViewModeChange: (v: CardStyle) => void

  filters: {
    category: string
    codeSubcategory: string
    year: string
    status: string
    sort: string
  }
  onFiltersChange: (next: {
    category: string
    codeSubcategory: string
    year: string
    status: string
    sort: string
  }) => void

  /**
   * Active theme filter values from the URL (`?theme=…`). When exactly one
   * theme is set, the page title and subtitle switch to the theme's label
   * and curated description.
   */
  themes?: string[]
  /**
   * Replace the current theme selection. Called by the Thématique
   * dropdown in the filter bar. Optional so legacy call sites that
   * don't drive themes from the bar (initial-render-only) keep working.
   */
  onThemesChange?: (themes: string[]) => void

  isLoading: boolean
  laws: DisplayItem[]
  total?: number
  onLoadMore?: () => void
  canLoadMore?: boolean
  activeSearchTerm?: string

  /**
   * Optional render slot for the editor-only pill (drafts/published/all).
   * Rendered inline in the sticky filter bar, next to the regular filters.
   * Pass `null` for anonymous visitors.
   */
  editorialSlot?: React.ReactNode
}

export function AllLawsUI({
  t,
  lang,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  cardStyle,
  onViewModeChange,
  filters,
  onFiltersChange,
  themes = [],
  onThemesChange,
  isLoading,
  laws,
  total,
  onLoadMore,
  canLoadMore,
  activeSearchTerm,
  editorialSlot,
}: Props) {
  const { isEditor } = useEditorMode()

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        {/* Spacer reserving the fixed menu nav's height (h-20). Keeping the
            menu reservation separate from the inner padding lets us use
            balanced py-* below for symmetric top/bottom space inside the
            dark band. */}
        <div aria-hidden className="h-20" />
        <div className="relative z-10 container py-12 lg:py-20">
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[600px] h-[300px] bg-white/5 blur-[100px] rounded-full pointer-events-none" />

          <Breadcrumb
            className="mb-6"
            items={buildBreadcrumbs(
              lang,
              filters.category,
              filters.codeSubcategory,
              themes,
            )}
          />

          {/* Title block — fills the container width; the search bar
              below has its own width cap for input UX. */}
          <div>
            <h1 className="animate-in fade-in slide-in-from-top-3 duration-500 text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white drop-shadow-sm">
              {activeSearchTerm ? (
                <span className="flex items-center gap-3">
                  <Search className="w-8 h-8 lg:w-12 lg:h-12 text-red-600" />
                  {activeSearchTerm}
                </span>
              ) : (
                filterTitle(filters, themes, lang) ??
                (t?.('allLaws.title') ??
                (lang === 'fr'
                  ? 'Tous les textes juridiques'
                  : 'Tout tèks jiridik yo'))
              )}
            </h1>
            <p className="animate-in fade-in duration-500 delay-100 fill-mode-both text-slate-300 text-lg lg:text-xl leading-relaxed">
              {filterSubtitle(themes, lang) ??
                t?.('allLaws.subtitle') ??
                (lang === 'fr'
                  ? "Explorez l'ensemble de la législation haïtienne."
                  : 'Eksplore tout lejislasyon ayisyen an.')}
            </p>

            {/* No header-level result count — the count lives in the
                filter bar below, next to the filter controls where it
                actually responds to filter changes. Keeping both led
                to two mismatched numbers ("35 RÉSULTATS" / "24 textes
                trouvés") because one was the API total and the other
                was the paginated batch size. */}
          </div>

          {/* Search — matches the home hero design: solid white pill input
              with deep navy submit, italic placeholder, full width up to a
              comfortable max. Replaces the previous glass-effect + red CTA
              pattern for visual consistency across pages. */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSearch?.()
            }}
            className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both mt-8 max-w-3xl flex items-stretch gap-0 rounded-lg overflow-hidden bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/15 focus-within:ring-2 focus-within:ring-amber-300/60 transition-shadow"
          >
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder={
                  t?.('allLaws.searchPlaceholder') ??
                  (lang === 'fr'
                    ? 'Rechercher un texte…'
                    : 'Chèche yon tèks…')
                }
                aria-label={
                  lang === 'fr' ? 'Rechercher un texte' : 'Chèche yon tèks'
                }
                className="w-full h-14 pl-11 pr-4 bg-transparent text-slate-900 placeholder:text-slate-400 placeholder:italic placeholder:text-sm text-base outline-none"
                style={{ fontSize: '16px' }}
              />
            </div>
            <button
              type="submit"
              aria-label={lang === 'fr' ? 'Rechercher' : 'Chèche'}
              className="inline-flex items-center gap-2 px-5 sm:px-7 bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">
                {lang === 'fr' ? 'Rechercher' : 'Chèche'}
              </span>
            </button>
          </form>

          {/* Editor-only action row in the hero — sits directly under
              the search box, mirroring the /moniteur layout. Contains
              the Tous / Publiés / Brouillons editorial-status filter
              and the "Importer un texte juridique" CTA side-by-side.
              ``editorialSlot`` is removed from the filter bar below so
              there's only one filter, not two. */}
          {isEditor && (
            <div
              className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both mt-4 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '320ms' }}
            >
              {editorialSlot}
              <Link
                href="/editorial/import?type=legal_text"
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-400 text-slate-900 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-amber-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t?.('allLaws.importButton') ??
                  (lang === 'fr'
                    ? 'Nouveau texte juridique'
                    : 'Nouvo tèks jiridik')}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border-b sticky top-16 lg:top-20 z-30">
        <div className="container py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <LawFilters
                filters={filters}
                onFilterChange={onFiltersChange}
                themes={themes}
                onThemesChange={onThemesChange}
                currentLang={lang}
              />
              {/* ``editorialSlot`` (Tous / Publiés / Brouillons filter)
                  was moved up into the hero — see the editor row right
                  under the search box. Filter-bar stays for category
                  + theme chips only. */}
            </div>

            {/* View Toggle */}
            <div className="hidden lg:flex items-center gap-1 bg-gray-100 p-1 rounded-full px-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange('grid')}
                className={
                  cardStyle === 'grid'
                    ? 'bg-white shadow-sm rounded-full'
                    : 'rounded-full'
                }
                aria-pressed={cardStyle === 'grid'}
                aria-label={t?.('allLaws.view.grid') ?? 'Grid'}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange('list')}
                className={
                  cardStyle === 'list'
                    ? 'bg-white shadow-sm rounded-full'
                    : 'rounded-full'
                }
                aria-pressed={cardStyle === 'list'}
                aria-label={t?.('allLaws.view.list') ?? 'List'}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container py-8 lg:py-12">
        {/* Results count — relocated from the right edge of the filter
            bar. Sits above the grid where it reads as a results header
            instead of competing with filter chrome for horizontal space. */}
        {!isLoading && laws.length > 0 && (
          <div className="mb-6 flex items-baseline gap-2 text-sm">
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {typeof total === 'number' ? total : laws.length}
            </span>
            <span className="text-slate-500">
              {(typeof total === 'number' ? total : laws.length) === 1
                ? lang === 'fr' ? 'texte trouvé' : 'tèks jwenn'
                : lang === 'fr' ? 'textes trouvés' : 'tèks jwenn'}
            </span>
          </div>
        )}

        {isLoading && laws.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : laws.length > 0 ? (
          <>
            <div
              className={
                cardStyle === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                  : 'space-y-4'
              }
            >
              {laws.map((di, index) => (
                <LawCard
                  key={String(
                    di.type === 'text' ? di.data.id : (di.data as any).text.id,
                  )}
                  displayItem={di}
                  language={lang}
                  cardStyle={cardStyle}
                  index={index}
                  className={cardStyle === 'list' ? 'max-w-7xl' : undefined}
                />
              ))}
            </div>

            {canLoadMore && onLoadMore && (
              <div className="mt-10 flex justify-center">
                <Button
                  onClick={onLoadMore}
                  variant="outline"
                  className="min-w-[200px] rounded-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {lang === 'fr' ? 'Chargement...' : 'Chaje...'}
                    </>
                  ) : lang === 'fr' ? (
                    'Charger plus'
                  ) : (
                    'Chaje plis'
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          (() => {
            // Two distinct empty cases: filter-too-tight (visitor needs
            // a "reset" CTA) vs corpus-empty (no filter, just nothing
            // matches yet). Different message + different action.
            const hasActiveFilter = Boolean(
              activeSearchTerm ||
                (filters.category && filters.category !== 'all') ||
                (filters.codeSubcategory &&
                  filters.codeSubcategory !== 'all') ||
                (filters.year && filters.year !== 'all') ||
                (filters.status && filters.status !== 'all') ||
                themes.length > 0,
            )
            return (
              <EmptyState
                tone={hasActiveFilter ? 'attention' : 'default'}
                eyebrow={
                  hasActiveFilter
                    ? lang === 'fr' ? 'Aucun résultat' : 'Pa gen rezilta'
                    : undefined
                }
                title={
                  hasActiveFilter
                    ? lang === 'fr'
                      ? 'Aucun texte ne correspond à vos filtres'
                      : 'Pa gen tèks ki koresponn ak filtè ou'
                    : t?.('allLaws.empty.title') ??
                      (lang === 'fr'
                        ? 'Aucun texte trouvé'
                        : 'Pa gen tèks jwenn')
                }
                description={
                  hasActiveFilter
                    ? lang === 'fr'
                      ? 'Élargissez les critères ou réinitialisez les filtres pour voir plus de textes.'
                      : 'Elaji kritè yo oswa reyinisyalize filtè yo pou wè plis tèks.'
                    : t?.('allLaws.empty.subtitle') ??
                      (lang === 'fr'
                        ? 'Le corpus s’enrichit chaque semaine — revenez bientôt.'
                        : 'Kòpis la ap grandi chak semèn — tounen byento.')
                }
                actions={
                  hasActiveFilter ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSearchQueryChange('')
                        onSearch?.()
                        onFiltersChange({
                          category: 'all',
                          codeSubcategory: 'all',
                          year: 'all',
                          status: 'all',
                          sort: filters.sort,
                        })
                        onThemesChange?.([])
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-7 py-3 text-sm font-bold transition-all active:scale-[0.99]"
                    >
                      {lang === 'fr'
                        ? 'Réinitialiser les filtres'
                        : 'Reyinisyalize filtè yo'}
                    </button>
                  ) : undefined
                }
              />
            )
          })()
        )}
      </div>
    </div>
  )
}
