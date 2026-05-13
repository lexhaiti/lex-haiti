'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Braces,
  Check,
  FileJson,
  Loader2,
  RotateCcw,
  Upload,
} from 'lucide-react'

import { useT } from '@/i18n/useT'
import { apiPost } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import type { MoniteurIssueRead } from '@/lib/api/endpoints'

/**
 * Dev-flavoured Moniteur import panel — takes a JSON payload
 * (paste OR file upload) and POSTs it to
 * ``/editorial/moniteur/issues/import-json``, which creates the
 * issue + entry rows in one transaction, skipping OCR / heuristic
 * parsing. Idempotent on (year, number) — re-importing the same
 * issue updates its metadata + replaces pending entries.
 *
 * Counterpart to ``backend/scripts/import_moniteur_json.py``.
 */

const EXAMPLE_PAYLOAD = `{
  "schema_version": 1,
  "issue": {
    "number": "47",
    "year": 2014,
    "publication_date": "2014-06-04",
    "edition_label": null,
    "director": "Henry Robert MARC-CHARLES",
    "director_role": null
  },
  "entries": [
    {
      "detected_category": "loi",
      "detected_title": "Loi sur \\u2026",
      "detected_number": "CL-007-09",
      "detected_date": "2014-06-04",
      "page_from": 3,
      "page_to": 25,
      "raw_text": "Article 1.- \\u2026"
    }
  ]
}`

type Phase = 'idle' | 'submitting' | 'done'

export default function MoniteurJsonImportPanel() {
  const { t, language } = useT()
  const isFr = language === 'fr'

  const [jsonText, setJsonText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [createdIssue, setCreatedIssue] = useState<MoniteurIssueRead | null>(
    null,
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    try {
      const text = await file.text()
      setJsonText(text)
      // Validate JSON-parseable but don't post yet — the editor
      // still gets to inspect/edit before clicking submit.
      JSON.parse(text)
      setError(null)
    } catch (e: any) {
      setError(
        (isFr ? 'JSON invalide : ' : 'JSON envalid : ') +
          (e?.message ?? 'parse error'),
      )
    }
  }

  async function submit() {
    setError(null)
    const raw = jsonText.trim()
    if (!raw) {
      setError(isFr ? 'Collez ou téléversez un JSON.' : 'Kole oswa enpòte yon JSON.')
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e: any) {
      setError(
        (isFr ? 'JSON invalide : ' : 'JSON envalid : ') +
          (e?.message ?? 'parse error'),
      )
      return
    }
    setPhase('submitting')
    try {
      const issue = await apiPost<MoniteurIssueRead>(
        '/editorial/moniteur/issues/import-json',
        parsed,
      )
      setCreatedIssue(issue)
      setPhase('done')
    } catch (e: any) {
      setError(e?.body?.detail ?? e?.message ?? String(e))
      setPhase('idle')
    }
  }

  function reset() {
    setJsonText('')
    setCreatedIssue(null)
    setError(null)
    setPhase('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="py-2 lg:py-4 w-full">
      <div className="space-y-6">
        {/* Help block — keep it short, the audience is devs. */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Braces className="w-4 h-4" />
            {isFr ? "Mode développeur" : 'Mòd devlopè'}
          </p>
          <p className="leading-relaxed">
            {isFr ? (
              <>
                Bypass l'OCR et le parser : le serveur crée le numéro
                + les entrées telles que vous les fournissez. Idempotent
                sur <code className="font-mono text-xs">(année, numéro)</code> —
                relancer avec le même fichier met à jour le numéro existant
                au lieu d'en créer un doublon.
              </>
            ) : (
              <>
                Bypass OCR ak pasè a : sèvè a kreye nimewo a + antre yo
                jan ou bay yo. Idempotan sou{' '}
                <code className="font-mono text-xs">(ane, nimewo)</code> —
                relanse ak menm fichye a met ajou nimewo ki egziste a olye
                pou li kreye yon doub.
              </>
            )}
          </p>
        </div>

        {/* File picker — optional shortcut to populate the textarea. */}
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300',
              'bg-white px-4 py-2 text-sm font-semibold text-slate-700',
              'hover:border-primary/40 transition-colors',
              phase === 'submitting' && 'opacity-50 pointer-events-none',
            )}
          >
            <Upload className="w-4 h-4" />
            {isFr ? 'Choisir un fichier .json' : 'Chwazi yon fichye .json'}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setJsonText(EXAMPLE_PAYLOAD)}
            disabled={phase === 'submitting'}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-50"
          >
            <FileJson className="w-3.5 h-3.5" />
            {isFr ? 'Insérer un exemple' : 'Mete yon egzanp'}
          </button>
        </div>

        {/* JSON textarea — the canonical input. Mono font, auto-grows. */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-primary/65 mb-1.5">
            {isFr ? 'Payload JSON' : 'Payload JSON'}
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            disabled={phase === 'submitting'}
            spellCheck={false}
            rows={16}
            placeholder={isFr ? 'Collez votre JSON ici…' : 'Kole JSON ou la…'}
            className="w-full font-mono text-xs leading-relaxed rounded-md border border-slate-300 bg-white p-3 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
          />
        </div>

        {error && <ErrorBanner density="compact">{error}</ErrorBanner>}

        {/* Success card — appears after a successful import. Links
            straight to the review page for the freshly-created issue. */}
        {phase === 'done' && createdIssue && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-5 py-4">
            <p className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
              <Check className="w-4 h-4" />
              {isFr ? 'Importé avec succès' : 'Enpòte avèk siksè'}
            </p>
            <p className="text-xs text-emerald-800 mb-3 leading-relaxed">
              {isFr
                ? `Numéro n° ${createdIssue.number} / ${createdIssue.year} créé (statut « parsed »).`
                : `Nimewo n° ${createdIssue.number} / ${createdIssue.year} kreye (estati « parsed »).`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/editorial/moniteur/${createdIssue.id}/review`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90"
              >
                {isFr ? 'Réviser le numéro' : 'Revize nimewo a'}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {isFr ? 'Nouvel import' : 'Nouvo enpò'}
              </button>
            </div>
          </div>
        )}

        {/* Submit row — kept simple. Editor sees one button. */}
        {phase !== 'done' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={phase === 'submitting' || !jsonText.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === 'submitting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isFr ? 'Importer' : 'Enpòte'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
