'use client'

import { useState } from 'react'
import {
  Check,
  ClipboardPaste,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import {
  bulkCreateLegalSigners,
  createLegalSigner,
  deleteLegalSigner,
  updateLegalSigner,
  type LegalSignerInput,
  type LegalSignerPatch,
  type LegalSignerRead,
} from '@/lib/api/endpoints'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/**
 * Editor UI for manually managing the signers list on a legal text.
 *
 * Minimal model — a signer is just **Name + Function**. The signing
 * capacity is redundant with what the editor types in the function
 * field ("Président" / "Secrétaire" / "Ministre…"), the chamber is
 * rarely needed for Haitian texts, and the per-signer date already
 * lives in the closing formula. So the editor form has two text
 * fields, both free-form. Backend stores ``signing_capacity='other'``
 * and ``chamber=null`` by default; if the parser populates them later
 * with stronger heuristics, that's fine — the editor's manual entries
 * just sit there with the loose defaults.
 *
 * State model: one row in edit mode at a time (or one new-row draft).
 * The draft is local — only flushed on Save.
 */

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
  /** Extra buttons rendered to the right of "+ Ajouter un signataire"
   *  on the same flex row. SignataireBlock uses this to put the
   *  "Modifier la formule de clôture" button next to the signer add
   *  button so editors see one unified action row at the bottom of
   *  the block. */
  extraActions?: React.ReactNode
}

