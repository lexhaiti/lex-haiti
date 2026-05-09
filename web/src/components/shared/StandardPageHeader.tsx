'use client'

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

import { Breadcrumb, type BreadcrumbItem } from '@/components/shared/Breadcrumb'

interface StandardPageHeaderProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  /**
   * Optional breadcrumb path. When provided, rendered above the h1 in the
   * dark variant. The last item should be the current page (no href).
   */
  breadcrumbs?: BreadcrumbItem[]
  children?: React.ReactNode
}

export function StandardPageHeader({
  title,
  subtitle,
  icon: Icon,
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

      <div className="relative z-10 container pt-28 lg:pt-36 pb-28 lg:pb-36">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumb className="mb-6" items={breadcrumbs} />
        )}

        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl lg:text-6xl font-black mb-6 leading-tight tracking-tight"
        >
          {title}
        </motion.h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-300 text-lg lg:text-xl leading-relaxed max-w-3xl border-l-2 border-red-600 pl-6"
          >
            {subtitle}
          </motion.p>
        )}

        {children}
      </div>
    </div>
  )
}
