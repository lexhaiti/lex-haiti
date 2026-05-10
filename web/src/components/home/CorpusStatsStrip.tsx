// Server Component — fetches corpus stats at request time and renders
// them server-side. Was previously `'use client'` with a useEffect that
// loaded stats after hydration; that produced a layout flash with "—"
// dashes for the first ~150 ms on every page load. Now the numbers
// arrive in the SSR HTML.

import { BookOpen, FileText, Newspaper } from 'lucide-react'
import { getCorpusStats, type CorpusStats } from '@/lib/api/endpoints'
import { getT } from '@/i18n/server'
import { cn } from '@/lib/utils'

// Copy lives at `home.corpusStats.*` in i18n/{fr,ht}.ts.

/**
 * Three-up corpus stats strip. Sits between the hero and the rest of
 * the homepage to (a) give visitors instant scale ("this project is
 * real"), and (b) provide a visual rhythm break between the dark hero
 * and the white feature sections.
 */
export default async function CorpusStatsStrip() {
  const t = await getT()

  // Server fetch with a 5-min revalidate window. The /stats endpoint
  // is itself cached server-side via Cache-Control, so this is a
  // belt-and-braces guard against re-hitting the API on every render
  // when many homepage visits land in the same minute.
  let stats: CorpusStats | null = null
  try {
    stats = await getCorpusStats()
  } catch {
    // Silently fall back to dashes if the API is down — the homepage
    // mustn't break because stats failed to load.
  }

  const items: Array<{ key: keyof CorpusStats; label: string; icon: typeof BookOpen }> = [
    { key: 'legal_texts', label: t('home.corpusStats.legalTexts'), icon: BookOpen },
    { key: 'articles', label: t('home.corpusStats.articles'), icon: FileText },
    { key: 'moniteur_issues', label: t('home.corpusStats.moniteurIssues'), icon: Newspaper },
  ]

  return (
    <section className="relative w-full bg-white border-b border-slate-100">
      <div className="container py-8 lg:py-10">
        <div className="grid grid-cols-3 gap-4 lg:gap-6 animate-in fade-in slide-in-from-bottom-1 duration-500">
          {items.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3 lg:gap-4">
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
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
