'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Pencil,
  RotateCcw,
  X,
} from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { useT } from '@/i18n/useT'
import {
  getMoniteurIssue,
  parseMoniteurIssue,
  previewMoniteurEntrySplit,
  promoteMoniteurEntry,
  reviewMoniteurEntry,
  type MoniteurIssueWithEntries,
  type MoniteurEntryRead,
  type TranscriptPreview,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

// Copy lives at `editorial.moniteur.review.*` in i18n/{fr,ht}.ts.

// Centralised in @/lib/legal/labels — local alias for indexed lookups.
import { CATEGORY_LABELS as CATEGORY_LABEL } from '@/lib/legal/labels'

/** Keys used by the review pill — restricted to string-valued COPY entries. */
type PillCopyKey = 'pending' | 'promoted' | 'rejected' | 'deferred'

const REVIEW_PILL: Record<
  MoniteurEntryRead['review_status'],
  { cls: string; key: PillCopyKey }
> = {
  pending: { cls: 'bg-slate-100 text-slate-700 border-slate-200', key: 'pending' },
  accepted: {
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    key: 'promoted',
  },
  rejected: { cls: 'bg-red-50 text-red-700 border-red-200', key: 'rejected' },
  deferred: { cls: 'bg-amber-50 text-amber-800 border-amber-200', key: 'deferred' },
}

type T = (key: string, opts?: { fallback?: string }) => string

export default function MoniteurReviewPage() {
  const params = useParams()
  const id = Number(params?.id)
  const { t, language } = useT()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'

  const [issue, setIssue] = useState<MoniteurIssueWithEntries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [parsing, setParsing] = useState(false)

  // Inline edit state — keyed by candidate id so opening a different
  // card cancels the in-flight draft instead of carrying it across.
  const [editingFields, setEditingFields] = useState<{
    candidateId: number
    detected_category: string
    detected_title: string
    detected_number: string
    detected_date: string
  } | null>(null)
  const [savingFields, setSavingFields] = useState(false)

  function startEditFields(c: MoniteurEntryRead) {
    setEditingFields({
      candidateId: c.id,
      detected_category: c.detected_category ?? '',
      detected_title: c.detected_title ?? '',
      detected_number: c.detected_number ?? '',
      detected_date: c.detected_date ?? '',
    })
  }
  function cancelEditFields() {
    setEditingFields(null)
  }
  async function saveEditFields() {
    if (!editingFields) return
    setSavingFields(true)
    setError(null)
    try {
      // Send only the four detected_* fields — leave review_status unset
      // so the backend doesn't flip pending → something else by accident.
      await reviewMoniteurEntry(editingFields.candidateId, {
        detected_category: (editingFields.detected_category || null) as any,
        detected_title: editingFields.detected_title || null,
        detected_number: editingFields.detected_number || null,
        detected_date: editingFields.detected_date || null,
      })
      setEditingFields(null)
      await refresh()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setSavingFields(false)
    }
  }

  // Inline raw_text edit state — separate from `editingFields` so the
  // editor can correct the OCR transcription without losing in-progress
  // metadata edits, and vice versa. Keyed by candidate id.
  const [editingText, setEditingText] = useState<{
    candidateId: number
    raw_text: string
  } | null>(null)
  const [savingText, setSavingText] = useState(false)
  // Live structural preview while the editor is typing in edit mode.
  // Debounced (350ms) to avoid hammering the backend on every keystroke.
  const [preview, setPreview] = useState<TranscriptPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)

  function startEditText(c: MoniteurEntryRead) {
    setEditingText({ candidateId: c.id, raw_text: c.raw_text ?? '' })
    setPreview(null)
  }
  function cancelEditText() {
    setEditingText(null)
    setPreview(null)
  }
  async function saveEditText() {
    if (!editingText) return
    setSavingText(true)
    setError(null)
    try {
      await reviewMoniteurEntry(editingText.candidateId, {
        raw_text: editingText.raw_text,
      })
      setEditingText(null)
      setPreview(null)
      await refresh()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setSavingText(false)
    }
  }

  // Debounced preview — fires whenever the editor pauses typing for
  // 350ms. The cleanup cancels the pending fetch and the in-flight
  // promise's result is discarded if a newer edit lands first.
  useEffect(() => {
    if (!editingText) return
    const { candidateId, raw_text } = editingText
    setPreviewing(true)
    let cancelled = false
    const handle = setTimeout(() => {
      previewMoniteurEntrySplit(candidateId, raw_text)
        .then((res) => {
          if (!cancelled) setPreview(res)
        })
        .catch(() => {
          if (!cancelled) setPreview(null)
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [editingText])

  async function refresh() {
    try {
      const data = await getMoniteurIssue(id)
      setIssue(data)
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id)) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleParseAgain() {
    setParsing(true)
    setError(null)
    try {
      const data = await parseMoniteurIssue(id)
      setIssue(data)
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setParsing(false)
    }
  }

  async function handleAccept(c: MoniteurEntryRead) {
    setBusyId(c.id)
    setError(null)
    try {
      await promoteMoniteurEntry(c.id)
      await refresh()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(c: MoniteurEntryRead) {
    setBusyId(c.id)
    setError(null)
    try {
      await reviewMoniteurEntry(c.id, { review_status: 'rejected' })
      await refresh()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDefer(c: MoniteurEntryRead) {
    setBusyId(c.id)
    setError(null)
    try {
      await reviewMoniteurEntry(c.id, { review_status: 'deferred' })
      await refresh()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setBusyId(null)
    }
  }

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
              { label: t('editorial.moniteur.review.crumbs.home'), href: '/' },
              { label: t('editorial.moniteur.review.crumbs.editor'), href: '/profile' },
              { label: t('editorial.moniteur.review.crumbs.moniteur'), href: '/editorial/moniteur' },
              {
                // Smart N° prefix: skip the prefix when the issue.number
                // already starts with non-digit text like "Spécial N° 5".
                label: issue
                  ? `${/^[0-9]/.test(issue.number) ? `N° ${issue.number}` : issue.number} / ${issue.year}`
                  : t('editorial.moniteur.review.crumbs.review'),
              },
            ]}
          />

          <div className="max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white"
            >
              {t('editorial.moniteur.review.title')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-slate-300 text-lg leading-relaxed border-l-2 border-red-600 pl-6"
            >
              {!issue
                ? t('editorial.moniteur.review.loading')
                : !issue.file_url
                  ? t('editorial.moniteur.review.subtitleNoFile')
                  : issue.entries.length === 0
                    ? t('editorial.moniteur.review.subtitleNoCandidates')
                    : t('editorial.moniteur.review.subtitlePending')}
            </motion.p>
          </div>
        </div>
      </div>

      <div className="container py-12 lg:py-16">
        {issue && (
          <div className="mb-6 flex items-center justify-end">
            <button
              onClick={handleParseAgain}
              disabled={parsing}
              className="inline-flex items-center gap-2 rounded-md border border-primary/30 text-primary px-4 py-2 text-sm font-semibold hover:bg-primary/[0.04] disabled:opacity-50 transition-colors"
            >
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('editorial.moniteur.review.parseRunning')}
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  {t('editorial.moniteur.review.runParseAgain')}
                </>
              )}
            </button>
          </div>
        )}

        {error && (
          <ErrorBanner density="compact" icon={AlertTriangle} className="mb-6">
            {error}
          </ErrorBanner>
        )}

        {issue && issue.entries.length === 0 && !parsing && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-6 py-10 text-center text-sm text-slate-600">
            {t('editorial.moniteur.review.subtitleNoCandidates')}
          </div>
        )}

        <div className="space-y-5">
          {issue?.entries.map((c) => {
            const pill = REVIEW_PILL[c.review_status]
            const cat = c.detected_category
              ? (CATEGORY_LABEL[c.detected_category]?.[lang] ?? c.detected_category)
              : '—'
            const isBusy = busyId === c.id
            const isFinal = c.review_status === 'accepted' || c.review_status === 'rejected'
            return (
              <article
                key={c.id}
                className={cn(
                  'rounded-xl border bg-white p-6 lg:p-7',
                  isFinal ? 'border-slate-200 opacity-70' : 'border-slate-200',
                )}
              >
                <header className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div className="flex items-center flex-wrap gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md',
                        'border text-[11px] font-bold uppercase tracking-wider',
                        pill.cls,
                      )}
                    >
                      {t(`editorial.moniteur.review.${pill.key}`)}
                    </span>
                    {c.confidence && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {t('editorial.moniteur.review.cardConfidence')}: {Number(c.confidence).toFixed(2)}
                      </span>
                    )}
                    {c.page_from && (
                      <span className="text-[11px] text-slate-400">
                        {t('editorial.moniteur.review.pages')} {c.page_from}
                        {c.page_to && c.page_to !== c.page_from
                          ? `–${c.page_to}`
                          : ''}
                      </span>
                    )}
                  </div>
                </header>

                {editingFields?.candidateId === c.id ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 mb-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-widest text-primary/65">
                          {t('editorial.moniteur.review.fieldCategory')}
                        </span>
                        <select
                          value={editingFields.detected_category}
                          onChange={(e) =>
                            setEditingFields((prev) =>
                              prev ? { ...prev, detected_category: e.target.value } : prev,
                            )
                          }
                          className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                        >
                          <option value="">—</option>
                          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v[lang]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-widest text-primary/65">
                          {t('editorial.moniteur.review.fieldNumber')}
                        </span>
                        <input
                          type="text"
                          value={editingFields.detected_number}
                          onChange={(e) =>
                            setEditingFields((prev) =>
                              prev ? { ...prev, detected_number: e.target.value } : prev,
                            )
                          }
                          className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-widest text-primary/65">
                          {t('editorial.moniteur.review.fieldDate')}
                        </span>
                        <input
                          type="date"
                          value={editingFields.detected_date}
                          onChange={(e) =>
                            setEditingFields((prev) =>
                              prev ? { ...prev, detected_date: e.target.value } : prev,
                            )
                          }
                          className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-primary/65">
                        {t('editorial.moniteur.review.fieldTitle')}
                      </span>
                      <textarea
                        value={editingFields.detected_title}
                        onChange={(e) =>
                          setEditingFields((prev) =>
                            prev ? { ...prev, detected_title: e.target.value } : prev,
                          )
                        }
                        rows={2}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-primary leading-snug resize-y"
                      />
                    </label>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={cancelEditFields}
                        disabled={savingFields}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 text-slate-700 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        {t('editorial.moniteur.review.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={saveEditFields}
                        disabled={savingFields}
                        className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                      >
                        {savingFields ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        {savingFields ? t('editorial.moniteur.review.saving') : t('editorial.moniteur.review.save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-sm">
                      <Detail label={t('editorial.moniteur.review.cardCategory')}>{cat}</Detail>
                      <Detail label={t('editorial.moniteur.review.cardNumber')}>
                        {c.detected_number || '—'}
                      </Detail>
                      <Detail label={t('editorial.moniteur.review.cardDate')}>
                        {c.detected_date ?? '—'}
                      </Detail>
                    </div>

                    <Detail label={t('editorial.moniteur.review.cardTitle')}>
                      <p className="text-base font-semibold text-primary leading-snug">
                        {c.detected_title || '(sans titre)'}
                      </p>
                    </Detail>
                  </>
                )}

                <details className="mt-4" open={editingText?.candidateId === c.id}>
                  <summary className="text-xs font-bold uppercase tracking-widest text-primary/65 cursor-pointer hover:text-primary">
                    {t('editorial.moniteur.review.cardExtract')}
                  </summary>
                  {editingText?.candidateId === c.id ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {t('editorial.moniteur.review.textHelp')}
                      </p>
                      <textarea
                        value={editingText.raw_text}
                        onChange={(e) =>
                          setEditingText((prev) =>
                            prev ? { ...prev, raw_text: e.target.value } : prev,
                          )
                        }
                        rows={14}
                        className="w-full text-xs text-slate-700 leading-relaxed font-mono bg-white border border-slate-300 rounded-md p-3 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        spellCheck={false}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={saveEditText}
                          disabled={savingText || !isFinal && false}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingText ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          {t('editorial.moniteur.review.saveText')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditText}
                          disabled={savingText}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
                        >
                          {t('editorial.moniteur.review.cancelText')}
                        </button>
                      </div>

                      {/* Live structural preview — recomputed (debounced)
                          as the editor types, so they see immediately how
                          their corrections will land in the structured
                          legal blocks at promotion time. */}
                      <TranscriptPreviewPanel
                        preview={preview}
                        loading={previewing}
                        t={t}
                      />
                    </div>
                  ) : (
                    <div className="mt-2">
                      <pre className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans bg-slate-50 border border-slate-100 rounded-md p-4 max-h-64 overflow-y-auto">
                        {c.raw_text}
                      </pre>
                      {!isFinal && (
                        <button
                          type="button"
                          onClick={() => startEditText(c)}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          <Pencil className="w-3 h-3" />
                          {t('editorial.moniteur.review.editText')}
                        </button>
                      )}
                    </div>
                  )}
                </details>

                {!isFinal && editingFields?.candidateId !== c.id && (
                  <div className="mt-5 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleAccept(c)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {t('editorial.moniteur.review.accept')}
                    </button>
                    <button
                      onClick={() => handleReject(c)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-md border border-red-200 text-red-700 bg-white px-4 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      {t('editorial.moniteur.review.reject')}
                    </button>
                    <button
                      onClick={() => handleDefer(c)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 text-slate-700 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                      {t('editorial.moniteur.review.defer')}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditFields(c)}
                      disabled={isBusy}
                      className="ml-auto inline-flex items-center gap-2 rounded-md border border-amber-200 text-amber-800 bg-amber-50/50 px-4 py-2 text-sm font-semibold hover:bg-amber-50 disabled:opacity-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      {t('editorial.moniteur.review.edit')}
                    </button>
                  </div>
                )}

                {/* Draft inspect link — surfaced whenever the candidate has
                    been accepted and a draft LegalText exists. Outside the
                    `!isFinal` block so it stays visible for accepted
                    candidates (whose action row is hidden). */}
                {c.promoted_legal_text_slug && (
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs text-slate-500">
                      {t('editorial.moniteur.review.promoted')}
                    </span>
                    <Link
                      href={`/loi/${c.promoted_legal_text_slug}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 text-primary px-4 py-2 text-sm font-semibold hover:bg-primary/[0.04] transition-colors"
                    >
                      {c.promoted_legal_text_title_fr
                        ? `${t('editorial.moniteur.review.openDraft')} : ${c.promoted_legal_text_title_fr.slice(0, 50)}${c.promoted_legal_text_title_fr.length > 50 ? '…' : ''}`
                        : t('editorial.moniteur.review.openDraft')}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TranscriptPreviewPanel({
  preview,
  loading,
  t,
}: {
  preview: TranscriptPreview | null
  loading: boolean
  t: T
}) {
  const blockSummary: Array<{ key: keyof TranscriptPreview; label: string }> = [
    { key: 'preamble', label: t('editorial.moniteur.review.previewPreamble') },
    { key: 'visas', label: t('editorial.moniteur.review.previewVisas') },
    { key: 'considerants', label: t('editorial.moniteur.review.previewConsiderants') },
    { key: 'enacting_formula', label: t('editorial.moniteur.review.previewEnacting') },
  ]

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {t('editorial.moniteur.review.previewTitle')}
        </p>
        {loading && (
          <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('editorial.moniteur.review.previewLoading')}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
        {t('editorial.moniteur.review.previewHint')}
      </p>
      {!preview ||
      (!preview.preamble &&
        !preview.visas &&
        !preview.considerants &&
        !preview.enacting_formula &&
        preview.articles.length === 0) ? (
        <p className="text-xs text-slate-400 italic">{t('editorial.moniteur.review.previewEmpty')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {blockSummary.map(({ key, label }) => {
            const value = preview[key] as string | null | undefined
            const has = !!value && value.trim().length > 0
            return (
              <div
                key={key}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-center',
                  has
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-400',
                )}
              >
                <div className="text-[9px] font-bold uppercase tracking-wider">
                  {label}
                </div>
                <div className="text-base font-bold tabular-nums">
                  {has ? '✓' : '—'}
                </div>
              </div>
            )
          })}
          <div
            className={cn(
              'rounded-md border px-2 py-1.5 text-center col-span-2 sm:col-span-4',
              preview.articles.length > 0
                ? 'border-blue-200 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-400',
            )}
          >
            <div className="text-[9px] font-bold uppercase tracking-wider">
              {t('editorial.moniteur.review.previewArticles')}
            </div>
            <div className="text-base font-bold tabular-nums">
              {preview.articles.length}
            </div>
            {preview.articles.length > 0 && (
              <div className="mt-1 flex flex-wrap justify-center gap-1">
                {preview.articles.slice(0, 12).map((a) => (
                  <span
                    key={a.number}
                    title={`${a.body_length} car.`}
                    className="inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-blue-200 text-[10px] font-mono text-blue-700"
                  >
                    {a.number}
                  </span>
                ))}
                {preview.articles.length > 12 && (
                  <span className="text-[10px] text-blue-700">
                    +{preview.articles.length - 12}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="text-sm">
      <p className="text-[11px] font-bold uppercase tracking-widest text-primary/65 mb-1">
        {label}
      </p>
      <div className="text-slate-700">{children}</div>
    </div>
  )
}
