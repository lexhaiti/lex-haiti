'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Newspaper,
  Sparkles,
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
  document_file: File | null
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
  title: string | null
}

interface ParseResult {
  headings: ParsedHeading[]
  articles: ParsedArticle[]
  preamble: string
  parser_confidence: number
  warnings: string[]
}

// ===========================================================================
// Copy
// ===========================================================================

const COPY = {
  fr: {
    pageTitle: 'Importer un nouveau texte',
    pageSubtitle:
      'Téléversez un texte juridique avec ses sources officielles. Le contenu est analysé puis présenté pour validation éditoriale avant publication.',
    backToEditor: 'Retour à l’éditorial',
    requiresEditor:
      'Cette page est réservée aux éditeurs. Connectez-vous avec un compte éditorial pour accéder à l’import.',
    signIn: 'Se connecter',
    sectionMeta: 'Métadonnées',
    sectionMetaHelp:
      'Renseignez les informations bibliographiques. Le slug détermine l’URL publique du texte.',
    sectionDocument: 'Document source',
    sectionDocumentHelp:
      'Téléversez le fichier qui contient les articles à structurer (PDF, DOCX ou TXT). L’analyse extrait automatiquement titres, chapitres, sections et articles.',
    sectionSource: 'Source officielle (Le Moniteur)',
    sectionSourceHelp:
      'Téléversez le scan PDF ou l’image de la publication originale dans Le Moniteur. C’est la pièce de provenance.',
    fields: {
      slug: 'Slug (URL)',
      slugPlaceholder: 'ex. : code-civil-1825 — auto-généré depuis le titre si vide',
      titleFr: 'Titre (français)',
      titleHt: 'Titre (kreyòl)',
      descFr: 'Description (français)',
      descHt: 'Description (kreyòl)',
      category: 'Catégorie',
      promulgationDate: 'Date de promulgation',
      publicationDate: 'Date de publication',
      moniteurRef: 'Référence Moniteur (numéro)',
      moniteurRefHint:
        '« Le Moniteur » est ajouté automatiquement à l’affichage. Saisissez seulement le numéro et la date.',
      status: 'Statut juridique',
    },
    statusOptions: {
      in_force: 'En vigueur',
      abrogated: 'Abrogée',
      suspended: 'Suspendue',
      historical: 'Historique',
    },
    categoryOptions: {
      constitution: 'Constitution',
      code: 'Code',
      loi: 'Loi',
      decret: 'Décret',
      arrete: 'Arrêté',
      circulaire: 'Circulaire',
      convention: 'Convention',
    },
    dropzoneDocument: 'Glissez-déposez le fichier ici, ou ',
    dropzoneSource: 'Glissez-déposez le scan ici, ou ',
    dropzoneBrowse: 'parcourir',
    dropzoneFormatsDoc: 'Formats acceptés : PDF, DOCX, TXT (max. 25 Mo)',
    dropzoneFormatsImg: 'Formats acceptés : PDF, JPG, PNG (max. 25 Mo)',
    fileSelected: 'Fichier sélectionné :',
    removeFile: 'Retirer',
    submit: 'Lancer l’analyse',
    submitting: 'Analyse en cours…',
    parsingTitle: 'Analyse du document',
    parsingHelp:
      'Extraction du texte, détection de la structure (titres, chapitres, articles) et préparation de la prévisualisation.',
    resultTitle: 'Aperçu de la structure détectée',
    resultIntro:
      'Vérifiez la structure ci-dessous avant de l’enregistrer. Vous pourrez l’affiner article par article via l’éditeur après import.',
    confidence: 'Confiance du parseur',
    headingsLabel: 'Hiérarchie',
    articlesLabel: 'Articles détectés',
    warnings: 'Avertissements',
    saveDraft: 'Enregistrer comme brouillon',
    discard: 'Annuler',
    successDraft: 'Texte importé en brouillon, en attente de validation.',
    requiredField: 'Champ requis',
  },
  ht: {
    pageTitle: 'Enpòte yon nouvo tèks',
    pageSubtitle:
      "Telechaje yon tèks jiridik avèk sous ofisyèl li. Sistèm la analize kontni an, epi prezante li pou validasyon editoryal anvan piblikasyon.",
    backToEditor: 'Retounen nan editoryal',
    requiresEditor:
      "Paj sa a sèlman pou editè yo. Konekte avèk yon kont editoryal pou jwenn aksè a enpò a.",
    signIn: 'Konekte',
    sectionMeta: 'Metadata',
    sectionMetaHelp:
      "Mete enfòmasyon bibliyografik yo. Slug la detèmine URL piblik tèks la.",
    sectionDocument: 'Dokiman sous',
    sectionDocumentHelp:
      'Telechaje fichye ki gen atik pou estriktire (PDF, DOCX oswa TXT). Analiz la ekstrè otomatikman tit, chapit, seksyon ak atik.',
    sectionSource: 'Sous ofisyèl (Le Moniteur)',
    sectionSourceHelp:
      'Telechaje skanèyon PDF oswa imaj piblikasyon orijinal nan Le Moniteur. Se moso pwovnens lan.',
    fields: {
      slug: 'Slug (URL)',
      slugPlaceholder: 'egz. : kod-sivil-1825 — otomatik soti nan tit la',
      titleFr: 'Tit (fransè)',
      titleHt: 'Tit (kreyòl)',
      descFr: 'Deskripsyon (fransè)',
      descHt: 'Deskripsyon (kreyòl)',
      category: 'Kategori',
      promulgationDate: 'Dat pwomilgasyon',
      publicationDate: 'Dat piblikasyon',
      moniteurRef: 'Referans Moniteur (nimewo)',
      moniteurRefHint:
        '« Le Moniteur » ajoute otomatikman lè y’ap afiche. Mete sèlman nimewo ak dat la.',
      status: 'Estati jiridik',
    },
    statusOptions: {
      in_force: 'An vigè',
      abrogated: 'Abwoje',
      suspended: 'Sispann',
      historical: 'Istorik',
    },
    categoryOptions: {
      constitution: 'Konstitisyon',
      code: 'Kòd',
      loi: 'Lwa',
      decret: 'Dekrè',
      arrete: 'Arète',
      circulaire: 'Sikilè',
      convention: 'Konvansyon',
    },
    dropzoneDocument: 'Glise epi depoze fichye a la, oswa ',
    dropzoneSource: 'Glise epi depoze skanèyon an la, oswa ',
    dropzoneBrowse: 'navige',
    dropzoneFormatsDoc: 'Fòma aksepte : PDF, DOCX, TXT (max. 25 Mo)',
    dropzoneFormatsImg: 'Fòma aksepte : PDF, JPG, PNG (max. 25 Mo)',
    fileSelected: 'Fichye chwazi :',
    removeFile: 'Retire',
    submit: 'Lanse analiz la',
    submitting: 'N ap analize…',
    parsingTitle: 'Analiz dokiman an',
    parsingHelp:
      'Ekstraksyon tèks, deteksyon estrikti (tit, chapit, atik) ak preparasyon prevyou a.',
    resultTitle: 'Prevyou estrikti ki detekte',
    resultIntro:
      'Verifye estrikti anba a anvan ou anrejistre. W ap kapab afine li atik pa atik nan editè a apre enpò.',
    confidence: 'Konfyans nan parsè a',
    headingsLabel: 'Yerachi',
    articlesLabel: 'Atik ki detekte',
    warnings: 'Avètisman',
    saveDraft: 'Anrejistre kòm bouyon',
    discard: 'Anile',
    successDraft: "Tèks enpòte kòm bouyon, ap tann validasyon.",
    requiredField: 'Chan obligatwa',
  },
}

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

