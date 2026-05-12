'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

import {
  createLegalSigner,
  deleteLegalSigner,
  updateLegalSigner,
  type LegalSignerInput,
  type LegalSignerPatch,
  type LegalSignerRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

/**
 * Editor UI for manually managing the signers list on a legal text.
 *
 * Used in two layouts:
 *  - Inline replacement of the structured signers block when the editor
 *    is signed in and either the parser missed signers OR the editor
 *    wants to correct them. Sits in the same vertical slot as the
 *    public Signataires block.
 *  - Renders the same rows as the public view when not editing, plus
 *    a per-row Pencil button to enter edit mode for that row and a
 *    "+ Ajouter" button at the bottom of the list.
 *
 * State model: only one row is in edit mode at a time (or one new-row
 * draft). The draft is local — only flushed to the server on Save.
 */

type Capacity = LegalSignerRead['signing_capacity']
type Chamber = NonNullable<LegalSignerRead['chamber']> | 'none'

const CAPACITY_OPTIONS: { value: Capacity; labelFr: string; labelHt: string }[] = [
  { value: 'authoring', labelFr: 'Auteur', labelHt: 'Otè' },
  { value: 'presiding', labelFr: 'Président de séance', labelHt: 'Prezidan seyans' },
  { value: 'attesting', labelFr: 'Secrétaire', labelHt: 'Sekretè' },
  { value: 'promulgating', labelFr: 'Promulgateur', labelHt: 'Pwomilgatè' },
  { value: 'countersigning', labelFr: 'Contresignataire', labelHt: 'Kontresiyatè' },
  { value: 'other', labelFr: 'Autre', labelHt: 'Lòt' },
]

const CHAMBER_OPTIONS: { value: Chamber; labelFr: string; labelHt: string }[] = [
  { value: 'none', labelFr: '— Aucune —', labelHt: '— Okenn —' },
  { value: 'senat', labelFr: 'Sénat', labelHt: 'Sena' },
  { value: 'chambre', labelFr: 'Chambre', labelHt: 'Chanm' },
  { value: 'executive', labelFr: 'Exécutif', labelHt: 'Egzekitif' },
  { value: 'ministerial', labelFr: 'Ministériel', labelHt: 'Ministeryèl' },
]

type DraftState = {
  // null = new row, number = signer.id being edited
  signerId: number | null
  values: LegalSignerInput
}

function emptyDraft(): DraftState {
  return {
    signerId: null,
    values: {
      name: '',
      function_fr: '',
      function_ht: null,
      signing_capacity: 'other',
      chamber: null,
      signed_at: null,
    },
  }
}

type Props = {
  slug: string
  signers: LegalSignerRead[]
  lang: 'fr' | 'ht'
  /** Refetch the parent law after a successful add / edit / delete. */
  onChanged: () => void
}

export function SignersEditor({ slug, signers, lang, onChanged }: Props) {
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  function startNew() {
    setDraft(emptyDraft())
    setError(null)
  }

  function startEdit(s: LegalSignerRead) {
    setDraft({
      signerId: s.id,
      values: {
        name: s.name,
        function_fr: s.function_fr,
        function_ht: s.function_ht,
        signing_capacity: s.signing_capacity,
        chamber: s.chamber,
        signed_at: s.signed_at,
        position: s.position,
      },
    })
    setError(null)
  }

  function cancelDraft() {
    setDraft(null)
    setError(null)
  }

  async function saveDraft() {
    if (!draft) return
    const name = draft.values.name.trim()
    const function_fr = draft.values.function_fr.trim()
    if (!name) {
      setError(lang === 'fr' ? 'Le nom est obligatoire.' : 'Non an obligatwa.')
      return
    }
    if (!function_fr) {
      setError(
        lang === 'fr'
          ? 'La fonction est obligatoire.'
          : 'Fonksyon an obligatwa.',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload: LegalSignerInput | LegalSignerPatch = {
        ...draft.values,
        name,
        function_fr,
        function_ht: draft.values.function_ht?.trim() || null,
      }
      if (draft.signerId === null) {
        await createLegalSigner(slug, payload as LegalSignerInput)
      } else {
        await updateLegalSigner(draft.signerId, payload as LegalSignerPatch)
      }
      onChanged()
      setDraft(null)
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeSigner(s: LegalSignerRead) {
    const ok =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            lang === 'fr'
              ? `Supprimer le signataire « ${s.name} » ?`
              : `Efase siyatè « ${s.name} » ?`,
          )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await deleteLegalSigner(s.id)
      onChanged()
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {signers.length > 0 ? (
        /* flex-wrap so signers pack onto rows by their natural width —
           three short names share one line, a long surname wraps to its
           own. Draft cards switch to ``w-full`` to take a whole row
           (the form is too tall to share a row with read-only entries). */
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          {signers.map((s) =>
            draft?.signerId === s.id ? (
              <div key={s.id} className="w-full">
                <SignerDraftCard
                  draft={draft}
                  setDraft={setDraft}
                  onSave={saveDraft}
                  onCancel={cancelDraft}
                  busy={busy}
                  lang={lang}
                  error={error}
                />
              </div>
            ) : (
              <div
                key={s.id}
                className="flex items-start gap-2 group min-w-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 whitespace-nowrap">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500 whitespace-nowrap">
                    {lang === 'ht' && s.function_ht
                      ? s.function_ht
                      : s.function_fr}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    disabled={busy || draft !== null}
                    className="text-slate-400 hover:text-primary disabled:opacity-30"
                    aria-label={
                      lang === 'fr' ? 'Modifier' : 'Modifye'
                    }
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSigner(s)}
                    disabled={busy || draft !== null}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                    aria-label={
                      lang === 'fr' ? 'Supprimer' : 'Efase'
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}

      {draft?.signerId === null && (
        <SignerDraftCard
          draft={draft}
          setDraft={setDraft}
          onSave={saveDraft}
          onCancel={cancelDraft}
          busy={busy}
          lang={lang}
          error={error}
        />
      )}

      {draft === null && (
        <div>
          <button
            type="button"
            onClick={startNew}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {lang === 'fr' ? 'Ajouter un signataire' : 'Ajoute yon siyatè'}
          </button>
        </div>
      )}

      {error && draft === null && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}

/** Inline form for both new + edit. Two columns: name + function_fr,
 *  with capacity / chamber / function_ht as secondary fields. */
function SignerDraftCard({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  lang,
  error,
}: {
  draft: DraftState
  setDraft: (next: DraftState | null) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  lang: 'fr' | 'ht'
  error: string | null
}) {
  function patch(p: Partial<LegalSignerInput>) {
    setDraft({ ...draft, values: { ...draft.values, ...p } })
  }
  const inputCls =
    'w-full h-9 px-2 rounded-md border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50'
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {lang === 'fr' ? 'Nom complet' : 'Non konplè'} *
          </span>
          <input
            type="text"
            value={draft.values.name}
            disabled={busy}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={lang === 'fr' ? 'Me. Jean DUPONT' : 'Me. Jean DUPONT'}
            className={inputCls}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {lang === 'fr' ? 'Fonction (FR)' : 'Fonksyon (FR)'} *
          </span>
          <input
            type="text"
            value={draft.values.function_fr}
            disabled={busy}
            onChange={(e) => patch({ function_fr: e.target.value })}
            placeholder={
              lang === 'fr' ? "Président de l'Assemblée…" : "Prezidan…"
            }
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {lang === 'fr' ? 'Fonction (HT)' : 'Fonksyon (HT)'}
          </span>
          <input
            type="text"
            value={draft.values.function_ht ?? ''}
            disabled={busy}
            onChange={(e) =>
              patch({ function_ht: e.target.value || null })
            }
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {lang === 'fr' ? 'Capacité' : 'Kapasite'}
          </span>
          <select
            value={draft.values.signing_capacity ?? 'other'}
            disabled={busy}
            onChange={(e) =>
              patch({ signing_capacity: e.target.value as Capacity })
            }
            className={cn(inputCls, 'pr-2')}
          >
            {CAPACITY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {lang === 'fr' ? c.labelFr : c.labelHt}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {lang === 'fr' ? 'Chambre' : 'Chanm'}
          </span>
          <select
            value={draft.values.chamber ?? 'none'}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value
              patch({
                chamber:
                  v === 'none'
                    ? null
                    : (v as LegalSignerRead['chamber']),
              })
            }}
            className={cn(inputCls, 'pr-2')}
          >
            {CHAMBER_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {lang === 'fr' ? c.labelFr : c.labelHt}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {lang === 'fr' ? 'Date de signature' : 'Dat siyati'}
          </span>
          <input
            type="date"
            value={draft.values.signed_at ?? ''}
            disabled={busy}
            onChange={(e) =>
              patch({ signed_at: e.target.value || null })
            }
            className={inputCls}
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          {lang === 'fr' ? 'Annuler' : 'Anile'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {lang === 'fr' ? 'Enregistrer' : 'Sove'}
        </button>
      </div>
    </div>
  )
}
