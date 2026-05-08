'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronDown,
  HelpCircle,
  Info,
  Mail,
  PlayCircle,
  Plus,
  RotateCcw,
  Scale,
  Scroll,
  Search as SearchIcon,
  Shield,
  Stamp,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

// =============================================================================
// Types
// =============================================================================

interface MatchSnippet {
  article_number: string
  article_slug?: string | null
  /** May contain `<mark>...</mark>` HTML wrappers around matched terms. */
  snippet_fr?: string | null
  snippet_ht?: string | null
}

interface LegalTextRow {
  slug: string
  title_fr: string
  title_ht?: string | null
  description_fr?: string | null
  description_ht?: string | null
  category: string
  status?: string | null
  publication_date?: string | null
  /** Populated when the backend was called with `with_snippets=true`. */
  match_snippets?: MatchSnippet[] | null
}

type FieldKey = 'all' | 'title' | 'description'
type ModeKey = 'all' | 'exact' | 'any' | 'exclude'
type OperatorKey = 'ET' | 'OU' | 'SAUF'

interface CriteriaRow {
  id: string
  operator: OperatorKey // ignored for the first row
  field: FieldKey
  text: string
  mode: ModeKey
}

interface FormState {
  fonds: string
  rows: CriteriaRow[]
  status: string
  yearFrom: string
  yearTo: string
}

// =============================================================================
// Copy
// =============================================================================

