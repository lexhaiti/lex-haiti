/**
 * Small monospaced badge for the official act number ("LOI N° CL-007-09-09").
 *
 * Sits in the law-detail hero next to the title. Hidden when null —
 * not every category has an official number (constitutions, some
 * conventions). The category prefix (LOI / DÉCRET / ARRÊTÉ) is shown
 * before the identifier so the badge is self-explanatory.
 */
import React from 'react'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, { fr: string; ht: string }> = {
  loi: { fr: 'LOI', ht: 'LWA' },
  decret: { fr: 'DÉCRET', ht: 'DEKRÈ' },
  arrete: { fr: 'ARRÊTÉ', ht: 'ARÈTE' },
  circulaire: { fr: 'CIRCULAIRE', ht: 'SIRKILÈ' },
  convention: { fr: 'CONVENTION', ht: 'KONVANSYON' },
  constitution: { fr: 'CONSTITUTION', ht: 'KONSTITISYON' },
  code: { fr: 'CODE', ht: 'KÒD' },
}

interface OfficialNumberTabProps {
  value?: string | null
  category?: string
  lang?: 'fr' | 'ht'
  className?: string
}

export function OfficialNumberTab({
  value,
  category,
  lang = 'fr',
  className,
}: OfficialNumberTabProps) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const prefix = category && CATEGORY_LABELS[category]?.[lang]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full',
        'bg-white/10 border border-white/20 px-3 py-1',
        'text-[10px] font-bold uppercase tracking-widest',
        'backdrop-blur-sm',
        className,
      )}
    >
      {prefix && <span className="opacity-70">{prefix}</span>}
      {prefix && <span className="opacity-30">·</span>}
      <span className="font-mono tracking-wider">N° {trimmed}</span>
    </span>
  )
}
