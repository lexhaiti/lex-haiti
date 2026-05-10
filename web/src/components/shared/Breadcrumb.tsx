'use client'

import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BreadcrumbItem = {
  label: string
  /** Omit on the current/last item — it renders as a non-link. */
  href?: string
}

type Props = {
  items: BreadcrumbItem[]
  /**
   * Visual variant.
   *  - `dark`  (default) — for navy page headers (white text on navy).
   *  - `light` — for white-bg pages (deep navy text).
   */
  variant?: 'dark' | 'light'
  className?: string
}

/**
 * Reusable breadcrumb trail. Lightweight inline style — small text, a
 * Home icon for the first segment when it links to '/', chevrons between
 * items, and a slightly brighter color on the current page.
 *
 * Used inside dark page headers (StandardPageHeader and the bespoke
 * moniteur masthead) — pass `variant="light"` for white backgrounds.
 *
 * Usage:
 *   <Breadcrumb items={[
 *     { label: 'Accueil', href: '/' },
 *     { label: 'Lois', href: '/lois' },
 *     { label: 'Constitution' },     // current page — no href
 *   ]} />
 */
export function Breadcrumb({ items, variant = 'dark', className }: Props) {
  if (!items || items.length === 0) return null

  const isDark = variant === 'dark'

  const linkCls = isDark
    ? 'text-white/50 hover:text-white'
    : 'text-slate-500 hover:text-slate-900'

  const currentCls = isDark ? 'text-white/85' : 'text-slate-900'

  const sepCls = isDark ? 'text-white/25' : 'text-slate-300'

  return (
    <nav
      aria-label="Fil d'ariane"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium',
        className,
      )}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const isHomeRoot = i === 0 && item.href === '/'
        const cls = cn(
          'inline-flex items-center gap-1 transition-colors',
          isLast || !item.href ? currentCls : linkCls,
        )

        return (
          <span key={`${i}-${item.label}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href} className={cls}>
                {isHomeRoot && <Home className="w-3 h-3" />}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span className={cls} aria-current={isLast ? 'page' : undefined}>
                {isHomeRoot && <Home className="w-3 h-3" />}
                <span>{item.label}</span>
              </span>
            )}
            {!isLast && (
              <ChevronRight className={cn('w-3 h-3 flex-shrink-0', sepCls)} />
            )}
          </span>
        )
      })}
    </nav>
  )
}