const COPY = {
  fr: {
    pageTitle: 'Recherche avancée',
    pageSubtitle:
      'Filtrez le corpus par type de texte, statut juridique, période et mots-clés. Combinez plusieurs critères avec ET, OU et SAUF.',
    fondsLabel: 'Fonds documentaire',
    fondsDropdown: {
      all: 'Dans tous les fonds',
      constitution: 'Constitutions',
      code: 'Codes',
      loi: 'Lois',
      decret: 'Décrets',
      arrete: 'Arrêtés',
    },
    selectFondsHint:
      'Sélectionnez un fonds documentaire pour cibler la recherche.',
    operatorLabel: 'Opérateur logique',
    operatorOptions: { ET: 'ET', OU: 'OU', SAUF: 'SAUF' },
    operatorHelp: {
      ET: 'Tous les critères « ET » doivent correspondre.',
      OU: 'Au moins un critère « OU » doit correspondre.',
      SAUF: 'Aucun critère « SAUF » ne doit correspondre.',
    },
    fieldLabel: 'Champ',
    fieldOptions: {
      all: 'Dans tous les champs',
      title: 'Dans les titres',
      description: 'Dans les descriptions',
    },
    textLabel: 'Texte recherché',
    textPlaceholder: 'Ex. : paternité, divorce, propriété…',
    modeLabel: 'Mode',
    modeOptions: {
      all: 'Tous les mots',
      exact: 'Expression exacte',
      any: 'Un de ces mots',
      exclude: 'Exclure ces mots',
    },
    deleteCriterion: 'Supprimer ce critère',
    addCriterion: 'Ajouter un groupe de critères',
    refineTitle: 'Affiner la recherche',
    statusLabel: 'Statut juridique',
    statusOptions: {
      all: 'Tous',
      in_force: 'En vigueur',
      abrogated: 'Abrogée',
      historical: 'Historique',
    },
    yearLabel: 'Année de publication',
    yearFrom: 'De',
    yearTo: 'à',
    submit: 'Lancer la recherche',
    reset: 'Réinitialiser la recherche',
    resultsTitle: 'Résultats',
    noResults: 'Aucun texte ne correspond à ces critères.',
    notSearchedYet:
      'Configurez vos critères ci-dessus, puis lancez la recherche pour afficher les résultats.',
    loading: 'Chargement du corpus…',
    error: 'Erreur de chargement.',
    helpTitle: 'Aide LexHaïti',
    helpIntro:
      'Pour vous accompagner dans l’utilisation du site, consultez l’aide disponible.',
    helpItems: [
      'La recherche ne tient pas compte des accents ni de la casse.',
      'Pour une expression exacte, choisissez « Expression exacte » dans le mode.',
      'Combinez plusieurs critères : « ET » pour cumuler, « OU » pour élargir, « SAUF » pour exclure.',
    ],
    contactUs: 'Nous contacter',
    tutorials: 'Voir les tutoriels',
    useCases: 'Guide des cas d’usage',
  },
  ht: {
    pageTitle: 'Rechèch avanse',
    pageSubtitle:
      'Filtre kòpis la pa tip tèks, estati jiridik, peryòd ak mo kle. Konbine plizyè kritè avèk ET, OU ak SOF.',
    fondsLabel: 'Fon dokimantè',
    fondsDropdown: {
      all: 'Nan tout fon yo',
      constitution: 'Konstitisyon',
      code: 'Kòd yo',
      loi: 'Lwa yo',
      decret: 'Dekrè yo',
      arrete: 'Arète yo',
    },
    selectFondsHint: 'Chwazi yon fon dokimantè pou sible rechèch la.',
    operatorLabel: 'Operatè lojik',
    operatorOptions: { ET: 'AK', OU: 'OU', SAUF: 'SOF' },
    operatorHelp: {
      ET: 'Tout kritè « AK » yo dwe matche.',
      OU: 'Omwen yon kritè « OU » dwe matche.',
      SAUF: 'Okenn kritè « SOF » pa dwe matche.',
    },
    fieldLabel: 'Chan',
    fieldOptions: {
      all: 'Nan tout chan yo',
      title: 'Nan tit yo',
      description: 'Nan deskripsyon yo',
    },
    textLabel: 'Tèks chèche',
    textPlaceholder: 'Egz. : patènite, divòs, pwopriyete…',
    modeLabel: 'Mòd',
    modeOptions: {
      all: 'Tout mo yo',
      exact: 'Ekspresyon egzak',
      any: 'Youn nan mo sa yo',
      exclude: 'Eskli mo sa yo',
    },
    deleteCriterion: 'Retire kritè sa a',
    addCriterion: 'Ajoute yon gwoup kritè',
    refineTitle: 'Afine rechèch la',
    statusLabel: 'Estati jiridik',
    statusOptions: {
      all: 'Tout',
      in_force: 'An vigè',
      abrogated: 'Abwoje',
      historical: 'Istorik',
    },
    yearLabel: 'Ane piblikasyon',
    yearFrom: 'Soti',
    yearTo: 'rive',
    submit: 'Lanse rechèch la',
    reset: 'Reinisyalize rechèch la',
    resultsTitle: 'Rezilta yo',
    noResults: 'Pa gen tèks ki matche kritè sa yo.',
    notSearchedYet:
      'Konfigire kritè ou yo anlè, epi lanse rechèch la pou afiche rezilta yo.',
    loading: 'Ap chaje kòpis la…',
    error: 'Erè pandan chajman.',
    helpTitle: 'Èd LexHaïti',
    helpIntro:
      'Pou ede w sèvi ak sit la, gade nan èd ki disponib la.',
    helpItems: [
      'Rechèch pa enpòtan aksan ni majiskil/miniskil.',
      'Pou yon ekspresyon egzak, chwazi « Ekspresyon egzak » nan mòd la.',
      'Konbine plizyè kritè : « AK » pou kimile, « OU » pou elaji, « SOF » pou eskli.',
    ],
    contactUs: 'Kontakte nou',
    tutorials: 'Wè tutoriels yo',
    useCases: 'Gid ka itilizasyon',
  },
}

// =============================================================================
// Constants
// =============================================================================

const FONDS = [
  { value: 'all', icon: SearchIcon },
  { value: 'constitution', icon: Shield },
  { value: 'code', icon: BookOpen },
  { value: 'loi', icon: Scale },
  { value: 'decret', icon: Scroll },
  { value: 'arrete', icon: Stamp },
] as const

