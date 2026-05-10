/**
 * Inline error banner — red surface with optional leading icon.
 *
 * Single canonical replacement for the half-dozen
 * `border-red-200 bg-red-50` blocks scattered across pages. Two visual
 * densities:
 *   - `default` (`p-5`) — standalone error in a section
 *   - `compact` (`px-5 py-4`) — inline within an existing card / form
 *
 * Pass `<AlertCircle />` (or any other lucide icon) as `icon` to add a
 * leading glyph; omit for plain text-only errors.
 */
import React from 'react'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorBannerProps {
  /** The message body. Plain string or rich JSX (for links / actions). */
  children: React.ReactNode
  icon?: LucideIcon
  density?: 'default' | 'compact'
  className?: string
}

export function ErrorBanner({
  children,
  icon: Icon,
  density = 'default',
  className,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-red-200 bg-red-50 text-sm text-red-800',
        density === 'compact' ? 'px-5 py-4' : 'p-5',
        Icon && 'flex items-start gap-3',
        className,
      )}
    >
      {Icon && (
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden />
      )}
      <div className="flex-1">{children}</div>
    </div>
  )
}
