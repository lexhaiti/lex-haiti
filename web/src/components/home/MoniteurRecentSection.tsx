'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Construction, Newspaper } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'
import { SectionHeading } from '@/components/shared/SectionHeading'

// The Moniteur ingestion pipeline isn't online yet (no /moniteur/[id] route,
// no API endpoint). Earlier this section listed mocked issue numbers whose
// links 404'd. Until the pipeline ships we show a single "in progress" card
// that sets the expectation honestly and links to the index.
const COPY = {
  fr: {
    eyebrow: 'Le Moniteur — Journal officiel',
    subtitle:
      "Le journal officiel de la République d'Haïti, indexé et recherchable.",
    statusKicker: 'En préparation',
    cardTitle: 'Indexation en cours du journal officiel',
    cardBody:
      "Numéros récents et historiques, avec recherche plein texte et liens depuis chaque loi vers le numéro qui l'a publiée.",
    cardCta: 'Suivre l’avancement',
  },
  ht: {
    eyebrow: 'Le Moniteur — Jounal ofisyèl',
    subtitle: "Jounal ofisyèl Repiblik d'Ayiti a, ki endekse epi k ap rechèche.",
    statusKicker: 'Nan preparasyon',
    cardTitle: 'Endeksasyon Jounal ofisyèl la ap fèt',
    cardBody:
      "Nimewo resan ak istorik, ak rechèch tèks konplè epi lyen depi chak lwa ale nan nimewo ki pibliye li a.",
    cardCta: 'Suiv pwogrè a',
  },
}

export default function MoniteurRecentSection() {
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  return (
    <section className="relative w-full bg-slate-50/40 py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        <SectionHeading title={copy.eyebrow} subtitle={copy.subtitle} />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.4 }}
          className="mt-2"
        >
          <Link
            href="/moniteur"
            className="group flex flex-col sm:flex-row items-start sm:items-center gap-5 rounded-md bg-white border border-slate-200 border-b-2 border-b-primary px-6 py-6 lg:px-8 lg:py-7 hover:border-slate-300 hover:border-b-primary hover:shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
          >
            <div className="relative flex-shrink-0">
              <Newspaper
                className="h-10 w-10 lg:h-12 lg:w-12 text-primary"
                strokeWidth={1.5}
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 lg:h-5 lg:w-5 items-center justify-center rounded-full bg-amber-500 ring-2 ring-white"
              >
                <Construction className="h-2.5 w-2.5 lg:h-3 lg:w-3 text-white" />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">
                {copy.statusKicker}
              </p>
              <p className="text-base lg:text-lg font-bold text-primary leading-tight mb-1.5">
                {copy.cardTitle}
              </p>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                {copy.cardBody}
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary mt-2 sm:mt-0 sm:ml-auto whitespace-nowrap">
              {copy.cardCta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
