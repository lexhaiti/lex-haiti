'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Newspaper } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { MoniteurIssueCard } from '@/components/shared/MoniteurIssueCard'
import {
  listMoniteurIssues,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'

const COPY = {
  fr: {
    eyebrow: 'Le Moniteur — Journal officiel',
    subtitle:
      "Le journal officiel de la République d'Haïti, indexé et recherchable.",
    cta: 'Voir tous les numéros',
    empty:
      "Les numéros du Moniteur seront publiés dès qu'ils auront été ingérés.",
    issuesLabel: 'numéro(s) publié(s)',
  },
  ht: {
    eyebrow: 'Le Moniteur — Jounal ofisyèl',
    subtitle: "Jounal ofisyèl Repiblik d'Ayiti a, ki endekse epi rechèche.",
    cta: 'Wè tout nimewo yo',
    empty: 'Nimewo Moniteur yo ap pibliye depi yo enpòte yo.',
    issuesLabel: 'nimewo pibliye',
  },
}

export default function MoniteurRecentSection() {
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  const [issues, setIssues] = useState<MoniteurIssueRead[] | null>(null)
  const [total, setTotal] = useState(0)

  // Home recents shows up to 4 — enough to feel like a real list, not so
  // many that the section dominates the homepage. The /moniteur listing
  // page handles deeper browsing.
  useEffect(() => {
    let cancelled = false
    listMoniteurIssues({ only_published: true, limit: 4 })
      .then((res) => {
        if (cancelled) return
        setIssues(res.items)
        setTotal(res.total)
      })
      .catch(() => {
        if (cancelled) return
        setIssues([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const hasIssues = (issues?.length ?? 0) > 0

  return (
    <section className="relative w-full bg-slate-50/40 py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <SectionHeading title={copy.eyebrow} subtitle={copy.subtitle} />
          {total > 0 && (
            <Link
              href="/moniteur"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2 transition-all whitespace-nowrap"
            >
              {total} {copy.issuesLabel}
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {!issues ? (
          // Loading skeleton — three muted card placeholders so the section
          // doesn't collapse to zero height before the API responds.
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200/80 bg-white animate-pulse h-44"
              />
            ))}
          </div>
        ) : !hasIssues ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">
            <Newspaper className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            <p>{copy.empty}</p>
          </div>
        ) : (
          <motion.div
            // `key` so the stagger animation re-runs cleanly when the
            // recents list changes (e.g. on re-fetch); `animate` over
            // `whileInView` so the section appears even if the user
            // lands directly with the section already in view.
            key={`recent-${total}`}
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
            }}
            // 4 cards in a 2x2 on tablet, single row on xl.
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5"
          >
            {issues!.map((issue) => (
              <motion.div
                key={issue.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="h-full"
              >
                <MoniteurIssueCard
                  issue={issue}
                  lang={lang}
                  variant="compact"
                  sommaireLimit={3}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {hasIssues && (
          <div className="mt-8 text-center">
            <Link
              href="/moniteur"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-primary hover:border-primary/40 hover:shadow-sm transition-all"
            >
              {copy.cta}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

