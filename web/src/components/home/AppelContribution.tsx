'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, MailIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'

const COPY = {
  fr: {
    eyebrow: 'Appel à contribution',
    heading: 'Le projet est en construction.',
    body: 'Universités, barreaux, magistrats, journalistes, étudiants : votre relecture, vos signalements et votre expertise font la qualité du corpus.',
    contact: 'Signaler ou contribuer',
    mission: 'La mission complète',
  },
  ht: {
    eyebrow: 'Apèl pou kontribisyon',
    heading: 'Pwojè a ap konstwi.',
    body: 'Inivèsite, baro, majistra, jounalis, etidyan : revizyon ou, siyalman ou ak ekspètiz ou bay kòpis la kalite.',
    contact: 'Siyale oswa kontribiye',
    mission: 'Misyon konplè a',
  },
}

export default function AppelContribution() {
  const { language } = useT()
  const copy = COPY[(language as 'fr' | 'ht') ?? 'fr']

  return (
    <section className="relative w-full bg-white py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl bg-primary p-8 sm:p-10 lg:p-14 overflow-hidden ring-1 ring-primary/10 shadow-[0_20px_60px_-20px_rgba(13,27,76,0.4)]"
        >
          {/* Subtle decorative atmosphere — Haitian flag tones, low intensity. */}
          <div className="absolute top-0 right-0 w-[320px] h-[320px] bg-blue-600/10 rounded-full blur-[110px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[320px] h-[320px] bg-red-600/8 rounded-full blur-[110px] -translate-x-1/3 translate-y-1/3 pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                {copy.eyebrow}
              </p>
              <h3 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight tracking-tight">
                {copy.heading}
              </h3>
              <div className="mt-5 h-[3px] w-16 bg-amber-400" />
              <p className="mt-5 text-white/85 text-sm sm:text-base lg:text-lg leading-relaxed max-w-2xl">
                {copy.body}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0 w-full lg:w-auto">
              <Link href="/contact" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 rounded-md bg-white text-primary hover:bg-slate-100 px-6 sm:px-7 font-semibold transition-colors active:scale-[0.98]"
                >
                  <MailIcon className="mr-2 w-4 h-4" />
                  {copy.contact}
                </Button>
              </Link>
              <Link href="/a-propos" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 rounded-md border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white/60 hover:text-white px-6 sm:px-7 font-medium transition-colors"
                >
                  {copy.mission}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
