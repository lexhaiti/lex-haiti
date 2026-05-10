// 404 page rendered by Next App Router whenever a route doesn't match
// or `notFound()` is called from a server component.
//
// RSC — server-side i18n via getT() + per-route metadata. The form is
// a plain HTML <form action="/recherche" method="get"> so the page
// stays fully static (no client JS needed for the search affordance).
//
// Sits inside the SiteShell from the root layout, so the global
// header/footer wrap automatically — no need to render them here.

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Compass,
  Home,
  LayoutGrid,
  Newspaper,
  Search,
  Scale,
} from 'lucide-react'
import { getServerLanguage, getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return {
    title: t('notFound.pageTitle'),
    // Don't index the 404 surface — search engines rely on the HTTP
    // status, but explicit robots:noindex is belt-and-braces.
    robots: { index: false, follow: false },
  }
}

export default async function NotFound() {
  const t = await getT()

  // Curated re-entry points for visitors who land on a dead URL.
  // Hrefs match the megamenu's primary destinations so the surface
  // stays in sync with the rest of the site's IA.
  const popular: Array<{
    href: string
    icon: typeof Home
    labelKey: string
  }> = [
    {
      href: '/loi/constitution-1987',
      icon: Scale,
      labelKey: 'notFound.popularItems.constitution',
    },
    {
      href: '/lois?category=code',
      icon: BookOpen,
      labelKey: 'notFound.popularItems.codes',
    },
    {
      href: '/moniteur',
      icon: Newspaper,
      labelKey: 'notFound.popularItems.moniteur',
    },
    {
      href: '/thematiques',
      icon: LayoutGrid,
      labelKey: 'notFound.popularItems.themes',
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Spacer for the fixed header — same h-20 used elsewhere on
          dark-band pages. */}
      <div aria-hidden className="h-20" />

      <div className="container py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          {/* Compass glyph — chosen over a literal "broken page" icon
              because it implies redirection rather than failure. */}
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-primary/5 border border-primary/10 text-primary">
            <Compass className="h-10 w-10" aria-hidden />
          </div>

          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            {t('notFound.eyebrow')}
          </p>

          <h1 className="text-3xl lg:text-5xl font-black tracking-tight text-primary leading-tight mb-4">
            {t('notFound.title')}
          </h1>

          <div className="mx-auto h-[3px] w-12 bg-amber-400 mb-6" />

          <p className="text-base lg:text-lg text-slate-600 leading-relaxed max-w-xl mx-auto">
            {t('notFound.body')}
          </p>

          {/* Search shortcut — plain GET form so the page stays RSC.
              Submitting routes to /recherche?q=… and the search page's
              client takes over from there. */}
          <form
            action="/recherche"
            method="get"
            role="search"
            className="mt-10 flex items-stretch gap-0 rounded-lg overflow-hidden bg-white border border-slate-200 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all"
          >
            <div className="relative flex-1 min-w-0">
              <Search
                aria-hidden
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                name="q"
                placeholder={t('notFound.searchPlaceholder')}
                aria-label={t('notFound.searchPlaceholder')}
                className="w-full h-14 pl-11 pr-4 bg-transparent text-slate-900 placeholder:text-slate-400 placeholder:italic placeholder:text-sm text-base outline-none"
                style={{ fontSize: '16px' }}
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 sm:px-7 bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all"
            >
              <Search className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">
                {t('notFound.searchButton')}
              </span>
            </button>
          </form>

          {/* Secondary CTA — back to home as a plain link, not a
              button, so it doesn't compete visually with the search. */}
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <Home className="w-4 h-4" />
              {t('notFound.backHome')}
            </Link>
          </div>
        </div>

        {/* Popular destinations — four-up grid of bold entry points.
            Same hover treatment as the home Explorer cards so the
            visual language stays consistent across the site. */}
        <div className="mt-20 mx-auto max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center mb-6">
            {t('notFound.popular')}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {popular.map(({ href, icon: Icon, labelKey }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-600 group-hover:bg-primary group-hover:text-white transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-700 text-center group-hover:text-primary transition-colors">
                  {t(labelKey)}
                </span>
                <ArrowRight
                  aria-hidden
                  className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                />
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
