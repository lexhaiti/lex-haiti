/**
 * Standard empty-state placeholder.
 *
 * Used wherever a list/grid resolves to zero items — search-no-results,
 * empty corpus listings, blank editorial review queues, etc. Keeps the
 * dashed-border + centred icon + title + description + actions layout
 * consistent across surfaces.
 *
 * Two visual tones:
 *   - `default` (neutral grey) — the result is empty but the request
 *     was valid; e.g. "no published laws yet".
 *   - `attention` (slightly more prominent) — the user did something
 *     that returned nothing; e.g. "no results for 'foo'".
 */
import React from 'react'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  /** Optional CTA region — pills, links, or buttons. */
  actions?: React.ReactNode
  tone?: 'default' | 'attention'
  /** Padding density. `default` = py-12, `compact` = py-8 — the latter
   *  for inline (in-card) empty states. */
  density?: 'default' | 'compact'
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  tone = 'default',
  density = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed text-center',
        density === 'compact' ? 'p-8' : 'p-12',
        tone === 'attention'
          ? 'border-slate-200'
          : 'border-slate-200 bg-slate-50/50',
        className,
      )}
    >
      {Icon && (
        <Icon className="w-10 h-10 mx-auto text-slate-300 mb-4" aria-hidden />
      )}
      {title && (
        <p className="text-slate-700 font-bold mb-1">{title}</p>
      )}
      {description && (
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {description}
        </p>
      )}
      {actions && <div className="mt-6">{actions}</div>}
    </div>
  )
}
