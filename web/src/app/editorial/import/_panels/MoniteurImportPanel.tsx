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

import { useT } from '@/i18n/useT'
import {
  createMoniteurIssue,
  extractMoniteurMetadata,
  parseMoniteurIssue,
  setMoniteurSommaire,
  uploadMoniteurFile,
  uploadMoniteurTranscript,
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
import { Field } from '@/components/forms/Field'
import { Dropzone } from '@/components/forms/Dropzone'
import { ErrorBanner } from '@/components/shared/ErrorBanner'

// Copy lives at `editorial.import.moniteur.*` in i18n/{fr,ht}.ts.

type Phase =
  | 'idle'
  | 'extracting'
  | 'review'
  | 'creating'
  | 'uploadingScan'
  | 'uploadingSource'
  | 'sendingSommaire'
  | 'parsing'
  | 'done'

type T = (key: string, opts?: { fallback?: string }) => string

// Document types the editor can pick from when pre-filling the sommaire.
// Mirrors backend MoniteurDocumentType. Kept here (not imported) because
// the OpenAPI types are a frozen string literal union and we need labels
// alongside the values.
const SOMMAIRE_DOC_TYPE_VALUES: ReadonlyArray<
  SommaireEntryInput['detected_category']
> = [
  'constitution',
  'loi',
  'decret',
  'arrete',
  'circulaire',
  'convention',
  'ordonnance',
  'communique',
  'correspondance',
  'promulgation',
  'errata',
  'autre',
]

// One row in the editor-facing sommaire form. Distinguished from the API
// type by carrying a synthetic uid so React can key list items as the
// editor adds / removes entries.
type SommaireRow = SommaireEntryInput & { uid: string }

function emptyRow(defaultDate?: string | null): SommaireRow {
  return {
    uid: Math.random().toString(36).slice(2),
    detected_category: 'loi',
    detected_title: '',
    detected_number: '',
    detected_date: defaultDate || null,
    page_from: 1,
    page_to: 1,
  }
}

export default function MoniteurImportPanel() {
  const router = useRouter()
  const { t, language } = useT()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'

  // Local helper — successWithCandidates interpolates a runtime value
  // (the candidate count), so it stays a function rather than going into
  // the i18n catalogue (which only carries strings).
  const successWithCandidates = (n: number): string =>
    lang === 'ht'
      ? `${n} kandida detekte.`
      : `${n} candidat${n > 1 ? 's' : ''} détecté${n > 1 ? 's' : ''}.`

  const sourceInputRef = useRef<HTMLInputElement>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().slice(0, 10)
  const thisYear = new Date().getFullYear()

  // Document source = transcribed PDF/DOCX (primary for metadata + parse).
  // Scan = scanned original (archive; OCR fallback only if no source).
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [scanFile, setScanFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<ExtractedMoniteurMetadata | null>(
    null,
  )
  // Form state — separate from `metadata` so the editor's edits don't get
  // overwritten by re-renders. Initialized when metadata arrives.
  const [number, setNumber] = useState('')
  const [year, setYear] = useState<number>(thisYear)
  const [pubDate, setPubDate] = useState(today)
  const [edition, setEdition] = useState('')
  const [director, setDirector] = useState('')
  // Director's institutional title in parens on the cover page — e.g.
  // "Major Forces Armées d'Haïti", "Secrétaire d'État à la Communication".
  // Auto-filled from the PDF/DOCX when present.
  const [directorRole, setDirectorRole] = useState('')

  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [issueId, setIssueId] = useState<number | null>(null)
  const [candidatesCount, setCandidatesCount] = useState(0)

  // Sommaire pre-fill — optional. If the editor adds rows, they're sent
  // to the backend before /parse so the OCR pipeline slices the PDF by
  // declared page range instead of running heuristic boundary detection.
  const [sommaireRows, setSommaireRows] = useState<SommaireRow[]>([])
  const [sommaireAutoFilled, setSommaireAutoFilled] = useState(false)

  function addSommaireRow() {
    // Default the per-entry date to the issue's publication date —
    // most Moniteur entries share the issue date; an editor only needs
    // to touch this field on the rare entry where the underlying decree
    // was signed earlier or the date differs from the issue header.
    setSommaireRows((rows) => [...rows, emptyRow(pubDate)])
  }
  function updateSommaireRow(uid: string, patch: Partial<SommaireRow>) {
    setSommaireRows((rows) =>
      rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    )
  }
  function removeSommaireRow(uid: string) {
    setSommaireRows((rows) => rows.filter((r) => r.uid !== uid))
  }

  /** Run metadata extraction on a file and auto-fill form fields. */
  async function runMetadataExtraction(file: File) {
    setErr(null)
    setPhase('extracting')
    setMetadata(null)
    try {
      const md = await extractMoniteurMetadata(file)
      setMetadata(md)
      if (md.number) setNumber(md.number)
      if (md.year) setYear(md.year)
      if (md.publication_date) setPubDate(md.publication_date)
      if (md.edition_label) setEdition(md.edition_label)
      if (md.director) setDirector(md.director)
      if (md.director_role) setDirectorRole(md.director_role)
      if (md.suggested_sommaire?.length) {
        setSommaireAutoFilled(true)
        // Default each suggested row's date to the issue's
        // publication_date pulled out of the same metadata pass — the
        // extractor doesn't surface per-entry dates yet, but the issue
        // date is the right baseline for nearly every entry.
        const defaultDate = md.publication_date ?? null
        setSommaireRows(
          md.suggested_sommaire.map((s) => ({
            uid: Math.random().toString(36).slice(2),
            detected_category: s.detected_category,
            detected_title: s.detected_title ?? '',
            detected_number: s.detected_number ?? '',
            detected_date: defaultDate,
            page_from: s.page_from,
            page_to: s.page_to,
          })),
        )
      }
      setPhase('review')
    } catch {
      setErr(t('editorial.import.moniteur.extractFailed'))
      setPhase('review')
    }
  }

  /** Document source selected — always extract metadata from it. */
  function handleSourceSelected(file: File) {
    setSourceFile(file)
    runMetadataExtraction(file)
  }

  /** Scan selected — extract metadata only if no source file present. */
  function handleScanSelected(file: File) {
    setScanFile(file)
    if (!sourceFile) {
      runMetadataExtraction(file)
    } else if (phase === 'idle') {
      // Source already set and metadata already extracted — just stay in review.
      setPhase('review')
    }
  }

  function reset() {
    setSourceFile(null)
    setScanFile(null)
    setMetadata(null)
    setNumber('')
    setYear(thisYear)
    setPubDate(today)
    setEdition('')
    setDirector('')
    setDirectorRole('')
    setPhase('idle')
    setErr(null)
    setIssueId(null)
    setCandidatesCount(0)
    setSommaireRows([])
    setSommaireAutoFilled(false)
    if (sourceInputRef.current) sourceInputRef.current.value = ''
    if (scanInputRef.current) scanInputRef.current.value = ''
  }

  const hasAnyFile = sourceFile || scanFile

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasAnyFile || !number.trim()) return
    setErr(null)
    try {
      setPhase('creating')
      const issue = await createMoniteurIssue({
        number: number.trim(),
        year,
        publication_date: pubDate || null,
        edition_label: edition.trim() || null,
        director: director.trim() || null,
        director_role: directorRole.trim() || null,
      })
      setIssueId(issue.id)

      // Upload scan → file_url (archival; OCR fallback).
      if (scanFile) {
        setPhase('uploadingScan')
        await uploadMoniteurFile(issue.id, scanFile)
      }

      // Upload document source → transcript_url (primary for parse, no OCR).
      if (sourceFile) {
        setPhase('uploadingSource')
        await uploadMoniteurTranscript(issue.id, sourceFile)
      }

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
            detected_date: r.detected_date || null,
            page_from: r.page_from,
            page_to: r.page_to,
          })),
        )
      }

      // Kick off parsing. If source is present → text extraction (fast).
      // If only scan → OCR pipeline (can be slow for 200+ page scans).
      setPhase('parsing')
      parseMoniteurIssue(issue.id)
        .then((result) => {
          setCandidatesCount(result.entries_count ?? 0)
          setPhase('done')
        })
        .catch(() => {
          // Parse failure is non-fatal — files are saved; the editor
          // can re-run from the review page.
          setPhase('done')
        })
    } catch (e: any) {
      setErr(e?.body?.detail ?? String(e))
      setPhase('review')
    }
  }

  function goReview() {
    // The issue page accepts either a numeric id (legacy permalink) or
    // a date slug. ``?view=editor`` opens it straight in the editor
    // panel — same target as the all-issues dashboard.
    if (issueId) router.push(`/moniteur/${issueId}?view=editor`)
  }

  return (
    <div className="py-2 lg:py-4 w-full">
      <div className="space-y-6 w-full">
        {/* Step 1 — two file slots: document source + scan */}
        <StepCard
          n={1}
          stepLabel={t('editorial.import.moniteur.step')}
          title={t('editorial.import.moniteur.s1Title')}
          help={t('editorial.import.moniteur.s1Help')}
          active={phase === 'idle' || phase === 'extracting'}
          done={phase !== 'idle' && phase !== 'extracting'}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Document source — transcribed PDF/DOCX (primary) */}
            <FileSlot
              label={t('editorial.import.moniteur.sourceLabel')}
              help={t('editorial.import.moniteur.sourceHelp')}
              file={sourceFile}
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
              dropPrompt={t('editorial.import.moniteur.sourceDrop')}
              formatHint={t('editorial.import.moniteur.sourceHint')}
              disabled={phase !== 'idle' && phase !== 'review'}
              inputRef={sourceInputRef}
              onSelect={(f) => {
                if (!f) return
                const name = f.name.toLowerCase()
                if (name.endsWith('.pdf') || name.endsWith('.docx')) {
                  handleSourceSelected(f)
                }
              }}
              onRemove={() => {
                setSourceFile(null)
                setMetadata(null)
                if (sourceInputRef.current) sourceInputRef.current.value = ''
                // If scan is present, re-extract metadata from it.
                if (scanFile) {
                  runMetadataExtraction(scanFile)
                } else {
                  setPhase('idle')
                }
              }}
            />

            {/* Scan du Moniteur — scanned original (archive) */}
            <FileSlot
              label={t('editorial.import.moniteur.scanLabel')}
              help={t('editorial.import.moniteur.scanHelp')}
              file={scanFile}
              accept="application/pdf"
              dropPrompt={t('editorial.import.moniteur.scanDrop')}
              formatHint={t('editorial.import.moniteur.scanHint')}
              disabled={phase !== 'idle' && phase !== 'review'}
              inputRef={scanInputRef}
              onSelect={(f) => {
                if (!f) return
                const name = f.name.toLowerCase()
                if (name.endsWith('.pdf')) {
                  handleScanSelected(f)
                }
              }}
              onRemove={() => {
                setScanFile(null)
                if (scanInputRef.current) scanInputRef.current.value = ''
                if (!sourceFile) {
                  setMetadata(null)
                  setPhase('idle')
                }
              }}
            />
          </div>

          {phase === 'extracting' && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('editorial.import.moniteur.extracting')}
            </p>
          )}
        </StepCard>

        {/* Step 2 — review/correct metadata + submit */}
        <StepCard
          n={2}
          stepLabel={t('editorial.import.moniteur.step')}
          title={t('editorial.import.moniteur.s2Title')}
          help={t('editorial.import.moniteur.s2Help')}
          active={phase === 'review' || phase === 'creating' || phase === 'uploadingScan' || phase === 'uploadingSource' || phase === 'parsing'}
          done={phase === 'done'}
        >
          {metadata && (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <Sparkles className="w-3.5 h-3.5" />
              {t('editorial.import.moniteur.autoFilled')}
            </div>
          )}

          <form onSubmit={handleSubmit} id="moniteur-import-form" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={t('editorial.import.moniteur.number')}
              hint={t('editorial.import.moniteur.numberHint')}
              autoFilled={metadata?.confidence?.number}
              lowConfidenceLabel={t('editorial.import.moniteur.lowConfidence')}
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
              label={t('editorial.import.moniteur.year')}
              autoFilled={metadata?.confidence?.year}
              lowConfidenceLabel={t('editorial.import.moniteur.lowConfidence')}
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
              label={t('editorial.import.moniteur.pubDate')}
              autoFilled={metadata?.confidence?.publication_date}
              lowConfidenceLabel={t('editorial.import.moniteur.lowConfidence')}
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
              label={t('editorial.import.moniteur.edition')}
              hint={t('editorial.import.moniteur.editionHint')}
              autoFilled={metadata?.confidence?.edition_label}
              lowConfidenceLabel={t('editorial.import.moniteur.lowConfidence')}
            >
              <input
                type="text"
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
                disabled={phase !== 'review' && phase !== 'idle'}
                className={inputCls}
              />
            </Field>
            <Field
              label={t('editorial.import.moniteur.director')}
              hint={t('editorial.import.moniteur.directorHint')}
              autoFilled={metadata?.confidence?.director}
              lowConfidenceLabel={t('editorial.import.moniteur.lowConfidence')}
            >
              <input
                type="text"
                value={director}
                onChange={(e) => setDirector(e.target.value)}
                disabled={phase !== 'review' && phase !== 'idle'}
                className={inputCls}
                placeholder={director ? undefined : 'Ex. : Henry Robert MARC-CHARLES'}
              />
            </Field>
            <Field
              label={t('editorial.import.moniteur.directorRole')}
              hint={t('editorial.import.moniteur.directorRoleHint')}
              autoFilled={metadata?.confidence?.director_role}
              lowConfidenceLabel={t('editorial.import.moniteur.lowConfidence')}
            >
              <input
                type="text"
                value={directorRole}
                onChange={(e) => setDirectorRole(e.target.value)}
                disabled={phase !== 'review' && phase !== 'idle'}
                className={inputCls}
                placeholder={
                  directorRole
                    ? undefined
                    : "Ex. : Major des Forces Armées d'Haïti"
                }
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
          stepLabel={t('editorial.import.moniteur.step')}
          title={t('editorial.import.moniteur.s3Title')}
          help={t('editorial.import.moniteur.s3Help')}
          active={
            phase === 'review' ||
            phase === 'creating' ||
            phase === 'uploadingScan' ||
            phase === 'uploadingSource' ||
            phase === 'sendingSommaire' ||
            phase === 'parsing'
          }
          done={phase === 'done'}
        >
          {sommaireAutoFilled && sommaireRows.length > 0 && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <Sparkles className="w-3.5 h-3.5" />
              {t('editorial.import.moniteur.sommaireAutoFilled')}
            </div>
          )}

          {sommaireRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-5 py-6 text-center">
              <p className="text-sm text-slate-500 mb-3">
                {t('editorial.import.moniteur.skipSommaire')}
              </p>
              <button
                type="button"
                onClick={addSommaireRow}
                disabled={phase !== 'review' && phase !== 'idle'}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary/40 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('editorial.import.moniteur.addEntry')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sommaireRows.map((row, i) => (
                <SommaireRowEditor
                  key={row.uid}
                  row={row}
                  index={i}
                  t={t}
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
                {t('editorial.import.moniteur.addEntry')}
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
              {t('editorial.import.moniteur.submitting')}
            </span>
          )}
          {phase === 'uploadingScan' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('editorial.import.moniteur.uploading')}
            </span>
          )}
          {phase === 'uploadingSource' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('editorial.import.moniteur.uploadingSource')}
            </span>
          )}
          {phase === 'sendingSommaire' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('editorial.import.moniteur.sendingSommaire')}
            </span>
          )}
          {phase === 'parsing' && (
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('editorial.import.moniteur.parsing')}
            </span>
          )}
          {phase === 'done' && (
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {t('editorial.import.moniteur.success')}{' '}
                {candidatesCount > 0 &&
                  successWithCandidates(candidatesCount)}
              </span>
              {candidatesCount === 0 && (
                <span className="text-xs text-slate-500">
                  {t('editorial.import.moniteur.parsingHint')}
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
                  {t('editorial.import.moniteur.reset')}
                </button>
                <button
                  type="button"
                  onClick={goReview}
                  className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary/90"
                >
                  {t('editorial.import.moniteur.review')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="submit"
                form="moniteur-import-form"
                disabled={
                  !hasAnyFile ||
                  !number.trim() ||
                  phase === 'creating' ||
                  phase === 'uploadingScan' ||
                  phase === 'uploadingSource' ||
                  phase === 'sendingSommaire' ||
                  phase === 'parsing' ||
                  phase === 'extracting'
                }
                className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                {t('editorial.import.moniteur.submit')}
              </button>
            )}
          </div>
        </div>

        {err && <ErrorBanner density="compact">{err}</ErrorBanner>}
      </div>
    </div>
  )
}

const inputCls =
  'w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-50 disabled:text-slate-400'

// Shared label style for the sommaire-row form. ``whitespace-nowrap``
// keeps multi-word labels on a single line so the input baselines
// don't drift between columns — "N° (facultatif)" used to wrap and
// pushed its input below the others.
const labelCls =
  'text-[10px] font-bold uppercase tracking-widest text-primary/65 whitespace-nowrap'

/**
 * One row of the sommaire pre-fill editor — type, title, optional N°,
 * and a page range. Visually a card so it stays readable when several
 * rows stack up. Inline grid keeps fields aligned even on narrow
 * viewports.
 */
function SommaireRowEditor({
  row,
  index,
  t,
  lang,
  disabled,
  onChange,
  onRemove,
}: {
  row: SommaireRow
  index: number
  t: T
  lang: 'fr' | 'ht'
  disabled: boolean
  onChange: (patch: Partial<SommaireRow>) => void
  onRemove: () => void
}) {
  // Cell uses a 12-col grid on lg+ that fits all five fields on one
  // row; on md it wraps to a two-row layout (Type + Titre top, N° /
  // Date / Pages share the second row); on mobile each field is its
  // own row. Labels are single-line (``whitespace-nowrap``) so the
  // baselines of the inputs stay aligned across columns regardless of
  // label length — the previous "N° (facultatif)" label wrapped and
  // pushed its input below the others.
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
          #{String(index + 1).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t('editorial.import.moniteur.removeEntry')}
          className="text-slate-400 hover:text-red-600 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
        {/* Type — 3 / 4 / 2 cols on sm / md / lg */}
        <div className="sm:col-span-6 md:col-span-3 lg:col-span-2 flex flex-col gap-1.5">
          <span className={labelCls}>
            {t('editorial.import.moniteur.sommaireType')}
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
              className="w-full data-[size=default]:h-11 bg-white border-slate-300 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-primary/30 data-[state=open]:border-primary"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
              {SOMMAIRE_DOC_TYPE_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`editorial.import.moniteur.docTypes.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Title — always labelled "Titre"; for ``autre`` entries it
            doubles as the entry's display name but stays in the same
            slot, with a placeholder hinting at the convention. */}
        <label className="sm:col-span-6 md:col-span-9 lg:col-span-5 flex flex-col gap-1.5">
          <span className={labelCls}>
            {t('editorial.import.moniteur.sommaireTitle')}
          </span>
          <input
            type="text"
            value={row.detected_title ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ detected_title: e.target.value })}
            placeholder={
              row.detected_category === 'autre'
                ? lang === 'ht'
                  ? 'Non pou afiche — egz. Avi piblik, Deklarasyon…'
                  : "Nom à afficher — ex. Avis public, Déclaration…"
                : undefined
            }
            className={inputCls}
          />
        </label>
        {/* N° — small numeric column. "Facultatif" moved out of the
            label (which wrapped on narrow widths and threw the input
            baseline off) into a placeholder. */}
        <label className="sm:col-span-3 md:col-span-2 lg:col-span-1 flex flex-col gap-1.5">
          <span className={labelCls}>
            {t('editorial.import.moniteur.sommaireNumber')}
          </span>
          <input
            type="text"
            value={row.detected_number ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ detected_number: e.target.value })}
            placeholder={lang === 'ht' ? 'opsyonèl' : 'facultatif'}
            className={cn(inputCls, 'text-center placeholder:italic placeholder:text-slate-300')}
          />
        </label>
        {/* Date — auto-prefilled from the issue publication date when
            a new row is added; editor only needs to touch entries
            whose date differs (e.g. a decree signed earlier than its
            Moniteur appearance). */}
        <label className="sm:col-span-4 md:col-span-4 lg:col-span-2 flex flex-col gap-1.5">
          <span className={labelCls}>
            {t('editorial.import.moniteur.sommaireDate', {
              fallback: 'Date',
            })}
          </span>
          <input
            type="date"
            value={row.detected_date ?? ''}
            disabled={disabled}
            onChange={(e) =>
              onChange({ detected_date: e.target.value || null })
            }
            className={inputCls}
          />
        </label>
        {/* Pages — segmented "N → N" input. Both PageInputs are h-11
            to match the rest of the row. */}
        <div className="sm:col-span-5 md:col-span-6 lg:col-span-2 flex flex-col gap-1.5">
          <span className={labelCls}>
            {t('editorial.import.moniteur.sommairePages')}
          </span>
          <div className="flex items-center gap-1.5">
            {/* ``page_from`` / ``page_to`` are nullable in the OpenAPI
                schema (the parser may emit a row without them when the
                page band is undetectable); the editor form always
                keeps a numeric value, so we fall back to 1 when null
                — same default ``emptyRow`` uses for a brand-new row. */}
            <PageInput
              value={row.page_from ?? 1}
              disabled={disabled}
              onChange={(v) => onChange({ page_from: v })}
              aria-label={t('editorial.import.moniteur.sommairePageFrom')}
            />
            <span className="text-slate-300 text-xs flex-shrink-0">→</span>
            <PageInput
              value={row.page_to ?? 1}
              disabled={disabled}
              onChange={(v) => onChange({ page_to: v })}
              aria-label={t('editorial.import.moniteur.sommairePageTo')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Numeric page-number input that lets you clear the field and retype from
 * scratch. The raw string is held in local state while the user is typing;
 * on blur the value is coerced to a positive integer (min 1) and pushed
 * back to the parent.
 */
function PageInput({
  value,
  disabled,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: number
  disabled: boolean
  onChange: (v: number) => void
  'aria-label'?: string
}) {
  const [raw, setRaw] = useState<string>(String(value))

  // Sync from parent when the canonical value changes externally
  // (e.g. auto-fill from metadata extraction).
  const prev = useRef(value)
  if (value !== prev.current) {
    prev.current = value
    setRaw(String(value))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={raw}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, '')
        setRaw(v)
        // Push valid numbers immediately so the parent sees incremental
        // updates, but don't snap empty → 1 — that's the blur's job.
        const n = parseInt(v, 10)
        if (!isNaN(n) && n > 0) onChange(n)
      }}
      onBlur={() => {
        const n = parseInt(raw, 10)
        const safe = isNaN(n) || n < 1 ? 1 : n
        setRaw(String(safe))
        onChange(safe)
      }}
      aria-label={ariaLabel}
      className={cn(inputCls, 'flex-1 min-w-0 px-2 text-center')}
    />
  )
}

/**
 * Reusable file-upload slot — shows either a dropzone or a file summary
 * card with a remove button. Used for both "document source" and "scan".
 */
function FileSlot({
  label,
  help,
  file,
  accept,
  dropPrompt,
  formatHint,
  disabled,
  inputRef,
  onSelect,
  onRemove,
}: {
  label: string
  help: string
  file: File | null
  accept: string
  dropPrompt: string
  formatHint: string
  disabled: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: (f: File | null) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-primary/65">
        {label}
      </p>
      <p className="text-xs text-slate-500 leading-relaxed">{help}</p>
      {!file ? (
        <label
          className={cn(
            'flex flex-col items-center justify-center gap-2 cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 transition-colors text-center',
            disabled
              ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
              : 'border-slate-300 bg-slate-50/40 hover:border-primary/40 hover:bg-primary/[0.02]',
          )}
        >
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-600">{dropPrompt}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide">{formatHint}</span>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onSelect(f)
            }}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-emerald-700 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {(file.size / 1024).toFixed(0)} KB
              </p>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={onRemove}
              className="text-slate-400 hover:text-red-600 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
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
