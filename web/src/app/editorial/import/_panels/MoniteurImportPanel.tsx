'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { useLanguage } from '@/i18n/LanguageContext'
import {
  createMoniteurIssue,
  extractMoniteurMetadata,
  parseMoniteurIssue,
  setMoniteurSommaire,
  uploadMoniteurPdf,
  type ExtractedMoniteurMetadata,
  type SommaireEntryInput,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const COPY = {
  fr: {
    step: 'Étape',
    s1Title: 'Téléverser le PDF',
    s1Help:
      "Glissez le PDF du Moniteur ici. La page de couverture est lue automatiquement pour pré-remplir les métadonnées.",
    s2Title: 'Vérifier les métadonnées',
    s2Help:
      "Corrigez les champs détectés automatiquement, puis lancez l'import.",
    dropPrompt: 'Déposez le PDF ou cliquez pour parcourir',
    dropHint: 'PDF uniquement',
    extracting: 'Lecture de la page de couverture…',
    extractFailed: 'Extraction impossible — saisissez les champs manuellement.',
    autoFilled: 'Métadonnées détectées automatiquement',
    lowConfidence: 'Faible confiance — vérifiez',
    number: 'Numéro',
    numberHint: 'Ex. 47, 47-bis',
    year: 'Année',
    pubDate: 'Date de publication',
    edition: 'Mention spéciale (facultatif)',
    editionHint: 'Ex. Numéro spécial',
    s3Title: 'Sommaire (facultatif)',
    s3Help:
      "Pré-remplissez le sommaire pour donner à l'OCR la structure exacte du numéro. Sinon, l'analyse heuristique tentera de détecter les bornes seule.",
    addEntry: 'Ajouter un document',
    skipSommaire: "Sans sommaire — laisser l'OCR détecter",
    sommaireType: 'Type',
    sommaireTitle: 'Titre',
    sommaireNumber: 'N° (facultatif)',
    sommairePages: 'Pages',
    sommairePagesHint: 'Ex. 3 → 7',
    sommairePageFrom: 'De',
    sommairePageTo: 'À',
    removeEntry: 'Retirer',
    submit: "Importer et lancer l'analyse",
    submitting: 'Création du numéro…',
    uploading: 'Téléversement du PDF…',
    sendingSommaire: 'Envoi du sommaire…',
    parsing: 'Analyse en cours…',
    success: 'Import terminé.',
    successWithCandidates: (n: number) =>
      `${n} candidat${n > 1 ? 's' : ''} détecté${n > 1 ? 's' : ''}.`,
    parsingHint:
      "L'analyse OCR continue en arrière-plan. Les candidats apparaîtront sur la page de revue dès qu'ils seront détectés.",
    review: 'Voir les candidats',
    reset: 'Importer un autre numéro',
    chooseDifferent: 'Choisir un autre fichier',
  },
  ht: {
    step: 'Etap',
    s1Title: 'Telechaje PDF la',
    s1Help:
      'Glise PDF Moniteur a la a. Paj kouvèti a li otomatikman pou pre-ranpli metadòn yo.',
    s2Title: 'Verifye metadòn yo',
    s2Help: 'Korije chan yo, epi lanse enpòtasyon an.',
    dropPrompt: 'Depoze PDF la oswa klike pou navige',
    dropHint: 'PDF sèlman',
    extracting: 'Ap li paj kouvèti a…',
    extractFailed: 'Pa ka ekstrè — antre chan yo nan men.',
    autoFilled: 'Metadòn detekte otomatikman',
    lowConfidence: 'Konfyans fèb — verifye',
    number: 'Nimewo',
    numberHint: 'Egz. 47, 47-bis',
    year: 'Ane',
    pubDate: 'Dat piblikasyon',
    edition: 'Mansyon espesyal (opsyonèl)',
    editionHint: 'Egz. Nimewo espesyal',
    s3Title: 'Somè (opsyonèl)',
    s3Help:
      "Pre-ranpli somè a pou bay OCR a estrikti egzakt nimewo a. Si non, analiz otomatik la ap eseye detekte yo pou kont li.",
    addEntry: 'Ajoute yon dokiman',
    skipSommaire: 'San somè — kite OCR a detekte',
    sommaireType: 'Tip',
    sommaireTitle: 'Tit',
    sommaireNumber: 'N° (opsyonèl)',
    sommairePages: 'Paj',
    sommairePagesHint: 'Egz. 3 → 7',
    sommairePageFrom: 'Soti',
    sommairePageTo: 'Rive',
    removeEntry: 'Retire',
    submit: 'Enpòte epi analize',
    submitting: 'Ap kreye nimewo a…',
    uploading: 'Ap telechaje PDF la…',
    sendingSommaire: 'Ap voye somè a…',
    parsing: 'Analiz an kou…',
    success: 'Enpòtasyon fini.',
    successWithCandidates: (n: number) =>
      `${n} kandida detekte.`,
    parsingHint:
      "Analiz OCR la kontinye nan background. Kandida yo ap parèt sou paj revizyon an lè yo detekte.",
    review: 'Wè kandida yo',
    reset: 'Enpòte yon lòt nimewo',
    chooseDifferent: 'Chwazi yon lòt fichye',
  },
}

type Phase =
  | 'idle'
  | 'extracting'
  | 'review'
  | 'creating'
  | 'uploading'
  | 'sendingSommaire'
  | 'parsing'
  | 'done'

// Document types the editor can pick from when pre-filling the sommaire.
// Mirrors backend MoniteurDocumentType. Kept here (not imported) because
// the OpenAPI types are a frozen string literal union and we need labels
// alongside the values.
const SOMMAIRE_DOC_TYPES: ReadonlyArray<{
  value: SommaireEntryInput['detected_category']
  fr: string
  ht: string
}> = [
  { value: 'loi', fr: 'Loi', ht: 'Lwa' },
  { value: 'decret', fr: 'Décret', ht: 'Dekrè' },
  { value: 'arrete', fr: 'Arrêté', ht: 'Arete' },
  { value: 'circulaire', fr: 'Circulaire', ht: 'Sirkilè' },
  { value: 'convention', fr: 'Convention', ht: 'Konvansyon' },
  { value: 'ordonnance', fr: 'Ordonnance', ht: 'Òdonans' },
  { value: 'communique', fr: 'Communiqué', ht: 'Kominike' },
  { value: 'promulgation', fr: 'Promulgation', ht: 'Pwomilgasyon' },
  { value: 'errata', fr: 'Errata', ht: 'Erata' },
  { value: 'autre', fr: 'Autre', ht: 'Lòt' },
]

// One row in the editor-facing sommaire form. Distinguished from the API
// type by carrying a synthetic uid so React can key list items as the
// editor adds / removes entries.
type SommaireRow = SommaireEntryInput & { uid: string }

function emptyRow(): SommaireRow {
  return {
    uid: Math.random().toString(36).slice(2),
    detected_category: 'loi',
    detected_title: '',
    detected_number: '',
    page_from: 1,
    page_to: 1,
  }
}

export default function MoniteurImportPanel() {
  const router = useRouter()
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  const fileInputRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().slice(0, 10)
  const thisYear = new Date().getFullYear()

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<ExtractedMoniteurMetadata | null>(
    null,
  )
  // Form state — separate from `metadata` so the editor's edits don't get
  // overwritten by re-renders. Initialized when metadata arrives.
  const [number, setNumber] = useState('')
  const [year, setYear] = useState<number>(thisYear)
  const [pubDate, setPubDate] = useState(today)
  const [edition, setEdition] = useState('')

  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [issueId, setIssueId] = useState<number | null>(null)
  const [candidatesCount, setCandidatesCount] = useState(0)

  // Sommaire pre-fill — optional. If the editor adds rows, they're sent
  // to the backend before /parse so the OCR pipeline slices the PDF by
  // declared page range instead of running heuristic boundary detection.
  const [sommaireRows, setSommaireRows] = useState<SommaireRow[]>([])

  function addSommaireRow() {
    setSommaireRows((rows) => [...rows, emptyRow()])
  }
  function updateSommaireRow(uid: string, patch: Partial<SommaireRow>) {
    setSommaireRows((rows) =>
      rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    )
  }
  function removeSommaireRow(uid: string) {
    setSommaireRows((rows) => rows.filter((r) => r.uid !== uid))
  }

  async function handleFileSelected(file: File) {
    setPdfFile(file)
    setErr(null)
    setPhase('extracting')
    setMetadata(null)
    try {
      const md = await extractMoniteurMetadata(file)
      setMetadata(md)
      // Pre-fill form fields from extraction; fall back to defaults.
      if (md.number) setNumber(md.number)
      if (md.year) setYear(md.year)
      if (md.publication_date) setPubDate(md.publication_date)
      if (md.edition_label) setEdition(md.edition_label)
      setPhase('review')
    } catch (e: any) {
      // Extractor failure isn't fatal — let the editor enter values manually.
      setErr(copy.extractFailed)
      setPhase('review')
    }
  }

  function reset() {
    setPdfFile(null)
    setMetadata(null)
    setNumber('')
    setYear(thisYear)
    setPubDate(today)
    setEdition('')
    setPhase('idle')
    setErr(null)
    setIssueId(null)
    setCandidatesCount(0)
    setSommaireRows([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pdfFile || !number.trim()) return
    setErr(null)
    try {
      setPhase('creating')
      const issue = await createMoniteurIssue({
        number: number.trim(),
        year,
        publication_date: pubDate || null,
        edition_label: edition.trim() || null,
      })
      setIssueId(issue.id)
      setPhase('uploading')
      await uploadMoniteurPdf(issue.id, pdfFile)

      // If the editor pre-filled the sommaire, send it now — the parse
      // pipeline will detect the pre-existing entries and switch to
      // page-range slicing instead of heuristic boundary detection.
      const filledRows = sommaireRows.filter(
        (r) => r.detected_category && r.page_from && r.page_to,
      )
      if (filledRows.length > 0) {
        setPhase('sendingSommaire')
        await setMoniteurSommaire(
          issue.id,
          filledRows.map((r) => ({
            detected_category: r.detected_category,
            detected_title: r.detected_title?.trim() || null,
            detected_number: r.detected_number?.trim() || null,
            page_from: r.page_from,
            page_to: r.page_to,
          })),
        )
      }

      // Kick off parsing without blocking. Real Moniteur PDFs can be 200+
      // scanned pages — synchronous OCR takes 10-20 min and would time out
      // any HTTP request. The editor sees the issue land in the dashboard
      // (status: ocr_pending → parsed) and reviews candidates from there.
      // TODO(worker): replace fire-and-forget with an RQ job + polling.
      setPhase('parsing')
      // Parsing can be slow for large scanned PDFs (10+ min), but we
      // want the spinner visible while it runs. The .then/.catch
      // transition to 'done' when the server responds (or times out).
      // TODO(worker): replace with an RQ job + polling via getMoniteurIssue.
      parseMoniteurIssue(issue.id)
        .then((result) => {
          setCandidatesCount(result.entries_count ?? 0)
          setPhase('done')
        })
        .catch(() => {
          // Parse failure is non-fatal — issue + PDF are saved; the
          // editor can re-run from the review page.
          setPhase('done')
        })
    } catch (e: any) {
      setErr(e?.body?.detail ?? String(e))
      // Stay on review so the editor can correct (e.g., duplicate number).
      setPhase('review')
    }
  }

  function goReview() {
    if (issueId) router.push(`/editorial/moniteur/${issueId}/review`)
  }

  return (
    <div className="py-2 lg:py-4 w-full">
      <div className="space-y-6 w-full">
        {/* Step 1 — drop PDF */}
        <StepCard
          n={1}
          stepLabel={copy.step}
          title={copy.s1Title}
          help={copy.s1Help}
          active={phase === 'idle' || phase === 'extracting'}
          done={phase !== 'idle' && phase !== 'extracting'}
        >
          {!pdfFile ? (
            <Dropzone
              prompt={copy.dropPrompt}
              hint={copy.dropHint}
              onFile={handleFileSelected}
              inputRef={fileInputRef}
            />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {pdfFile.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(pdfFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
              {(phase === 'idle' || phase === 'review') && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-xs font-semibold text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  {copy.chooseDifferent}
                </button>
              )}
            </div>
          )}

          {phase === 'extracting' && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {copy.extracting}
            </p>
          )}
        </StepCard>

        {/* Step 2 — review/correct metadata + submit */}
        <StepCard
          n={2}
          stepLabel={copy.step}
          title={copy.s2Title}
          help={copy.s2Help}
          active={phase === 'review' || phase === 'creating' || phase === 'uploading' || phase === 'parsing'}
          done={phase === 'done'}
        >
          {metadata && (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <Sparkles className="w-3.5 h-3.5" />
              {copy.autoFilled}
            </div>
          )}

          <form onSubmit={handleSubmit} id="moniteur-import-form" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={copy.number}
              hint={copy.numberHint}
              autoFilled={metadata?.confidence?.number}
              lowConfidenceLabel={copy.lowConfidence}
            >
              <input
                required
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                disabled={phase !== 'review' && phase !== 'idle'}
                className={inputCls}
              />
            </Field>
            <Field
              label={copy.year}
              autoFilled={metadata?.confidence?.year}
              lowConfidenceLabel={copy.lowConfidence}
            >
              <input
                required
                type="number"
                min={1800}
                max={2200}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={phase !== 'review' && phase !== 'idle'}
                className={inputCls}
              />
            </Field>
            <Field
              label={copy.pubDate}
              autoFilled={metadata?.confidence?.publication_date}
              lowConfidenceLabel={copy.lowConfidence}
            >
              <input
                type="date"
                value={pubDate}
                onChange={(e) => setPubDate(e.target.value)}
                disabled={phase !== 'review' && phase !== 'idle'}
                className={inputCls}
              />
            </Field>
            <Field
              label={copy.edition}
              hint={copy.editionHint}
              autoFilled={metadata?.confidence?.edition_label}
              lowConfidenceLabel={copy.lowConfidence}
            >
              <input
                type="text"
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
                disabled={phase !== 'review' && phase !== 'idle'}
                className={inputCls}
              />
            </Field>

          </form>
        </StepCard>

        {/* Step 3 — sommaire pre-fill (optional). The form's submit
            button (in the action panel below) implicitly includes the
            sommaire rows because handleSubmit reads `sommaireRows` from
            React state, not from form fields. */}
        <StepCard
          n={3}
          stepLabel={copy.step}
          title={copy.s3Title}
          help={copy.s3Help}
          active={
            phase === 'review' ||
            phase === 'creating' ||
            phase === 'uploading' ||
            phase === 'sendingSommaire' ||
            phase === 'parsing'
          }
          done={phase === 'done'}
        >
          {sommaireRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-5 py-6 text-center">
              <p className="text-sm text-slate-500 mb-3">
                {copy.skipSommaire}
              </p>
              <button
                type="button"
                onClick={addSommaireRow}
                disabled={phase !== 'review' && phase !== 'idle'}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary/40 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {copy.addEntry}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sommaireRows.map((row, i) => (
                <SommaireRowEditor
                  key={row.uid}
                  row={row}
                  index={i}
                  copy={copy}
                  lang={lang}
                  disabled={phase !== 'review' && phase !== 'idle'}
                  onChange={(patch) => updateSommaireRow(row.uid, patch)}
                  onRemove={() => removeSommaireRow(row.uid)}
                />
              ))}
              <button
                type="button"
                onClick={addSommaireRow}
                disabled={phase !== 'review' && phase !== 'idle'}
                className="self-start inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary/40 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {copy.addEntry}
              </button>
            </div>
          )}
        </StepCard>

        {/* Action panel — submit / done / reset buttons. Outside the
            StepCards so the action row is always visible at the bottom
            of the flow regardless of which step is "active". */}
        <div className="flex items-center justify-between gap-3 px-2">
          {phase === 'creating' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {copy.submitting}
            </span>
          )}
          {phase === 'uploading' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {copy.uploading}
            </span>
          )}
          {phase === 'sendingSommaire' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {copy.sendingSommaire}
            </span>
          )}
          {phase === 'parsing' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {copy.parsing}
            </span>
          )}
          {phase === 'done' && (
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {copy.success}{' '}
                {candidatesCount > 0 &&
                  copy.successWithCandidates(candidatesCount)}
              </span>
              {candidatesCount === 0 && (
                <span className="text-xs text-slate-500">
                  {copy.parsingHint}
                </span>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            {phase === 'done' ? (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-primary/40"
                >
                  {copy.reset}
                </button>
                <button
                  type="button"
                  onClick={goReview}
                  className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary/90"
                >
                  {copy.review}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="submit"
                form="moniteur-import-form"
                disabled={
                  !pdfFile ||
                  !number.trim() ||
                  phase === 'creating' ||
                  phase === 'uploading' ||
                  phase === 'sendingSommaire' ||
                  phase === 'parsing' ||
                  phase === 'extracting'
                }
                className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                {copy.submit}
              </button>
            )}
          </div>
        </div>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            {err}
          </div>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-50 disabled:text-slate-400'

function Field({
  label,
  hint,
  autoFilled,
  lowConfidenceLabel,
  children,
}: {
  label: string
  hint?: string
  /** Confidence score from the extractor, 0-1. Undefined = field wasn't
   *  auto-filled (manual input). <0.6 = flagged as low-confidence. */
  autoFilled?: number
  lowConfidenceLabel?: string
  children: React.ReactNode
}) {
  const lowConfidence = autoFilled !== undefined && autoFilled < 0.6
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-primary/65 inline-flex items-center gap-2">
        {label}
        {autoFilled !== undefined && !lowConfidence && (
          <Sparkles
            className="w-3 h-3 text-amber-500"
            aria-label="Auto-filled"
          />
        )}
        {lowConfidence && lowConfidenceLabel && (
          <span className="ml-1 inline-flex items-center gap-1 text-[9px] font-bold normal-case tracking-normal text-amber-700">
            ⚠ {lowConfidenceLabel}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

/**
 * One row of the sommaire pre-fill editor — type, title, optional N°,
 * and a page range. Visually a card so it stays readable when several
 * rows stack up. Inline grid keeps fields aligned even on narrow
 * viewports.
 */
function SommaireRowEditor({
  row,
  index,
  copy,
  lang,
  disabled,
  onChange,
  onRemove,
}: {
  row: SommaireRow
  index: number
  copy: (typeof COPY)['fr']
  lang: 'fr' | 'ht'
  disabled: boolean
  onChange: (patch: Partial<SommaireRow>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
          #{String(index + 1).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={copy.removeEntry}
          className="text-slate-400 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Type — 3 columns */}
        <div className="sm:col-span-3 flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/65">
            {copy.sommaireType}
          </span>
          <Select
            value={row.detected_category}
            disabled={disabled}
            onValueChange={(v) =>
              onChange({
                detected_category:
                  v as SommaireEntryInput['detected_category'],
              })
            }
          >
            <SelectTrigger
              size="default"
              className="w-full h-11 bg-white border-slate-300 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-primary/30 data-[state=open]:border-primary"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
              {SOMMAIRE_DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {lang === 'fr' ? t.fr : t.ht}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Title — 5 columns */}
        <label className="sm:col-span-5 flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/65">
            {copy.sommaireTitle}
          </span>
          <input
            type="text"
            value={row.detected_title ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ detected_title: e.target.value })}
            className={inputCls}
          />
        </label>
        {/* N° — 2 columns */}
        <label className="sm:col-span-2 flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/65">
            {copy.sommaireNumber}
          </span>
          <input
            type="text"
            value={row.detected_number ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ detected_number: e.target.value })}
            className={inputCls}
          />
        </label>
        {/* Pages — 2 columns, two number inputs */}
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/65">
            {copy.sommairePages}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={row.page_from}
              disabled={disabled}
              onChange={(e) =>
                onChange({ page_from: Number(e.target.value) || 1 })
              }
              aria-label={copy.sommairePageFrom}
              className={cn(inputCls, 'flex-1 min-w-0 px-2 text-center')}
            />
            <span className="text-slate-300 text-xs">→</span>
            <input
              type="number"
              min={1}
              value={row.page_to}
              disabled={disabled}
              onChange={(e) =>
                onChange({ page_to: Number(e.target.value) || 1 })
              }
              aria-label={copy.sommairePageTo}
              className={cn(inputCls, 'flex-1 min-w-0 px-2 text-center')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Dropzone({
  prompt,
  hint,
  onFile,
  inputRef,
}: {
  prompt: string
  hint: string
  onFile: (f: File) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        const f = e.dataTransfer.files?.[0]
        if (f && f.type === 'application/pdf') onFile(f)
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 cursor-pointer transition-colors',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-slate-300 bg-slate-50/50 hover:border-primary/40 hover:bg-slate-50',
      )}
    >
      <Upload className="w-8 h-8 text-slate-400" />
      <span className="text-sm font-semibold text-slate-700">{prompt}</span>
      <span className="text-xs text-slate-500">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
    </label>
  )
}

function StepCard({
  n,
  stepLabel,
  title,
  help,
  active,
  done,
  children,
}: {
  n: number
  stepLabel: string
  title: string
  help?: string
  active: boolean
  done: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-xl border bg-white p-6 lg:p-7 transition-colors',
        done
          ? 'border-emerald-200 bg-emerald-50/30'
          : active
            ? 'border-primary/40 shadow-sm'
            : 'border-slate-200 opacity-60',
      )}
    >
      <header className="flex items-start gap-3 mb-4">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold tabular-nums border flex-shrink-0',
            done
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
              : active
                ? 'bg-primary text-white border-primary'
                : 'bg-slate-100 text-slate-500 border-slate-200',
          )}
        >
          {done ? '✓' : n}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {stepLabel} {n}
          </span>
          <h2 className="text-base lg:text-lg font-bold text-primary leading-tight">
            {title}
          </h2>
          {help && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {help}
            </p>
          )}
        </div>
      </header>
      <div>{children}</div>
    </section>
  )
}
