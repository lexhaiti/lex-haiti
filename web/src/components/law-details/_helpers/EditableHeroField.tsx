'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Inline-edit affordance for one field in the law-detail hero.
 *
 * Two states:
 * - **Idle**: renders ``displayValue`` inside the parent's existing
 *   typography. On hover (in editor mode) a small Pencil icon
 *   surfaces; click switches to edit mode. Public viewers see only
 *   the displayValue, no hint of editability.
 * - **Editing**: a controlled <input> replaces the display node.
 *   Enter saves, Escape cancels, the inline check/x buttons act as
 *   explicit save/cancel.
 *
 * The hero sits on a dark gradient background — input + button styling
 * are tuned for that contrast (white-translucent surface, light text).
 * For a light-background variant, override via ``inputClassName``.
 */

type Props = {
  /** The current value rendered when not editing. */
  value: string
  /** Persist handler. Receives the new trimmed string; throw to surface
   *  the error via the inline error message. Empty-string handling is
   *  the caller's concern (some fields are required, some clear to null). */
  onSave: (next: string) => Promise<void>
  /** Free-form node rendered when not editing. Usually a span / h1
   *  carrying the parent's typography classes. */
  children: React.ReactNode
  /** When false, renders ``children`` straight through with no editor
   *  affordance. Defaults to true so callers don't have to think
   *  about it — they conditionally render the whole component instead. */
  isEditor?: boolean
  /** Optional override for the input's class — by default we style for
   *  the dark hero background. */
  inputClassName?: string
  /** Optional override for the icon button colour. */
  iconColorClassName?: string
  /** Optional kind. ``year`` validates 4 digits and treats the input
   *  as numeric; otherwise free text. */
  kind?: 'text' | 'year'
  /** Optional placeholder shown when value is empty + editor is in
   *  display mode. */
  emptyPlaceholder?: string
  /** ARIA label for the edit button — different per field. */
  editAriaLabel?: string
}

export function EditableHeroField({
  value,
  onSave,
  children,
  isEditor = true,
  inputClassName,
  iconColorClassName = 'text-white/60 hover:text-white',
  kind = 'text',
  emptyPlaceholder,
  editAriaLabel = 'Modifier',
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset draft whenever an external value change comes in (e.g. after
  // a successful save + refetch, the new value flows back via props).
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function startEdit() {
    setDraft(value)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  async function save() {
    const trimmed = draft.trim()
    if (kind === 'year' && trimmed && !/^\d{4}$/.test(trimmed)) {
      setError('Année à 4 chiffres')
      return
    }
    if (trimmed === value.trim()) {
      cancel()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch (e: any) {
      setError(e?.body?.detail ?? e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!isEditor) {
    return <>{children}</>
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-2 max-w-full">
        <input
          ref={inputRef}
          type={kind === 'year' ? 'text' : 'text'}
          inputMode={kind === 'year' ? 'numeric' : 'text'}
          pattern={kind === 'year' ? '\\d{4}' : undefined}
          maxLength={kind === 'year' ? 4 : undefined}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          placeholder={emptyPlaceholder}
          className={cn(
            'rounded-md border border-white/30 bg-white/10 backdrop-blur-sm',
            'px-2 py-1 text-white placeholder:text-white/40',
            'outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400/60',
            'disabled:opacity-50',
            'min-w-0 max-w-full',
            inputClassName,
          )}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="text-emerald-300 hover:text-emerald-200 disabled:opacity-50 flex-shrink-0"
          aria-label="Enregistrer"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="text-white/60 hover:text-white disabled:opacity-50 flex-shrink-0"
          aria-label="Annuler"
        >
          <X className="w-4 h-4" />
        </button>
        {error && (
          <span className="text-xs text-red-300 ml-1">{error}</span>
        )}
      </span>
    )
  }

  return (
    <span className="group/edit inline-flex items-center gap-2 max-w-full min-w-0">
      <span className="min-w-0">
        {value ? (
          children
        ) : emptyPlaceholder ? (
          <span className="text-white/40 italic">{emptyPlaceholder}</span>
        ) : (
          children
        )}
      </span>
      <button
        type="button"
        onClick={startEdit}
        className={cn(
          'opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0',
          iconColorClassName,
        )}
        aria-label={editAriaLabel}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </span>
  )
}
