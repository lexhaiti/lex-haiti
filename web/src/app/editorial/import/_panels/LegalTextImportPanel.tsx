'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Newspaper,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'
import {
  parseDocument,
  createLegalText,
  type DocumentParseResponse,
} from '@/lib/api/endpoints'
import { FormSection } from '@/components/forms/FormSection'
import { Field } from '@/components/forms/Field'
import { Dropzone } from '@/components/forms/Dropzone'

// ===========================================================================
// Types
// ===========================================================================

interface FormState {
  slug: string
  title_fr: string
  title_ht: string
  description_fr: string
  description_ht: string
  category: 'constitution' | 'code' | 'loi' | 'decret' | 'arrete' | 'circulaire' | 'convention'
  promulgation_date: string
  publication_date: string
  moniteur_ref: string
  status: 'in_force' | 'abrogated' | 'suspended' | 'historical'
  /** Required — French version of the document. */
  document_file: File | null
  /** Optional — Kreyòl translation file, aligned by article number. */
  document_file_ht: File | null
  source_file: File | null
}

interface ParsedHeading {
  key: string
  level: string
  number: string
  title_fr: string
  parent_key: string | null
  position: number
}

interface ParsedArticle {
  number: string
  heading_path: string[]
  heading_key: string | null
  content_fr: string
  content_ht: string | null
  title: string | null
  title_ht: string | null
}

interface ParseResult {
  headings: ParsedHeading[]
  articles: ParsedArticle[]
  preamble: string
  preamble_ht: string | null
  parser_confidence: number
  warnings: string[]
  fr_article_count: number
  ht_article_count: number
  matched_count: number
}

// Copy lives at `editorial.import.legalText.*` in i18n/{fr,ht}.ts.

const STATUS_VALUES = ['in_force', 'abrogated', 'suspended', 'historical'] as const
const CATEGORY_VALUES = [
  'constitution',
  'code',
  'loi',
  'decret',
  'arrete',
  'circulaire',
  'convention',
] as const

const DEFAULT_FORM: FormState = {
  slug: '',
  title_fr: '',
  title_ht: '',
  description_fr: '',
  description_ht: '',
  category: 'loi',
  promulgation_date: '',
  publication_date: '',
  moniteur_ref: '',
  status: 'in_force',
  document_file: null,
  document_file_ht: null,
  source_file: null,
}

// Slugify: lowercase, strip accents, hyphenate.
function toSlug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// ===========================================================================
// Page
// ===========================================================================

type ViewState = 'form' | 'parsing' | 'preview'
type T = (key: string, opts?: { fallback?: string }) => string

