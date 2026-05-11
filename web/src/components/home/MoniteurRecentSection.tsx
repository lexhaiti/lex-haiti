// Server Component — fetches recent Moniteur issues at request time.
// Was previously `'use client'` with a useEffect + skeleton fallback;
// now the cards arrive in the SSR HTML, no first-paint placeholder.

import Link from 'next/link'
import { ArrowRight, Newspaper } from 'lucide-react'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { MoniteurIssueCard } from '@/components/shared/MoniteurIssueCard'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  listMoniteurIssues,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { getT } from '@/i18n/server'

// Copy lives at `home.moniteurRecent.*` in i18n/{fr,ht}.ts.

export default async function MoniteurRecentSection() {
  const t = await getT()
  const lang = t.language

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
          <SectionHeading
            title={t('home.moniteurRecent.eyebrow')}
            subtitle={t('home.moniteurRecent.subtitle')}
          />
          {total > 0 && (
            <Link
              href="/moniteur"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2 transition-all whitespace-nowrap"
            >
              {total} {t('home.moniteurRecent.issuesLabel')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {!hasIssues ? (
          <EmptyState
            description={t('home.moniteurRecent.empty')}
            density="compact"
            className="bg-white"
          />
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
              {t('home.moniteurRecent.cta')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
