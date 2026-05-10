/**
 * Section card wrapper for editorial forms.
 *
 * Wraps a logical group of form fields with a card surface, optional
 * leading icon, title, and helper text. Used by the legal-text import
 * panel and any future editorial form that needs a sectioned layout.
 *
 * Numbered "wizard step" sections (Moniteur import) use a different
 * primitive (`StepCard` in MoniteurImportPanel) since the numeric
 * eyebrow + collapsed/active states are wizard-specific concerns.
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface FormSectionProps {
  title: string
  /** Sub-text rendered under the title — describes what the section
   *  contains or how to fill it in. */
  help?: string
  /** Optional leading icon (lucide-react component) rendered in a
   *  rounded badge. */
  icon?: React.ComponentType<{ className?: string }>
  className?: string
  children: React.ReactNode
}

export function FormSection({
  title,
  help,
  icon: Icon,
  className,
  children,
}: FormSectionProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200 bg-white p-6 sm:p-8',
        className,
      )}
    >
      <div className="mb-5 flex items-center gap-3">
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-primary">
            <Icon className="w-4.5 h-4.5" />
          </span>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-900 leading-tight">
            {title}
          </h2>
          {help && (
            <p className="text-xs text-slate-500 leading-relaxed mt-1 max-w-3xl">
              {help}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}
