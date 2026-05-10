/**
 * Labelled form field — single canonical implementation that supersedes
 * the formerly-duplicated `Field` components in both editorial import
 * panels (LegalTextImportPanel, MoniteurImportPanel).
 *
 * Combines:
 *   - the LegalText panel's `required` + `error` props (validation)
 *   - the Moniteur panel's `autoFilled` + `lowConfidenceLabel` props
 *     (confidence visualisation for OCR-extracted metadata)
 *
 * Both decorations are mutually exclusive in practice: a field is
 * either user-input (required/error) or auto-filled (confidence). If
 * both are passed, the auto-fill decoration wins because the user
 * hasn't yet had a chance to interact.
 */
import React from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  /** Helper text rendered under the input — explains the format,
   *  example values, or constraints. */
  hint?: string
  /** Marks the field as required with a red asterisk after the label. */
  required?: boolean
  /** Validation error to render under the input. Also tints the label
   *  asterisk when present. Pass `undefined` to clear. */
  error?: string
  /** OCR/extractor confidence score, 0–1. When set, the label sprouts
   *  a small Sparkles icon ("auto-filled"). When < 0.6, the icon is
   *  replaced with a `lowConfidenceLabel` warning instead. Leave
   *  undefined for plain user-input fields. */
  autoFilled?: number
  /** Localized "low confidence" label. Required only when `autoFilled`
   *  is supplied — kept as a prop so the i18n boundary stays at the
   *  call site. */
  lowConfidenceLabel?: string
  className?: string
  children: React.ReactNode
}

export function Field({
  label,
  hint,
  required,
  error,
  autoFilled,
  lowConfidenceLabel,
  className,
  children,
}: FieldProps) {
  const isAutoFilled = autoFilled !== undefined
  const isLowConfidence = isAutoFilled && (autoFilled as number) < 0.6

  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
        {required && <span className="text-red-500">*</span>}
        {isAutoFilled && !isLowConfidence && (
          <Sparkles
            className="w-3 h-3 text-amber-500"
            aria-label="Auto-filled"
          />
        )}
        {isLowConfidence && lowConfidenceLabel && (
          <span className="ml-1 inline-flex items-center gap-1 text-[9px] font-bold normal-case tracking-normal text-amber-700">
            ⚠ {lowConfidenceLabel}
          </span>
        )}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
          {hint}
        </span>
      )}
      {error && (
        <span className="mt-1 block text-[11px] leading-relaxed text-red-600">
          {error}
        </span>
      )}
    </label>
  )
}
