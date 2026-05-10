/**
 * Universal Haitian official-act banner — devise + désignation de l'État.
 *
 * Every official act of the Haitian Republic opens with these two
 * lines. They're not stored on `LegalText` because they're invariant
 * for every row in the corpus; rendering them as a frontend constant
 * keeps the database tidy and the visual identity consistent.
 *
 * The visual treatment mirrors the printed Moniteur masthead: a small
 * ornamental glyph above the devise, ample letter-spacing on the
 * three words (drawn out so the page *feels* official), and a
 * generous gap before the "République d'Haïti" line. Centered, so
 * the block reads as an emblem rather than a banner.
 *
 * RSC-safe (no hooks, no client state).
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface DeviseBannerProps {
  /** Visual size variant. `default` for the law-detail body identity
   *  preamble; `compact` for inline / contextual placements. */
  size?: 'default' | 'compact'
  className?: string
}

export function DeviseBanner({
  size = 'default',
  className,
}: DeviseBannerProps) {
  const isCompact = size === 'compact'
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center select-none',
        isCompact ? 'gap-1' : 'gap-3 lg:gap-4',
        className,
      )}
      aria-label="République d'Haïti — Liberté Égalité Fraternité"
    >
      {/* Ornamental glyph — three asterisks (asterism, U+2042) signal
          a decorative break in formal typography. Mirrors the small
          dingbat the Moniteur uses above the devise on official acts. */}
      {!isCompact && (
        <span className="text-amber-500/70 text-[10px] tracking-[0.5em] leading-none">
          ⁂
        </span>
      )}

      <p
        className={cn(
          'font-bold uppercase',
          // Wide tracking on each letter — this is how the printed
          // Moniteur draws out the devise. Adjusted slightly tighter
          // on the bullets so the dots stay visually anchored.
          isCompact
            ? 'text-[9px] tracking-[0.3em]'
            : 'text-[11px] sm:text-xs tracking-[0.42em]',
        )}
      >
        Liberté{' '}
        <span className="opacity-40 mx-0.5">•</span>{' '}
        Égalité{' '}
        <span className="opacity-40 mx-0.5">•</span>{' '}
        Fraternité
      </p>

      <p
        className={cn(
          'font-black tracking-tight',
          isCompact ? 'text-xs' : 'text-base lg:text-lg',
        )}
      >
        République d&apos;Haïti
      </p>
    </div>
  )
}
