'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { useLanguage } from '@/i18n/LanguageContext'
import {
  deleteMoniteurIssue,
  listMoniteurIssues,
  parseMoniteurIssue,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

const COPY = {
  fr: {
    crumbs: { home: 'Accueil', editor: 'Éditorial', moniteur: 'Le Moniteur' },
    title: 'Pipeline Le Moniteur',
    subtitle:
      "Tableau de bord de l'ingestion : créez un numéro, téléversez le PDF, exécutez l'analyse, puis promouvez les textes détectés vers le corpus public.",
    newIssue: 'Nouveau numéro',
    columns: { issue: 'Numéro', date: 'Date', status: 'État', candidates: 'Candidats', actions: '' },
    review: 'Revue',
    empty: 'Aucun numéro encore. Démarrez avec « Nouveau numéro ».',
    loading: 'Chargement…',
    delete: 'Supprimer',
    confirmDelete: (n: string) =>
      `Supprimer définitivement le numéro ${n} et tous ses candidats ?`,
    rerunParse: "Relancer l'analyse",
    parseStarted: 'Analyse lancée',
  },
  ht: {
    crumbs: { home: 'Akèy', editor: 'Editoryal', moniteur: 'Le Moniteur' },
    title: 'Pipeline Le Moniteur',
    subtitle:
      "Tablo enjesyon : kreye yon nimewo, telechaje PDF la, lanse analiz la, epi pwomouvwa tèks yo nan kòpis piblik la.",
    newIssue: 'Nouvo nimewo',
    columns: { issue: 'Nimewo', date: 'Dat', status: 'Estati', candidates: 'Kandida', actions: '' },
    review: 'Revize',
    empty: 'Pa gen nimewo ankò. Kòmanse ak « Nouvo nimewo ».',
    loading: 'Ap chaje…',
    delete: 'Efase',
    confirmDelete: (n: string) =>
      `Efase nimewo ${n} ak tout kandida l yo nèt ?`,
    rerunParse: 'Relanse analiz la',
    parseStarted: 'Analiz lanse',
  },
}

const STATUS_PILL: Record<
  MoniteurIssueRead['processing_status'],
  {
    label: { fr: string; ht: string }
    cls: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  uploaded: {
    label: { fr: 'Téléversé', ht: 'Telechaje' },
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: FileText,
  },
  ocr_pending: {
    label: { fr: 'OCR en cours', ht: 'OCR ap mache' },
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Loader2,
  },
  parsed: {
    label: { fr: 'Analysé', ht: 'Analize' },
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  reviewed: {
    label: { fr: 'Revu', ht: 'Revize' },
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: CheckCircle2,
  },
  published: {
    label: { fr: 'Publié', ht: 'Pibliye' },
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  failed: {
    label: { fr: 'Échec', ht: 'Echèk' },
    cls: 'bg-red-50 text-red-700 border-red-200',
    icon: AlertTriangle,
  },
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function MoniteurDashboardPage() {
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  const [issues, setIssues] = useState<MoniteurIssueRead[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Per-row in-flight set — drives the spinner on the parse-trigger button.
  const [parsing, setParsing] = useState<Set<number>>(new Set())

  const refetchIssues = useCallback(() => {
    return listMoniteurIssues({ limit: 100, only_published: false })
      .then((data) => setIssues(data.items))
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    let cancelled = false
    listMoniteurIssues({ limit: 100, only_published: false })
      .then((data) => {
        if (!cancelled) setIssues(data.items)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Live status — poll while any issue is mid-pipeline (ocr_pending).
  // Stops as soon as everything has settled. 5s is cheap (single SELECT
  // on a paginated list) and feels responsive without being chatty.
  useEffect(() => {
    if (!issues) return
    const hasInFlight = issues.some(
      (i) => i.processing_status === 'ocr_pending',
    )
    if (!hasInFlight) return
    const t = setInterval(() => void refetchIssues(), 5000)
    return () => clearInterval(t)
  }, [issues, refetchIssues])

  return (
    <div className="min-h-screen bg-white">
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
        </div>

        <div className="relative z-10 container py-12 lg:py-20 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: copy.crumbs.home, href: '/' },
              { label: copy.crumbs.editor, href: '/profile' },
              { label: copy.crumbs.moniteur },
            ]}
          />

          <div className="max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white"
            >
              {copy.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-slate-300 text-lg lg:text-xl leading-relaxed border-l-2 border-red-600 pl-6"
            >
              {copy.subtitle}
            </motion.p>
          </div>
        </div>
      </div>

      <div className="container py-12 lg:py-16">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <Link
            href="/editorial/moniteur/import"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors group"
          >
            <Plus className="w-4 h-4" />
            {copy.newIssue}
          </Link>
        </div>

        {!issues && !error && (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{copy.loading}</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {issues && issues.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-6 py-10 text-center text-sm text-slate-600">
            {copy.empty}
          </div>
        )}

        {issues && issues.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-3">{copy.columns.issue}</th>
                  <th className="px-5 py-3">{copy.columns.date}</th>
                  <th className="px-5 py-3">{copy.columns.status}</th>
                  <th className="px-5 py-3 text-right">{copy.columns.candidates}</th>
                  <th className="px-5 py-3 text-right">{copy.columns.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map((it) => {
                  const pill = STATUS_PILL[it.processing_status]
                  const Icon = pill.icon
                  return (
                    <tr key={it.id} className="hover:bg-slate-50/40">
                      <td className="px-5 py-4 font-bold text-primary">
                        {/* Smart N° prefix: skip when the stored number
                            already starts with non-digit text such as
                            "Spécial N° 5" — otherwise we'd render the
                            duplicate "n° Spécial N° 5". */}
                        {/^[0-9]/.test(it.number) ? `N° ${it.number}` : it.number}{' '}
                        <span className="text-slate-400 font-normal">/ {it.year}</span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(it.publication_date)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md',
                            'border text-[11px] font-bold uppercase tracking-wider',
                            pill.cls,
                          )}
                        >
                          <Icon
                            className={cn(
                              'w-3 h-3',
                              it.processing_status === 'ocr_pending' && 'animate-spin',
                            )}
                          />
                          {pill.label[lang]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-600">
                        {it.entries_count}
                        {it.accepted_count > 0 && (
                          <span className="ml-1 text-emerald-600">
                            ({it.accepted_count} ✓)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-3">
                          {/* Re-trigger parse — shown for issues that have a
                              file but no successful parse yet (uploaded /
                              failed). Hidden for `parsed` to protect
                              already-reviewed candidates from being wiped,
                              and for `ocr_pending` since one is already in
                              flight. */}
                          {(it.processing_status === 'uploaded' ||
                            it.processing_status === 'failed') && (
                            <button
                              type="button"
                              title={copy.rerunParse}
                              aria-label={copy.rerunParse}
                              disabled={parsing.has(it.id)}
                              onClick={() => {
                                setParsing((s) => new Set(s).add(it.id))
                                // Optimistic status flip — the dashboard
                                // re-renders to "OCR en cours" so the editor
                                // sees immediate feedback. Server is the
                                // source of truth; the next list refetch
                                // will reconcile.
                                setIssues(
                                  (cur) =>
                                    cur?.map((x) =>
                                      x.id === it.id
                                        ? {
                                            ...x,
                                            processing_status: 'ocr_pending',
                                            processing_error: null,
                                          }
                                        : x,
                                    ) ?? null,
                                )
                                void parseMoniteurIssue(it.id).finally(() => {
                                  setParsing((s) => {
                                    const next = new Set(s)
                                    next.delete(it.id)
                                    return next
                                  })
                                  // Pull truth from the server — for short
                                  // parses (or "no file" failures) the
                                  // optimistic ocr_pending state is already
                                  // wrong by the time the call returns.
                                  void refetchIssues()
                                })
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {parsing.has(it.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          <Link
                            href={`/editorial/moniteur/${it.id}/review`}
                            className="text-sm font-semibold text-primary hover:underline"
                          >
                            {copy.review} →
                          </Link>
                          <button
                            type="button"
                            aria-label={copy.delete}
                            onClick={async () => {
                              if (!confirm(copy.confirmDelete(it.number))) return
                              try {
                                await deleteMoniteurIssue(it.id)
                                setIssues(
                                  (cur) => cur?.filter((x) => x.id !== it.id) ?? null,
                                )
                              } catch (e) {
                                setError(String(e))
                              }
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
