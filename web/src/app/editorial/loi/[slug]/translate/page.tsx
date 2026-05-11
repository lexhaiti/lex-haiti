'use client'

/**
 * Translation editor — fills text_ht on the articles of an existing
 * legal_text. Two modes:
 *
 *   1. Upload Kreyòl DOCX → parse → align by article number → editor
 *      reviews matches in a side-by-side pane → applies them.
 *   2. Inline edit — list of articles with FR on left, HT input on
 *      right, save per-row via PATCH /editorial/articles/{id}/content.
 *
 * Mode 1 is the workhorse when the editor has a complete translation
 * file ready (the usual case for the Moniteur companion flow). Mode 2
 * is for partial / typed translations the editor produces themselves.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Languages,
  Loader2,
  Save,
  Upload,
} from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { Dropzone } from '@/components/forms/Dropzone'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { useT } from '@/i18n/useT'
import {
  getTextBySlug,
  parseTranslation,
  updateArticleContent,
  type LegalTextRead,
  type TranslationMatchResponse,
  type TranslationParseResponse,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

type Mode = 'upload' | 'inline'

interface InlineDraft {
  articleId: number
  text_ht: string
  saving: boolean
  saved: boolean
  error: string | null
}

export default function TranslateLegalTextPage() {
  const params = useParams()
  const slug = String(params?.slug ?? '')
  const router = useRouter()
  const { t, language } = useT()
  const isFr = language !== 'ht'
  const { isEditor, status: editorStatus } = useEditorMode()
  const editorLoading = editorStatus === 'loading'

  // ── Legal text load ────────────────────────────────────────────────
  const [text, setText] = useState<LegalTextRead | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    getTextBySlug(slug, 'all')
      .then((res) => {
        if (!cancelled) setText(res)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e?.message ?? String(e))
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // ── Mode + DOCX upload state ───────────────────────────────────────
  const [mode, setMode] = useState<Mode>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [preview, setPreview] = useState<TranslationParseResponse | null>(null)

  const runParse = async () => {
    if (!file) return
    setParsing(true)
    setParseError(null)
    try {
      const res = await parseTranslation(slug, file)
      setPreview(res)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
    } finally {
      setParsing(false)
    }
  }

  // Per-row apply: writes one article's text_ht via the existing
  // article-content patch endpoint. The editor can apply row-by-row
  // or in bulk via "Tout appliquer".
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applied, setApplied] = useState<Set<number>>(new Set())

  const applyRow = async (m: TranslationMatchResponse) => {
    if (!m.parsed_content_ht) return
    setApplyingId(m.article_id)
    setApplyError(null)
    try {
      await updateArticleContent(m.article_id, {
        text_ht: m.parsed_content_ht,
        title_ht: m.parsed_title_ht ?? null,
        comment: `Traduction HT importée — alignée sur numéro ${m.article_number}`,
      })
      setApplied((cur) => new Set(cur).add(m.article_id))
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplyingId(null)
    }
  }

  const applyAll = async () => {
    if (!preview) return
    for (const m of preview.matches) {
      if (m.parsed_content_ht && !applied.has(m.article_id)) {
        // eslint-disable-next-line no-await-in-loop
        await applyRow(m)
      }
    }
  }

  // ── Inline mode state ──────────────────────────────────────────────
  const [drafts, setDrafts] = useState<Record<number, InlineDraft>>({})

  const setDraft = (articleId: number, patch: Partial<InlineDraft>) =>
    setDrafts((cur) => {
      const prev =
        cur[articleId] ??
        ({
          articleId,
          text_ht: '',
          saving: false,
          saved: false,
          error: null,
        } as InlineDraft)
      return { ...cur, [articleId]: { ...prev, ...patch } }
    })

  const saveInline = async (articleId: number) => {
    const d = drafts[articleId]
    if (!d) return
    setDraft(articleId, { saving: true, saved: false, error: null })
    try {
      await updateArticleContent(articleId, {
        text_ht: d.text_ht.trim() || null,
      })
      setDraft(articleId, { saving: false, saved: true, error: null })
    } catch (err) {
      setDraft(articleId, {
        saving: false,
        saved: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Render gates ───────────────────────────────────────────────────
  if (editorLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isEditor) {
    return (
      <div className="container py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-4 max-w-3xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
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
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="container py-12">
        <ErrorBanner>{loadError}</ErrorBanner>
      </div>
    )
  }

  if (!text) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const articles = text.articles ?? []
  const totalHt = articles.filter((a) => a.content_ht && a.content_ht.trim()).length
  const totalFr = articles.length

  return (
    <div className="container py-10 lg:py-12 space-y-6">
      <Breadcrumb
        variant="light"
        items={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: 'Éditorial', href: '/editorial' },
          {
            label: text.title_fr.slice(0, 40),
            href: `/loi/${text.slug}`,
          },
          { label: isFr ? 'Traduction' : 'Tradiksyon' },
        ]}
      />

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-2">
            {isFr ? 'Éditeur de traduction' : 'Editè tradiksyon'}
          </p>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
            {text.title_fr}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            <span className="tabular-nums font-bold text-slate-900">
              {totalHt}
            </span>
            <span className="text-slate-400"> / </span>
            <span className="tabular-nums font-bold text-slate-900">
              {totalFr}
            </span>{' '}
            {isFr
              ? 'articles traduits en Kreyòl'
              : 'atik tradui an Kreyòl'}
          </p>
        </div>
        <Link
          href={`/loi/${text.slug}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
        >
          <ArrowLeft className="w-4 h-4" />
          {isFr ? 'Retour au texte' : 'Retounen nan tèks la'}
        </Link>
      </header>

      {/* Mode toggle */}
      <div className="inline-flex p-1 rounded-md bg-slate-100">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            'px-3.5 py-1.5 rounded text-sm font-semibold transition-all',
            mode === 'upload'
              ? 'bg-white shadow-sm text-slate-900'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          <Upload className="inline w-3.5 h-3.5 -mt-0.5 mr-1.5" />
          {isFr ? 'Importer un fichier' : 'Enpòte yon fichye'}
        </button>
        <button
          type="button"
          onClick={() => setMode('inline')}
          className={cn(
            'px-3.5 py-1.5 rounded text-sm font-semibold transition-all',
            mode === 'inline'
              ? 'bg-white shadow-sm text-slate-900'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          <Languages className="inline w-3.5 h-3.5 -mt-0.5 mr-1.5" />
          {isFr ? 'Saisir article par article' : 'Antre atik pa atik'}
        </button>
      </div>

      {/* ── Mode 1: DOCX upload ─────────────────────────────────────── */}
      {mode === 'upload' && !preview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              {isFr ? 'Fichier de traduction Kreyòl' : 'Fichye tradiksyon Kreyòl'}
            </p>
            <p className="text-sm text-slate-600 mb-4">
              {isFr
                ? "Déposez le document Kreyòl. Les articles seront alignés sur les numéros existants ; vous reverrez chaque appariement avant de confirmer."
                : 'Depoze dokiman Kreyòl la. Atik yo ap aliyen sou nimewo ki egziste yo; w ap revize chak apariman anvan ou konfime.'}
            </p>
            <Dropzone
              file={file}
              onSelect={(f) => setFile(f)}
              accept=".pdf,.docx,.txt"
              prompt={
                isFr
                  ? 'Glissez le fichier Kreyòl ici'
                  : 'Glise fichye Kreyòl la la'
              }
              browseLabel={isFr ? 'Parcourir' : 'Gade'}
              formatsLabel="PDF · DOCX · TXT"
              fileSelectedLabel={isFr ? 'Fichier sélectionné' : 'Fichye seleksyone'}
              removeLabel={isFr ? 'Retirer' : 'Retire'}
            />
          </div>
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={runParse}
              disabled={!file || parsing}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {parsing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              {isFr ? 'Analyser le fichier' : 'Analize fichye a'}
            </button>
          </div>
        </div>
      )}

      {/* ── Mode 1 preview (after parse) ─────────────────────────────── */}
      {mode === 'upload' && preview && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">
                {isFr ? 'Aperçu de l’alignement' : 'Apèsi alyman an'}
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums bg-slate-100 text-slate-700">
                <span className="text-slate-900">{preview.fr_article_count}</span>
                <span className="text-slate-400">FR</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-900">{preview.parsed_ht_count}</span>
                <span className="text-slate-400">HT</span>
                <span className="text-slate-300">·</span>
                <span
                  className={cn(
                    preview.matched_count === preview.fr_article_count
                      ? 'text-emerald-700'
                      : 'text-amber-700',
                  )}
                >
                  {preview.matched_count}
                </span>
                <span className="text-slate-400">{isFr ? 'appariés' : 'aliyen'}</span>
              </span>
            </div>
            {preview.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 rounded-full bg-amber-700 flex-shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            {applyError && (
              <p className="text-sm text-red-600 mb-2">{applyError}</p>
            )}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setPreview(null)
                  setFile(null)
                  setApplied(new Set())
                  setApplyError(null)
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                {isFr ? 'Recommencer' : 'Rekòmanse'}
              </button>
              <button
                type="button"
                onClick={applyAll}
                disabled={
                  applyingId !== null ||
                  preview.matches.every(
                    (m) => !m.parsed_content_ht || applied.has(m.article_id),
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isFr ? 'Tout appliquer' : 'Aplike tout'}
              </button>
            </div>
          </div>

          {/* Side-by-side rows */}
          <ul className="space-y-3">
            {preview.matches.map((m) => {
              const isApplied = applied.has(m.article_id)
              const willOverwrite = m.status === 'existing_ht'
              const hasHt = !!m.parsed_content_ht
              return (
                <li
                  key={m.article_id}
                  className={cn(
                    'rounded-xl border bg-white p-4',
                    isApplied
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : !hasHt
                        ? 'border-amber-200 bg-amber-50/30'
                        : willOverwrite
                          ? 'border-amber-200'
                          : 'border-slate-200',
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-bold text-primary tabular-nums">
                      Art. {m.article_number}
                    </span>
                    {isApplied ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {isFr ? 'Appliqué' : 'Aplike'}
                      </span>
                    ) : !hasHt ? (
                      <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
                        {isFr ? 'Pas de HT' : 'Pa gen HT'}
                      </span>
                    ) : willOverwrite ? (
                      <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
                        {isFr ? 'Écrasera' : 'Ranplase'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200">
                        {isFr ? 'Nouveau HT' : 'Nouvo HT'}
                      </span>
                    )}
                    {hasHt && !isApplied && (
                      <button
                        type="button"
                        onClick={() => applyRow(m)}
                        disabled={applyingId === m.article_id}
                        className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-900 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-800 disabled:opacity-50"
                      >
                        {applyingId === m.article_id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Save className="w-3 h-3" />
                        )}
                        {isFr ? 'Appliquer' : 'Aplike'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm leading-relaxed">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                        FR
                      </p>
                      <p className="text-slate-700 line-clamp-6">
                        {m.existing_text_fr ?? (
                          <em className="text-slate-400">{isFr ? '(vide)' : '(vid)'}</em>
                        )}
                      </p>
                    </div>
                    <div className="md:border-l md:pl-4 md:border-slate-100">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                        HT
                      </p>
                      {hasHt ? (
                        <p className="text-slate-700 line-clamp-6">
                          {m.parsed_content_ht}
                        </p>
                      ) : (
                        <p className="text-slate-400 italic">
                          {isFr
                            ? 'Aucune traduction trouvée pour ce numéro.'
                            : 'Pa jwenn tradiksyon pou nimewo sa a.'}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── Mode 2: inline edit ─────────────────────────────────────── */}
      {mode === 'inline' && (
        <ul className="space-y-4">
          {articles.map((a) => {
            const initial = a.content_ht ?? ''
            const d =
              drafts[a.id] ??
              ({
                articleId: a.id,
                text_ht: initial,
                saving: false,
                saved: false,
                error: null,
              } as InlineDraft)
            const dirty = d.text_ht !== initial
            return (
              <li
                key={a.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-bold text-primary tabular-nums">
                    Art. {a.number}
                  </span>
                  {initial && initial.trim() ? (
                    <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {isFr ? 'Traduit' : 'Tradui'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200">
                      {isFr ? 'À traduire' : 'Pou tradui'}
                    </span>
                  )}
                  {d.saved && !dirty && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" />
                      {isFr ? 'Enregistré' : 'Sove'}
                    </span>
                  )}
                  {dirty && (
                    <button
                      type="button"
                      onClick={() => saveInline(a.id)}
                      disabled={d.saving}
                      className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-900 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-800 disabled:opacity-50"
                    >
                      {d.saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      {isFr ? 'Enregistrer' : 'Sove'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                      FR
                    </p>
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-[12]">
                      {a.content_fr ?? (
                        <em className="text-slate-400">{isFr ? '(vide)' : '(vid)'}</em>
                      )}
                    </p>
                  </div>
                  <div className="md:border-l md:pl-4 md:border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                      HT
                    </p>
                    <textarea
                      value={d.text_ht}
                      onChange={(e) =>
                        setDraft(a.id, { text_ht: e.target.value, saved: false })
                      }
                      rows={6}
                      placeholder={
                        isFr
                          ? 'Tapez ici la traduction Kreyòl…'
                          : 'Tape tradiksyon Kreyòl la la…'
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    {d.error && (
                      <p className="mt-1 text-xs text-red-600">{d.error}</p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
