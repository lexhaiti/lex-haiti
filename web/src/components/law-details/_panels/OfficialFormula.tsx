/**
 * Verbatim renderer for `official_formula` — the post-dispositif
 * block (Votée + LIBERTÉ banner + Donné + signature lines).
 *
 * Stored as raw text. Displayed in italic, smaller, with a subtle
 * left border so it reads as a formal closing block distinct from
 * the article body above.
 *
 * Hidden when null. Old laws and decree-style acts that only carry
 * a "Donné au …" line still render through this component — the
 * formula text is truncated to whatever the source provides.
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface OfficialFormulaProps {
  value?: string | null
  /** Caption above the block. Optional — pass the i18n string from the
   *  parent (typically `lawDetail.officialFormula`). */
  caption?: string
  className?: string
}

export function OfficialFormula({
  value,
  caption,
  className,
}: OfficialFormulaProps) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200 bg-slate-50/40 p-6 lg:p-8',
        className,
      )}
      aria-label={caption ?? 'Formule de promulgation'}
    >
      {caption && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
          {caption}
        </p>
      )}
      <div
        // `whitespace-pre-line` preserves the line breaks the parser
        // captured. The text has a slight left rail for visual weight,
        // matching the considérants block above the dispositif.
        className="text-sm lg:text-[15px] italic text-slate-700 leading-relaxed whitespace-pre-line border-l-2 border-amber-300 pl-5"
      >
        {trimmed}
      </div>
    </section>
  )
}