export default function LegalTextImportPanel() {
  const router = useRouter()
  const { language } = useT()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

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
    if (!form.title_fr.trim()) e.title_fr = copy.requiredField
    if (!form.slug.trim()) e.slug = copy.requiredField
    if (!form.document_file) e.document_file = copy.requiredField
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) return

    setSubmitError(null)
    setView('parsing')

    try {
      const response: DocumentParseResponse = await parseDocument(form.document_file!)

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
          heading_path: a.heading_path,
          heading_key: a.heading_key,
          title: a.title,
        })),
        preamble: response.preamble,
        parser_confidence: response.parser_confidence,
        warnings: response.warnings,
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
            title_fr: a.title,
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
                {copy.requiresEditor}
              </p>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                {copy.signIn}
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
            <FormSection title={copy.sectionMeta} help={copy.sectionMetaHelp}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Field label={copy.fields.titleFr} required error={errors.title_fr}>
                  <input
                    type="text"
                    value={form.title_fr}
                    onChange={(e) => setField('title_fr', e.target.value)}
                    placeholder="Constitution haïtienne de 1987"
                    className="formInput"
                  />
                </Field>
                <Field label={copy.fields.titleHt}>
                  <input
                    type="text"
                    value={form.title_ht}
                    onChange={(e) => setField('title_ht', e.target.value)}
                    placeholder="Konstitisyon ayisyen 1987"
                    className="formInput"
                  />
                </Field>

                <Field label={copy.fields.descFr}>
                  <textarea
                    value={form.description_fr}
                    onChange={(e) => setField('description_fr', e.target.value)}
                    rows={3}
                    className="formInput min-h-[88px]"
                  />
                </Field>
                <Field label={copy.fields.descHt}>
                  <textarea
                    value={form.description_ht}
                    onChange={(e) => setField('description_ht', e.target.value)}
                    rows={3}
                    className="formInput min-h-[88px]"
                  />
                </Field>

                <Field label={copy.fields.category}>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setField('category', v as FormState['category'])}
                  >
                    <SelectTrigger className="!h-11 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(copy.categoryOptions).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={copy.fields.status}>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setField('status', v as FormState['status'])}
                  >
                    <SelectTrigger className="!h-11 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(copy.statusOptions).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={copy.fields.promulgationDate}>
                  <input
                    type="date"
                    value={form.promulgation_date}
                    onChange={(e) => setField('promulgation_date', e.target.value)}
                    className="formInput"
                  />
                </Field>
                <Field label={copy.fields.publicationDate}>
                  <input
                    type="date"
                    value={form.publication_date}
                    onChange={(e) => setField('publication_date', e.target.value)}
                    className="formInput"
                  />
                </Field>

                <Field
                  label={copy.fields.moniteurRef}
                  hint={copy.fields.moniteurRefHint}
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
                  label={copy.fields.slug}
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
                    placeholder={copy.fields.slugPlaceholder}
                    className="formInput font-mono text-[13px]"
                  />
                </Field>
              </div>
            </FormSection>

            {/* Section 2 — Document source */}
            <FormSection
              title={copy.sectionDocument}
              help={copy.sectionDocumentHelp}
              icon={FileText}
            >
              <Dropzone
                file={form.document_file}
                onSelect={(f) => setField('document_file', f)}
                accept=".pdf,.docx,.txt"
                placeholder={copy.dropzoneDocument}
                browseLabel={copy.dropzoneBrowse}
                formatsLabel={copy.dropzoneFormatsDoc}
                fileSelectedLabel={copy.fileSelected}
                removeLabel={copy.removeFile}
                error={errors.document_file}
                requiredLabel={copy.requiredField}
              />
            </FormSection>

            {/* Section 3 — Moniteur source */}
            <FormSection
              title={copy.sectionSource}
              help={copy.sectionSourceHelp}
              icon={Newspaper}
            >
              <Dropzone
                file={form.source_file}
                onSelect={(f) => setField('source_file', f)}
                accept=".pdf,.jpg,.jpeg,.png"
                placeholder={copy.dropzoneSource}
                browseLabel={copy.dropzoneBrowse}
                formatsLabel={copy.dropzoneFormatsImg}
                fileSelectedLabel={copy.fileSelected}
                removeLabel={copy.removeFile}
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
                {copy.discard}
              </Button>
              <Button
                type="submit"
                size="lg"
                className="h-11 rounded-md bg-primary text-white hover:bg-primary/90 px-7 font-semibold gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {copy.submit}
              </Button>
            </div>
          </form>
        )}

        {view === 'parsing' && (
          <ParsingState title={copy.parsingTitle} help={copy.parsingHelp} />
        )}

        {view === 'preview' && parseResult && (
          <PreviewState
            result={parseResult}
            copy={copy}
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

interface FormSectionProps {
  title: string
  help?: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}

function FormSection({ title, help, icon: Icon, children }: FormSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-primary">
            <Icon className="w-4.5 h-4.5" />
          </span>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-900 leading-tight">
            {title}
          </h2>
          {help && (
            <p className="text-xs text-slate-500 leading-relaxed mt-1 max-w-3xl">
              {help}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

interface FieldProps {
  label: string
  hint?: string
  required?: boolean
  error?: string
  className?: string
  children: React.ReactNode
}

function Field({ label, hint, required, error, className, children }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
          {hint}
        </span>
      )}
      {error && (
        <span className="mt-1 block text-[11px] leading-relaxed text-red-600">
          {error}
        </span>
      )}
    </label>
  )
}

interface DropzoneProps {
  file: File | null
  onSelect: (f: File | null) => void
  accept: string
  placeholder: string
  browseLabel: string
  formatsLabel: string
  fileSelectedLabel: string
  removeLabel: string
  error?: string
  requiredLabel?: string
}

function Dropzone({
  file,
  onSelect,
  accept,
  placeholder,
  browseLabel,
  formatsLabel,
  fileSelectedLabel,
  removeLabel,
  error,
}: DropzoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputId = `file-${Math.random().toString(36).slice(2, 8)}`

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onSelect(files[0])
  }

  return (
    <>
      {file ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-1">
              {fileSelectedLabel}
            </p>
            <p className="text-sm text-slate-800 font-medium truncate">{file.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {(file.size / 1024 / 1024).toFixed(2)} Mo
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            {removeLabel}
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            onFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : error
                ? 'border-red-300 bg-red-50/40'
                : 'border-slate-300 bg-slate-50/40 hover:border-slate-400 hover:bg-slate-50',
          )}
        >
          <Upload className="w-8 h-8 text-slate-400" />
          <p className="text-sm text-slate-600 text-center">
            {placeholder}
            <span className="font-semibold text-primary underline underline-offset-4">
              {browseLabel}
            </span>
          </p>
          <p className="text-[11px] text-slate-400">{formatsLabel}</p>
          <input
            id={inputId}
            type="file"
            accept={accept}
            onChange={(e) => onFiles(e.target.files)}
            className="sr-only"
          />
        </label>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-red-600">{error}</p>
      )}
    </>
  )
}

