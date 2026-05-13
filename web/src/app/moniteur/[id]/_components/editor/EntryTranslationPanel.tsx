'use client'

/**
 * Translation-source panel — attached to each Moniteur entry.
 *
 * Lets the editor record where the Kreyòl version of this entry's
 * content was published (typically a companion Moniteur issue with a
 * suffixed number — the "36 → 36-a" pattern). Storing this pointer here
 * avoids re-ingesting the HT issue's sommaire as duplicate candidates.
 *
 * What this panel manages:
 *   - The companion-issue FK + the HT entry number (may differ from FR)
 *   - HT display title + page range in the companion issue
 *   - Optional summary in HT
 *   - Companion documents (lettre de promulgation, etc.) as JSONB list
 *
 * What this panel does NOT manage:
 *   - The actual translated article texts. Those live on the promoted
 *     legal_text's article_versions.text_ht and are edited via the
 *     dedicated translation editor (Stage 4).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Languages, Plus, Trash2 } from 'lucide-react'
import {
  setMoniteurEntryTranslation,
  type MoniteurEntryRead,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

type Lang = 'fr' | 'ht'

interface CompanionDoc {
  kind: string
  pages?: string | null
  note?: string | null
}

interface Props {
  entry: MoniteurEntryRead
  /** All issues the editor can pick as companion. Typically the parent
   *  issue's siblings (same year, base-number-prefix match) — but the
   *  picker accepts any issue. */
  candidateIssues: MoniteurIssueRead[]
  lang: Lang
  onUpdated: (updated: MoniteurEntryRead) => void
}

