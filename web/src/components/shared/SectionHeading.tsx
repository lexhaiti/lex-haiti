'use client'

import React from 'react'
import { motion } from 'framer-motion'
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className={cn(
        'mb-10 lg:mb-12 flex items-end justify-between gap-6 flex-wrap',
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
    </motion.div>
  )
}
