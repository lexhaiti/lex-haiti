'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useT } from '@/i18n/useT'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Newspaper,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  getMoniteurIssue,
  type MoniteurIssueWithCandidates,
  type MoniteurLawCandidateRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

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

type DocType = NonNullable<MoniteurLawCandidateRead['detected_category']>

const CATEGORY_LABELS: Record<DocType, { fr: string; cls: string }> = {
  constitution: { fr: 'Constitution', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  code: { fr: 'Code', cls: 'bg-purple-50 text-purple-800 border-purple-200' },
  loi: { fr: 'Loi', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  decret: { fr: 'Décret', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  arrete: { fr: 'Arrêté', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
  circulaire: { fr: 'Circulaire', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
  convention: { fr: 'Convention', cls: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  ordonnance: { fr: 'Ordonnance', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  communique: { fr: 'Communiqué', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  promulgation: { fr: 'Promulgation', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  errata: { fr: 'Errata', cls: 'bg-red-50 text-red-700 border-red-200' },
  autre: { fr: 'Autre', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
}

function CategoryBadge({ type }: { type: DocType | null }) {
  if (!type) return null
  const meta = CATEGORY_LABELS[type]
  if (!meta) return null
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md border',
        'text-[10px] font-bold uppercase tracking-wider',
        meta.cls,
      )}
    >
      {meta.fr}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Candidate entry (one item in the sommaire)
// ---------------------------------------------------------------------------

function CandidateEntry({
  candidate,
  children: childCandidates,
}: {
  candidate: MoniteurLawCandidateRead
  children: MoniteurLawCandidateRead[]
}) {
  const [expanded, setExpanded] = useState(false)
  const title = candidate.display_title || candidate.detected_title || 'Sans titre'
  const isPromoted = !!candidate.promoted_legal_text_slug
  const isPromulgation = candidate.detected_category === 'promulgation'

  return (
    <div className={cn('border-b border-slate-100 last:border-0', isPromulgation && 'ml-6')}>
      <div className="flex items-start gap-3 py-4 px-1">
        <CategoryBadge type={candidate.detected_category} />
        <div className="flex-1 min-w-0">
          {isPromoted ? (
            <Link
              href={`/loi/${candidate.promoted_legal_text_slug}`}
              className="text-primary font-semibold hover:underline leading-snug"
            >
              {title}
            </Link>
          ) : (
            <p className="text-slate-900 font-semibold leading-snug">{title}</p>
          )}
          {candidate.detected_number && (
            <p className="text-xs text-slate-500 mt-0.5">N° {candidate.detected_number}</p>
          )}
          {candidate.page_from != null && (
            <p className="text-xs text-slate-400 mt-0.5">
              p. {candidate.page_from}
              {candidate.page_to != null && candidate.page_to !== candidate.page_from
                ? `–${candidate.page_to}`
                : ''}
            </p>
          )}
          {isPromoted && (
            <Link
              href={`/loi/${candidate.promoted_legal_text_slug}`}
              className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-1"
            >
              Voir le texte structuré <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        {/* Expand raw text for non-promoted candidates */}
        {!isPromoted && candidate.raw_text && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={expanded ? 'Réduire' : 'Lire le texte'}
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      {/* Expanded raw text */}
      {expanded && !isPromoted && candidate.raw_text && (
        <div className="pb-4 px-1">
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
            {candidate.raw_text}
          </div>
        </div>
      )}
      {/* Child candidates (promulgation letters grouped under parent) */}
      {childCandidates.length > 0 && (
        <div className="ml-4 border-l-2 border-slate-100">
          {childCandidates.map((child) => (
            <CandidateEntry key={child.id} candidate={child} children={[]} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MoniteurDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const { t } = useT()
  const isFr = true // Moniteur is always in French

  const [issue, setIssue] = useState<MoniteurIssueWithCandidates | null>(null)
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

  // Group candidates: top-level (no parent) and children (parent_candidate_id set)
  const childrenByParent = new Map<number, MoniteurLawCandidateRead[]>()
  const topLevel: MoniteurLawCandidateRead[] = []

  for (const c of issue.candidates) {
    if (c.parent_candidate_id) {
      const list = childrenByParent.get(c.parent_candidate_id) ?? []
      list.push(c)
      childrenByParent.set(c.parent_candidate_id, list)
    } else {
      topLevel.push(c)
    }
  }

  const formattedDate = formatLongDate(issue.publication_date)
  const issueLabel = issue.edition_label
    ? `${issue.edition_label} — N° ${issue.number}`
    : `N° ${issue.number}`

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={`Le Moniteur ${issueLabel}`}
        subtitle={`${formattedDate} · ${issue.year}e Année`}
        icon={Newspaper}
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Le Moniteur', href: '/moniteur' },
          { label: `N° ${issue.number}` },
        ]}
      />

      <div className="container py-12 lg:py-20 max-w-4xl mx-auto">
        {/* Issue metadata bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-4 mb-10 text-sm text-slate-500"
        >
          {issue.page_count && (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" /> {issue.page_count} pages
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> {issue.candidates.length}{' '}
            {issue.candidates.length === 1 ? 'document' : 'documents'}
          </span>
          {issue.file_url && issue.file_url.startsWith('http') && (
            <a
              href={issue.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <Download className="w-4 h-4" /> Télécharger le PDF
            </a>
          )}
        </motion.div>

        {/* Sommaire */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-6">
            Sommaire
          </h2>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {topLevel.length > 0 ? (
              topLevel.map((candidate) => (
                <CandidateEntry
                  key={candidate.id}
                  candidate={candidate}
                  children={childrenByParent.get(candidate.id) ?? []}
                />
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">
                <p>Aucun document indexé dans ce numéro.</p>
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </div>
  )
}
