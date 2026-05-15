'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  FileText,
  Loader2,
  Newspaper,
  Search,
  SearchX,
} from 'lucide-react'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import { LawCard } from '@/components/shared/LawCard'
import { useT } from '@/i18n/useT'
import {
  globalSearch,
  moniteurIssueSlug,
  type GlobalSearchResponse,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'
import { highlightMatches } from '@/lib/text/highlight'
import { formatLongDate } from '@/lib/format/date'
import { smartIssueNumber } from '@/lib/format/moniteur'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { EmptyState } from '@/components/shared/EmptyState'

// ---------------------------------------------------------------------------
// Inline search field — same band as the StandardPageHeader, lives inside it
// ---------------------------------------------------------------------------

function SearchBar({
  initial,
  onSubmit,
  lang,
}: {
  initial: string
  onSubmit: (q: string) => void
  lang: 'fr' | 'ht'
}) {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    setValue(initial)
  }, [initial])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(value.trim())
      }}
      className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both mt-8 max-w-3xl flex items-stretch gap-0 rounded-lg overflow-hidden bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/15 focus-within:ring-2 focus-within:ring-amber-300/60 transition-shadow"
      role="search"
    >
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            lang === 'fr'
              ? 'Rechercher une loi, un numéro CL, un Moniteur…'
              : 'Chèche yon lwa, yon nimewo CL, yon Moniteur…'
          }
          aria-label={lang === 'fr' ? 'Rechercher' : 'Chèche'}
          className="w-full h-14 pl-11 pr-4 bg-transparent text-slate-900 placeholder:text-slate-400 placeholder:italic placeholder:text-sm text-base outline-none"
          style={{ fontSize: '16px' }}
        />
      </div>
      <button
        type="submit"
        aria-label={lang === 'fr' ? 'Rechercher' : 'Chèche'}
        className="inline-flex items-center gap-2 px-5 sm:px-7 bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all"
      >
        <Search className="w-4 h-4" aria-hidden />
        <span className="hidden sm:inline">
          {lang === 'fr' ? 'Rechercher' : 'Chèche'}
        </span>
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Moniteur issue card — small, link to /moniteur/[id]
// ---------------------------------------------------------------------------

