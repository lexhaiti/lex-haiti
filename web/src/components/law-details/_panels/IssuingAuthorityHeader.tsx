/**
 * Authority block — renders `issuing_authority` as a centered header.
 *
 * Single-line (most common): "CORPS LÉGISLATIF" / "LE PRÉSIDENT DE LA
 * RÉPUBLIQUE" — collapses to one line, drawn out with letter-spacing.
 *
 * Multi-line (joint arrêtés or Conseil Présidentiel of multiple
 * members): the column layout reads as a list — institution name,
 * members below.
 *
 * Hidden when `value` is null/empty so old laws and non-applicable
 * categories degrade gracefully.
 *
 * Visually anchored with a small horizontal divider above so it reads
 * as a distinct "issuing organ" announcement, not a continuation of
 * the devise above.
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface IssuingAuthorityHeaderProps {
  value?: string | null
  className?: string
}

export function IssuingAuthorityHeader({
  value,
  className,
}: IssuingAuthorityHeaderProps) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 lg:gap-3 text-center',
        className,
      )}
    >
      {/* Three dots between two short rules — a typographic separator
          common in formal French legal printing. Visually marks the
          transition from the universal devise to the act-specific
          issuing organ. */}
      <span
        aria-hidden
        className="inline-flex items-center gap-2 text-amber-500/60 text-[8px] leading-none"
      >
        <span className="w-6 h-px bg-current" />
        <span>· · ·</span>
        <span className="w-6 h-px bg-current" />
      </span>

      <p
        // `whitespace-pre-line` preserves \n line breaks so multi-line
        // headers (joint ministers, CPT membership) render as written.
        // `tracking-[0.18em]` keeps single-line authorities visually
        // weighty without overflowing on narrow viewports.
        className="text-base sm:text-lg font-black uppercase tracking-[0.18em] whitespace-pre-line leading-snug"
      >
        {trimmed}
      </p>
    </div>
  )
}
