'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Inline-edit affordance for one field in the law-detail view.
 *
 * Two states:
 * - **Idle**: renders ``displayValue`` inside the parent's existing
 *   typography. On hover (in editor mode) a small Pencil icon
 *   surfaces; click switches to edit mode. Public viewers see only
 *   the displayValue, no hint of editability.
 * - **Editing**: a controlled <input> or <textarea> replaces the
 *   display node. Enter saves (Shift+Enter on textarea inserts a
 *   newline), Escape cancels, the inline check/x buttons act as
 *   explicit save/cancel.
 *
 * Defaults are tuned for the dark hero gradient (white-translucent
 * surface, light text). Pass ``theme="light"`` (or override the
 * individual *ClassName props) when wiring fields rendered on a
 * light body surface — official_title and issuing_authority both
 * sit below the hero on white.
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
  /** Optional override for the empty-state placeholder span class.
   *  Defaults to ``text-white/40 italic`` (dark-hero friendly). */
  placeholderClassName?: string
  /** Optional override for the inline save button (Check icon). */
  saveBtnClassName?: string
  /** Optional override for the inline cancel button (X icon). */
  cancelBtnClassName?: string
  /** Optional override for the inline error message. */
  errorClassName?: string
  /** Optional kind.
   *  - ``year``: 4 digits, numeric input. Validates and clears at save.
   *  - ``date``: native ``<input type="date">``. Value is a YYYY-MM-DD
   *    ISO string (the format the backend's date columns expect).
   *  - ``textarea``: multi-line text. Enter inserts a newline; saves
   *    on blur or via the Check button. Use for issuing_authority and
   *    official_title which routinely span 2–4 lines.
   *  - ``text`` (default): free text, single line.
   */
  kind?: 'text' | 'year' | 'date' | 'textarea'
  /** Optional placeholder shown when value is empty + editor is in
   *  display mode. */
  emptyPlaceholder?: string
  /** ARIA label for the edit button — different per field. */
  editAriaLabel?: string
  /** ``"dark"`` (default) uses the hero gradient palette;
   *  ``"light"`` flips every default to slate/emerald-600 tones so the
   *  affordance reads against a white body surface without per-call
   *  className overrides. Individual *ClassName props still win. */
  theme?: 'dark' | 'light'
  /** Wrap layout. ``"inline"`` (default) keeps the affordance inside a
   *  ``<span>`` for inline-flex use. ``"block"`` uses a ``<div>`` so
   *  multi-line content (textarea / issuing-authority block) doesn't
   *  break out of an inline parent. */
  layout?: 'inline' | 'block'
}

export function EditableHeroField({
  value,
  onSave,
  children,
  isEditor = true,
  inputClassName,
  iconColorClassName,
  placeholderClassName,
  saveBtnClassName,
  cancelBtnClassName,
  errorClassName,
  kind = 'text',
  emptyPlaceholder,
  editAriaLabel = 'Modifier',
  theme = 'dark',
  layout = 'inline',
}: Props) {
  const isLight = theme === 'light'
  // Resolved class defaults — light theme flips every chrome colour so
  // the affordance reads on a white body surface; explicit overrides
  // (saveBtnClassName etc.) still win. Tailwind requires literal class
  // strings, so we ternary on ``isLight`` rather than build them.
  const _iconColorClassName =
    iconColorClassName ??
    (isLight
      ? 'text-slate-400 hover:text-slate-700'
      : 'text-white/60 hover:text-white')
  const _placeholderClassName =
    placeholderClassName ??
    (isLight ? 'text-slate-400 italic' : 'text-white/40 italic')
  const _saveBtnClassName =
    saveBtnClassName ??
    (isLight
      ? 'text-emerald-600 hover:text-emerald-700'
      : 'text-emerald-300 hover:text-emerald-200')
  const _cancelBtnClassName =
    cancelBtnClassName ??
    (isLight
      ? 'text-slate-400 hover:text-slate-700'
      : 'text-white/60 hover:text-white')
  const _errorClassName =
    errorClassName ?? (isLight ? 'text-red-600' : 'text-red-300')
  const _inputClassNameDefault = isLight
    ? cn(
        'rounded-md border border-slate-300 bg-white',
        'px-2 py-1 text-slate-900 placeholder:text-slate-400',
        'outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60',
        'disabled:opacity-50',
        'min-w-0 max-w-full',
      )
    : cn(
        'rounded-md border border-white/30 bg-white/10 backdrop-blur-sm',
        'px-2 py-1 text-white placeholder:text-white/40',
        'outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400/60',
        'disabled:opacity-50',
        'min-w-0 max-w-full',
      )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

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
    if (kind === 'date' && trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      // Native date input typically guarantees this format, but on
      // unsupported browsers the input falls back to a text field and
      // editors can paste arbitrary strings. Reject anything not ISO.
      setError('Format attendu : AAAA-MM-JJ')
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

  const Wrap = layout === 'block' ? 'div' : 'span'
  const wrapClass =
    layout === 'block'
      ? 'group/edit flex flex-col items-center gap-2 max-w-full min-w-0'
      : 'group/edit inline-flex items-center gap-2 max-w-full min-w-0'

  if (editing) {
    return (
      <Wrap
        className={
          layout === 'block'
            ? 'flex flex-col items-stretch gap-2 max-w-full w-full'
            : 'inline-flex items-center gap-2 max-w-full'
        }
      >
        {kind === 'textarea' ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // ``Enter`` saves (matches the single-line case); Shift+
              // Enter inserts a newline so editors can compose multi-
              // line values (issuing authority, Moniteur titles).
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void save()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
              }
            }}
            placeholder={emptyPlaceholder}
            className={cn(_inputClassNameDefault, 'resize-y', inputClassName)}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={kind === 'date' ? 'date' : 'text'}
            inputMode={kind === 'year' ? 'numeric' : undefined}
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
            className={cn(_inputClassNameDefault, inputClassName)}
          />
        )}
        <div
          className={
            layout === 'block'
              ? 'flex items-center justify-center gap-3'
              : 'contents'
          }
        >
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={cn(
              _saveBtnClassName,
              'disabled:opacity-50 flex-shrink-0',
            )}
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
            className={cn(
              _cancelBtnClassName,
              'disabled:opacity-50 flex-shrink-0',
            )}
            aria-label="Annuler"
          >
            <X className="w-4 h-4" />
          </button>
          {error && (
            <span className={cn('text-xs ml-1', _errorClassName)}>
              {error}
            </span>
          )}
        </div>
      </Wrap>
    )
  }

  return (
    <Wrap className={wrapClass}>
      <Wrap className="min-w-0">
        {value ? (
          children
        ) : emptyPlaceholder ? (
          <span className={_placeholderClassName}>{emptyPlaceholder}</span>
        ) : (
          children
        )}
      </Wrap>
      <button
        type="button"
        onClick={startEdit}
        className={cn(
          'opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0',
          _iconColorClassName,
        )}
        aria-label={editAriaLabel}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </Wrap>
  )
}
