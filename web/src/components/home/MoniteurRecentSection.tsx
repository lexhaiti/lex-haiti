'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Calendar, Newspaper } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'
import { SectionHeading } from '@/components/shared/SectionHeading'
import {
  listMoniteurIssues,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

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

const MONTHS_FR = [
  '',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const day = Number.parseInt(m[3], 10)
  const month = Number.parseInt(m[2], 10)
  return `${day} ${MONTHS_FR[month] ?? ''} ${m[1]}`
}

function smartIssueNumber(raw: string): string {
  return /^[0-9]/.test(raw) ? `N° ${raw}` : raw
}

export default function MoniteurRecentSection() {
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  const [issues, setIssues] = useState<MoniteurIssueRead[] | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    listMoniteurIssues({ only_published: true, limit: 6 })
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
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
            }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
          >
            {issues!.map((issue) => (
              <motion.div
                key={issue.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <IssueCard issue={issue} lang={lang} />
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

function IssueCard({
  issue,
  lang,
}: {
  issue: MoniteurIssueRead
  lang: 'fr' | 'ht'
}) {
  const numberDisplay = smartIssueNumber(issue.number)
  return (
    <Link
      href={`/moniteur/${issue.id}`}
      className={cn(
        'group flex flex-col rounded-2xl bg-white border border-slate-200/80',
        'hover:border-slate-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] transition-all duration-200',
        'overflow-hidden h-full',
      )}
    >
      {/* Navy header band — same masthead language used on the Moniteur
          listing page so visitors form a consistent visual mapping. */}
      <div className="bg-primary px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/55 mb-0.5">
          Le Moniteur
        </p>
        <p className="text-lg font-black text-white leading-tight tracking-tight">
          {numberDisplay}
        </p>
        <div className="flex items-center gap-1.5 mt-2 text-white/65 text-xs">
          <Calendar className="w-3 h-3" />
          {formatLongDate(issue.publication_date)}
        </div>
      </div>

      <div className="flex-1 p-5 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {issue.edition_label ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-bold uppercase tracking-wider text-[10px]">
              {issue.edition_label}
            </span>
          ) : (
            <span className="text-slate-400">{issue.year}</span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-1.5 transition-all">
          {lang === 'fr' ? 'Ouvrir' : 'Louvri'}
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  )
}
