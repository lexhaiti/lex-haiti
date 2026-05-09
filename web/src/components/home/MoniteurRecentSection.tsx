// Server Component — fetches recent Moniteur issues at request time.
// Was previously `'use client'` with a useEffect + skeleton fallback;
// now the cards arrive in the SSR HTML, no first-paint placeholder.

import Link from 'next/link'
import { ArrowRight, Newspaper } from 'lucide-react'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { MoniteurIssueCard } from '@/components/shared/MoniteurIssueCard'
import {
  listMoniteurIssues,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { getT } from '@/i18n/server'

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

export default async function MoniteurRecentSection() {
  const t = await getT()
  const lang = t.language
  const copy = COPY[lang]

  // Home recents shows up to 4 — enough to feel like a real list,
  // not so many that the section dominates the homepage. The /moniteur
  // listing page handles deeper browsing.
  let issues: MoniteurIssueRead[] = []
  let total = 0
  try {
    const res = await listMoniteurIssues({ only_published: true, limit: 4 })
    issues = res.items
    total = res.total
  } catch {
    // Soft fail — homepage stays usable even if this section's API is down.
  }

  const hasIssues = issues.length > 0

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

        {!hasIssues ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">
            <Newspaper className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            <p>{copy.empty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {issues.map((issue) => (
              <div key={issue.id} className="h-full">
                <MoniteurIssueCard
                  issue={issue}
                  lang={lang}
                  variant="compact"
                  sommaireLimit={3}
                />
              </div>
            ))}
          </div>
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
