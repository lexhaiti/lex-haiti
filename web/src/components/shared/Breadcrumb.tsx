'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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
 * Reusable breadcrumb trail. Each segment is a small uppercase pill
 * separated by a chevron. The last segment is non-link (omit `href`).
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
    ? 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20'
    : 'bg-primary/5 text-primary/70 border border-primary/10 hover:bg-primary/10 hover:text-primary hover:border-primary/20'

  const currentCls = isDark
    ? 'bg-white/10 text-white border border-white/15'
    : 'bg-primary/10 text-primary border border-primary/15'

  const sepCls = isDark ? 'text-white/30' : 'text-primary/30'

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center', className)}>
      <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          const pillCls = cn(
            'inline-flex items-center px-2.5 py-1 rounded-md',
            'text-[10px] sm:text-xs font-bold uppercase tracking-widest',
            'transition-colors',
            isLast || !item.href ? currentCls : linkCls,
          )

          return (
            <li key={`${i}-${item.label}`} className="flex items-center gap-1.5 sm:gap-2">
              {item.href && !isLast ? (
                <Link href={item.href} className={pillCls}>
                  {item.label}
                </Link>
              ) : (
                <span className={pillCls} aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronRight className={cn('w-3.5 h-3.5 flex-shrink-0', sepCls)} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