function MoniteurCard({
  issue,
  lang,
  query,
}: {
  issue: GlobalSearchResponse['moniteur_issues'][number]
  lang: 'fr' | 'ht'
  /** Query string to highlight inside number / edition_label / year. */
  query?: string
}) {
  const numberDisplay = smartIssueNumber(issue.number)
  return (
    <Link
      href={`/moniteur/${moniteurIssueSlug(issue)}`}
      className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]"
    >
      <div className="flex-shrink-0 p-3 rounded-xl bg-primary/5 border border-primary/10 text-primary">
        <Newspaper className="w-6 h-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          {lang === 'fr' ? 'Le Moniteur' : 'Moniteur'} ·{' '}
          {highlightMatches(String(issue.year), query)}
        </div>
        <div className="text-base font-bold text-slate-900 truncate">
          {highlightMatches(numberDisplay, query)}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
          {issue.publication_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatLongDate(issue.publication_date, lang)}
            </span>
          )}
          {issue.edition_label && (
            <span>{highlightMatches(issue.edition_label, query)}</span>
          )}
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SearchPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language } = useT()
  const lang: 'fr' | 'ht' = language === 'ht' ? 'ht' : 'fr'

  // Read the query from the URL — single source of truth so deep links
  // and back-button navigation stay coherent.
  const query = searchParams?.get('q')?.trim() ?? ''

  const [data, setData] = useState<GlobalSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    globalSearch({
      q: query,
      legal_text_limit: 20,
      moniteur_issue_limit: 10,
    })
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch(() => {
        if (cancelled) return
        setError(
          lang === 'fr'
            ? 'Erreur lors de la recherche.'
            : 'Erè pandan rechèch la.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, lang])

  function navigateToQuery(q: string) {
    if (!q) {
      router.push('/recherche')
      return
    }
    router.push(`/recherche?q=${encodeURIComponent(q)}`)
  }

  const totals = useMemo(() => {
    if (!data) return { laws: 0, issues: 0, total: 0 }
    return {
      laws: data.total_legal_texts,
      issues: data.total_moniteur_issues,
      total: data.total_legal_texts + data.total_moniteur_issues,
    }
  }, [data])

  const headerTitle = query
    ? lang === 'fr'
      ? `Résultats pour « ${query} »`
      : `Rezilta pou « ${query} »`
    : lang === 'fr'
      ? 'Rechercher'
      : 'Chèche'

  const headerSubtitle = query
    ? loading
      ? lang === 'fr' ? 'Recherche en cours…' : 'Rechèch ap fèt…'
      : lang === 'fr'
        ? `${totals.total} résultat${totals.total > 1 ? 's' : ''} dans la législation et le Moniteur.`
        : `${totals.total} rezilta nan lejislasyon an ak Moniteur la.`
    : lang === 'fr'
      ? "Cherchez une loi par son titre, son numéro CL ou son numéro de Moniteur."
      : 'Chèche yon lwa pa tit li, nimewo CL li oswa nimewo Moniteur li.'

  // When the body is just an empty / no-result state, fill the remaining
  // viewport so the white area visually adjoins both header and footer.
  // For loaded results, fall back to the standard padded container.
  const isEmptySurface =
    !query ||
    (query && !loading && !error && data && totals.total === 0)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <StandardPageHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        breadcrumbs={[
          { label: lang === 'fr' ? 'Accueil' : 'Akèy', href: '/' },
          { label: lang === 'fr' ? 'Recherche' : 'Rechèch' },
        ]}
      >
        <SearchBar initial={query} onSubmit={navigateToQuery} lang={lang} />
      </StandardPageHeader>

      <div
        className={cn(
          'container',
          isEmptySurface
            ? 'flex-1 flex items-center justify-center'
            : 'py-12 lg:py-16',
        )}
      >
        {!query && (
          <EmptyPrompt lang={lang} />
        )}

        {query && loading && <LoadingState />}

        {query && !loading && error && <ErrorBanner>{error}</ErrorBanner>}

        {query && !loading && !error && data && totals.total === 0 && (
          <NoResults query={query} lang={lang} />
        )}

        {query && !loading && !error && data && totals.total > 0 && (
          <div className="flex flex-col gap-12">
            {data.legal_texts.length > 0 && (
              <section aria-labelledby="laws-heading">
                <SectionHeader
                  id="laws-heading"
                  icon={FileText}
                  label={lang === 'fr' ? 'Lois & Codes' : 'Lwa & Kòd'}
                  count={data.total_legal_texts}
                  shownCount={data.legal_texts.length}
                  seeAllHref={`/lois?q=${encodeURIComponent(query)}`}
                  lang={lang}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6 mt-6">
                  {data.legal_texts.map((hit, i) => (
                    <LawCard
                      key={hit.text.id}
                      item={hit.text}
                      language={lang}
                      cardStyle="grid"
                      index={i}
                      query={query}
                    />
                  ))}
                </div>
              </section>
            )}

            {data.moniteur_issues.length > 0 && (
              <section aria-labelledby="moniteur-heading">
                <SectionHeader
                  id="moniteur-heading"
                  icon={Newspaper}
                  label={lang === 'fr' ? 'Numéros du Moniteur' : 'Nimewo Moniteur'}
                  count={data.total_moniteur_issues}
                  shownCount={data.moniteur_issues.length}
                  seeAllHref="/moniteur"
                  lang={lang}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6 mt-6">
                  {data.moniteur_issues.map((issue) => (
                    <MoniteurCard
                      key={issue.id}
                      issue={issue}
                      lang={lang}
                      query={query}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeader({
  id,
  icon: Icon,
  label,
  count,
  shownCount,
  seeAllHref,
  lang,
}: {
  id: string
  icon: typeof FileText
  label: string
  count: number
  shownCount: number
  seeAllHref: string
  lang: 'fr' | 'ht'
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h2
            id={id}
            className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500"
          >
            {label}
          </h2>
          <p className="text-base font-bold text-slate-900 mt-0.5">
            {count} {count === 1 ? (lang === 'fr' ? 'résultat' : 'rezilta') : (lang === 'fr' ? 'résultats' : 'rezilta')}
          </p>
        </div>
      </div>
      {count > shownCount && (
        <Link
          href={seeAllHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:gap-1.5 transition-all"
        >
          {lang === 'fr' ? 'Voir tout' : 'Wè tout'}
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  )
}

function EmptyPrompt({ lang }: { lang: 'fr' | 'ht' }) {
  const examples =
    lang === 'fr'
      ? ['Constitution 1987', 'CL-007-09-09', 'Code Civil', 'Spécial N° 5']
      : ['Konstitisyon 1987', 'CL-007-09-09', 'Kòd Sivil', 'Spécial N° 5']
  return (
    <EmptyState
      eyebrow={lang === 'fr' ? 'Commencer' : 'Kòmanse'}
      title={
        lang === 'fr'
          ? 'Explorez la législation haïtienne'
          : 'Eksplore lejislasyon ayisyen an'
      }
      description={
        lang === 'fr'
          ? 'Tapez votre recherche dans la barre ci-dessus, ou essayez un des exemples.'
          : "Tape rechèch ou nan ba ki anwo a, oswa eseye youn nan egzanp yo."
      }
      actions={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {examples.map((ex) => (
            <Link
              key={ex}
              href={`/recherche?q=${encodeURIComponent(ex)}`}
              className="px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-primary/30 hover:bg-slate-50 hover:text-primary transition-colors"
            >
              {ex}
            </Link>
          ))}
        </div>
      }
    />
  )
}

function NoResults({ query, lang }: { query: string; lang: 'fr' | 'ht' }) {
  const suggestions =
    lang === 'fr'
      ? ['Constitution 1987', 'Code Civil', 'CL-007-09-09', 'Spécial N° 5']
      : ['Konstitisyon 1987', 'Kòd Sivil', 'CL-007-09-09', 'Spécial N° 5']

  return (
    <EmptyState
      eyebrow={lang === 'fr' ? 'Aucun résultat' : 'Pa gen rezilta'}
      tone="attention"
      title={
        lang === 'fr'
          ? `Rien trouvé pour « ${query} »`
          : `Anyen pa jwenn pou « ${query} »`
      }
      description={
        lang === 'fr'
          ? "Vérifiez l'orthographe, raccourcissez votre requête, ou parcourez directement le corpus."
          : "Verifye òtograf la, kout rekèt ou a, oswa gade kòpis la dirèkteman."
      }
      actions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/lois"
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-7 py-3 text-sm font-bold transition-all active:scale-[0.99]"
          >
            {lang === 'fr' ? 'Parcourir tous les textes' : 'Gade tout tèks yo'}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          <Link
            href="/recherche/avancee"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 hover:border-slate-300 bg-white text-slate-700 px-6 py-3 text-sm font-semibold transition-all"
          >
            {lang === 'fr' ? 'Recherche avancée' : 'Rechèch avanse'}
          </Link>
        </div>
      }
      suggestions={
        <div className="flex flex-col items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {lang === 'fr' ? 'Essayer plutôt' : 'Eseye olye'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {suggestions.map((s) => (
              <Link
                key={s}
                href={`/recherche?q=${encodeURIComponent(s)}`}
                className="px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-primary/30 hover:bg-slate-50 hover:text-primary transition-colors"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      }
    />
  )
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState variant="viewport" />}>
      <SearchPageInner />
    </Suspense>
  )
}
