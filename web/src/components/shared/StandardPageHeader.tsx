'use client'

import { Breadcrumb, type BreadcrumbItem } from '@/components/shared/Breadcrumb'

interface StandardPageHeaderProps {
  title: string
  subtitle?: string
  /**
   * Optional breadcrumb path. When provided, rendered above the h1 in the
   * dark variant. The last item should be the current page (no href).
   */
  breadcrumbs?: BreadcrumbItem[]
  children?: React.ReactNode
}

// Note on the dropped `icon` prop: it was accepted but never rendered.
// The dead prop also broke RSC ↔ Client serialization (LucideIcon
// components can't cross the server/client boundary as plain values),
// so server-component pages — /thematiques, /legal, /privacy,
// /a-propos, /contact — would crash at hydration. Removing the prop
// fixes both the dead code AND the cross-boundary error.

export function StandardPageHeader({
  title,
  subtitle,
  breadcrumbs,
  children,
}: StandardPageHeaderProps) {
  return (
    <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
      {/* Background decorative elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* Spacer reserving the fixed menu nav's height (h-20). Decoupling
          this from the inner padding lets us use balanced py-* values
          below so the breadcrumb and the last element each sit the same
          visual distance from the dark band's edges. */}
      <div aria-hidden className="h-20" />
      <div className="relative z-10 container py-12 lg:py-20">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumb className="mb-6" items={breadcrumbs} />
        )}

        <h1 className="animate-in fade-in slide-in-from-top-3 duration-500 delay-100 fill-mode-both text-4xl lg:text-6xl font-black mb-6 leading-tight tracking-tight">
          {title}
        </h1>

        {subtitle && (
          <p className="animate-in fade-in duration-500 delay-200 fill-mode-both text-slate-300 text-lg lg:text-xl leading-relaxed">
            {subtitle}
          </p>
        )}

        {children}
      </div>
    </div>
  )
}
