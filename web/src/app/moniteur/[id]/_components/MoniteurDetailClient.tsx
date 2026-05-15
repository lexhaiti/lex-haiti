'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
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
  Pencil,
  Trash2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  deleteMoniteurEntry,
  getMoniteurIssue,
  getMoniteurIssueBySlug,
  type MoniteurIssueWithEntries,
  type MoniteurEntryRead,
} from '@/lib/api/endpoints'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { formatLongDate as formatLongDateBilingual } from '@/lib/format/date'
import { smartIssueNumber } from '@/lib/format/moniteur'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { MoniteurIssueEditorPanel } from './MoniteurIssueEditorPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Local FR-only convenience wrapper so existing call sites stay tidy.
 *  Falls back to "—" (em-dash) when the date is missing — historic
 *  behaviour of this page, distinct from the empty string used on
 *  /recherche. */
function formatLongDate(iso: string | null | undefined): string {
  return formatLongDateBilingual(iso, 'fr', '—')
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
  correspondance: {
    label: 'Correspondance',
    plural: 'Correspondances',
    badge: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    bar: 'bg-yellow-500',
    icon: 'text-yellow-600',
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
  isEditor,
  onDelete,
}: {
  candidate: MoniteurEntryRead
  index: number
  children: MoniteurEntryRead[]
  isEditor: boolean
  onDelete: (entryId: number) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const isPromoted = !!candidate.promoted_legal_text_slug
  const isPromulgation = candidate.detected_category === 'promulgation'
  const hasRawText = !!candidate.raw_text && !isPromoted
  const meta = candidate.detected_category
    ? CATEGORY_META[candidate.detected_category]
    : null

  // Promulgations don't carry their own titles — they're accompanying
  // letters, not standalone documents. Render with the dedicated
  // CompanionRow (no card chrome, no "Sans titre" placeholder, just
  // a label + page range + inline expand). Used at both top-level and
  // nested-under-parent positions; the row is intentionally identical
  // in both contexts so the eye doesn't have to learn two layouts.
  if (isPromulgation) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className="rounded-lg border border-slate-200/60 bg-slate-50/40 px-3 py-1"
      >
        <CompanionRow
          candidate={candidate}
          isEditor={isEditor}
          onDelete={onDelete}
        />
      </motion.div>
    )
  }

  const title = candidate.display_title || candidate.detected_title || 'Sans titre'

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        'group rounded-2xl border bg-white overflow-hidden transition-all duration-300',
        'hover:border-slate-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]',
        'border-slate-200/80',
      )}
    >
      <div className="flex">
        {/* Left color bar — category indicator */}
        {meta && (
          <div className={cn('w-1 flex-shrink-0', meta.bar)} aria-hidden="true" />
        )}

        <div className="flex-1 min-w-0">
          {/* Header strip: index + category badge + page range */}
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-4 pb-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-mono font-semibold text-slate-300 tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              {meta && (
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
                href={
                  candidate.lang === 'ht'
                    ? `/loi/${candidate.promoted_legal_text_slug}?lang=ht`
                    : `/loi/${candidate.promoted_legal_text_slug}`
                }
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
                <span className="font-bold leading-snug hover:text-primary transition-colors text-base sm:text-lg text-slate-900">
                  {title}
                </span>
              </button>
            ) : (
              <p className="font-bold leading-snug text-base sm:text-lg text-slate-900">
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
                href={
                  candidate.lang === 'ht'
                    ? `/loi/${candidate.promoted_legal_text_slug}?lang=ht`
                    : `/loi/${candidate.promoted_legal_text_slug}`
                }
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

      {/* Child candidates (promulgation letters grouped under parent).
          Promulgations don't carry their own structural identity — they
          accompany the law they promulgate. Render as flat rows inside
          the parent card (no nested rounded-2xl border, no second
          chevron) instead of full SommaireCard chrome. */}
      {childCandidates.length > 0 && (
        <div className="px-5 sm:px-6 pb-5 border-t border-slate-100 pt-3">
          {childCandidates.map((child) => (
            <CompanionRow
              key={child.id}
              candidate={child}
              isEditor={isEditor}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </motion.article>
  )
}


/**
 * Flat row renderer for a companion candidate (promulgation,
 * communiqué, correspondance, errata, …), rendered as a child of its
 * parent SommaireCard. Companion documents rarely carry titles of
 * their own (they're letters/notes accompanying the promoted law),
 * so we don't show a "Sans titre" placeholder — just the type label,
 * the page range, and an optional inline expansion of the raw text
 * on click. The label reflects the row's own ``detected_category``
 * (not the hardcoded "Promulgation" the previous shape used), so
 * a communiqué attached to an arrêté reads as "Communiqué", not as
 * a promulgation.
 */
function CompanionRow({
  candidate,
  isEditor = false,
  onDelete,
}: {
  candidate: MoniteurEntryRead
  isEditor?: boolean
  onDelete?: (entryId: number) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const hasRawText = !!candidate.raw_text
  const meta = candidate.detected_category
    ? CATEGORY_META[candidate.detected_category]
    : null
  // Fallback to the raw category code if our label table doesn't carry
  // it — better than a blank chip. ``autre`` and any future enum value
  // get the slate styling below.
  const label = meta?.label ?? candidate.detected_category ?? 'Document'
  // Title doubles as the editor-typed free-form name for ``autre``
  // entries (per the c9aea41 commit). For other companion kinds it's
  // an optional subtitle the parser may have detected. Either way,
  // showing it when present makes "Autre", "Avis public" readable as
  // two distinct rows instead of two anonymous ones.
  const subtitle = candidate.display_title || candidate.detected_title || null

  const canDelete = isEditor && !!onDelete

  return (
    <div className="-mx-1 group/companion">
      <div className="flex items-start gap-1">
      <button
        type="button"
        onClick={() => hasRawText && setExpanded((v) => !v)}
        disabled={!hasRawText}
        className={cn(
          'flex-1 flex items-start justify-between gap-3 px-2 py-2 text-left rounded-md',
          hasRawText
            ? 'hover:bg-slate-50 cursor-pointer'
            : 'cursor-default',
        )}
      >
        <span className="inline-flex items-start gap-2 min-w-0">
          {hasRawText && (
            <ChevronRight
              className={cn(
                'w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-200 mt-0.5',
                expanded && 'rotate-90',
              )}
            />
          )}
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="inline-flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-widest',
                  meta?.icon ?? 'text-slate-400',
                )}
              >
                {label}
              </span>
              {candidate.detected_number && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                  N° {candidate.detected_number}
                </span>
              )}
            </span>
            {subtitle && (
              <span className="text-sm font-medium text-slate-700 leading-snug">
                {subtitle}
              </span>
            )}
          </span>
        </span>
        {candidate.page_from != null && (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap flex-shrink-0 mt-0.5">
            <BookOpen className="w-3 h-3" />
            p. {candidate.page_from}
            {candidate.page_to != null && candidate.page_to !== candidate.page_from
              ? `–${candidate.page_to}`
              : ''}
          </span>
        )}
      </button>
      {/* Editor-only delete affordance — only fades in on row hover so
          the public reader sees a clean list. Confirms via dialog so
          a mis-click doesn't quietly remove the row. */}
      {canDelete && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Supprimer cette entrée"
          title="Supprimer cette entrée"
          className="opacity-0 group-hover/companion:opacity-100 focus:opacity-100 transition-opacity mt-2 mr-1 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      </div>

      <AnimatePresence>
        {hasRawText && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Inline text — no inner card chrome, just indented prose
                under the row's label. */}
            <div className="mt-2 ml-6 pr-2 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {candidate.raw_text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirmDelete(false)
        }}
        onConfirm={async () => {
          if (!onDelete) return
          setDeleting(true)
          try {
            await onDelete(candidate.id)
            setConfirmDelete(false)
          } finally {
            setDeleting(false)
          }
        }}
        title="Supprimer cette entrée ?"
        description={
          <span>
            {`L'entrée « ${label}${subtitle ? ` — ${subtitle}` : ''} » sera retirée du sommaire. `}
            Le texte légal lié (s'il existe) reste intact ; seule la ligne dans ce numéro disparaît.
          </span>
        }
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        destructive
        loading={deleting}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MoniteurDetailClient() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { isEditor } = useEditorMode()
  // Route param is named "id" for backwards compatibility but accepts
  // either a numeric ID (``/moniteur/11`` — legacy permalink) or a
  // date slug (``/moniteur/28-avril-1987`` — preferred public form).
  // We dispatch on the shape INSIDE the effect so the dependency
  // array stays a single-element ``[params.id]`` — React's HMR
  // refuses to hot-reload a component whose useEffect-deps changes
  // size between renders, and the previous ``[rawParam, isNumeric]``
  // form tripped that warning after every save.
  const [issue, setIssue] = useState<MoniteurIssueWithEntries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // View mode for editors: 'public' is the reader layout below, 'editor'
  // mounts the shared MoniteurIssueEditorPanel under the same hero.
  // Defaults to 'editor' when ``?view=editor`` is in the URL — used by
  // the all-issues dashboard at /editorial/moniteur and by the import
  // wizard so editors land directly on the work surface.
  const wantsEditorView = searchParams?.get('view') === 'editor'
  const [view, setView] = useState<'public' | 'editor'>(
    wantsEditorView ? 'editor' : 'public',
  )

  useEffect(() => {
    const rawParam = String(params.id ?? '')
    if (!rawParam) return
    const isNumeric = /^\d+$/.test(rawParam)
    setLoading(true)
    const promise = isNumeric
      ? getMoniteurIssue(Number(rawParam))
      : getMoniteurIssueBySlug(rawParam)
    promise
      .then(setIssue)
      .catch(() => setError('Numéro introuvable'))
      .finally(() => setLoading(false))
  }, [params.id])

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

    // Print order: ``page_from`` first (entries follow the printed
    // Moniteur), then ``position`` (stable tie-break inside the same
    // page), then ``id`` (deterministic when both are equal). Entries
    // with no ``page_from`` trail. Same key used by the PDF export
    // so the on-screen and exported sommaire match.
    const PAGE_TRAILER = Number.MAX_SAFE_INTEGER
    const orderKey = (e: MoniteurEntryRead) => [
      e.page_from ?? PAGE_TRAILER,
      e.position,
      e.id,
    ] as const
    const byOrder = (a: MoniteurEntryRead, b: MoniteurEntryRead) => {
      const ka = orderKey(a)
      const kb = orderKey(b)
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i]
      }
      return 0
    }
    top.sort(byOrder)
    for (const list of childrenMap.values()) list.sort(byOrder)

    return {
      topLevel: top,
      childrenByParent: childrenMap,
      categoryCounts: counts,
    }
  }, [issue])

  if (loading) {
    return <LoadingState variant="viewport" />
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
                <div className="inline-flex items-center gap-2 text-base lg:text-lg text-white/90 font-medium">
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

            {/* Sidebar — stats grid. The Documents card pulls double
                duty: it shows the count *and* hosts the primary
                download CTA as an inline action row, so the visitor
                doesn't have to leave the card to grab the PDF. The
                Pages card stays a pure stat. */}
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.22 }}
              className="grid grid-cols-2 lg:grid-cols-1 gap-3 lg:min-w-[240px]"
            >
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
                {/* Stat — Documents count */}
                <div className="px-5 pt-3 lg:pt-4 pb-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                    Documents
                  </div>
                  <div className="text-3xl lg:text-4xl font-black text-white tabular-nums leading-none">
                    {topLevel.length}
                  </div>
                </div>
                {/* Inline download action — visually a divider + card
                    footer that the whole row reacts to. White-shade
                    treatment matches the parent card; the hover lift
                    + amber accent on the icon are the only colour
                    inversions, so the action reads as part of the
                    card, not bolted on. */}
                <a
                  href={`/api/v1/moniteur/issues/${issue.id}/export`}
                  download
                  className="group/dl flex items-center gap-3 px-5 py-3 border-t border-white/10 bg-white/0 hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 group-hover/dl:bg-amber-300/90 group-hover/dl:text-slate-900 text-white/80 transition-colors">
                    <Download className="w-4 h-4" />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      Télécharger
                    </span>
                    <span className="text-sm font-semibold text-white">
                      PDF LexHaïti
                    </span>
                  </span>
                </a>
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

          {/* Bottom action row — secondary actions only. The primary
              download moved into the sidebar above. */}
          {((issue.file_url && issue.file_url.startsWith('http')) ||
            isEditor) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
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
              {/* Editor-only toggle. Flips the body below for the
                  review work surface (accept/reject entries, edit text,
                  attach to parent) without leaving the issue's
                  canonical URL. This is the *only* per-issue editor
                  surface — the previous /editorial/moniteur/[id]/review
                  route was removed in favour of this inline toggle. */}
              {isEditor && (
                <button
                  type="button"
                  onClick={() =>
                    setView(view === 'editor' ? 'public' : 'editor')
                  }
                  aria-pressed={view === 'editor'}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-400 text-slate-900 text-sm font-bold border border-amber-300 hover:bg-amber-300 transition-all"
                >
                  <Pencil className="w-4 h-4" />
                  {view === 'editor' ? 'Vue publique' : 'Vue éditeur'}
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Body — public reader layout, or the editor work surface when      */}
      {/* the editor has toggled into "Vue éditeur". Same canonical URL    */}
      {/* either way; ``MoniteurIssueEditorPanel`` renders with its         */}
      {/* dedicated hero suppressed so this page's chrome stays single.    */}
      {/* ------------------------------------------------------------------- */}
      {isEditor && view === 'editor' ? (
        <MoniteurIssueEditorPanel issueId={issue.id} showHero={false} />
      ) : (
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
                  isEditor={isEditor}
                  onDelete={async (entryId) => {
                    await deleteMoniteurEntry(entryId)
                    // Refetch the issue so the deleted row disappears
                    // and any siblings re-order naturally. Keeps the
                    // delete UX consistent with what /editorial/moniteur
                    // does after an edit.
                    const rawParam = String(params.id ?? '')
                    if (!rawParam) return
                    const isNumeric = /^\d+$/.test(rawParam)
                    const fresh = await (isNumeric
                      ? getMoniteurIssue(Number(rawParam))
                      : getMoniteurIssueBySlug(rawParam))
                    setIssue(fresh)
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState description="Aucun document indexé dans ce numéro." />
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
      )}
    </div>
  )
}
