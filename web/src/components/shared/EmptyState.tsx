/**
 * Standard empty / not-found placeholder.
 *
 * Used wherever a list/grid resolves to zero items — search-no-results,
 * empty corpus listings, blank editorial queues, 404 surfaces. Keeps a
 * single visual language: typographic hierarchy (eyebrow → title →
 * description → actions → suggestions). No decorative icon — the copy
 * carries the meaning.
 *
 * Tone variants influence the eyebrow color:
 *   - `default`   — slate-400 (calm, benign empty)
 *   - `attention` — red-500 (missing resource, "page not found")
 *
 * Density: `default` for full-section placeholders, `compact` for
 * inline / in-card empty states.
 *
 * Entry animation is CSS-only so it works in paused / strict-mode tabs.
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** Single-line eyebrow above the title — small, uppercase, muted. */
  eyebrow?: string
  title?: string
  description?: string
  /** Optional CTA region — pills, links, or buttons. */
  actions?: React.ReactNode
  /** Optional supplementary block under the actions — typically a list
   *  of suggestion chips so the user has something to click instead of
   *  a dead end. */
  suggestions?: React.ReactNode
  tone?: 'default' | 'attention'
  /** Vertical breathing room. `default` for hero placeholders. */
  density?: 'default' | 'compact'
  className?: string
}

export function EmptyState({
  eyebrow,
  title,
  description,
  actions,
  suggestions,
  tone = 'default',
  density = 'default',
  className,
}: EmptyStateProps) {
  const isAttention = tone === 'attention'

  return (
    <div
      className={cn(
        'relative w-full',
        density === 'compact' ? 'py-8' : 'py-12 lg:py-16',
        className,
      )}
    >
      <div className="relative z-10 mx-auto max-w-xl text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
        {eyebrow && (
          <p
            className={cn(
              'text-xs font-bold uppercase tracking-widest mb-4',
              isAttention ? 'text-red-500' : 'text-slate-400',
            )}
          >
            {eyebrow}
          </p>
        )}

        {title && (
          <h2 className="text-2xl lg:text-3xl font-black text-slate-900 mb-4 tracking-tight leading-tight">
            {title}
          </h2>
        )}

        {description && (
          <p className="text-sm lg:text-base text-slate-500 leading-relaxed mx-auto max-w-md">
            {description}
          </p>
        )}

        {actions && <div className="mt-8">{actions}</div>}

        {suggestions && (
          <div className="mt-12 pt-8 border-t border-slate-200/70">
            {suggestions}
          </div>
        )}
      </div>
    </div>
  )
}
