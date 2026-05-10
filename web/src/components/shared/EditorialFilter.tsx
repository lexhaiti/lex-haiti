'use client'

import { CheckCircle2, FileEdit, Layers } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

/**
 * Closed set of editorial-view scopes the toggle exposes:
 *  - `all`        — show everything regardless of editorial state
 *  - `published`  — only items the public site would render
 *  - `draft`      — only items still pending publication
 *
 * Defined here (not in a hook) because this is the canonical type for
 * the filter API; consumers (useAllTexts, moniteur page, etc.) import
 * from the component.
 */
export type EditorialStatusFilter = 'all' | 'published' | 'draft'

// Copy lives at `editorialFilter.*` in i18n/{fr,ht}.ts.

const OPTIONS: ReadonlyArray<{
  value: EditorialStatusFilter
  icon: typeof CheckCircle2
}> = [
  { value: 'all', icon: Layers },
  { value: 'published', icon: CheckCircle2 },
  { value: 'draft', icon: FileEdit },
]

/**
 * Compact pill that scopes a listing to all / published-only / drafts-only.
 * Only rendered when the visitor is signed in as an editor — its mere
 * presence signals "you're looking at the editor view," so no extra
 * "mode éditeur" label is needed.
 *
 * The amber palette is intentional and consistent across both light page
 * backgrounds (white filter bar on /lois) and dark page headers
 * (navy masthead on /moniteur). Editor surfaces in this app standardize
 * on amber as the "editorial chrome" accent — see EditorBar / draft
 * indicators / pending-review chips.
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
  const { t } = useT()

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full',
        'border border-amber-200 bg-amber-50/70 backdrop-blur-sm',
        'p-0.5 shadow-sm h-9',
      )}
      role="group"
      aria-label={t('editorialFilter.ariaLabel')}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value
        const label = t(`editorialFilter.${opt.value}`)
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
