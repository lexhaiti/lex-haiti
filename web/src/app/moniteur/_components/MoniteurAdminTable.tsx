'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
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

import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { useT } from '@/i18n/useT'
import {
  deleteMoniteurIssue,
  listMoniteurIssues,
  moniteurIssueSlug,
  parseMoniteurIssue,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

// Editor-facing tabular dashboard for Moniteur issues. Lives here
// instead of inside the editorial route so the public /moniteur page
// can render the same table inline (under a "Vue éditeur" toggle),
// without forcing a navigation that loses the editor's scroll +
// filter state. The editorial route renders this component too — it's
// the same view, hosted under different chrome.

const STATUS_PILL: Record<
  MoniteurIssueRead['processing_status'],
  {
    labelKey: string
    cls: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  uploaded: {
    labelKey: 'editorial.moniteur.list.statusUploaded',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: FileText,
  },
  ocr_pending: {
    labelKey: 'editorial.moniteur.list.statusOcrPending',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Loader2,
  },
  parsed: {
    labelKey: 'editorial.moniteur.list.statusParsed',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  reviewed: {
    labelKey: 'editorial.moniteur.list.statusReviewed',
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: CheckCircle2,
  },
  published: {
    labelKey: 'editorial.moniteur.list.statusPublished',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  failed: {
    labelKey: 'editorial.moniteur.list.statusFailed',
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

type Props = {
  /** When false, the "Importer un numéro" row CTA is hidden. The
   *  public /moniteur page already exposes the import button up in
   *  the hero next to the filter, so it would duplicate. */
  showImportButton?: boolean
}

export function MoniteurAdminTable({ showImportButton = true }: Props) {
  const { t, language } = useT()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'

  // Local helper — confirmDelete interpolates a runtime value (the
  // issue number) so it stays a function rather than going into the
  // i18n catalogue (which only carries strings).
  const confirmDelete = (n: string): string =>
    lang === 'ht'
      ? `Efase nimewo ${n} ak tout kandida l yo nèt ?`
      : `Supprimer définitivement le numéro ${n} et tous ses candidats ?`

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
    const tick = setInterval(() => void refetchIssues(), 5000)
    return () => clearInterval(tick)
  }, [issues, refetchIssues])

  return (
    <div>
      {showImportButton && (
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <Link
            href="/editorial/import?type=moniteur"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors group"
          >
            <Plus className="w-4 h-4" />
            {t('editorial.moniteur.list.newIssue')}
          </Link>
        </div>
      )}

      {!issues && !error && (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t('editorial.moniteur.list.loading')}</span>
        </div>
      )}

      {error && <ErrorBanner density="compact">{error}</ErrorBanner>}

      {issues && issues.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-6 py-10 text-center text-sm text-slate-600">
          {t('editorial.moniteur.list.empty')}
        </div>
      )}

      {issues && issues.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">{t('editorial.moniteur.list.columns.issue')}</th>
                <th className="px-5 py-3">{t('editorial.moniteur.list.columns.date')}</th>
                <th className="px-5 py-3">{t('editorial.moniteur.list.columns.status')}</th>
                <th className="px-5 py-3 text-right">{t('editorial.moniteur.list.columns.candidates')}</th>
                <th className="px-5 py-3 text-right">{t('editorial.moniteur.list.columns.actions')}</th>
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
                        {t(pill.labelKey)}
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
                            title={t('editorial.moniteur.list.rerunParse')}
                            aria-label={t('editorial.moniteur.list.rerunParse')}
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
                          // Opens the issue page directly in editor mode
                          // via the ``?view=editor`` query — same target
                          // as the public reader, just with the editor
                          // toggle pre-flipped.
                          href={`/moniteur/${moniteurIssueSlug(it)}?view=editor`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {t('editorial.moniteur.list.review')} →
                        </Link>
                        <button
                          type="button"
                          aria-label={t('editorial.moniteur.list.delete')}
                          onClick={async () => {
                            if (!confirm(confirmDelete(it.number))) return
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
  )
}
