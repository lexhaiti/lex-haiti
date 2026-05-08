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
import { useLanguage } from '@/i18n/LanguageContext'
import {
  getMoniteurIssue,
  parseMoniteurIssue,
  promoteMoniteurCandidate,
  reviewMoniteurCandidate,
  type MoniteurIssueWithCandidates,
  type MoniteurLawCandidateRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

const COPY = {
  fr: {
    crumbs: {
      home: 'Accueil',
      editor: 'Éditorial',
      moniteur: 'Le Moniteur',
      review: 'Revue',
    },
    title: 'Revue des candidats détectés',
    subtitleNoFile: 'Aucun PDF téléversé. Retournez à l’étape de téléversement.',
    subtitleNoCandidates: 'Aucun candidat détecté. Lancez ou relancez l’analyse.',
    subtitlePending: 'Validez chaque candidat — accepter le promeut en brouillon de texte légal ; rejeter le supprime.',
    runParseAgain: 'Relancer l’analyse',
    pages: 'pp.',
    cardCategory: 'Catégorie',
    cardNumber: 'Numéro',
    cardDate: 'Date',
    cardTitle: 'Titre détecté',
    cardConfidence: 'Confiance',
    cardExtract: 'Extrait OCR',
    accept: 'Accepter & promouvoir',
    reject: 'Rejeter',
    defer: 'Reporter',
    promoted: 'Promu — brouillon créé',
    openDraft: 'Ouvrir le brouillon',
    edit: 'Modifier',
    save: 'Enregistrer',
    cancel: 'Annuler',
    fieldCategory: 'Catégorie',
    fieldTitle: 'Titre',
    fieldNumber: 'Numéro',
    fieldDate: 'Date',
    saving: 'Enregistrement…',
    rejected: 'Rejeté',
    deferred: 'Reporté',
    pending: 'En attente',
    loading: 'Chargement…',
    parseRunning: 'Analyse en cours…',
  },
  ht: {
    crumbs: {
      home: 'Akèy',
      editor: 'Editoryal',
      moniteur: 'Le Moniteur',
      review: 'Revize',
    },
    title: 'Revize kandida yo',
    subtitleNoFile: 'Pa gen PDF. Tounen sou etap telechaje a.',
    subtitleNoCandidates: 'Pa gen kandida. Lanse oswa rilanse analiz la.',
    subtitlePending: 'Valide chak kandida — aksepte fè li tounen yon bouyon ; rejte efase l.',
    runParseAgain: 'Rilanse analiz la',
    pages: 'pp.',
    cardCategory: 'Kategori',
    cardNumber: 'Nimewo',
    cardDate: 'Dat',
    cardTitle: 'Tit detekte',
    cardConfidence: 'Konfyans',
    cardExtract: 'Ekstrè OCR',
    accept: 'Aksepte & pwomouvwa',
    reject: 'Rejte',
    defer: 'Repòte',
    promoted: 'Pwomouvre — bouyon kreye',
    openDraft: 'Louvri bouyon an',
    edit: 'Modifye',
    save: 'Anrejistre',
    cancel: 'Anile',
    fieldCategory: 'Kategori',
    fieldTitle: 'Tit',
    fieldNumber: 'Nimewo',
    fieldDate: 'Dat',
    saving: 'Ap anrejistre…',
    rejected: 'Rejte',
    deferred: 'Repòte',
    pending: 'Ap tann',
    loading: 'Ap chaje…',
    parseRunning: 'Analiz ap mache…',
  },
}

const CATEGORY_LABEL: Record<string, { fr: string; ht: string }> = {
  constitution: { fr: 'Constitution', ht: 'Konstitisyon' },
  code: { fr: 'Code', ht: 'Kòd' },
  loi: { fr: 'Loi', ht: 'Lwa' },
  decret: { fr: 'Décret', ht: 'Dekrè' },
  arrete: { fr: 'Arrêté', ht: 'Arète' },
  circulaire: { fr: 'Circulaire', ht: 'Sirkilè' },
  convention: { fr: 'Convention', ht: 'Konvansyon' },
}

/** Keys used by the review pill — restricted to string-valued COPY entries. */
type PillCopyKey = 'pending' | 'promoted' | 'rejected' | 'deferred'

const REVIEW_PILL: Record<
  MoniteurLawCandidateRead['review_status'],
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

export default function MoniteurReviewPage() {
  const params = useParams()
  const id = Number(params?.id)
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  const [issue, setIssue] = useState<MoniteurIssueWithCandidates | null>(null)
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

  function startEditFields(c: MoniteurLawCandidateRead) {
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
      await reviewMoniteurCandidate(editingFields.candidateId, {
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

  async function handleAccept(c: MoniteurLawCandidateRead) {
    setBusyId(c.id)
    setError(null)
    try {
      await promoteMoniteurCandidate(c.id)
      await refresh()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(c: MoniteurLawCandidateRead) {
    setBusyId(c.id)
    setError(null)
    try {
      await reviewMoniteurCandidate(c.id, { review_status: 'rejected' })
      await refresh()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDefer(c: MoniteurLawCandidateRead) {
    setBusyId(c.id)
    setError(null)
    try {
      await reviewMoniteurCandidate(c.id, { review_status: 'deferred' })
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
              { label: copy.crumbs.home, href: '/' },
              { label: copy.crumbs.editor, href: '/profile' },
              { label: copy.crumbs.moniteur, href: '/editorial/moniteur' },
              {
                label: issue
                  ? `n° ${issue.number} / ${issue.year}`
                  : copy.crumbs.review,
              },
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
              className="text-slate-300 text-lg leading-relaxed max-w-3xl border-l-2 border-red-600 pl-6"
            >
              {!issue
                ? copy.loading
                : !issue.file_url
                  ? copy.subtitleNoFile
                  : issue.candidates.length === 0
                    ? copy.subtitleNoCandidates
                    : copy.subtitlePending}
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
                  {copy.parseRunning}
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  {copy.runParseAgain}
                </>
              )}
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {issue && issue.candidates.length === 0 && !parsing && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-6 py-10 text-center text-sm text-slate-600">
            {copy.subtitleNoCandidates}
          </div>
        )}

        <div className="space-y-5">
          {issue?.candidates.map((c) => {
            const pill = REVIEW_PILL[c.review_status]
            const cat = c.detected_category
              ? CATEGORY_LABEL[c.detected_category][lang]
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
                      {copy[pill.key]}
                    </span>
                    {c.confidence && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {copy.cardConfidence}: {Number(c.confidence).toFixed(2)}
                      </span>
                    )}
                    {c.page_from && (
                      <span className="text-[11px] text-slate-400">
                        {copy.pages} {c.page_from}
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
                          {copy.fieldCategory}
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
                          {copy.fieldNumber}
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
                          {copy.fieldDate}
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
                        {copy.fieldTitle}
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
                        {copy.cancel}
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
                        {savingFields ? copy.saving : copy.save}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-sm">
                      <Detail label={copy.cardCategory}>{cat}</Detail>
                      <Detail label={copy.cardNumber}>
                        {c.detected_number || '—'}
                      </Detail>
                      <Detail label={copy.cardDate}>
                        {c.detected_date ?? '—'}
                      </Detail>
                    </div>

                    <Detail label={copy.cardTitle}>
                      <p className="text-base font-semibold text-primary leading-snug">
                        {c.detected_title || '(sans titre)'}
                      </p>
                    </Detail>
                  </>
                )}

                <details className="mt-4">
                  <summary className="text-xs font-bold uppercase tracking-widest text-primary/65 cursor-pointer hover:text-primary">
                    {copy.cardExtract}
                  </summary>
                  <pre className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans bg-slate-50 border border-slate-100 rounded-md p-4 max-h-64 overflow-y-auto">
                    {c.raw_text}
                  </pre>
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
                      {copy.accept}
                    </button>
                    <button
                      onClick={() => handleReject(c)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-md border border-red-200 text-red-700 bg-white px-4 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      {copy.reject}
                    </button>
                    <button
                      onClick={() => handleDefer(c)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 text-slate-700 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                      {copy.defer}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditFields(c)}
                      disabled={isBusy}
                      className="ml-auto inline-flex items-center gap-2 rounded-md border border-amber-200 text-amber-800 bg-amber-50/50 px-4 py-2 text-sm font-semibold hover:bg-amber-50 disabled:opacity-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      {copy.edit}
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
                      {copy.promoted}
                    </span>
                    <Link
                      href={`/loi/${c.promoted_legal_text_slug}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 text-primary px-4 py-2 text-sm font-semibold hover:bg-primary/[0.04] transition-colors"
                    >
                      {c.promoted_legal_text_title_fr
                        ? `${copy.openDraft} : ${c.promoted_legal_text_title_fr.slice(0, 50)}${c.promoted_legal_text_title_fr.length > 50 ? '…' : ''}`
                        : copy.openDraft}
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
