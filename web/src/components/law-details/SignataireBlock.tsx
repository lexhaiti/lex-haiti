'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Check, ChevronDown, Loader2, PenLine, Plus, X } from 'lucide-react'

import {
  updateLegalTextMetadata,
  type LegalSignerRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'
import { buildSignatureLeadCaption } from './_helpers/signatureCaption'
import { SignersEditor } from './SignersEditor'

// Tiptap-backed rich editor — same component the other formal blocks
// (preamble, visas, considérants, mentions procédurales) use. Dynamic-
// imported so the editor JS doesn't ship on the public read path.
const RichArticleEditor = dynamic(
  () =>
    import('./_editor/RichArticleEditor').then((m) => ({
      default: m.RichArticleEditor,
    })),
  { ssr: false },
)

/**
 * Combined "Signataires et formule de clôture" block on the law detail
 * page. Replaces the previous two-section layout (separate Signataires
 * grid + verbatim formula fallback) with a single collapsible card:
 *
 * - Header: PenLine icon + "Signataires et formule de clôture" + chevron
 *   toggle. Clicking the chevron (or anywhere on the header) collapses
 *   or expands the whole body.
 * - Body, when open:
 *     1. Lead caption (only if structured signers — derives from their
 *        capacities, "Adoptée par… Promulguée le…" etc.).
 *     2. Signataires sub-section. Editor: full CRUD via SignersEditor.
 *        Public: flex-wrap layout — each signer takes only the space
 *        its name needs, multiple short names wrap onto one line.
 *     3. Formule de clôture sub-section. Public: verbatim text. Editor:
 *        inline edit textarea with save/cancel + an "+ Ajouter une
 *        formule de clôture" button when the field is empty.
 */

type Props = {
  slug: string
  signers: LegalSignerRead[]
  officialFormula: string | null
  category: string | null
  lang: 'fr' | 'ht'
  isEditor: boolean
  onChanged: () => void
}

export function SignataireBlock({
  slug,
  signers,
  officialFormula,
  category,
  lang,
  isEditor,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(true)
  const [editFormula, setEditFormula] = useState(false)
  const [formulaDraft, setFormulaDraft] = useState<string>(
    officialFormula ?? '',
  )
  const [formulaSaving, setFormulaSaving] = useState(false)
  const [formulaError, setFormulaError] = useState<string | null>(null)

  const lead =
    signers.length > 0
      ? buildSignatureLeadCaption(signers, category as any, lang)
      : null
  const hasFormula = !!(officialFormula && officialFormula.trim())

  function startFormulaEdit() {
    setFormulaDraft(officialFormula ?? '')
    setFormulaError(null)
    setEditFormula(true)
    setOpen(true) // can't edit a closed block
  }
  function cancelFormulaEdit() {
    setEditFormula(false)
    setFormulaError(null)
  }
  async function saveFormula() {
    setFormulaSaving(true)
    setFormulaError(null)
    try {
      const value = formulaDraft.trim()
      await updateLegalTextMetadata(slug, {
        official_formula: value || null,
      } as any)
      onChanged()
      setEditFormula(false)
    } catch (e: any) {
      setFormulaError(e?.body?.detail ?? String(e))
    } finally {
      setFormulaSaving(false)
    }
  }

  return (
    <div className="mb-12 pt-8 border-t border-slate-200">
      {/* Header — PenLine icon + uppercase title + chevron toggle.
          Whole header is the click target so users don't have to aim
          for the tiny chevron. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 mb-6 w-full text-left group"
        aria-expanded={open}
      >
        <PenLine className="w-4 h-4 text-slate-400" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex-1">
          {lang === 'fr' ? 'Signataires' : 'Siyatè'}
        </h3>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-slate-400 transition-transform duration-200 group-hover:text-slate-600',
            !open && '-rotate-90',
          )}
        />
      </button>

      {open && (
        <>
          {/* Formule de clôture first — narrative comes before the
              list of names. No sub-label: the block title already
              groups everything in this section, and the verbatim
              "Donné au … le … " text identifies itself by content.
              When editing, we show an inline textarea with its own
              save/cancel; otherwise the formula renders as read-only
              prose with the amber left-border (matches the lead
              caption styling). */}
          {editFormula ? (
            <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50/40 p-3">
              <RichArticleEditor
                value={formulaDraft}
                onChange={setFormulaDraft}
                placeholder={
                  lang === 'fr'
                    ? 'Donné au Palais Législatif, à Port-au-Prince…'
                    : 'Bay nan Pale Lejislatif…'
                }
                ariaLabel={
                  lang === 'fr' ? 'Formule de clôture' : 'Fòmil fèmti'
                }
                tone="amber"
                disabled={formulaSaving}
              />
              {formulaError && (
                <p className="mt-2 text-xs text-red-600">{formulaError}</p>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelFormulaEdit}
                  disabled={formulaSaving}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  {lang === 'fr' ? 'Annuler' : 'Anile'}
                </button>
                <button
                  type="button"
                  onClick={saveFormula}
                  disabled={formulaSaving}
                  className="inline-flex items-center gap-1 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {formulaSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {lang === 'fr' ? 'Enregistrer' : 'Sove'}
                </button>
              </div>
            </div>
          ) : hasFormula ? (
            /* Closing formula rendered as italic prose — classic French
               legal-document convention for "Donné au … le …" formulas.
               Rich-HTML now (Tiptap output), so dangerouslySetInnerHTML
               instead of text node; the editor sanitises through the
               same allowlist as the other formal blocks. The italic
               + tracking + muted slate styling matches the previous
               plain-text rendering, and a small ``prose``-shape rule
               below keeps inline ``<p>`` / ``<em>`` / ``<strong>``
               looking right inside the italic wrapper. */
            <div
              className="mb-6 text-sm italic text-slate-600 leading-relaxed tracking-[0.005em] [&_p]:mb-2 [&_p:last-child]:mb-0"
              dangerouslySetInnerHTML={{ __html: officialFormula! }}
            />
          ) : null}

          {/* Lead caption from the structured signers — italic
              transition sentence between the formula prose and the
              names list. Only renders for the structured case
              (signers populated), since it derives its phrasing from
              their capacities. Small-caps letter-spacing reinforces
              its "summary annotation" role vs. the closing prose
              above and the names below. */}
          {lead && (
            <p className="text-sm italic text-slate-500 leading-relaxed mb-4 tracking-[0.005em]">
              {lead}
            </p>
          )}

          {/* Signataires list. Editor: SignersEditor with the formula
              action passed as ``extraActions`` so both buttons live in
              the same row at the bottom of the section. Public: just
              the flex-wrap signer cards. */}
          {isEditor ? (
            <SignersEditor
              slug={slug}
              signers={signers}
              lang={lang}
              onChanged={onChanged}
              extraActions={
                editFormula ? null : (
                  <button
                    type="button"
                    onClick={startFormulaEdit}
                    className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-50"
                  >
                    {hasFormula ? (
                      <PenLine className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {hasFormula
                      ? lang === 'fr'
                        ? 'Modifier la formule de clôture'
                        : 'Modifye fòmil fèmti'
                      : lang === 'fr'
                      ? 'Ajouter une formule de clôture'
                      : 'Ajoute yon fòmil fèmti'}
                  </button>
                )
              }
            />
          ) : signers.length > 0 ? (
            /* Fixed-column grid so every column lines up vertically.
               Previously this used ``flex flex-wrap`` and the first row
               only fit 3 of the Constituante's longer names while the
               rest of the rows packed 4 — looked like a misaligned
               table. Mirrors the editor view's column count (1 → 2 → 3
               → 4) so public/editor renders stay visually consistent. */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
              {signers.map((signer) => (
                <div key={signer.id} className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-bold text-slate-900 truncate">
                    {signer.name}
                  </span>
                  <span className="text-xs text-slate-500 truncate">
                    {lang === 'ht' && signer.function_ht
                      ? signer.function_ht
                      : signer.function_fr}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
