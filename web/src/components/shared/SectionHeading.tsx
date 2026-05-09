// Server Component — was previously `'use client'` solely for the
// framer-motion entrance animation. Switching to tailwindcss-animate's
// `animate-in` utilities (CSS-only) lets every consumer that uses
// SectionHeading also be a server component without needing a client
// boundary.

import React from 'react'
import { cn } from '@/lib/utils'

type Props = {
  /**
   * Small uppercase label above the title (e.g., "Actualités", "Principes").
   * Hidden when not provided.
   */
  eyebrow?: string
  /** Section heading text — rendered as <h2>. */
  title: string
  /** Optional descriptive paragraph below the amber accent line. */
  subtitle?: string
  /**
   * Optional right-aligned slot — typically a "see all" link or button.
   * Sits on the same row as the heading block on wide screens, wraps below
   * on small ones.
   */
  action?: React.ReactNode
  /** Override the heading's max width (default: max-w-3xl on title only). */
  titleMaxWidth?: string
  /** Extra classes for the outer container. */
  className?: string
}

/**
 * Standard heading block used across home page sections.
 *
 * Visual recipe (canonical for the LexHaïti design system):
 *   eyebrow (uppercase navy/65)
 *   h2 (extrabold navy)
 *   amber accent line (3px × 4rem)
 *   subtitle (slate-600 body)
 *
 * To change spacing, weight, or accent across all sections, edit this file
 * — every consumer follows.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
  titleMaxWidth = 'max-w-3xl',
  className,
}: Props) {
  return (
    <div
      className={cn(
        'mb-10 lg:mb-12 flex items-end justify-between gap-6 flex-wrap',
        // CSS-only entrance animation; runs on mount, no client JS.
        'animate-in fade-in slide-in-from-bottom-2 duration-500',
        className,
      )}
    >
      <div className="max-w-full">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-widest text-primary/65">
            {eyebrow}
          </p>
        )}
        <h2
          className={cn(
            'text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-primary leading-tight',
            eyebrow && 'mt-3',
            titleMaxWidth,
          )}
        >
          {title}
        </h2>
        <div className="mt-5 h-[3px] w-16 bg-amber-400" />
        {subtitle && (
          <p className="mt-5 text-base lg:text-lg text-slate-600 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
