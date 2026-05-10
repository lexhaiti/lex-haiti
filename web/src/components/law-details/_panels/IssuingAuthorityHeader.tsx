/**
 * Authority block — renders `issuing_authority` as a multi-line header.
 *
 * Single-line (most common): "CORPS LÉGISLATIF" or "LE PRÉSIDENT DE LA
 * RÉPUBLIQUE" — collapses to one line.
 *
 * Multi-line (joint arrêtés or Conseil Présidentiel): the column
 * layout reads as a list — institution name first, members below.
 *
 * Hidden when `value` is null/empty so old laws and non-applicable
 * categories degrade gracefully.
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
        'inline-flex flex-col items-center text-center',
        className,
      )}
    >
      <p
        // `whitespace-pre-line` preserves \n line breaks so multi-line
        // headers (joint ministers, CPT membership) render as written.
        className="text-base sm:text-lg font-black uppercase tracking-wider whitespace-pre-line leading-tight"
      >
        {trimmed}
      </p>
    </div>
  )
}
