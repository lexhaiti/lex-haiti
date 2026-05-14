'use client'

/**
 * Editorial dashboard — landing page for editor-mode users.
 *
 * Stage 5 of the bilingual ingestion pipeline. Surfaces translation-
 * pipeline counters (texts/articles/Moniteur-entries) and links to the
 * worklists for each.
 *
 * Currently focused on translation stats; will grow over time to host
 * other editorial KPIs (drafts pending review, OCR queue depth, etc.).
 */
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight,
  CalendarRange,
  ChevronDown,
  FileText,
  Languages,
  Loader2,
  Newspaper,
  Search,
  Sparkles,
  X,
} from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { useT } from '@/i18n/useT'
import {
  getTranslationStats,
  listEditorialTexts,
  type TranslationStats,
} from '@/lib/api/endpoints'
import type { components } from '@/lib/api-types'
import { cn } from '@/lib/utils'

type LegalTextListItem = components['schemas']['LegalTextListItem']

export default function EditorialDashboardPage() {
  const { isEditor, status } = useEditorMode()
  const { language } = useT()
  const isFr = language !== 'ht'

  const [stats, setStats] = useState<TranslationStats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [allLaws, setAllLaws] = useState<LegalTextListItem[] | null>(null)
  // Search + open-years state for the by-year inventory list. ``openYears``
  // defaults to a Set seeded once the data lands (the most recent year is
  // expanded by default; older years stay collapsed so the page reads
  // quickly even with hundreds of entries).
  const [lawsQuery, setLawsQuery] = useState('')
  const [openYears, setOpenYears] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!isEditor) return
    let cancelled = false
    getTranslationStats()
      .then((s) => {
        if (!cancelled) setStats(s)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? String(e))
      })
    // Fetch the full corpus listing for the "Tous les textes par
    // année" section. listEditorialTexts (no editorial_status filter)
    // returns drafts + published — exactly what an editor wants when
    // scanning the inventory. Public listTexts would have hidden
    // drafts behind the default published-only filter.
    listEditorialTexts({ limit: 100 })
      .then((res) => {
        if (!cancelled) setAllLaws(res.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setAllLaws([])
      })
    return () => {
      cancelled = true
    }
  }, [isEditor])

  // Group laws by their publication year. Texts without a date land
  // in a trailing "(année inconnue)" bucket so the editor can spot
  // and fix them rather than have them silently disappear. The
  // search box filters the list ahead of grouping; an active query
  // also forces every matching year open so hits aren't hidden
  // behind a collapsed accordion.
  const lawsByYear = useMemo(() => {
    if (!allLaws) return null
    const q = lawsQuery.trim().toLowerCase()
    const matches = q
      ? allLaws.filter(
          (law) =>
            (law.title_fr || '').toLowerCase().includes(q) ||
            (law.title_ht || '').toLowerCase().includes(q) ||
            (law.slug || '').toLowerCase().includes(q),
        )
      : allLaws
    const groups = new Map<string, LegalTextListItem[]>()
    for (const law of matches) {
      const year = law.publication_date
        ? law.publication_date.slice(0, 4)
        : '—'
      const bucket = groups.get(year) ?? []
      bucket.push(law)
      groups.set(year, bucket)
    }
    return Array.from(groups.entries()).sort((a, b) => {
      // Numeric years descending; unknown year always last.
      if (a[0] === '—') return 1
      if (b[0] === '—') return -1
      return Number(b[0]) - Number(a[0])
    })
  }, [allLaws, lawsQuery])

  // Seed openYears once the data arrives: pop the most recent (first
  // in the sorted list) open by default, everything else collapsed.
  // ``useEffect`` rather than ``useMemo`` because we only want to
  // initialize once; subsequent user toggles persist.
  useEffect(() => {
    if (openYears !== null) return
    if (!lawsByYear || lawsByYear.length === 0) return
    setOpenYears(new Set([lawsByYear[0][0]]))
  }, [lawsByYear, openYears])

  // Active query forces every year-with-hits open so matches aren't
  // hidden behind a collapsed accordion. ``effectiveOpen`` is the
  // render-time set; we don't mutate ``openYears`` so toggles after
  // clearing the search restore the user's prior accordion state.
  const effectiveOpenYears = useMemo(() => {
    if (lawsQuery.trim() && lawsByYear) {
      return new Set(lawsByYear.map(([year]) => year))
    }
    return openYears ?? new Set<string>()
  }, [lawsQuery, lawsByYear, openYears])

  function toggleYear(year: string) {
    setOpenYears((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isEditor) {
    return (
      <div className="container py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 max-w-3xl">
          <p className="text-sm text-slate-700">
            {isFr
              ? 'Cette page est réservée aux éditeurs connectés.'
              : 'Paj sa a pou editè ki konekte sèlman.'}
          </p>
          <Link
            href="/sign-in"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {isFr ? 'Se connecter' : 'Konekte'} →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navy hero band — matches the law-detail / amendements pages
          so the editor dashboard reads as part of the same surface. */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-12 lg:py-20 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
              { label: isFr ? 'Éditorial' : 'Editoryal' },
            ]}
          />
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white"
          >
            {isFr ? 'Pipeline éditorial' : 'Pipeline editoryal'}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-slate-300 text-lg lg:text-xl leading-relaxed max-w-3xl"
          >
            {isFr
              ? 'Tableau de bord pour la curation du corpus juridique haïtien — imports, traductions, et inventaire des textes.'
              : 'Tablo pou kirate kòpis jiridik ayisyen — enpòtasyon, tradiksyon, ak envantè tèks yo.'}
          </motion.p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-10 lg:py-12 space-y-10">
      {/* Quick actions */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DashboardCard
          href="/editorial/import"
          icon={Sparkles}
          title={isFr ? 'Importer un texte' : 'Enpòte yon tèks'}
          subtitle={
            isFr
              ? 'PDF/DOCX français — avec ou sans Kreyòl'
              : 'PDF/DOCX fransè — ak oswa san Kreyòl'
          }
        />
        <DashboardCard
          href="/editorial/moniteur"
          icon={Newspaper}
          title={isFr ? 'Le Moniteur' : 'Le Moniteur'}
          subtitle={
            isFr ? 'Numéros + sommaire à réviser' : 'Nimewo + somè pou revize'
          }
        />
        <DashboardCard
          href="/editorial/translations"
          icon={Languages}
          title={isFr ? 'Traductions' : 'Tradiksyon'}
          subtitle={
            isFr ? 'Liste des textes à traduire' : 'Lis tèks pou tradui'
          }
        />
      </section>

      {/* Translation stats */}
      {err && <ErrorBanner>{err}</ErrorBanner>}

      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-slate-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {isFr ? 'Couverture des traductions' : 'Kouvèti tradiksyon yo'}
          </h2>
        </header>
        {stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label={isFr ? 'Textes au corpus' : 'Tèks nan kòpis'}
              value={stats.legal_texts_total}
              icon={FileText}
            />
            <StatCard
              label={isFr ? 'Au moins partiellement traduits' : 'Omwen pasyèlman tradui'}
              value={stats.legal_texts_with_ht}
              accent="emerald"
            />
            <StatCard
              label={isFr ? 'Entièrement traduits' : 'Tradui konplètman'}
              value={stats.legal_texts_fully_translated}
              accent="emerald"
            />
            <StatCard
              label={isFr ? 'Aucune traduction' : 'Pa gen tradiksyon'}
              value={stats.legal_texts_fr_only}
              accent="amber"
            />
            <StatCard
              label={isFr ? 'Articles au corpus' : 'Atik nan kòpis'}
              value={stats.articles_total}
              icon={FileText}
            />
            <StatCard
              label={isFr ? 'Articles traduits' : 'Atik tradui'}
              value={stats.articles_translated}
              accent="emerald"
              hint={
                stats.articles_total > 0
                  ? `${Math.round((stats.articles_translated / stats.articles_total) * 100)}%`
                  : undefined
              }
            />
            <StatCard
              label={isFr ? 'Entrées Moniteur' : 'Antre Moniteur'}
              value={stats.moniteur_entries_total}
              icon={Newspaper}
            />
            <StatCard
              label={isFr ? 'Avec source HT' : 'Ak sous HT'}
              value={stats.moniteur_entries_with_translation_pointer}
              accent="emerald"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
            {isFr ? 'Chargement…' : 'Chaje…'}
          </div>
        )}
      </section>

      {/* Pending pointers callout — only when there are entries to fix */}
      {stats && stats.moniteur_entries_pending_translation > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-800 mb-1">
                {isFr ? 'En attente d’une source HT' : 'Ap tann sous HT'}
              </p>
              <p className="text-sm text-amber-900">
                {isFr
                  ? `${stats.moniteur_entries_pending_translation} entrée(s) du Moniteur ont été promues mais n'ont pas encore de source de traduction.`
                  : `${stats.moniteur_entries_pending_translation} antre Moniteur pwomòte san sous tradiksyon.`}
              </p>
            </div>
            <Link
              href="/editorial/moniteur"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-800"
            >
              {isFr ? 'Voir les numéros' : 'Wè nimewo yo'}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* All laws grouped by publication year — quick inventory for
          editors. Single-column list (one text per line) for fast
          scanning, accordion per year so older buckets stay folded
          by default, and a sticky search filter at the top of the
          block for instant title lookup. */}
      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {isFr ? 'Tous les textes par année' : 'Tout tèks pa ane'}
          </h2>
          {allLaws && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
              {allLaws.length}
            </span>
          )}
        </header>
        {/* Search filter — purely client-side, hits title_fr / title_ht
            / slug. Active query also force-opens every accordion. */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={lawsQuery}
            onChange={(e) => setLawsQuery(e.target.value)}
            placeholder={
              isFr
                ? 'Filtrer par titre ou slug…'
                : 'Filtre pa tit oswa slug…'
            }
            className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {lawsQuery && (
            <button
              type="button"
              onClick={() => setLawsQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
              aria-label={isFr ? 'Effacer le filtre' : 'Efase filtè'}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {lawsByYear === null ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
            {isFr ? 'Chargement…' : 'Chaje…'}
          </div>
        ) : lawsByYear.length === 0 ? (
          <p className="text-sm text-slate-400 italic px-1">
            {lawsQuery.trim()
              ? isFr
                ? 'Aucun texte ne correspond à ce filtre.'
                : 'Pa gen tèks ki koresponn ak filtè sa a.'
              : isFr
                ? 'Aucun texte au corpus.'
                : 'Pa gen tèks nan kòpis la.'}
          </p>
        ) : (
          <div className="space-y-2">
            {lawsByYear.map(([year, items]) => {
              const isOpen = effectiveOpenYears.has(year)
              return (
                <div
                  key={year}
                  className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleYear(year)}
                    aria-expanded={isOpen}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left',
                      'hover:bg-slate-50 transition-colors',
                      isOpen && 'bg-slate-50/60',
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-slate-400 transition-transform',
                        !isOpen && '-rotate-90',
                      )}
                    />
                    <span className="text-xl font-black text-slate-300 tabular-nums leading-none">
                      {year}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
                      {items.length}{' '}
                      {items.length === 1
                        ? isFr
                          ? 'texte'
                          : 'tèks'
                        : isFr
                          ? 'textes'
                          : 'tèks'}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <ul className="divide-y divide-slate-100 border-t border-slate-100">
                          {items.map((law) => (
                            <li
                              key={law.id}
                              className="px-4 py-2.5 text-sm leading-relaxed hover:bg-slate-50/50 transition-colors"
                            >
                              <Link
                                href={`/loi/${law.slug}`}
                                className="text-slate-700 hover:text-primary hover:underline underline-offset-2"
                              >
                                {(isFr
                                  ? law.title_fr
                                  : law.title_ht || law.title_fr) ||
                                  law.slug}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </section>
      </div>
    </div>
  )
}

function DashboardCard({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-primary/30 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <Icon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-0.5">{title}</h3>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </Link>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string
  value: number
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  accent?: 'emerald' | 'amber'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4',
        accent === 'emerald'
          ? 'border-emerald-100'
          : accent === 'amber'
            ? 'border-amber-100'
            : 'border-slate-200',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 leading-tight">
          {label}
        </p>
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
      </div>
      <p className="flex items-baseline gap-2">
        <span
          className={cn(
            'text-2xl font-black tabular-nums leading-none',
            accent === 'emerald'
              ? 'text-emerald-700'
              : accent === 'amber'
                ? 'text-amber-700'
                : 'text-slate-900',
          )}
        >
          {value.toLocaleString('fr-FR')}
        </span>
        {hint && (
          <span className="text-xs font-semibold text-slate-500 tabular-nums">
            {hint}
          </span>
        )}
      </p>
    </div>
  )
}
