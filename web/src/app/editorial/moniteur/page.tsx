'use client'

import { motion } from 'framer-motion'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { useT } from '@/i18n/useT'
import { MoniteurAdminTable } from '@/app/moniteur/_components/MoniteurAdminTable'

// Editorial dashboard for Moniteur issues. The table body lives in
// the shared ``MoniteurAdminTable`` so the public /moniteur page can
// also surface it inline under a "Vue éditeur" toggle — clicking the
// toggle there shouldn't navigate away from the public listing.

export default function MoniteurDashboardPage() {
  const { t } = useT()

  return (
    <div className="min-h-screen bg-white">
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
        </div>

        <div className="relative z-10 container py-12 lg:py-20 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: t('editorial.moniteur.list.crumbs.home'), href: '/' },
              { label: t('editorial.moniteur.list.crumbs.editor'), href: '/profile' },
              { label: t('editorial.moniteur.list.crumbs.moniteur') },
            ]}
          />

          <div className="max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white"
            >
              {t('editorial.moniteur.list.title')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-slate-300 text-lg lg:text-xl leading-relaxed"
            >
              {t('editorial.moniteur.list.subtitle')}
            </motion.p>
          </div>
        </div>
      </div>

      <div className="container py-12 lg:py-16">
        <MoniteurAdminTable />
      </div>
    </div>
  )
}