interface ParsingStateProps {
  title: string
  help: string
}

function ParsingState({ title, help }: ParsingStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center"
    >
      <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin mb-5" />
      <h2 className="text-xl font-bold text-slate-900 mb-3">{title}</h2>
      <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">{help}</p>
    </motion.div>
  )
}

interface PreviewStateProps {
  result: ParseResult
  copy: (typeof COPY)['fr']
  onSaveDraft: () => void
  onDiscard: () => void
  saving: boolean
  error: string | null
}

function PreviewState({ result, copy, onSaveDraft, onDiscard, saving, error }: PreviewStateProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 w-full"
      >
        {/* Header strip */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                {copy.resultTitle}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                {copy.resultIntro}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  {copy.confidence}
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
            </div>
          </div>
          {error && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Headings */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
            {copy.headingsLabel}
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
                  {
                    ({
                      book: 'Livre',
                      title: 'Titre',
                      chapter: 'Chap.',
                      section: 'Sect.',
                      subsection: 'Sous-s.',
                    } as Record<string, string>)[h.level] ?? h.level
                  }{' '}
                  {h.number}
                </span>
                <span>· {h.title_fr}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Articles */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
            {copy.articlesLabel}
            <span className="text-slate-400 tabular-nums">({result.articles.length})</span>
          </h3>
          <ul className="divide-y divide-slate-100">
            {result.articles.map((a, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-sm font-bold text-primary tabular-nums">
                    Art. {a.number}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {a.heading_path.join(' › ')}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">
                  {a.content_fr}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-800 mb-3">
              <AlertCircle className="w-3.5 h-3.5" />
              {copy.warnings}
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
            {copy.discard}
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
            {copy.saveDraft}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
