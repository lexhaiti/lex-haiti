'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, FileText, Newspaper } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'
import { getCorpusStats, type CorpusStats } from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

const COPY = {
  fr: {
    legalTexts: 'Textes juridiques',
    articles: 'Articles indexés',
    moniteurIssues: 'Numéros du Moniteur',
  },
  ht: {
    legalTexts: 'Tèks jiridik',
    articles: 'Atik endekse',
    moniteurIssues: 'Nimewo Moniteur',
  },
}

/**
 * Three-up corpus stats strip. Sits between the hero and the rest of
 * the homepage to (a) give visitors instant scale ("this project is
 * real"), and (b) provide a visual rhythm break between the dark hero
 * and the white feature sections.
 */
export default function CorpusStatsStrip() {
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]
  const [stats, setStats] = useState<CorpusStats | null>(null)

  useEffect(() => {
    let cancelled = false
    getCorpusStats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const items: Array<{ key: keyof CorpusStats; label: string; icon: typeof BookOpen }> = [
    { key: 'legal_texts', label: copy.legalTexts, icon: BookOpen },
    { key: 'articles', label: copy.articles, icon: FileText },
    { key: 'moniteur_issues', label: copy.moniteurIssues, icon: Newspaper },
  ]

  return (
    <section className="relative w-full bg-white border-b border-slate-100">
      <div className="container py-8 lg:py-10">
        <div className="grid grid-cols-3 gap-4 lg:gap-6">
          {items.map(({ key, label, icon: Icon }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 lg:gap-4"
            >
              <div className="flex-shrink-0 flex h-10 w-10 lg:h-11 lg:w-11 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div
                  className={cn(
                    'text-2xl lg:text-3xl font-black text-primary tabular-nums leading-none',
                    !stats && 'text-slate-300',
                  )}
                >
                  {stats ? stats[key].toLocaleString('fr-FR') : '—'}
                </div>
                <div className="text-[10px] lg:text-xs font-bold uppercase tracking-widest text-slate-500 mt-1 truncate">
                  {label}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
