'use client'

/**
 * Reusable in-place editor for the four formal blocks on a LegalText:
 * préambule, visas, considérants, enacting formula. (sovereignty_formula
 * is a fifth one we can wire later — same shape.)
 *
 * Backend wiring: PATCH /editorial/legal-texts/{slug}/metadata with
 * the bilingual field pair. Editor mutates one block at a time; saves
 * are immediate (no batch).
 *
 * UX rules:
 *   - Read-only by default. PenLine icon appears only when isEditor.
 *   - "Edit" toggles a textarea seeded with the current value.
 *   - Save runs the PATCH and exits edit mode on success.
 *   - Cancel discards local edits.
 *   - The compact variant is used for one-line blocks (enacting
 *     formula); the textarea grows for multi-line blocks.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  PenLine,
  X,
  Check,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export interface EditableFormalBlockProps {
  /** What the block currently shows. Either string or null. */
  value: string | null
  /** Whether the calling page is in editor mode. */
  isEditor: boolean
  /** Title shown on the collapsed/expanded header. */
  title: string
  /** Whether to mount as compact one-liner (enacting formula style) or
   *  expandable accordion (préambule/visas/considérants). */
  variant?: 'collapsible' | 'compact'
  /** Side-of-header hint text shown in slate-400. */
  hint?: string
  /** Initially expanded (collapsible variant only). Default: false. */
  defaultExpanded?: boolean
  /** Save handler — receives the new value (or null when cleared).
   *  Throws to surface an error to the user. */
  onSave: (newValue: string | null) => Promise<void>
  /** Bilingual i18n hook — pass `currentLang === 'fr'` from the parent. */
  isFr: boolean
}

export function EditableFormalBlock({
  value,
  isEditor,
  title,
  variant = 'collapsible',
  hint,
  defaultExpanded = false,
  onSave,
  isFr,
}: EditableFormalBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep draft in sync when the live value updates from outside.
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  // Compact variant — no accordion, content always shown.
  const renderCompact = () => (
    <div className="py-4 text-center group">
      {editing ? (
        <div className="max-w-2xl mx-auto space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary italic text-center"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={cancel} disabled={saving} className={cancelBtnCls}>
              <X className="w-3 h-3" /> {isFr ? 'Annuler' : 'Anile'}
            </button>
            <button type="button" onClick={save} disabled={saving} className={saveBtnCls}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {isFr ? 'Enregistrer' : 'Sove'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm font-semibold italic text-slate-500 tracking-wide">
            {value}
          </p>
          {isEditor && (
            <button
              type="button"
              onClick={() => {
                setEditing(true)
                setDraft(value ?? '')
                setError(null)
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-primary"
              aria-label={isFr ? 'Modifier' : 'Modifye'}
            >
              <PenLine className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )

  // Collapsible variant
  const renderCollapsible = () => (
    <div>
      <div className="w-full flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors group">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-red-600 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span className="text-sm font-bold uppercase tracking-widest text-slate-600">
            {title}
          </span>
          {hint && (
            <span className="text-xs text-slate-400 ml-2">{hint}</span>
          )}
        </button>
        {isEditor && expanded && !editing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
              setDraft(value ?? '')
              setError(null)
            }}
            className="text-slate-400 hover:text-primary transition-colors"
            aria-label={isFr ? 'Modifier' : 'Modifye'}
          >
            <PenLine className="w-4 h-4" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {editing ? (
              <div className="mt-3 px-5 py-5 bg-amber-50/40 border border-amber-300 rounded-lg space-y-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.max(4, (draft.match(/\n/g)?.length ?? 0) + 3)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder={
                    isFr
                      ? 'Tapez le contenu de ce bloc…'
                      : 'Tape kontni blòk sa a…'
                  }
                />
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={cancel} disabled={saving} className={cancelBtnCls}>
                    <X className="w-3 h-3" /> {isFr ? 'Annuler' : 'Anile'}
                  </button>
                  <button type="button" onClick={save} disabled={saving} className={saveBtnCls}>
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    {isFr ? 'Enregistrer' : 'Sove'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 px-5 py-5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {value}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  // Hide whole block if value is null and editor is not active.
  // (Editors still don't see hidden blocks here — they should add the
  // field via the MetadataEditor first; that ships separately.)
  if (!value && !isEditor) return null

  return variant === 'compact' ? renderCompact() : renderCollapsible()

  // ── helpers ─────────────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    setError(null)
    try {
      const trimmed = draft.trim()
      await onSave(trimmed === '' ? null : trimmed)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  function cancel() {
    setEditing(false)
    setDraft(value ?? '')
    setError(null)
  }
}

const cancelBtnCls = cn(
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300',
  'bg-white px-3 py-1.5 text-xs font-semibold text-slate-600',
  'hover:border-slate-400 disabled:opacity-50',
)

const saveBtnCls = cn(
  'inline-flex items-center gap-1.5 rounded-md bg-primary text-white',
  'px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50',
)
