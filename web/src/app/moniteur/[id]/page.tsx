'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useT } from '@/i18n/useT'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import {
  ArrowRight,
  BookOpen,
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

const CATEGORY_META: Record<DocType, { label: string; cls: string }> = {
  constitution: { label: 'Constitution', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  code: { label: 'Code', cls: 'bg-purple-50 text-purple-800 border-purple-200' },
  loi: { label: 'Loi', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  decret: { label: 'Décret', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  arrete: { label: 'Arrêté', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
  circulaire: { label: 'Circulaire', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
  convention: { label: 'Convention', cls: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  ordonnance: { label: 'Ordonnance', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  communique: { label: 'Communiqué', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  promulgation: { label: 'Promulgation', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  errata: { label: 'Errata', cls: 'bg-red-50 text-red-700 border-red-200' },
  autre: { label: 'Autre', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
}

// ---------------------------------------------------------------------------
// Sommaire card for a single candidate
// ---------------------------------------------------------------------------

function SommaireCard({
  candidate,
  children: childCandidates,
}: {
  candidate: MoniteurLawCandidateRead
  children: MoniteurLawCandidateRead[]
}) {
  const title = candidate.display_title || candidate.detected_title || 'Sans titre'
  const isPromoted = !!candidate.promoted_legal_text_slug
  const isCommunique = candidate.detected_category === 'communique'
  const isPromulgation = candidate.detected_category === 'promulgation'
  const meta = candidate.detected_category
    ? CATEGORY_META[candidate.detected_category]
    : null

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border bg-white overflow-hidden',
        isPromulgation ? 'ml-8 border-slate-100' : 'border-slate-200',
      )}
    >
      {/* Category stripe */}
      {meta && !isPromulgation && (
        <div className="px-6 pt-4 pb-0">
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-1 rounded-md border',
              'text-[10px] font-bold uppercase tracking-wider',
              meta.cls,
            )}
          >
            {meta.label}
          </span>
        </div>
      )}

      <div className="px-6 py-4">
        {/* Title */}
        {isPromoted ? (
          <Link
            href={`/loi/${candidate.promoted_legal_text_slug}`}
            className="text-lg font-bold text-primary hover:underline leading-snug block"
          >
            {title}
          </Link>
        ) : (
          <p className={cn(
            'font-bold leading-snug',
            isPromulgation ? 'text-sm text-slate-500' : 'text-lg text-slate-900',
          )}>
            {title}
          </p>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
          {candidate.detected_date && (
            <span>
              Promulguée le {formatLongDate(candidate.detected_date)}
            </span>
          )}
          {candidate.detected_number && (
            <span>N° {candidate.detected_number}</span>
          )}
          {candidate.page_from != null && (
            <span className="text-slate-400">
              pp. {candidate.page_from}
              {candidate.page_to != null && candidate.page_to !== candidate.page_from
                ? `–${candidate.page_to}`
                : ''}
            </span>
          )}
        </div>

        {/* Link to structured text */}
        {isPromoted && (
          <Link
            href={`/loi/${candidate.promoted_legal_text_slug}`}
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Voir le texte structuré
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        {/* Inline text for communiqués */}
        {isCommunique && candidate.raw_text && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">
              Texte intégral
            </p>
            <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {candidate.raw_text}
            </div>
          </div>
        )}
      </div>

      {/* Child candidates (promulgation letters grouped under parent) */}
      {childCandidates.length > 0 && (
        <div className="px-6 pb-4 space-y-3">
          {childCandidates.map((child) => (
            <SommaireCard key={child.id} candidate={child} children={[]} />
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
  const { t } = useT()

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
            <FileText className="w-4 h-4" /> {topLevel.length}{' '}
            {topLevel.length === 1 ? 'document' : 'documents'}
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
          {topLevel.length > 0 ? (
            <div className="space-y-4">
              {topLevel.map((candidate) => (
                <SommaireCard
                  key={candidate.id}
                  candidate={candidate}
                  children={childrenByParent.get(candidate.id) ?? []}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 border border-slate-200 rounded-xl">
              <p>Aucun document indexé dans ce numéro.</p>
            </div>
          )}
        </motion.section>
      </div>
    </div>
  )
}
