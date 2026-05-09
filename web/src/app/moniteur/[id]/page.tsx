'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Newspaper,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  getMoniteurIssue,
  type MoniteurIssueWithEntries,
  type MoniteurEntryRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/shared/Breadcrumb'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS_FR = [
  '',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function formatLongDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const day = Number.parseInt(m[3], 10)
  const month = Number.parseInt(m[2], 10)
  return `${day} ${MONTHS_FR[month] ?? ''} ${m[1]}`
}

function smartIssueNumber(raw: string): string {
  // Only prepend "N°" when the issue number starts with a digit.
  // "Spécial N° 5" stays as is, "237" becomes "N° 237".
  return /^[0-9]/.test(raw) ? `N° ${raw}` : raw
}

// Le Moniteur Officiel d'Haïti was founded in 1845 — the first published
// "année" was 1846. So the historic année count for a calendar year is
// `year - 1845` (e.g. 2017 → 172e année). Anchor lives here rather than
// being derived per call so the founding-year decision is documented.
const MONITEUR_FOUNDING_YEAR = 1845

function moniteurAnnee(year: number): number {
  return Math.max(1, year - MONITEUR_FOUNDING_YEAR)
}

type DocType = NonNullable<MoniteurEntryRead['detected_category']>

const CATEGORY_META: Record<
  DocType,
  { label: string; plural: string; badge: string; bar: string; icon: string }
> = {
  constitution: {
    label: 'Constitution',
    plural: 'Constitutions',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    bar: 'bg-amber-500',
    icon: 'text-amber-600',
  },
  code: {
    label: 'Code',
    plural: 'Codes',
    badge: 'bg-purple-50 text-purple-800 border-purple-200',
    bar: 'bg-purple-500',
    icon: 'text-purple-600',
  },
  loi: {
    label: 'Loi',
    plural: 'Lois',
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
    bar: 'bg-blue-500',
    icon: 'text-blue-600',
  },
  decret: {
    label: 'Décret',
    plural: 'Décrets',
    badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    bar: 'bg-indigo-500',
    icon: 'text-indigo-600',
  },
  arrete: {
    label: 'Arrêté',
    plural: 'Arrêtés',
    badge: 'bg-teal-50 text-teal-800 border-teal-200',
    bar: 'bg-teal-500',
    icon: 'text-teal-600',
  },
  circulaire: {
    label: 'Circulaire',
    plural: 'Circulaires',
    badge: 'bg-slate-50 text-slate-700 border-slate-200',
    bar: 'bg-slate-400',
    icon: 'text-slate-500',
  },
  convention: {
    label: 'Convention',
    plural: 'Conventions',
    badge: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    bar: 'bg-cyan-500',
    icon: 'text-cyan-600',
  },
  ordonnance: {
    label: 'Ordonnance',
    plural: 'Ordonnances',
    badge: 'bg-rose-50 text-rose-800 border-rose-200',
    bar: 'bg-rose-500',
    icon: 'text-rose-600',
  },
  communique: {
    label: 'Communiqué',
    plural: 'Communiqués',
    badge: 'bg-orange-50 text-orange-800 border-orange-200',
    bar: 'bg-orange-500',
    icon: 'text-orange-600',
  },
  promulgation: {
    label: 'Promulgation',
    plural: 'Promulgations',
    badge: 'bg-gray-50 text-gray-600 border-gray-200',
    bar: 'bg-gray-400',
    icon: 'text-gray-500',
  },
  errata: {
    // "Errata" is invariable in French (already plural of erratum).
    label: 'Errata',
    plural: 'Errata',
    badge: 'bg-red-50 text-red-700 border-red-200',
    bar: 'bg-red-500',
    icon: 'text-red-600',
  },
  autre: {
    label: 'Autre',
    plural: 'Autres',
    badge: 'bg-slate-50 text-slate-600 border-slate-200',
    bar: 'bg-slate-400',
    icon: 'text-slate-500',
  },
}

// ---------------------------------------------------------------------------
// Sommaire card for a single candidate
// ---------------------------------------------------------------------------

