'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'
import { useQuickAccess } from '@/lib/hooks/useQuickAccess'
import { toLawCardModel } from '@/lib/law-ui/toLawModel'
import { LawCard } from '@/components/shared/LawCard'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

function SkeletonCard() {
  return (
    <div className="h-full rounded-3xl border border-gray-100 bg-white p-7 pt-9 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="h-14 w-14 rounded-full bg-gray-100" />
        <div className="h-6 w-24 rounded-full bg-gray-100" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-6 w-2/3 rounded bg-gray-100" />
        <div className="h-5 w-24 rounded bg-gray-100" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
      </div>
      <div className="mt-8 border-t border-gray-100 pt-5 flex justify-between">
        <div className="h-8 w-28 rounded bg-gray-100" />
        <div className="h-10 w-10 rounded-full bg-gray-100" />
      </div>
    </div>
  )
}

export function QuickAccessSection() {
  const { t, language } = useT()
  const state = useQuickAccess()

  const models = useMemo(() => {
    if (state.status !== 'success') return []
    return state.data.map((item) => toLawCardModel({ item, language }))
  }, [state, language])

  return (
    <section id="quick-access" className="relative w-full overflow-hidden bg-gray-50/60 py-16 lg:py-24 border-t border-gray-100">

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="mb-10 md:mb-14 flex flex-col items-center text-center"
        >
          <div className="w-full max-w-3xl mx-auto">
            {/* Eyebrow */}
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center justify-center gap-2">
              <span className="h-px w-6 bg-slate-300" />
              {language === 'fr' ? 'Corpus principal' : 'Kòpis prensipal'}
              <span className="h-px w-6 bg-slate-300" />
            </p>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="mb-5 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.1]"
            >
              {t('home.quickAccess.title')}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed"
            >
              {t('home.quickAccess.subtitle')}
            </motion.p>
          </div>

          {state.status === 'error' && (
            <p className="mt-6 text-sm text-red-600">{state.error.message}</p>
          )}
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
          }}
          className={cn(
            'mx-auto',
            'grid gap-6 sm:gap-8 xl:gap-10',
            // Adapt grid to actual card count to avoid awkward left-aligned single cards.
            state.status === 'success' && models.length === 1 && 'max-w-md grid-cols-1',
            state.status === 'success' && models.length === 2 && 'max-w-3xl grid-cols-1 sm:grid-cols-2',
            (state.status !== 'success' || models.length === 0 || models.length >= 3) &&
              'max-w-7xl grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
            'mb-12 md:mb-16',
          )}
        >
          {state.status === 'loading' &&
            Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={`sk-${i}`}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <SkeletonCard />
              </motion.div>
            ))}

          {state.status === 'success' && models.length === 0 && (
            <motion.div
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1 },
              }}
              className="col-span-full text-center py-16"
            >
              <p className="text-gray-400 text-lg">
                {t('home.quickAccess.empty', {
                  fallback:
                    language === 'fr'
                      ? 'Aucun texte disponible pour le moment.'
                      : 'Pa gen tèks disponib pou kounye a.',
                })}
              </p>
            </motion.div>
          )}

          {state.status === 'success' &&
            models.map((model, idx) => (
              <motion.div
                key={model.id}
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <LawCard model={model} index={idx} />
              </motion.div>
            ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex justify-center"
        >
          <Link
            href="/lois"
            className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:bg-slate-800 hover:shadow-xl active:scale-[0.98]"
          >
            {t('home.quickAccess.viewAll')}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
