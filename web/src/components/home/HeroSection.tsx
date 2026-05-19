'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BookMarked,
  Briefcase,
  Gavel,
  Newspaper,
  Search,
  SlidersHorizontal,
  Unlock,
} from 'lucide-react'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

// Popular quick-access pills under the search bar. Icon is paired
// by type — Constitution gets the book, codes the gavel, themes the
// briefcase, Moniteur the newspaper. (The narrow chip row that used
// to live inside the search card was removed per UX brief — pulling
// double duty with the POPULAIRES row below was visual noise.)
type PopularCard = {
  label: string
  href?: string
  q?: string
  Icon: React.ComponentType<{ className?: string }>
}

const POPULAR: Record<'fr' | 'ht', PopularCard[]> = {
  fr: [
    { label: 'Constitution 1987', q: 'Constitution 1987', Icon: BookOpen },
    { label: 'Code Civil', q: 'Code Civil', Icon: Gavel },
    { label: 'Code Pénal', q: 'Code Pénal', Icon: BookMarked },
    {
      label: 'Droit du Travail',
      href: '/lois?theme=droit_travail',
      Icon: Briefcase,
    },
    { label: 'Le Moniteur', href: '/moniteur', Icon: Newspaper },
  ],
  ht: [
    { label: 'Konstitisyon 1987', q: 'Constitution 1987', Icon: BookOpen },
    { label: 'Kòd Sivil', q: 'Code Civil', Icon: Gavel },
    { label: 'Kòd Penal', q: 'Code Pénal', Icon: BookMarked },
    { label: 'Dwa travay', href: '/lois?theme=droit_travail', Icon: Briefcase },
    { label: 'Le Moniteur', href: '/moniteur', Icon: Newspaper },
  ],
}

export default function HeroSection() {
  const { t, language } = useT()
  const lang = (language === 'ht' ? 'ht' : 'fr') as 'fr' | 'ht'
  const router = useRouter()
  const [query, setQuery] = useState('')

  const goSearch = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    // Cross-entity results page — surfaces matching laws AND Moniteur
    // issues for queries like "CL-007-09-09" or "Spécial N° 5".
    router.push(`/recherche?q=${encodeURIComponent(q)}`)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    goSearch(query)
  }

  return (
    <section
      className={cn(
        // Light tool-style hero. ``min-h-screen + flex justify-center``
        // pins the content to the visual midline of the viewport (the
        // fixed 80px header is reserved by ``pt-20``), so the brand +
        // tagline + search land where the eye naturally settles after
        // the page paints — instead of clinging to the top edge.
        // Section still grows past 100vh when the content (popular
        // row, trust line) is taller than the viewport.
        'relative w-full bg-slate-50 text-slate-900 pt-20 min-h-screen flex flex-col justify-center',
      )}
    >
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* 1) H1 + short intro paragraph. The previous monumental
            ``LexHaïti`` wordmark is gone — the brand already lives in
            the global header, and the surface now leads with the
            actual value proposition. */}
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] text-slate-950">
            {t('home.hero.tagline')}
          </h1>
          <p className="mt-5 text-base sm:text-lg md:text-xl leading-relaxed text-slate-700">
            {t('home.hero.description')}
          </p>
        </div>

        {/* 2) Trust line — sits right under the intro paragraph and
            ABOVE the search card. Two halves separated by a soft
            divider; small SVG icons (BadgeCheck for provenance,
            Unlock for posture) give each half a glyph. Reads as the
            project's quality cue before the user even types. */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs sm:text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <BadgeCheck
              className="w-4 h-4 text-emerald-600 flex-shrink-0"
              aria-hidden
            />
            {t('home.hero.trustSources')}
          </span>
          <span className="hidden sm:inline text-slate-300" aria-hidden>
            |
          </span>
          <span className="inline-flex items-center gap-2">
            <Unlock
              className="w-4 h-4 text-primary flex-shrink-0"
              aria-hidden
            />
            {t('home.hero.trustAccess')}
          </span>
        </div>

        {/* 3) Search bar — the primary action.
            Softer + wider shadow (``shadow-[0_24px_60px_-20px_…]``)
            so the card lifts off the slate-50 surface but doesn't
            shout. No chip row inside any more; the POPULAIRES row
            below takes that role. */}
        <div className="mt-8 sm:mt-10 rounded-2xl bg-white ring-1 ring-slate-100 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.18)] px-4 sm:px-6 py-4 sm:py-5">
          <label htmlFor="hero-search" className="sr-only">
            {t('home.hero.findLabel')}
          </label>
          <form
            onSubmit={onSubmit}
            className="flex flex-col sm:flex-row items-stretch gap-3"
          >
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
                aria-hidden
              />
              <input
                id="hero-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('home.hero.placeholder')}
                aria-label={t('home.hero.findLabel')}
                className={cn(
                  'w-full h-14 pl-14 pr-4 rounded-full',
                  'bg-slate-50 ring-1 ring-slate-200',
                  'placeholder:text-slate-400 placeholder:italic placeholder:text-sm',
                  'text-base text-slate-900 outline-none',
                  'focus:ring-2 focus:ring-primary/40 focus:bg-white transition',
                )}
                // 16px keeps iOS Safari from zooming the viewport on
                // input focus — anything below triggers the auto-zoom.
                style={{ fontSize: '16px' }}
              />
            </div>
            <button
              type="submit"
              className={cn(
                'inline-flex items-center justify-center gap-2',
                'h-14 px-7 rounded-full',
                'bg-primary text-white font-semibold',
                'hover:bg-primary/90 active:scale-[0.99] transition-all',
              )}
            >
              {t('home.hero.searchButton')}
              <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          </form>
        </div>

        {/* 4) Advanced-search link — placed immediately below the
            search bar where the user's eye is already; the previous
            spot at the very bottom of the hero buried it. */}
        <div className="mt-4 text-center">
          <Link
            href="/recherche/avancee"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
            {t('home.hero.advancedFull')}
          </Link>
        </div>

        {/* 5) POPULAIRES — interactive pills for the canonical entry
            points (Constitution, the three core codes, Le Moniteur).
            Pill style: white, soft ring, hover lifts the shadow +
            tints the icon, gives a polished interactive feel without
            shouting. The bare label row above (was an ``h2`` eyebrow)
            is gone — pills are self-explanatory at this scale. */}
        <div className="mt-10 sm:mt-12 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {POPULAR[lang].map((p) => {
            const inner = (
              <>
                <p.Icon
                  className="w-4 h-4 text-amber-600 group-hover:text-amber-700 transition-colors flex-shrink-0"
                  aria-hidden
                />
                <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                  {p.label}
                </span>
              </>
            )
            const cls = cn(
              'group inline-flex items-center gap-2',
              'rounded-full bg-white ring-1 ring-slate-200 px-4 py-2.5',
              'shadow-[0_1px_3px_-1px_rgba(15,23,42,0.08)]',
              'hover:ring-slate-300 hover:shadow-[0_6px_16px_-6px_rgba(15,23,42,0.18)] hover:-translate-y-0.5',
              'transition-all duration-200',
            )
            if (p.href) {
              return (
                <Link key={p.label} href={p.href} className={cls}>
                  {inner}
                </Link>
              )
            }
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => goSearch(p.q!)}
                className={cls}
              >
                {inner}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