export function EntryTranslationPanel({
  entry,
  candidateIssues,
  lang,
  onUpdated,
}: Props) {
  const isFr = lang === 'fr'
  const hasPointer = entry.translation_issue_id !== null
  const [expanded, setExpanded] = useState<boolean>(hasPointer)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local form state — mirrors the entry but lets the editor edit
  // without round-tripping until they click "Enregistrer".
  const [issueId, setIssueId] = useState<number | ''>(
    entry.translation_issue_id ?? '',
  )
  const [number, setNumber] = useState<string>(
    entry.translation_detected_number ?? '',
  )
  const [titleHt, setTitleHt] = useState<string>(
    entry.translation_title_ht ?? '',
  )
  const [pageFrom, setPageFrom] = useState<string>(
    entry.translation_page_from?.toString() ?? '',
  )
  const [pageTo, setPageTo] = useState<string>(
    entry.translation_page_to?.toString() ?? '',
  )
  const [summary, setSummary] = useState<string>(
    entry.translation_summary_ht ?? '',
  )
  const [docs, setDocs] = useState<CompanionDoc[]>(
    entry.companion_documents ?? [],
  )

  // Sync if the entry prop changes from outside (e.g., after a save).
  useEffect(() => {
    setIssueId(entry.translation_issue_id ?? '')
    setNumber(entry.translation_detected_number ?? '')
    setTitleHt(entry.translation_title_ht ?? '')
    setPageFrom(entry.translation_page_from?.toString() ?? '')
    setPageTo(entry.translation_page_to?.toString() ?? '')
    setSummary(entry.translation_summary_ht ?? '')
    setDocs(entry.companion_documents ?? [])
  }, [entry])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await setMoniteurEntryTranslation(entry.id, {
        translation_issue_id: issueId === '' ? null : Number(issueId),
        translation_detected_number: number.trim() || null,
        translation_title_ht: titleHt.trim() || null,
        translation_page_from: pageFrom ? Number(pageFrom) : null,
        translation_page_to: pageTo ? Number(pageTo) : null,
        translation_summary_ht: summary.trim() || null,
        companion_documents: docs.length > 0 ? docs : null,
      })
      onUpdated(updated)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isFr
            ? "Échec de l'enregistrement."
            : 'Sove a echwe.',
      )
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await setMoniteurEntryTranslation(entry.id, {
        translation_issue_id: null,
        translation_detected_number: null,
        translation_title_ht: null,
        translation_page_from: null,
        translation_page_to: null,
        translation_summary_ht: null,
        companion_documents: null,
      })
      onUpdated(updated)
      setExpanded(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isFr
            ? 'Échec de la suppression.'
            : 'Efase a echwe.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className={cn(
        'mt-5 pt-4 border-t border-slate-100',
        hasPointer && 'bg-emerald-50/30 -mx-6 lg:-mx-7 px-6 lg:px-7 pb-5 rounded-b-xl',
      )}
    >
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-slate-400" aria-hidden />
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {isFr ? 'Source de la traduction' : 'Sous tradiksyon an'}
          </h4>
          {hasPointer && (
            <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700 border border-emerald-200">
              {entry.translation_issue_number
                ? `N° ${entry.translation_issue_number}`
                : 'HT'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry.promoted_legal_text_slug && hasPointer && (
            <Link
              href={`/editorial/loi/${entry.promoted_legal_text_slug}/translate`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              {isFr ? 'Importer la traduction' : 'Enpòte tradiksyon an'}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-semibold text-slate-600 hover:text-primary transition-colors"
          >
            {expanded
              ? isFr ? 'Réduire' : 'Redui'
              : hasPointer
                ? isFr ? 'Modifier' : 'Modifye'
                : isFr ? '+ Ajouter une traduction' : '+ Ajoute tradiksyon'}
          </button>
        </div>
      </header>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {isFr ? 'Moniteur HT (compagnon)' : 'Moniteur HT (konpayon)'}
              </span>
              <select
                value={issueId}
                onChange={(e) =>
                  setIssueId(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="">— {isFr ? 'Aucun' : 'Pa gen'} —</option>
                {candidateIssues
                  .filter((iss) => iss.id !== entry.issue_id)
                  .map((iss) => (
                    <option key={iss.id} value={iss.id}>
                      N° {iss.number}
                      {iss.publication_date ? ` (${iss.publication_date})` : ''}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {isFr ? 'N° dans le Moniteur HT' : 'Nimewo nan Moniteur HT'}
              </span>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={isFr ? 'ex. 36-a, 1, …' : 'eg. 36-a, 1, …'}
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {isFr ? 'Pages' : 'Paj'}
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={pageFrom}
                  onChange={(e) => setPageFrom(e.target.value)}
                  placeholder={isFr ? 'De' : 'Soti'}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="number"
                  value={pageTo}
                  onChange={(e) => setPageTo(e.target.value)}
                  placeholder={isFr ? 'À' : 'Rive'}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums"
                />
              </div>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {isFr ? 'Titre en Kreyòl' : 'Tit an Kreyòl'}
            </span>
            <input
              type="text"
              value={titleHt}
              onChange={(e) => setTitleHt(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {isFr ? 'Résumé en Kreyòl' : 'Rezime an Kreyòl'}
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm leading-relaxed"
            />
          </label>

          {/* Companion documents — variable-length JSONB list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {isFr ? 'Documents associés' : 'Dokiman ki mache ak li'}
              </span>
              <button
                type="button"
                onClick={() =>
                  setDocs((cur) => [...cur, { kind: '', pages: '', note: '' }])
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary"
              >
                <Plus className="w-3 h-3" />
                {isFr ? 'Ajouter' : 'Ajoute'}
              </button>
            </div>
            {docs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                {isFr
                  ? 'Aucun document associé. Ex. lettre de promulgation, arrêté d\'application.'
                  : 'Pa gen dokiman ki mache ak li.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((d, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-1 md:grid-cols-[1fr_120px_2fr_auto] gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={d.kind}
                      onChange={(e) =>
                        setDocs((cur) =>
                          cur.map((x, j) =>
                            j === i ? { ...x, kind: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder={
                        isFr ? 'Type (ex. lettre de promulgation)' : 'Kalite'
                      }
                      className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                    />
                    <input
                      type="text"
                      value={d.pages ?? ''}
                      onChange={(e) =>
                        setDocs((cur) =>
                          cur.map((x, j) =>
                            j === i ? { ...x, pages: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder={isFr ? 'Pages' : 'Paj'}
                      className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums"
                    />
                    <input
                      type="text"
                      value={d.note ?? ''}
                      onChange={(e) =>
                        setDocs((cur) =>
                          cur.map((x, j) =>
                            j === i ? { ...x, note: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder={isFr ? 'Note' : 'Nòt'}
                      className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDocs((cur) => cur.filter((_, j) => j !== i))
                      }
                      className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={isFr ? 'Supprimer' : 'Efase'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            {hasPointer && (
              <button
                type="button"
                onClick={clear}
                disabled={saving}
                className="text-xs font-semibold text-slate-500 hover:text-red-600 px-3 py-2 rounded-md disabled:opacity-50"
              >
                {isFr ? 'Détacher' : 'Detache'}
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving
                ? isFr ? 'Enregistrement…' : 'Sove…'
                : isFr ? 'Enregistrer' : 'Sove'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
