/**
 * Universal Haitian official-act banner — devise + désignation de l'État.
 *
 * Every official act of the Haitian Republic opens with these two
 * lines. They're not stored on `LegalText` because they're invariant
 * for every row in the corpus; rendering them as a frontend constant
 * keeps the database tidy and the visual identity consistent.
 *
 * RSC-safe (no hooks, no client state).
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface DeviseBannerProps {
  /** Visual size variant. `default` for the law-detail hero;
   *  `compact` for inline / contextual placements. */
  size?: 'default' | 'compact'
  className?: string
}

export function DeviseBanner({
  size = 'default',
  className,
}: DeviseBannerProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center select-none',
        className,
      )}
      aria-label="République d'Haïti — Liberté Égalité Fraternité"
    >
      <p
        className={cn(
          'font-bold uppercase tracking-[0.3em]',
          size === 'compact' ? 'text-[9px]' : 'text-[10px]',
        )}
      >
        Liberté <span className="opacity-60">•</span> Égalité{' '}
        <span className="opacity-60">•</span> Fraternité
      </p>
      <p
        className={cn(
          'font-black tracking-tight mt-1',
          size === 'compact' ? 'text-xs' : 'text-sm',
        )}
      >
        République d&apos;Haïti
      </p>
    </div>
  )
}
