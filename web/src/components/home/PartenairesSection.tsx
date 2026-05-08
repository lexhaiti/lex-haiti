'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, GraduationCap, Scale } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { SectionHeading } from '@/components/shared/SectionHeading'

const COPY = {
  fr: {
    eyebrow: 'Partenaires',
    title: 'Construit avec les institutions du droit haïtien.',
    subtitle:
      'LexHaïti est un projet collectif. Les premiers partenariats — universités, barreaux, ONG juridiques — sont en cours de discussion.',
    types: [
      { icon: GraduationCap, label: 'Universités & facultés de droit' },
      { icon: Scale, label: 'Barreaux & ordres professionnels' },
      { icon: Building2, label: 'ONG & institutions publiques' },
    ],
    cta: 'Devenir partenaire',
  },
  ht: {
    eyebrow: 'Patnè',
    title: 'Bati ansanm ak enstitisyon dwa ayisyen yo.',
    subtitle:
      "LexHaïti se yon pwojè kolektif. Premye patenarya yo — inivèsite, baro, ONG jiridik — ap diskite kounye a.",
    types: [
      { icon: GraduationCap, label: 'Inivèsite ak fakilte dwa' },
      { icon: Scale, label: 'Baro ak òd pwofesyonèl' },
      { icon: Building2, label: 'ONG ak enstitisyon piblik' },
    ],
    cta: 'Vin yon patnè',
  },
}

export default function PartenairesSection() {
  const { language } = useT()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  return (
    <section className="relative w-full bg-slate-50/40 py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        <SectionHeading
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle}
        />

        {/* Partner-types grid — dashed border indicates "open to partners",
            not yet filled with logos. */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 mb-10"
        >
          {copy.types.map((t, i) => {
            const Icon = t.icon
            return (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="flex items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-5 transition-colors hover:border-primary/30 hover:bg-white"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-slate-700 leading-tight">
                  {t.label}
                </span>
              </motion.div>
            )
          })}
        </motion.div>

        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-6 py-3 text-sm font-semibold hover:bg-primary/90 transition-colors group"
        >
          {copy.cta}
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  )
}
