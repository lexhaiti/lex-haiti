'use client'

import { CheckCircle2, FileEdit, Layers } from 'lucide-react'
import type { EditorialStatusFilter } from '@/lib/hooks/useAllTexts'
import { useLanguage } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'

const COPY = {
  fr: {
    all: 'Tous',
    published: 'Publiés',
    draft: 'Brouillons',
  },
  ht: {
    all: 'Tout',
    published: 'Pibliye',
    draft: 'Bouyon',
  },
}

const OPTIONS: ReadonlyArray<{
  value: EditorialStatusFilter
  icon: typeof CheckCircle2
}> = [
  { value: 'all', icon: Layers },
  { value: 'published', icon: CheckCircle2 },
  { value: 'draft', icon: FileEdit },
]

/**
 * Compact pill that lives inline with the other filters on `/lois`. Only
 * rendered when the visitor is signed in as an editor — its mere presence
 * signals "you're looking at the editor view," so the verbose "mode éditeur"
 * label of the previous design is no longer needed here.
 */
export function EditorialFilter({
  value,
  onChange,
  counts,
}: {
  value: EditorialStatusFilter
  onChange: (next: EditorialStatusFilter) => void
  counts?: Partial<Record<EditorialStatusFilter, number>>
}) {
  const { language } = useLanguage()
  const t = COPY[(language as 'fr' | 'ht') ?? 'fr']

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full',
        'border border-amber-200 bg-amber-50/70 backdrop-blur-sm',
        'p-0.5 shadow-sm h-9',
      )}
      role="group"
      aria-label={language === 'ht' ? 'Filtè editè' : 'Filtre éditeur'}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value
        const label = t[opt.value]
        const count = counts?.[opt.value]
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-full',
              'text-xs font-bold uppercase tracking-wider',
              'transition-all',
              active
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-amber-900/80 hover:text-slate-900 hover:bg-white/60',
            )}
          >
            <Icon
              className={cn(
                'h-3.5 w-3.5',
                active ? 'opacity-100' : 'opacity-70',
              )}
            />
            <span>{label}</span>
            {typeof count === 'number' && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums leading-none',
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 text-amber-900',
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