export function SignersEditor({
  slug,
  signers,
  lang,
  onChanged,
  extraActions,
}: Props) {
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

  // Pending-delete state: when the user clicks the Trash icon we
  // stash the signer here and open the custom ConfirmDialog. The
  // actual delete fires when the dialog's "Supprimer" button is
  // clicked. Lets us show name + a styled modal instead of the
  // browser's native confirm prompt.
  const [pendingDelete, setPendingDelete] = useState<LegalSignerRead | null>(
    null,
  )

  function requestDelete(s: LegalSignerRead) {
    setPendingDelete(s)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    setError(null)
    try {
      await deleteLegalSigner(pendingDelete.id)
      onChanged()
      setPendingDelete(null)
    } catch (e: any) {
      setError(e?.body?.detail ?? String(e))
      setPendingDelete(null)
    } finally {
      setBusy(false)
    }
  }

  // Bulk-import panel state. Kept separate from the single-row draft
  // so the editor can paste JSON without losing an in-progress draft
  // (and vice versa — opening the form doesn't wipe pasted JSON).
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkError, setBulkError] = useState<string | null>(null)

  async function submitBulk() {
    setBulkError(null)
    const raw = bulkText.trim()
    if (!raw) {
      setBulkError(lang === 'fr' ? 'Collez un JSON.' : 'Mete yon JSON.')
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e: any) {
      setBulkError(
        (lang === 'fr' ? 'JSON invalide : ' : 'JSON envalid : ') +
          (e?.message ?? 'parse error'),
      )
      return
    }
    // Accept either a bare array `[{...}, ...]` or an object
    // `{signers: [...]}` — editors paste both shapes depending on
    // whether they wrote the list by hand or got it from a tool.
    const list: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as any)?.signers)
        ? (parsed as any).signers
        : []
    if (list.length === 0) {
      setBulkError(
        lang === 'fr'
          ? 'Le JSON doit être un tableau non vide.'
          : 'JSON la dwe yon lis ki pa vid.',
      )
      return
    }
    // Lenient field mapping — accept "role" or "function" or
    // "fonction" as aliases for ``function_fr``. The 1987 Constituante
    // list circulating online uses "role"; the parser uses
    // ``function_fr``. Pick whichever exists.
    const payload: LegalSignerInput[] = []
    for (let i = 0; i < list.length; i++) {
      const item = list[i] ?? {}
      const name = String(item.name ?? item.nom ?? '').trim()
      const function_fr = String(
        item.function_fr ?? item.role ?? item.function ?? item.fonction ?? '',
      ).trim()
      if (!name || !function_fr) {
        setBulkError(
          (lang === 'fr'
            ? `Entrée ${i + 1} : « name » et « function_fr » (ou « role ») sont obligatoires.`
            : `Antre ${i + 1}: « name » ak « function_fr » (oswa « role ») obligatwa.`),
        )
        return
      }
      const function_ht = item.function_ht
        ? String(item.function_ht).trim() || null
        : null
      payload.push({ name, function_fr, function_ht })
    }
    setBusy(true)
    try {
      await bulkCreateLegalSigners(slug, payload)
      setBulkOpen(false)
      setBulkText('')
      onChanged()
    } catch (e: any) {
      setBulkError(e?.body?.detail ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {signers.length > 0 ? (
        /* Grid with fixed column count so every "column" lines up
           vertically — without this, ``flex-wrap`` packed names by
           their natural width and a long surname in row 1 pushed the
           whole grid out of alignment on row 2. Three columns on
           lg+ matches the layout the editor expects for a Constituante
           membership list; two cols on tablet; one on mobile. The draft
           card spans the full row because its form is too tall to share. */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
          {signers.map((s) =>
            draft?.signerId === s.id ? (
              <div key={s.id} className="sm:col-span-2 lg:col-span-3">
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
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
                    onClick={() => requestDelete(s)}
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

      {draft === null && !bulkOpen && (
        /* flex-wrap so the formula button (passed via extraActions)
           sits next to the signer add button on a wide row, and wraps
           to its own line on narrow viewports. */
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startNew}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {lang === 'fr' ? 'Ajouter un signataire' : 'Ajoute yon siyatè'}
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkOpen(true)
              setBulkError(null)
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
            title={
              lang === 'fr'
                ? 'Coller une liste JSON pour ajouter plusieurs signataires d’un coup'
                : 'Kole yon lis JSON pou ajoute plizyè siyatè ansanm'
            }
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            {lang === 'fr' ? 'Importer JSON' : 'Enpòte JSON'}
          </button>
          {extraActions}
        </div>
      )}

      {bulkOpen && (
        <div className="rounded-lg border border-slate-300 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-700">
              {lang === 'fr'
                ? 'Coller une liste JSON de signataires'
                : 'Kole yon lis JSON siyatè'}
            </p>
            <button
              type="button"
              onClick={() => {
                setBulkOpen(false)
                setBulkError(null)
              }}
              disabled={busy}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              aria-label={lang === 'fr' ? 'Fermer' : 'Fèmen'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            {lang === 'fr' ? (
              <>
                Format attendu : un tableau JSON. Chaque objet doit
                contenir <code className="font-mono text-slate-700">name</code>{' '}
                et <code className="font-mono text-slate-700">function_fr</code>{' '}
                (alias acceptés :{' '}
                <code className="font-mono text-slate-700">role</code>,{' '}
                <code className="font-mono text-slate-700">function</code>). Les
                signataires sont ajoutés à la suite des existants.
              </>
            ) : (
              <>
                Fòma : yon lis JSON. Chak antre dwe gen yon{' '}
                <code className="font-mono text-slate-700">name</code> ak yon{' '}
                <code className="font-mono text-slate-700">function_fr</code>{' '}
                (alyas:{' '}
                <code className="font-mono text-slate-700">role</code>,{' '}
                <code className="font-mono text-slate-700">function</code>).
              </>
            )}
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            disabled={busy}
            spellCheck={false}
            rows={10}
            placeholder={`[
  { "name": "Me. Jean DUPONT", "role": "Président" },
  { "name": "Marie PIERRE", "role": "Sénatrice" }
]`}
            className="w-full font-mono text-xs rounded-md border border-slate-300 bg-white p-2 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
          />
          {bulkError && (
            <p className="mt-2 text-xs text-red-600">{bulkError}</p>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setBulkOpen(false)
                setBulkError(null)
              }}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              {lang === 'fr' ? 'Annuler' : 'Anile'}
            </button>
            <button
              type="button"
              onClick={submitBulk}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {lang === 'fr' ? 'Importer' : 'Enpòte'}
            </button>
          </div>
        </div>
      )}

      {error && draft === null && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingDelete(null)
        }}
        onConfirm={confirmDelete}
        title={
          lang === 'fr'
            ? 'Supprimer le signataire ?'
            : 'Efase siyatè a ?'
        }
        description={
          pendingDelete ? (
            <>
              {lang === 'fr'
                ? 'Le signataire'
                : 'Siyatè'}{' '}
              <span className="font-semibold text-slate-900">
                « {pendingDelete.name} »
              </span>{' '}
              {lang === 'fr'
                ? 'sera retiré de ce texte. Cette action est immédiate.'
                : 'pral retire nan tèks sa. Aksyon sa imedya.'}
            </>
          ) : null
        }
        confirmLabel={lang === 'fr' ? 'Supprimer' : 'Efase'}
        cancelLabel={lang === 'fr' ? 'Annuler' : 'Anile'}
        destructive
        loading={busy}
      />
    </div>
  )
}

/** Inline form for both new + edit. Just two fields: Name + Function
 *  (FR), with the Kreyòl translation of the function as an optional
 *  third field. Capacity / chamber / signed_at are not surfaced —
 *  capacity is redundant with what the editor types in the function
 *  field, chamber is rarely meaningful for Haitian texts, and the
 *  per-signer date already lives in the closing formula. Backend
 *  stores ``signing_capacity='other'`` + ``chamber=null`` from the
 *  default emptyDraft() so this is purely a UI simplification. */
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
            {lang === 'fr' ? 'Fonction' : 'Fonksyon'} *
          </span>
          <input
            type="text"
            value={draft.values.function_fr}
            disabled={busy}
            onChange={(e) => patch({ function_fr: e.target.value })}
            placeholder={
              lang === 'fr'
                ? "Président, Ministre, Secrétaire…"
                : 'Prezidan, Minis, Sekretè…'
            }
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {lang === 'fr'
              ? 'Fonction (Kreyòl, facultatif)'
              : 'Fonksyon (Kreyòl, opsyonèl)'}
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