function SommaireCard({
  candidate,
  index,
  children: childCandidates,
}: {
  candidate: MoniteurEntryRead
  index: number
  children: MoniteurEntryRead[]
}) {
  const [expanded, setExpanded] = useState(false)
  const title = candidate.display_title || candidate.detected_title || 'Sans titre'
  const isPromoted = !!candidate.promoted_legal_text_slug
  const isPromulgation = candidate.detected_category === 'promulgation'
  const hasRawText = !!candidate.raw_text && !isPromoted
  const meta = candidate.detected_category
    ? CATEGORY_META[candidate.detected_category]
    : null

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        'group rounded-2xl border bg-white overflow-hidden transition-all duration-300',
        'hover:border-slate-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]',
        isPromulgation ? 'ml-0 sm:ml-10 border-slate-100 bg-slate-50/40' : 'border-slate-200/80',
      )}
    >
      <div className="flex">
        {/* Left color bar — category indicator */}
        {meta && !isPromulgation && (
          <div className={cn('w-1 flex-shrink-0', meta.bar)} aria-hidden="true" />
        )}

        <div className="flex-1 min-w-0">
          {/* Header strip: index + category badge + page range */}
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-4 pb-2">
            <div className="flex items-center gap-3 min-w-0">
              {!isPromulgation && (
                <span className="text-[11px] font-mono font-semibold text-slate-300 tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
              )}
              {meta && !isPromulgation && (
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded border',
                    'text-[10px] font-bold uppercase tracking-wider',
                    meta.badge,
                  )}
                >
                  {meta.label}
                </span>
              )}
              {isPromulgation && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <ChevronRight className="w-3 h-3" />
                  Promulgation
                </span>
              )}
            </div>

            {candidate.page_from != null && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
                <BookOpen className="w-3 h-3" />
                p. {candidate.page_from}
                {candidate.page_to != null && candidate.page_to !== candidate.page_from
                  ? `–${candidate.page_to}`
                  : ''}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-5 sm:px-6 pb-5">
            {/* Title */}
            {isPromoted ? (
              <Link
                href={`/loi/${candidate.promoted_legal_text_slug}`}
                className="block text-base sm:text-lg font-bold text-slate-900 hover:text-primary transition-colors leading-snug"
              >
                {title}
              </Link>
            ) : hasRawText ? (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-start gap-2 text-left"
              >
                <span
                  className={cn(
                    'mt-1 flex-shrink-0 transition-transform duration-200',
                    expanded ? 'rotate-90' : '',
                  )}
                >
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </span>
                <span
                  className={cn(
                    'font-bold leading-snug hover:text-primary transition-colors',
                    isPromulgation
                      ? 'text-sm text-slate-500'
                      : 'text-base sm:text-lg text-slate-900',
                  )}
                >
                  {title}
                </span>
              </button>
            ) : (
              <p
                className={cn(
                  'font-bold leading-snug',
                  isPromulgation
                    ? 'text-sm text-slate-500'
                    : 'text-base sm:text-lg text-slate-900',
                )}
              >
                {title}
              </p>
            )}

            {/* Metadata pills */}
            {(candidate.detected_date || candidate.detected_number) && (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-2 mt-3 text-xs',
                  hasRawText && 'ml-6',
                )}
              >
                {candidate.detected_date && (
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Promulguée le {formatLongDate(candidate.detected_date)}
                  </span>
                )}
                {candidate.detected_number && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]">
                    N° {candidate.detected_number}
                  </span>
                )}
              </div>
            )}

            {/* CTA for promoted texts */}
            {isPromoted && (
              <Link
                href={`/loi/${candidate.promoted_legal_text_slug}`}
                className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-primary hover:gap-2 transition-all"
              >
                Voir le texte structuré
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}

            {/* Accordion body for non-promoted candidates with raw text */}
            <AnimatePresence>
              {hasRawText && expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 ml-6 bg-slate-50 rounded-lg p-5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border border-slate-100">
                    {candidate.raw_text}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Child candidates (promulgation letters grouped under parent) */}
      {childCandidates.length > 0 && (
        <div className="px-5 sm:px-6 pb-5 space-y-3 border-t border-slate-100 pt-4 bg-slate-50/30">
          {childCandidates.map((child, i) => (
            <SommaireCard
              key={child.id}
              candidate={child}
              index={i}
              children={[]}
            />
          ))}
        </div>
      )}
    </motion.article>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MoniteurDetailPage() {
  const params = useParams()
  const id = Number(params.id)

  const [issue, setIssue] = useState<MoniteurIssueWithEntries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || Number.isNaN(id)) return
    setLoading(true)
    getMoniteurIssue(id)
      .then(setIssue)
      .catch(() => setError('Numéro introuvable'))
      .finally(() => setLoading(false))
  }, [id])

  // Group entries — must be called before any conditional return so hook order is stable.
  const { topLevel, childrenByParent, categoryCounts } = useMemo(() => {
    const childrenMap = new Map<number, MoniteurEntryRead[]>()
    const top: MoniteurEntryRead[] = []
    const counts = new Map<DocType, number>()

    if (issue) {
      for (const c of issue.entries) {
        if (c.parent_entry_id) {
          const list = childrenMap.get(c.parent_entry_id) ?? []
          list.push(c)
          childrenMap.set(c.parent_entry_id, list)
        } else {
          top.push(c)
          if (c.detected_category && c.detected_category !== 'promulgation') {
            counts.set(
              c.detected_category,
              (counts.get(c.detected_category) ?? 0) + 1,
            )
          }
        }
      }
    }

    return {
      topLevel: top,
      childrenByParent: childrenMap,
      categoryCounts: counts,
    }
  }, [issue])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
      </div>
    )
  }

  if (error || !issue) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-lg">{error ?? 'Erreur de chargement'}</p>
          <Link href="/moniteur" className="text-primary hover:underline mt-4 inline-block">
            ← Retour au Moniteur
          </Link>
        </div>
      </div>
    )
  }

  const formattedDate = formatLongDate(issue.publication_date)
  const numberDisplay = smartIssueNumber(issue.number)
  const sortedCategoryEntries = Array.from(categoryCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )

  return (
    <div className="min-h-screen bg-slate-50/40">
      {/* ------------------------------------------------------------------- */}
      {/* Newspaper masthead header                                          */}
      {/* ------------------------------------------------------------------- */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        {/* Background decorative elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        {/* Spacer reserving the fixed menu nav's height (h-20). Decoupling
            menu clearance from the inner padding lets us use balanced py-*
            below for symmetric top/bottom space inside the dark band. */}
        <div aria-hidden className="h-20" />
        <div className="relative z-10 container py-12 lg:py-20">
          <Breadcrumb
            className="mb-8"
            items={[
              { label: 'Accueil', href: '/' },
              { label: 'Le Moniteur', href: '/moniteur' },
              { label: numberDisplay },
            ]}
          />

          {/* Two-column layout: title block + meta sidebar */}
          <div className="grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-12 items-end">
            <div>
              {/* "LE MONITEUR" wordmark */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 mb-6"
              >
                <Newspaper className="w-4 h-4 text-red-400" />
                <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">
                  Le Moniteur · Journal Officiel
                </span>
              </motion.div>

              {/* Big issue number */}
              <motion.h1
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl lg:text-7xl font-black mb-5 leading-[0.95] tracking-tight"
              >
                {numberDisplay}
              </motion.h1>

              {/* Date + edition pill row */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.18 }}
                className="flex flex-wrap items-center gap-3"
              >
                <div className="inline-flex items-center gap-2 text-base lg:text-lg text-white/90 font-medium border-l-2 border-red-500 pl-4">
                  <Calendar className="w-4 h-4 text-white/60" />
                  {formattedDate}
                </div>
                {issue.edition_label && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-400/15 border border-amber-300/30 text-amber-200 text-xs font-bold uppercase tracking-wider">
                    {issue.edition_label}
                  </span>
                )}
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium">
                  {moniteurAnnee(issue.year)}
                  <sup className="ml-px">e</sup>
                  <span className="ml-1">année</span>
                </span>
              </motion.div>
            </div>

            {/* Sidebar — stats grid */}
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.22 }}
              className="grid grid-cols-2 lg:grid-cols-1 gap-3 lg:min-w-[200px]"
            >
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-5 py-3 lg:py-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                  Documents
                </div>
                <div className="text-3xl lg:text-4xl font-black text-white tabular-nums leading-none">
                  {topLevel.length}
                </div>
              </div>
              {issue.page_count && (
                <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-5 py-3 lg:py-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                    Pages
                  </div>
                  <div className="text-3xl lg:text-4xl font-black text-white tabular-nums leading-none">
                    {issue.page_count}
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* Download row — branded LexHaïti version is always available
              (server-rendered from the structured corpus); the original
              scan stays as an "advanced" link only when a remote URL
              is present. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <a
              href={`/api/v1/moniteur/issues/${issue.id}/export`}
              download
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-primary text-sm font-bold border border-white shadow-lg shadow-blue-900/20 hover:bg-amber-50 transition-all"
            >
              <Download className="w-4 h-4" />
              Télécharger (PDF LexHaïti)
            </a>
            {issue.file_url && issue.file_url.startsWith('http') && (
              <a
                href={issue.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold border border-white/15 transition-all"
              >
                <Download className="w-4 h-4" />
                Scan original
              </a>
            )}
          </motion.div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Body                                                               */}
      {/* ------------------------------------------------------------------- */}
      <div className="container py-10 lg:py-16">
        {/* Category breakdown chips */}
        {sortedCategoryEntries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10 flex flex-wrap items-center gap-2"
          >
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mr-2">
              Composition
            </span>
            {sortedCategoryEntries.map(([cat, n]) => {
              const meta = CATEGORY_META[cat]
              const word = n === 1 ? meta.label : meta.plural
              return (
                <span
                  key={cat}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold',
                    meta.badge,
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', meta.bar)} />
                  <span className="font-mono tabular-nums">{n}</span>
                  {word}
                </span>
              )
            })}
          </motion.div>
        )}

        {/* Sommaire */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
              Sommaire
            </h2>
          </div>

          {topLevel.length > 0 ? (
            <div className="space-y-4">
              {topLevel.map((candidate, i) => (
                <SommaireCard
                  key={candidate.id}
                  candidate={candidate}
                  index={i}
                  children={childrenByParent.get(candidate.id) ?? []}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white">
              <FileText className="w-8 h-8 mx-auto mb-3 text-slate-300" />
              <p>Aucun document indexé dans ce numéro.</p>
            </div>
          )}
        </motion.section>

        {/* Footer back-link */}
        <div className="mt-16 pt-8 border-t border-slate-200">
          <Link
            href="/moniteur"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux numéros du Moniteur
          </Link>
        </div>
      </div>
    </div>
  )
}
