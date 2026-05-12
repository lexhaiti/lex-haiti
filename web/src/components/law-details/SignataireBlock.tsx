'use client'

import { useState } from 'react'
import { Check, ChevronDown, Loader2, PenLine, Plus, X } from 'lucide-react'

import {
  updateLegalTextMetadata,
  type LegalSignerRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'
import { buildSignatureLeadCaption } from './_helpers/signatureCaption'
import { SignersEditor } from './SignersEditor'

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
          {lang === 'fr'
            ? 'Signataires et formule de clôture'
            : 'Siyatè ak fòmil fèmti'}
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
          {lead && (
            <p className="text-sm italic text-slate-600 leading-relaxed mb-6 border-l-2 border-amber-300 pl-4">
              {lead}
            </p>
          )}

          {/* Signataires sub-section */}
          {isEditor ? (
            <SignersEditor
              slug={slug}
              signers={signers}
              lang={lang}
              onChanged={onChanged}
            />
          ) : signers.length > 0 ? (
            /* flex-wrap: each signer takes only its natural width, two or
               three short names share one row, long names wrap to their
               own. ``min-w-0`` on the inner card lets long surnames
               truncate instead of forcing the row to expand. */
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              {signers.map((signer) => (
                <div
                  key={signer.id}
                  className="flex flex-col gap-0.5 min-w-0"
                >
                  <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
                    {signer.name}
                  </span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {lang === 'ht' && signer.function_ht
                      ? signer.function_ht
                      : signer.function_fr}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Formule de clôture sub-section. Public: verbatim text in
              an amber-bordered panel matching the lead-caption styling.
              Editor: inline textarea with save/cancel; or a "+ Ajouter
              une formule de clôture" button when empty. */}
          {editFormula ? (
            <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50/40 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-primary/70">
                {lang === 'fr'
                  ? 'Formule de clôture'
                  : 'Fòmil fèmti'}
              </div>
              <textarea
                value={formulaDraft}
                disabled={formulaSaving}
                onChange={(e) => setFormulaDraft(e.target.value)}
                rows={8}
                placeholder={
                  lang === 'fr'
                    ? 'Donné au Palais Législatif, à Port-au-Prince…'
                    : 'Bay nan Pale Lejislatif…'
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed font-mono"
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
            <>
              <div className="mt-6 border-l-2 border-amber-300 pl-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {lang === 'fr'
                    ? 'Formule de clôture'
                    : 'Fòmil fèmti'}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {officialFormula}
                </p>
              </div>
              {/* Editor always sees a visible action below the formula.
                  We keep the dashed-amber button style consistent with
                  the empty-state add button + the signers add button —
                  the editor learns one affordance, not two. */}
              {isEditor && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={startFormulaEdit}
                    className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-50"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    {lang === 'fr'
                      ? 'Modifier la formule de clôture'
                      : 'Modifye fòmil fèmti'}
                  </button>
                </div>
              )}
            </>
          ) : isEditor ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={startFormulaEdit}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === 'fr'
                  ? 'Ajouter une formule de clôture'
                  : 'Ajoute yon fòmil fèmti'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