const CATEGORY_PILL: Record<string, { fr: string; ht: string; cls: string }> = {
  constitution: { fr: 'Constitution', ht: 'Konstitisyon', cls: 'bg-amber-100 text-amber-800' },
  code: { fr: 'Code', ht: 'Kòd', cls: 'bg-blue-100 text-blue-800' },
  loi: { fr: 'Loi', ht: 'Lwa', cls: 'bg-indigo-100 text-indigo-800' },
  decret: { fr: 'Décret', ht: 'Dekrè', cls: 'bg-emerald-100 text-emerald-800' },
  arrete: { fr: 'Arrêté', ht: 'Arète', cls: 'bg-purple-100 text-purple-800' },
}

const STATUS_PILL: Record<string, { fr: string; ht: string; cls: string }> = {
  in_force: { fr: 'En vigueur', ht: 'An vigè', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  abrogated: { fr: 'Abrogée', ht: 'Abwoje', cls: 'bg-red-50 text-red-700 border-red-200' },
  historical: { fr: 'Historique', ht: 'Istorik', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  suspended: { fr: 'Suspendue', ht: 'Sispann', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
}

// =============================================================================
// Search helpers
// =============================================================================

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function getHaystack(row: LegalTextRow, field: FieldKey): string {
  const parts: string[] = []
  if (field === 'all' || field === 'title') {
    if (row.title_fr) parts.push(row.title_fr)
    if (row.title_ht) parts.push(row.title_ht)
  }
  if (field === 'all' || field === 'description') {
    if (row.description_fr) parts.push(row.description_fr)
    if (row.description_ht) parts.push(row.description_ht)
  }
  return normalize(parts.join(' \n '))
}

/** Does this row match the given criterion? */
function matchCriterion(row: LegalTextRow, c: CriteriaRow): boolean {
  const query = c.text.trim()
  if (!query) return true
  const hay = getHaystack(row, c.field)
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  switch (c.mode) {
    case 'exact':
      return hay.includes(normalize(query))
    case 'any':
      return tokens.some((t) => hay.includes(t))
    case 'exclude':
      return tokens.every((t) => !hay.includes(t))
    case 'all':
    default:
      return tokens.every((t) => hay.includes(t))
  }
}

/**
 * Apply ET/OU/SAUF group semantics:
 *   row matches IFF
 *     ALL(ET rows match) AND
 *     ANY(OU rows match) [or no OU rows] AND
 *     NONE(SAUF rows match)
 *
 * The first row is treated as ET regardless of its `operator` field
 * (the first row's operator is hidden in the UI).
 */
function combinedMatch(row: LegalTextRow, criteria: CriteriaRow[]): boolean {
  if (criteria.length === 0) return true
  const buckets: Record<OperatorKey, CriteriaRow[]> = { ET: [], OU: [], SAUF: [] }
  criteria.forEach((c, i) => {
    const op: OperatorKey = i === 0 ? 'ET' : c.operator
    buckets[op].push(c)
  })
  // Skip empty rows (text empty) so users can leave a blank one.
  const nonEmpty = (c: CriteriaRow) => c.text.trim().length > 0
  const et = buckets.ET.filter(nonEmpty)
  const ou = buckets.OU.filter(nonEmpty)
  const sauf = buckets.SAUF.filter(nonEmpty)

  if (et.length && !et.every((c) => matchCriterion(row, c))) return false
  if (ou.length && !ou.some((c) => matchCriterion(row, c))) return false
  if (sauf.length && sauf.some((c) => matchCriterion(row, c))) return false
  return true
}

// =============================================================================
// Defaults
// =============================================================================

const newRow = (operator: OperatorKey = 'ET'): CriteriaRow => ({
  id: `row-${Math.random().toString(36).slice(2, 9)}`,
  operator,
  field: 'all',
  text: '',
  mode: 'all',
})

const DEFAULT_FORM: FormState = {
  fonds: 'all',
  rows: [newRow('ET')],
  status: 'all',
  yearFrom: '',
  yearTo: '',
}

// =============================================================================
// Component
// =============================================================================

export default function AdvancedSearchPage() {
  const { language } = useT()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  const [allTexts, setAllTexts] = useState<LegalTextRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [applied, setApplied] = useState<FormState>(DEFAULT_FORM)
  const [refineOpen, setRefineOpen] = useState(true)
  // Don't show results (or fetch) until the user explicitly clicks "Lancer
  // la recherche" at least once. Reset on "Réinitialiser la recherche".
  const [hasSearched, setHasSearched] = useState(false)

  // Refetch from the backend whenever the applied filters change AFTER the
  // user has clicked "Lancer la recherche" at least once. The backend handles:
  // category, status, year range, and the first criterion's text query (q +
  // q_field + q_mode). Multi-criteria boolean composition (OR / SAUF rows)
  // is then applied client-side — proper backend support for boolean groups
  // is a separate ticket.
  useEffect(() => {
    if (!hasSearched) return
    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams()
    params.set('limit', '100')
    params.set('offset', '0')
    if (applied.fonds !== 'all') params.set('category', applied.fonds)
    if (applied.status !== 'all') params.set('status', applied.status)
    if (applied.yearFrom) params.set('year_from', applied.yearFrom)
    if (applied.yearTo) params.set('year_to', applied.yearTo)
    // Use the first non-empty ET criterion as the backend's text filter.
    // The backend matches across title + description + article body (when
    // q_field=all), so we trust its result for that row and skip re-applying
    // it on the client. Additional OR/SAUF rows are still applied below.
    const baseIdx = applied.rows.findIndex(
      (r, i) => (i === 0 || r.operator === 'ET') && r.text.trim().length > 0,
    )
    if (baseIdx >= 0) {
      const baseRow = applied.rows[baseIdx]
      params.set('q', baseRow.text.trim())
      params.set('q_field', baseRow.field)
      params.set('q_mode', baseRow.mode)
      // Ask the backend to return highlighted snippets when searching all fields.
      if (baseRow.field === 'all') {
        params.set('with_snippets', 'true')
      }
    }

    fetch(`/api/v1/legal-texts?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const arr = Array.isArray(data)
          ? data
          : (data.items ?? data.results ?? [])
        setAllTexts(arr)
        setErrored(false)
      })
      .catch(() => {
        if (!cancelled) setErrored(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applied, hasSearched])

  const results = useMemo(() => {
    // The backend already handled the first non-empty ET criterion (with
    // article-body search). Skip that exact row when composing on the client
    // so we don't double-filter and lose results whose match was in the body.
    const baseIdx = applied.rows.findIndex(
      (r, i) => (i === 0 || r.operator === 'ET') && r.text.trim().length > 0,
    )
    const remaining =
      baseIdx >= 0
        ? applied.rows.filter((_, i) => i !== baseIdx)
        : applied.rows
    return allTexts.filter((t) => combinedMatch(t, remaining))
  }, [allTexts, applied])

  const submit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setApplied(form)
    setHasSearched(true)
  }

  const reset = () => {
    const fresh: FormState = { ...DEFAULT_FORM, rows: [newRow('ET')] }
    setForm(fresh)
    setApplied(fresh)
    setHasSearched(false)
    setAllTexts([])
  }

  const updateRow = (id: string, patch: Partial<CriteriaRow>) =>
    setForm((cur) => ({
      ...cur,
      rows: cur.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))

  const addRow = () =>
    setForm((cur) => ({ ...cur, rows: [...cur.rows, newRow('ET')] }))

  const deleteRow = (id: string) =>
    setForm((cur) => ({
      ...cur,
      rows: cur.rows.length > 1 ? cur.rows.filter((r) => r.id !== id) : cur.rows,
    }))

  const fondsLabelText =
    copy.fondsDropdown[form.fonds as keyof typeof copy.fondsDropdown] ??
    copy.fondsDropdown.all

  return (
    <div className="bg-white min-h-screen">
      <StandardPageHeader title={copy.pageTitle} subtitle={copy.pageSubtitle} />

      {/* Search panel — Légifrance-style inset */}
      <div className="container py-10 lg:py-12">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl bg-slate-50/80 border border-slate-200 p-6 sm:p-8 space-y-6"
        >
          {/* Fonds picker — DropdownMenu with tile grid inside */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
              {copy.fondsLabel}
            </label>
            <FondsPicker
              value={form.fonds}
              onChange={(v) => setForm((cur) => ({ ...cur, fonds: v }))}
              labelText={fondsLabelText}
              dropdownLabels={copy.fondsDropdown}
            />
          </div>

          {form.fonds === 'all' && (
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-primary">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{copy.selectFondsHint}</span>
            </div>
          )}

          {/* Criteria rows.
              Row 1: full width, no operator, no delete when standalone.
              Row 2+: indented + tree-style connector line.
                - Middle rows draw a "T" (vertical through full height + a
                  horizontal branch at mid-row), so the next row's connector
                  meets seamlessly.
                - The last row draws an "L" (vertical only to mid-row + branch).
              The result reads as a single line that branches out to each group. */}
          <div className="space-y-3">
            {form.rows.map((row, i) => {
              const isFirst = i === 0
              const isLast = i === form.rows.length - 1
              return (
                <div
                  key={row.id}
                  className={cn('relative', !isFirst && 'pl-4 sm:pl-8')}
                >
                  {!isFirst && (
                    <>
                      {/* Top half: rounded "L" from above-left curving into
                          the row's mid-left. Single element with two borders +
                          rounded-bl gives the curved corner cleanly. */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -top-3 left-2 sm:left-4 w-2 sm:w-4 border-l-2 border-b-2 border-slate-300 rounded-bl-lg h-[calc(50%+0.75rem)]"
                      />
                      {/* Bottom half (middle rows only): straight trunk
                          continuing from mid-row down through the gap,
                          meeting the next row's L on its top edge. */}
                      {!isLast && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 left-2 sm:left-4 w-0.5 bg-slate-300 h-[calc(50%+0.75rem)]"
                        />
                      )}
                    </>
                  )}
                  <CriteriaRowEditor
                    row={row}
                    copy={copy}
                    onChange={(patch) => updateRow(row.id, patch)}
                    onDelete={() => deleteRow(row.id)}
                    canDelete={form.rows.length > 1}
                    showOperator={!isFirst}
                  />
                </div>
              )
            })}

            <div className="flex items-center justify-between flex-wrap gap-3 pt-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {copy.reset}
              </button>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4"
              >
                <Plus className="w-3.5 h-3.5" />
                {copy.addCriterion}
              </button>
            </div>
          </div>

          {/* Affiner la recherche — collapsible group */}
          <div className="rounded-xl bg-white border border-slate-200">
            <button
              type="button"
              onClick={() => setRefineOpen((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
              aria-expanded={refineOpen}
            >
              <span className="text-sm font-bold text-primary">
                {copy.refineTitle}
              </span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-primary transition-transform',
                  refineOpen && 'rotate-180',
                )}
              />
            </button>

            <AnimatePresence initial={false}>
              {refineOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-5 pb-5 pt-2 border-t border-slate-100">
                    <div>
                      <label
                        id="adv-status-label"
                        className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2"
                      >
                        {copy.statusLabel}
                      </label>
                      <Select
                        value={form.status}
                        onValueChange={(v) =>
                          setForm((cur) => ({ ...cur, status: v }))
                        }
                      >
                        <SelectTrigger
                          aria-labelledby="adv-status-label"
                          className="!h-11 w-full bg-white"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{copy.statusOptions.all}</SelectItem>
                          <SelectItem value="in_force">{copy.statusOptions.in_force}</SelectItem>
                          <SelectItem value="abrogated">{copy.statusOptions.abrogated}</SelectItem>
                          <SelectItem value="historical">{copy.statusOptions.historical}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                        {copy.yearLabel}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1800}
                          max={2100}
                          placeholder={copy.yearFrom}
                          aria-label={`${copy.yearLabel} — ${copy.yearFrom}`}
                          value={form.yearFrom}
                          onChange={(e) =>
                            setForm((cur) => ({ ...cur, yearFrom: e.target.value }))
                          }
                          className="w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                        />
                        <span aria-hidden="true" className="text-xs text-slate-400">
                          {copy.yearTo}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1800}
                          max={2100}
                          placeholder={copy.yearTo}
                          aria-label={`${copy.yearLabel} — ${copy.yearTo}`}
                          value={form.yearTo}
                          onChange={(e) =>
                            setForm((cur) => ({ ...cur, yearTo: e.target.value }))
                          }
                          className="w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.form>

        {/* Submit area — right-aligned outside the form card (Légifrance pattern) */}
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            onClick={() => submit()}
            size="lg"
            className="h-12 rounded-md bg-primary text-white hover:bg-primary/90 px-7 font-semibold gap-2"
          >
            <SearchIcon className="w-4 h-4" />
            {copy.submit}
          </Button>
        </div>
      </div>

      {/* Results — only rendered after the user clicks "Lancer la recherche". */}
      <section className="container pb-12 lg:pb-16">
        {!hasSearched ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/40 px-6 py-10 text-center">
            <p className="text-sm text-slate-500 leading-relaxed max-w-xl mx-auto">
              {copy.notSearchedYet}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {copy.resultsTitle}
              </h2>
              <span className="text-sm font-medium text-slate-400 tabular-nums">
                ({results.length})
              </span>
            </div>

            {loading && (
              <p className="text-sm text-slate-400 italic">{copy.loading}</p>
            )}
            {!loading && errored && (
              <p className="text-sm text-red-500 italic">{copy.error}</p>
            )}
            {!loading && !errored && results.length === 0 && (
              <p className="text-sm text-slate-400 italic">{copy.noResults}</p>
            )}

            {!loading && !errored && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            {results.map((t) => (
              <ResultCard
                key={t.slug}
                text={t}
                lang={lang}
                query={
                  applied.rows.find(
                    (r, i) =>
                      (i === 0 || r.operator === 'ET') && r.text.trim().length > 0,
                  )?.text ?? ''
                }
              />
            ))}
          </div>
            )}
          </>
        )}
      </section>

      {/* Help */}
      <section className="bg-slate-50/60 border-t border-slate-200 py-12 lg:py-16">
        <div className="container">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3 tracking-tight">
            {copy.helpTitle}
          </h3>
          <p className="text-sm text-slate-600 mb-6 max-w-3xl leading-relaxed">
            {copy.helpIntro}
          </p>
          <ul className="space-y-2 text-sm text-slate-600 leading-relaxed mb-8 max-w-3xl">
            {copy.helpItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-slate-400 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4"
            >
              <Mail className="w-3.5 h-3.5" />
              {copy.contactUs}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/a-propos"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              {copy.tutorials}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/a-propos"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {copy.useCases}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

interface FondsPickerProps {
  value: string
  onChange: (v: string) => void
  labelText: string
  dropdownLabels: Record<string, string>
}

function FondsPicker({
  value,
  onChange,
  labelText,
  dropdownLabels,
}: FondsPickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-between gap-3 min-w-[260px] h-11 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <span>{labelText}</span>
          <ChevronDown
            className={cn('w-4 h-4 transition-transform', open && 'rotate-180')}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="p-3 w-[min(720px,calc(100vw-2rem))]"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 px-1">
          {dropdownLabels.all === 'Dans tous les fonds' ? 'Sélectionner un fonds' : 'Chwazi yon fon'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FONDS.map((f) => {
            const Icon = f.icon
            const active = value === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  onChange(f.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border',
                    active
                      ? 'border-primary bg-white'
                      : 'border-slate-300 bg-white',
                  )}
                >
                  {active ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  ) : null}
                </span>
                <Icon
                  className={cn(
                    'w-4 h-4',
                    active ? 'text-primary' : 'text-slate-400',
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    active ? 'text-primary' : 'text-slate-700',
                  )}
                >
                  {dropdownLabels[f.value]}
                </span>
              </button>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface CriteriaRowEditorProps {
  row: CriteriaRow
  copy: (typeof COPY)['fr']
  onChange: (patch: Partial<CriteriaRow>) => void
  onDelete: () => void
  canDelete: boolean
  /**
   * When true, render the operator (ET/OU/SAUF) as the leftmost column.
   * False for the first row (its operator is implicit — there's nothing
   * before it to connect to).
   */
  showOperator: boolean
}

/**
 * One criteria row.
 * Without operator: Field | Text | Mode | Delete.
 * With operator:    [ET▼] | Field | Text | Mode | Delete.
 *
 * Note on heights: shadcn's `SelectTrigger` ships with
 * `data-[size=default]:h-9`. We need `h-11` to match the text input,
 * so we use `!h-11` to force it past the data-attribute selector.
 */
function CriteriaRowEditor({
  row,
  copy,
  onChange,
  onDelete,
  canDelete,
  showOperator,
}: CriteriaRowEditorProps) {
  // Grid adapts to whether the operator and delete columns are present.
  // Standalone row 1 (canDelete=false) doesn't reserve a delete column.
  const gridTemplate = showOperator
    ? 'lg:grid-cols-[100px_minmax(180px,220px)_1fr_minmax(180px,220px)_44px]'
    : canDelete
      ? 'lg:grid-cols-[minmax(180px,220px)_1fr_minmax(180px,220px)_44px]'
      : 'lg:grid-cols-[minmax(180px,220px)_1fr_minmax(180px,220px)]'

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3 sm:p-4">
      <div className={cn('grid grid-cols-1 gap-2 items-stretch', gridTemplate)}>
        {/* Operator (link to previous row) — only on rows 2+ */}
        {showOperator && (
          <Select
            value={row.operator}
            onValueChange={(v) => onChange({ operator: v as OperatorKey })}
          >
            <SelectTrigger
              className="!h-11 w-full bg-white font-semibold text-primary tracking-widest uppercase text-xs"
              aria-label={copy.operatorLabel}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ET">{copy.operatorOptions.ET}</SelectItem>
              <SelectItem value="OU">{copy.operatorOptions.OU}</SelectItem>
              <SelectItem value="SAUF">{copy.operatorOptions.SAUF}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Field */}
        <Select
          value={row.field}
          onValueChange={(v) => onChange({ field: v as FieldKey })}
        >
          <SelectTrigger
            className="!h-11 w-full bg-white"
            aria-label={copy.fieldLabel}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.fieldOptions.all}</SelectItem>
            <SelectItem value="title">{copy.fieldOptions.title}</SelectItem>
            <SelectItem value="description">
              {copy.fieldOptions.description}
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Text */}
        <input
          type="text"
          value={row.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={copy.textPlaceholder}
          aria-label={copy.textLabel}
          className="w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
        />

        {/* Mode */}
        <Select
          value={row.mode}
          onValueChange={(v) => onChange({ mode: v as ModeKey })}
        >
          <SelectTrigger
            className="!h-11 w-full bg-white"
            aria-label={copy.modeLabel}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.modeOptions.all}</SelectItem>
            <SelectItem value="exact">{copy.modeOptions.exact}</SelectItem>
            <SelectItem value="any">{copy.modeOptions.any}</SelectItem>
            <SelectItem value="exclude">{copy.modeOptions.exclude}</SelectItem>
          </SelectContent>
        </Select>

        {/* Delete — only rendered when there are 2+ rows (so a single-criteria
            standalone view stays clean). */}
        {canDelete && (
          <div className="flex items-center justify-end lg:justify-center h-11">
            <button
              type="button"
              onClick={onDelete}
              aria-label={copy.deleteCriterion}
              title={copy.deleteCriterion}
              className="w-11 h-11 inline-flex items-center justify-center rounded-md border border-transparent text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


interface ResultCardProps {
  text: LegalTextRow
  lang: 'fr' | 'ht'
  /** Search query string — used to highlight matches in title/description. */
  query?: string
}

/** Strip combining diacritics (NFD form) so "président" matches "president". */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Highlight every occurrence of any query word inside `text`. Matching is
 * case- and accent-insensitive, but the returned slices preserve the original
 * casing/accents from `text`. Returns React nodes (an array of strings and
 * `<mark>` elements).
 */
function highlightQuery(text: string, query: string): React.ReactNode {
  if (!text || !query.trim()) return text
  const stripped = stripAccents(text)
  const tokens = stripAccents(query.trim())
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return text

  // Find every occurrence of every token; build a sorted, merged list of ranges.
  const ranges: Array<[number, number]> = []
  for (const tok of tokens) {
    let idx = 0
    while (idx < stripped.length) {
      const found = stripped.indexOf(tok, idx)
      if (found < 0) break
      ranges.push([found, found + tok.length])
      idx = found + tok.length
    }
  }
  if (ranges.length === 0) return text
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && last[1] >= r[0]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }

  const out: React.ReactNode[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (cursor < start) out.push(text.slice(cursor, start))
    out.push(
      <mark
        key={`${start}-${end}`}
        className="bg-amber-100 text-amber-900 rounded px-0.5 font-semibold"
      >
        {text.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

function ResultCard({ text, lang, query = '' }: ResultCardProps) {
  const title = lang === 'ht' && text.title_ht ? text.title_ht : text.title_fr
  const desc =
    lang === 'ht' && text.description_ht ? text.description_ht : text.description_fr
  const cat = CATEGORY_PILL[text.category] ?? CATEGORY_PILL.loi
  const stat =
    text.status && STATUS_PILL[text.status] ? STATUS_PILL[text.status] : null
  const year = text.publication_date?.slice(0, 4)
  const snippets = text.match_snippets ?? []

  // Card wrapper is a `<div>` (not `<Link>`) so we can nest separate links
  // for the title and each individual snippet — clicking a snippet deep-links
  // straight to that article on the detail page via `?article=N`.
  return (
    <div className="group flex flex-col h-full rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cat.cls}`}
        >
          {cat[lang]}
        </span>
        {stat && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${stat.cls}`}
          >
            {stat[lang]}
          </span>
        )}
      </div>

      <Link
        href={`/loi/${text.slug}`}
        className="block group/title"
      >
        <h3 className="text-base font-bold text-slate-900 mb-2 leading-snug group-hover/title:text-primary transition-colors line-clamp-2">
          {highlightQuery(title, query)}
        </h3>
      </Link>

      {desc && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 mb-3">
          {highlightQuery(desc, query)}
        </p>
      )}

      {/* Article-body snippets — each snippet is its own link with the
          article anchor as a query param so the detail page opens with
          that exact article selected. Backend wraps matched terms in
          `<mark>` via `ts_headline`. */}
      {snippets.length > 0 && (
        <ul className="mb-3 space-y-2 border-l-2 border-amber-200 pl-3">
          {snippets.map((s, i) => {
            const snippetHtml =
              lang === 'ht' && s.snippet_ht ? s.snippet_ht : s.snippet_fr
            if (!snippetHtml) return null
            return (
              <li key={i} className="text-xs leading-relaxed text-slate-600">
                <Link
                  href={`/loi/${text.slug}?article=${encodeURIComponent(s.article_number)}`}
                  className="block rounded-md hover:bg-amber-50/60 -mx-2 px-2 py-1 transition-colors"
                >
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover/snippet:text-primary mb-0.5">
                    Art. {s.article_number}
                  </span>
                  <span
                    className="[&_mark]:bg-amber-100 [&_mark]:text-amber-900 [&_mark]:rounded [&_mark]:px-0.5 [&_mark]:font-semibold"
                    // Sanitized server-side via ts_headline — only <mark>
                    // tags are inserted around matched terms.
                    dangerouslySetInnerHTML={{ __html: snippetHtml }}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
        {year && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Calendar className="w-3 h-3" />
            {year}
          </span>
        )}
        <Link
          href={`/loi/${text.slug}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline underline-offset-4"
        >
          {lang === 'fr' ? 'Voir le texte' : 'Wè tèks la'}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}