export default function LegalTextImportPanel() {
  const router = useRouter()
  const { t } = useT()

  const { isEditor } = useEditorMode()

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [view, setView] = useState<ViewState>('form')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Auto-generate slug from FR title until the editor edits the slug field manually.
  const [slugTouched, setSlugTouched] = useState(false)
  useEffect(() => {
    if (slugTouched) return
    if (!form.title_fr) return
    setForm((cur) => ({ ...cur, slug: toSlug(cur.title_fr) }))
  }, [form.title_fr, slugTouched])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((cur) => ({ ...cur, [key]: value }))

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.title_fr.trim()) e.title_fr = t('editorial.import.legalText.requiredField')
    if (!form.slug.trim()) e.slug = t('editorial.import.legalText.requiredField')
    if (!form.document_file) e.document_file = t('editorial.import.legalText.requiredField')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) return

    setSubmitError(null)
    setView('parsing')

    try {
      const response: DocumentParseResponse = await parseDocument(
        form.document_file!,
        form.document_file_ht ?? null,
      )

      const result: ParseResult = {
        headings: response.headings.map((h) => ({
          key: h.key,
          level: h.level,
          number: h.number,
          title_fr: h.title_fr,
          parent_key: h.parent_key,
          position: h.position,
        })),
        articles: response.articles.map((a) => ({
          number: a.number,
          content_fr: a.content_fr,
          content_ht: a.content_ht,
          heading_path: a.heading_path,
          heading_key: a.heading_key,
          title: a.title,
          title_ht: a.title_ht,
        })),
        preamble: response.preamble,
        preamble_ht: response.preamble_ht,
        parser_confidence: response.parser_confidence,
        warnings: response.warnings,
        fr_article_count: response.fr_article_count,
        ht_article_count: response.ht_article_count,
        matched_count: response.matched_count,
      }
      setParseResult(result)
      setView('preview')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Une erreur est survenue.'
      setSubmitError(message)
      setView('form')
    }
  }

  const reset = () => {
    setForm(DEFAULT_FORM)
    setSlugTouched(false)
    setParseResult(null)
    setView('form')
    setErrors({})
    setSubmitError(null)
  }

  const [saving, setSaving] = useState(false)

  const saveDraft = async () => {
    if (!parseResult) return
    setSaving(true)
    setSubmitError(null)

    try {
      // Build the article slug from the article number
      const slugifyArticle = (num: string) => {
        const s = num.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        return `art-${s || 'n'}`
      }

      await createLegalText({
        slug: form.slug,
        category: form.category,
        title_fr: form.title_fr.trim(),
        title_ht: form.title_ht.trim() || null,
        description_fr: form.description_fr.trim() || null,
        description_ht: form.description_ht.trim() || null,
        preamble_fr: parseResult.preamble || null,
        preamble_ht: parseResult.preamble_ht || null,
        promulgation_date: form.promulgation_date || null,
        publication_date: form.publication_date || null,
        moniteur_ref: form.moniteur_ref.trim() || null,
        status: form.status,
        headings: parseResult.headings.map((h) => ({
          key: h.key,
          parent_key: h.parent_key,
          level: h.level,
          number: h.number,
          title_fr: h.title_fr,
          position: h.position,
        })),
        articles: parseResult.articles.map((a, i) => ({
          number: a.number,
          slug: slugifyArticle(a.number),
          heading_key: a.heading_key,
          position: i,
          version: {
            text_fr: a.content_fr,
            text_ht: a.content_ht ?? null,
            title_fr: a.title,
            title_ht: a.title_ht ?? null,
          },
        })),
      })

      router.push('/lois')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Échec de la sauvegarde.'
      setSubmitError(message)
      setSaving(false)
    }
  }

  // ----- Auth gate -----

  if (!isEditor) {
    return (
      <div className="py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-4 max-w-3xl">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-slate-700 leading-relaxed mb-4">
                {t('editorial.import.legalText.requiresEditor')}
              </p>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                {t('editorial.import.legalText.signIn')}
              </Link>
            </div>
          </div>
        </div>
    )
  }

  // ----- Form / Parsing / Preview -----

  return (
    <div className="py-2 lg:py-4 w-full">
      <div className="w-full">

        {view === 'form' && (
          <form onSubmit={submit} className="space-y-8 w-full">
            {/* Section 1 — Metadata */}
            <FormSection
              title={t('editorial.import.legalText.sectionMeta')}
              help={t('editorial.import.legalText.sectionMetaHelp')}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Field label={t('editorial.import.legalText.fields.titleFr')} required error={errors.title_fr}>
                  <input
                    type="text"
                    value={form.title_fr}
                    onChange={(e) => setField('title_fr', e.target.value)}
                    placeholder="Constitution haïtienne de 1987"
                    className="formInput"
                  />
                </Field>
                <Field label={t('editorial.import.legalText.fields.titleHt')}>
                  <input
                    type="text"
                    value={form.title_ht}
                    onChange={(e) => setField('title_ht', e.target.value)}
                    placeholder="Konstitisyon ayisyen 1987"
                    className="formInput"
                  />
                </Field>

                <Field label={t('editorial.import.legalText.fields.descFr')}>
                  <textarea
                    value={form.description_fr}
                    onChange={(e) => setField('description_fr', e.target.value)}
                    rows={3}
                    className="formInput min-h-[88px]"
                  />
                </Field>
                <Field label={t('editorial.import.legalText.fields.descHt')}>
                  <textarea
                    value={form.description_ht}
                    onChange={(e) => setField('description_ht', e.target.value)}
                    rows={3}
                    className="formInput min-h-[88px]"
                  />
                </Field>

                <Field label={t('editorial.import.legalText.fields.category')}>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setField('category', v as FormState['category'])}
                  >
                    <SelectTrigger className="!h-11 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_VALUES.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`editorial.import.legalText.categoryOptions.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={t('editorial.import.legalText.fields.status')}>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setField('status', v as FormState['status'])}
                  >
                    <SelectTrigger className="!h-11 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_VALUES.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`editorial.import.legalText.statusOptions.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={t('editorial.import.legalText.fields.promulgationDate')}>
                  <input
                    type="date"
                    value={form.promulgation_date}
                    onChange={(e) => setField('promulgation_date', e.target.value)}
                    className="formInput"
                  />
                </Field>
                <Field label={t('editorial.import.legalText.fields.publicationDate')}>
                  <input
                    type="date"
                    value={form.publication_date}
                    onChange={(e) => setField('publication_date', e.target.value)}
                    className="formInput"
                  />
                </Field>

                <Field
                  label={t('editorial.import.legalText.fields.moniteurRef')}
                  hint={t('editorial.import.legalText.fields.moniteurRefHint')}
                  className="lg:col-span-2"
                >
                  <input
                    type="text"
                    value={form.moniteur_ref}
                    onChange={(e) => setField('moniteur_ref', e.target.value)}
                    placeholder="n° 47 du 4 juin 2014"
                    className="formInput"
                  />
                </Field>

                <Field
                  label={t('editorial.import.legalText.fields.slug')}
                  required
                  error={errors.slug}
                  className="lg:col-span-2"
                >
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setField('slug', toSlug(e.target.value))
                    }}
                    placeholder={t('editorial.import.legalText.fields.slugPlaceholder')}
                    className="formInput font-mono text-[13px]"
                  />
                </Field>
              </div>
            </FormSection>

            {/* Section 2 — Document source */}
            <FormSection
              title={t('editorial.import.legalText.sectionDocument')}
              help={t('editorial.import.legalText.sectionDocumentHelp')}
              icon={FileText}
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Version française <span className="text-red-500">*</span>
                  </p>
                  <Dropzone
                    file={form.document_file}
                    onSelect={(f) => setField('document_file', f)}
                    accept=".pdf,.docx,.txt"
                    prompt={t('editorial.import.legalText.dropzoneDocument')}
                    browseLabel={t('editorial.import.legalText.dropzoneBrowse')}
                    formatsLabel={t('editorial.import.legalText.dropzoneFormatsDoc')}
                    fileSelectedLabel={t('editorial.import.legalText.fileSelected')}
                    removeLabel={t('editorial.import.legalText.removeFile')}
                    error={errors.document_file}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Version kreyòl <span className="text-slate-400 font-medium normal-case">(optionnelle — alignée par numéro d'article)</span>
                  </p>
                  <Dropzone
                    file={form.document_file_ht}
                    onSelect={(f) => setField('document_file_ht', f)}
                    accept=".pdf,.docx,.txt"
                    prompt="Glissez la version Kreyòl ici, ou laissez vide pour ajouter la traduction plus tard."
                    browseLabel={t('editorial.import.legalText.dropzoneBrowse')}
                    formatsLabel={t('editorial.import.legalText.dropzoneFormatsDoc')}
                    fileSelectedLabel={t('editorial.import.legalText.fileSelected')}
                    removeLabel={t('editorial.import.legalText.removeFile')}
                  />
                </div>
              </div>
            </FormSection>

            {/* Section 3 — Moniteur source */}
            <FormSection
              title={t('editorial.import.legalText.sectionSource')}
              help={t('editorial.import.legalText.sectionSourceHelp')}
              icon={Newspaper}
            >
              <Dropzone
                file={form.source_file}
                onSelect={(f) => setField('source_file', f)}
                accept=".pdf,.jpg,.jpeg,.png"
                prompt={t('editorial.import.legalText.dropzoneSource')}
                browseLabel={t('editorial.import.legalText.dropzoneBrowse')}
                formatsLabel={t('editorial.import.legalText.dropzoneFormatsImg')}
                fileSelectedLabel={t('editorial.import.legalText.fileSelected')}
                removeLabel={t('editorial.import.legalText.removeFile')}
              />
            </FormSection>

            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                className="h-11 rounded-md"
              >
                {t('editorial.import.legalText.discard')}
              </Button>
              <Button
                type="submit"
                size="lg"
                className="h-11 rounded-md bg-primary text-white hover:bg-primary/90 px-7 font-semibold gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {t('editorial.import.legalText.submit')}
              </Button>
            </div>
          </form>
        )}

        {view === 'parsing' && (
          <ParsingState
            title={t('editorial.import.legalText.parsingTitle')}
            help={t('editorial.import.legalText.parsingHelp')}
          />
        )}

        {view === 'preview' && parseResult && (
          <PreviewState
            result={parseResult}
            onUpdateResult={setParseResult}
            t={t}
            onSaveDraft={saveDraft}
            onDiscard={reset}
            saving={saving}
            error={submitError}
          />
        )}
      </div>

      <style jsx global>{`
        .formInput {
          width: 100%;
          height: 2.75rem;
          padding: 0 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid rgb(203 213 225);
          background: white;
          font-size: 0.875rem;
          color: rgb(30 41 59);
          transition: border-color 120ms, box-shadow 120ms;
        }
        textarea.formInput {
          height: auto;
          padding: 0.625rem 0.75rem;
          line-height: 1.5;
        }
        .formInput::placeholder {
          color: rgb(148 163 184);
        }
        .formInput:focus {
          outline: none;
          border-color: #0d1b4c;
          box-shadow: 0 0 0 1px rgba(13, 27, 76, 0.2);
        }
      `}</style>
    </div>
  )
}

