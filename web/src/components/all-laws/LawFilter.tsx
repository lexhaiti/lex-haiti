'use client'

import React, { useCallback, useMemo } from 'react'
import { Filter, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

type Lang = 'fr' | 'ht'
const toSupportedLang = (lang?: string): Lang => (lang === 'ht' ? 'ht' : 'fr')

const categories = [
  { value: 'all', label: { fr: 'Toutes cat\u00e9gories', ht: 'Tout kategori' } },
  { value: 'constitution', label: { fr: 'Constitution', ht: 'Konstitisyon' } },
  { value: 'code', label: { fr: 'Codes', ht: 'K\u00f2d' } },
  { value: 'loi', label: { fr: 'Lois', ht: 'Lwa' } },
  { value: 'decret', label: { fr: 'D\u00e9crets', ht: 'Dekr\u00e8' } },
  { value: 'arrete', label: { fr: 'Arr\u00eat\u00e9s', ht: 'Ar\u00e8te' } },
  { value: 'circulaire', label: { fr: 'Circulaires', ht: 'Sirkil\u00e8' } },
  { value: 'convention', label: { fr: 'Conventions', ht: 'Konvansyon' } },
]

// Code-specific subcategories. Mirrors backend `CodeSubcategory` enum
// (see backend/packages/schemas/enums.py). The dropdown is shown only
// when the parent category is "code".
const codeSubcategories = [
  { value: 'all', label: { fr: 'Tous les codes', ht: 'Tout kòd' } },
  { value: 'code_civil', label: { fr: 'Code Civil', ht: 'Kòd Sivil' } },
  { value: 'code_penal', label: { fr: 'Code Pénal', ht: 'Kòd Penal' } },
  {
    value: 'code_procedure_civile',
    label: { fr: 'Code de Procédure Civile', ht: 'Kòd Pwosedi Sivil' },
  },
  {
    value: 'code_procedure_penale',
    label: { fr: 'Code de Procédure Pénale', ht: 'Kòd Pwosedi Penal' },
  },
  {
    value: 'code_travail',
    label: { fr: 'Code du Travail', ht: 'Kòd Travay' },
  },
  {
    value: 'code_commerce',
    label: { fr: 'Code de Commerce', ht: 'Kòd Komès' },
  },
  { value: 'code_rural', label: { fr: 'Code Rural', ht: 'Kòd Riral' } },
  { value: 'autre', label: { fr: 'Autre', ht: 'Lòt' } },
]

const statuses = [
  { value: 'all', label: { fr: 'Tous statuts', ht: 'Tout estati' } },
  { value: 'in_force', label: { fr: 'En vigueur', ht: 'An vig\u00e8' } },
  {
    value: 'partially_abrogated',
    label: { fr: 'Partiellement abrog\u00e9', ht: 'Pasy\u00e8lman abroje' },
  },
  { value: 'abrogated', label: { fr: 'Abrog\u00e9', ht: 'Abroje' } },
]

const sortOptions = [
  { value: 'newest', label: { fr: 'Plus r\u00e9cents', ht: 'Pi resan' } },
  { value: 'oldest', label: { fr: 'Plus anciens', ht: 'Pi ansyen' } },
  { value: 'alphabetical', label: { fr: 'Alphab\u00e9tique', ht: 'Alfabetik' } },
  { value: 'relevance', label: { fr: 'Pertinence', ht: 'P\u00e8tinans' } },
]

function buildYearOptions() {
  const currentYear = new Date().getFullYear()
  const decadeStart = Math.floor(currentYear / 10) * 10
  const years: Array<{ value: string; label: { fr: string; ht: string } }> = [
    { value: 'all', label: { fr: 'Toutes ann\u00e9es', ht: 'Tout ane' } },
  ]
  for (let year = decadeStart; year >= 1800; year -= 10) {
    years.push({
      value: String(year),
      label: {
        fr: `Ann\u00e9e ${year}`,
        ht: `Ane ${year}`,
      },
    })
  }
  return years
}

type Filters = {
  category?: string
  codeSubcategory?: string
  status?: string
  year?: string
  sort?: string
}

type PatchInput = Partial<{
  category: string
  codeSubcategory: string
  status: string
  year: string
  sort: string
}>

type FilterContentProps = {
  lang: Lang
  t: (key: string) => string
  filters: Filters
  yearOptions: Array<{ value: string; label: { fr: string; ht: string } }>
  activeFiltersCount: number
  patch: (partial: PatchInput) => void
  onReset: () => void
}

function FilterContent({
  lang,
  t,
  filters,
  yearOptions,
  activeFiltersCount,
  patch,
  onReset,
}: FilterContentProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-6 pb-20">
        {/* Category */}
        <div>
          <label className="text-sm font-semibold text-gray-900 mb-3 block">
            {t('filters.category')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() =>
                  patch({
                    category: cat.value,
                    // Clear the code-subcategory when switching away from "code".
                    ...(cat.value !== 'code'
                      ? { codeSubcategory: 'all' }
                      : {}),
                  })
                }
                className={cn(
                  'px-4 py-3 rounded-xl text-sm font-medium transition-all text-left border',
                  (filters.category ?? 'all') === cat.value
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-gray-50 text-gray-600 border-gray-100 hover:border-gray-300 hover:bg-gray-100',
                )}
              >
                {cat.label[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Code subcategory — shown only when category=code so the filter
            sheet stays light when filtering Constitutions / Lois / etc. */}
        {filters.category === 'code' && (
          <div>
            <label className="text-sm font-semibold text-gray-900 mb-3 block">
              {lang === 'fr' ? 'Code spécifique' : 'Kòd espesifik'}
            </label>
            <Select
              value={filters.codeSubcategory ?? 'all'}
              onValueChange={(v) => patch({ codeSubcategory: v })}
            >
              <SelectTrigger className="w-full h-12 rounded-xl bg-gray-50 border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {codeSubcategories.map((sub) => (
                  <SelectItem key={sub.value} value={sub.value}>
                    {sub.label[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Year */}
        <div>
          <label className="text-sm font-semibold text-gray-900 mb-3 block">
            {t('filters.period')}
          </label>
          <Select
            value={filters.year ?? 'all'}
            onValueChange={(v) => patch({ year: v })}
          >
            <SelectTrigger className="w-full h-12 rounded-xl bg-gray-50 border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div>
          <label className="text-sm font-semibold text-gray-900 mb-3 block">
            {t('filters.status')}
          </label>
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => patch({ status: s.value })}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all border',
                  (filters.status ?? 'all') === s.value
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700',
                )}
              >
                {s.label[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div>
          <label className="text-sm font-semibold text-gray-900 mb-3 block">
            {t('filters.sortBy')}
          </label>
          <Select
            value={filters.sort ?? 'newest'}
            onValueChange={(v) => patch({ sort: v })}
          >
            <SelectTrigger className="w-full h-12 rounded-xl bg-gray-50 border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t flex gap-3">
        {activeFiltersCount > 0 && (
          <Button
            variant="outline"
            onClick={onReset}
            className="flex-1 h-12 rounded-xl border-gray-200 font-bold"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('filters.reset')}
          </Button>
        )}
        <SheetTrigger asChild>
          <Button className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold">
            {lang === 'fr' ? 'Appliquer' : 'Aplike'}
          </Button>
        </SheetTrigger>
      </div>
    </div>
  )
}

export default function LawFilters({
  filters,
  onFilterChange,
  currentLang,
  resultsCount = 0,
}: {
  filters: Filters
  onFilterChange: (next: {
    category: string
    codeSubcategory: string
    status: string
    year: string
    sort: string
  }) => void
  currentLang?: string
  resultsCount?: number
}) {
  const { t, language } = useT()
  const lang = toSupportedLang(currentLang ?? language)

  const yearOptions = useMemo(() => buildYearOptions(), [])
  const activeFiltersCount = useMemo(
    () => Object.values(filters).filter((v) => v && v !== 'all' && v !== 'newest').length,
    [filters],
  )

  const patch = useCallback(
    (partial: PatchInput) => {
      onFilterChange({
        category: filters.category ?? 'all',
        codeSubcategory: filters.codeSubcategory ?? 'all',
        status: filters.status ?? 'all',
        year: filters.year ?? 'all',
        sort: filters.sort ?? 'newest',
        ...partial,
      })
    },
    [filters, onFilterChange],
  )

  const handleReset = useCallback(() => {
    onFilterChange({
      category: 'all',
      codeSubcategory: 'all',
      status: 'all',
      year: 'all',
      sort: 'newest',
    })
  }, [onFilterChange])

  const isActive = (key: string, val?: string) => val !== undefined && val !== 'all' && (key !== 'sort' || val !== 'newest')

  const triggerCls = (active: boolean) =>
    cn(
      'rounded-full h-9 text-sm transition-all',
      active
        ? 'bg-primary text-white border-primary hover:bg-primary/90 shadow-sm [&_svg]:text-white/60'
        : 'bg-white border-gray-200 hover:border-gray-400 text-gray-700',
    )

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
      {/* Desktop filters */}
      <div className="hidden lg:flex items-center gap-2 flex-wrap">
        <Select
          value={filters.category ?? 'all'}
          onValueChange={(v) =>
            patch({
              category: v,
              ...(v !== 'code' ? { codeSubcategory: 'all' } : {}),
            })
          }
        >
          <SelectTrigger className={cn('w-44', triggerCls(isActive('category', filters.category)))}>
            <SelectValue placeholder={categories[0].label[lang]} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filters.category === 'code' && (
          <Select
            value={filters.codeSubcategory ?? 'all'}
            onValueChange={(v) => patch({ codeSubcategory: v })}
          >
            <SelectTrigger
              className={cn(
                'w-56',
                triggerCls(isActive('codeSubcategory', filters.codeSubcategory)),
              )}
            >
              <SelectValue placeholder={codeSubcategories[0].label[lang]} />
            </SelectTrigger>
            <SelectContent>
              {codeSubcategories.map((sub) => (
                <SelectItem key={sub.value} value={sub.value}>
                  {sub.label[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.year ?? 'all'}
          onValueChange={(v) => patch({ year: v })}
        >
          <SelectTrigger className={cn('w-36', triggerCls(isActive('year', filters.year)))}>
            <SelectValue placeholder={yearOptions[0].label[lang]} />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y.value} value={y.value}>
                {y.label[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status ?? 'all'}
          onValueChange={(v) => patch({ status: v })}
        >
          <SelectTrigger className={cn('w-36', triggerCls(isActive('status', filters.status)))}>
            <SelectValue placeholder={statuses[0].label[lang]} />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="h-6 w-px bg-gray-200 mx-1" />

        <Select
          value={filters.sort ?? 'newest'}
          onValueChange={(v) => patch({ sort: v })}
        >
          <SelectTrigger className={cn('w-36', triggerCls(isActive('sort', filters.sort)))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-slate-500 hover:text-slate-900 rounded-full h-9 px-3"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {t('filters.reset')}
          </Button>
        )}
      </div>

      {/* Mobile filter sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'lg:hidden w-full justify-between rounded-xl h-11',
              activeFiltersCount > 0
                ? 'bg-primary text-white border-primary hover:bg-primary/90'
                : 'border-gray-200',
            )}
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              {t('filters.title')}
            </span>
            {activeFiltersCount > 0 && (
              <Badge className="bg-white/20 text-white ml-2 rounded-full px-2.5 border-0">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>

        <SheetContent
          side="bottom"
          className="h-[85vh] rounded-t-[2rem] p-0 overflow-hidden border-none"
        >
          <div className="flex flex-col h-full bg-white">
            <div className="p-6 pb-2">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
              <SheetHeader className="text-left">
                <SheetTitle className="text-2xl font-black text-gray-900">
                  {t('filters.title')}
                </SheetTitle>
                <SheetDescription className="text-gray-500 font-medium">
                  {resultsCount} {t('filters.results')}
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 px-6 overflow-hidden">
              <FilterContent
                lang={lang}
                t={t}
                filters={filters}
                yearOptions={yearOptions}
                activeFiltersCount={activeFiltersCount}
                patch={patch}
                onReset={handleReset}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Results count */}
      <div className="hidden lg:block ml-auto">
        <span className="text-sm text-gray-500 font-medium">
          {resultsCount} {t('filters.foundText')}
        </span>
      </div>
    </div>
  )
}
