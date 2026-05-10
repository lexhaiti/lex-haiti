/**
 * Standard centred spinner — replaces the half-dozen
 * `Loader2 w-8 h-8 text-slate-300 animate-spin` blocks copy-pasted
 * across pages. Renders a vertically-padded container so it sits
 * comfortably inside both viewport-height and section-bounded layouts.
 *
 * Variants:
 *   - `inline` (default) — centred in its parent with `py-20` padding
 *   - `viewport` — `min-h-screen` flex centre, for full-page loading
 *     states (use sparingly; prefer Suspense + RSC where possible)
 */
import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
  variant?: 'inline' | 'viewport'
  /** Optional muted label below the spinner — typically a localized
   *  "Chargement…" / "N ap chaje…". Omit for icon-only. */
  label?: string
  className?: string
}

export function LoadingState({
  variant = 'inline',
  label,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        variant === 'viewport'
          ? 'min-h-screen flex items-center justify-center'
          : 'flex flex-col items-center justify-center py-20 gap-3',
        className,
      )}
    >
      <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
      {label && <span className="text-sm text-slate-500">{label}</span>}
    </div>
  )
}