// ===========================================================================
// Sub-components
// ===========================================================================
//
// FormSection / Field / Dropzone now live in @/components/forms — see
// the imports at the top of this file. Page-local subcomponents below
// are wizard-specific (parsing screen, preview screen with editable
// articles).

interface ParsingStateProps {
  title: string
  help: string
}

function ParsingState({ title, help }: ParsingStateProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center">
      <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin mb-5" />
      <h2 className="text-xl font-bold text-slate-900 mb-3">{title}</h2>
      <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">{help}</p>
    </div>
  )
}

interface PreviewStateProps {
  result: ParseResult
  onUpdateResult: (r: ParseResult) => void
  t: T
  onSaveDraft: () => void
  onDiscard: () => void
  saving: boolean
  error: string | null
}

const LEVEL_LABELS: Record<string, string> = {
  book: 'Livre',
  title: 'Titre',
  chapter: 'Chap.',
  section: 'Sect.',
  subsection: 'Sous-s.',
}

function PreviewState({
  result,
  onUpdateResult,
  t,
  onSaveDraft,
  onDiscard,
  saving,
  error,
}: PreviewStateProps) {
  // Track which article is being edited (by index), or null for none.
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editHeadingKey, setEditHeadingKey] = useState<string | null>(null)

  const startEdit = useCallback(
    (idx: number) => {
      const a = result.articles[idx]
      setEditIdx(idx)
      setEditContent(a.content_fr)
      setEditHeadingKey(a.heading_key)
    },
    [result.articles],
  )

  const cancelEdit = useCallback(() => {
    setEditIdx(null)
    setEditContent('')
    setEditHeadingKey(null)
  }, [])

  const saveEdit = useCallback(() => {
    if (editIdx === null) return
    const updated = [...result.articles]
    const heading = result.headings.find((h) => h.key === editHeadingKey)
    // Rebuild heading_path for the new assignment
    const buildPath = (key: string | null): string[] => {
      if (!key) return []
      const h = result.headings.find((x) => x.key === key)
      if (!h) return []
      const parentPath = buildPath(h.parent_key)
      const label = `${LEVEL_LABELS[h.level] ?? h.level} ${h.number} — ${h.title_fr}`
      return [...parentPath, label]
    }
    updated[editIdx] = {
      ...updated[editIdx],
      content_fr: editContent,
      heading_key: editHeadingKey,
      heading_path: buildPath(editHeadingKey),
    }
    onUpdateResult({ ...result, articles: updated })
    cancelEdit()
  }, [editIdx, editContent, editHeadingKey, result, onUpdateResult, cancelEdit])

  const removeArticle = useCallback(
    (idx: number) => {
      const updated = result.articles.filter((_, i) => i !== idx)
      onUpdateResult({ ...result, articles: updated })
      if (editIdx === idx) cancelEdit()
    },
    [result, onUpdateResult, editIdx, cancelEdit],
  )

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-6 w-full">
        {/* Header strip */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                {t('editorial.import.legalText.resultTitle')}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                {t('editorial.import.legalText.resultIntro')}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {t('editorial.import.legalText.confidence')}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums',
                      result.parser_confidence >= 0.85
                        ? 'bg-emerald-100 text-emerald-700'
                        : result.parser_confidence >= 0.7
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700',
                    )}
                  >
                    {Math.round(result.parser_confidence * 100)}%
                  </span>
                </div>
                {/* Bilingual alignment summary — only when a HT file was
                    uploaded (ht_article_count > 0). Three counts: total
                    FR articles, total HT articles, and how many matched
                    by article number. */}
                {result.ht_article_count > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Alignement
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums bg-slate-100 text-slate-700">
                      <span className="text-slate-900">{result.fr_article_count}</span>
                      <span className="text-slate-400">FR</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-900">{result.ht_article_count}</span>
                      <span className="text-slate-400">HT</span>
                      <span className="text-slate-300">·</span>
                      <span
                        className={cn(
                          result.matched_count === result.fr_article_count
                            ? 'text-emerald-700'
                            : 'text-amber-700',
                        )}
                      >
                        {result.matched_count}
                      </span>
                      <span className="text-slate-400">appariés</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {error && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Headings */}
        {result.headings.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
              {t('editorial.import.legalText.headingsLabel')}
            </h3>
            <ol className="space-y-1">
              {result.headings.map((h) => (
                <li
                  key={h.key}
                  className={cn(
                    'flex items-baseline gap-2 text-sm',
                    h.level === 'book' && 'font-bold text-slate-900',
                    h.level === 'title' && 'pl-0 font-semibold text-slate-900',
                    h.level === 'chapter' && 'pl-6 text-slate-700',
                    h.level === 'section' && 'pl-12 text-slate-600',
                    h.level === 'subsection' && 'pl-16 text-slate-500',
                  )}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
                    {LEVEL_LABELS[h.level] ?? h.level} {h.number}
                  </span>
                  <span>· {h.title_fr}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Articles — editable */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
            {t('editorial.import.legalText.articlesLabel')}
            <span className="text-slate-400 tabular-nums">({result.articles.length})</span>
          </h3>
          <ul className="divide-y divide-slate-100">
            {result.articles.map((a, i) => (
              <li key={`${a.number}-${i}`} className="py-4 first:pt-0 last:pb-0">
                {editIdx === i ? (
                  /* ---- Inline edit form ---- */
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-3">
                      <span className="text-sm font-bold text-primary tabular-nums">
                        Art. {a.number}
                      </span>
                    </div>
                    {/* Heading reassignment */}
                    {result.headings.length > 0 && (
                      <label className="block">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">
                          {t('editorial.import.legalText.reassignHeading')}
                        </span>
                        <div className="relative">
                          <select
                            value={editHeadingKey ?? ''}
                            onChange={(e) =>
                              setEditHeadingKey(e.target.value || null)
                            }
                            className="w-full h-9 pl-3 pr-8 rounded-md border border-slate-300 bg-white text-sm text-slate-700 appearance-none focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                          >
                            <option value="">{t('editorial.import.legalText.noHeading')}</option>
                            {result.headings.map((h) => (
                              <option key={h.key} value={h.key}>
                                {LEVEL_LABELS[h.level] ?? h.level} {h.number} — {h.title_fr}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                      </label>
                    )}
                    {/* Content editing */}
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={6}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {t('editorial.import.legalText.saveEdit')}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400"
                      >
                        {t('editorial.import.legalText.cancelEdit')}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ---- Read-only article row ---- */
                  <div className="group">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-sm font-bold text-primary tabular-nums">
                        Art. {a.number}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {a.heading_path.join(' › ')}
                      </span>
                      {result.ht_article_count > 0 && (
                        a.content_ht ? (
                          <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                            HT
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200" title="Traduction Kreyòl manquante pour cet article">
                            HT manquant
                          </span>
                        )
                      )}
                      {/* Edit/delete controls — visible on hover */}
                      <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-primary hover:bg-primary/5"
                        >
                          <Pencil className="w-3 h-3" />
                          {t('editorial.import.legalText.editArticle')}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeArticle(i)}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          {t('editorial.import.legalText.deleteArticle')}
                        </button>
                      </span>
                    </div>
                    {a.content_ht ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1">
                        <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                          {a.content_fr}
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed line-clamp-3 md:border-l md:pl-5 md:border-slate-100">
                          {a.content_ht}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">
                        {a.content_fr}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-800 mb-3">
              <AlertCircle className="w-3.5 h-3.5" />
              {t('editorial.import.legalText.warnings')}
            </h3>
            <ul className="space-y-1.5 text-sm text-amber-900">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-amber-700 flex-shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
            className="h-11 rounded-md"
          >
            {t('editorial.import.legalText.discard')}
          </Button>
          <Button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            size="lg"
            className="h-11 rounded-md bg-primary text-white hover:bg-primary/90 px-7 font-semibold gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {t('editorial.import.legalText.saveDraft')}
          </Button>
        </div>
    </div>
  )
}
