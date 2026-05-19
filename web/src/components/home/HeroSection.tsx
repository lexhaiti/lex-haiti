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
        // Light tool-style hero. ``min-h-screen`` makes the surface
        // claim the full viewport so the Lady-Justice backdrop has
        // room to breathe; ``pt-20`` clears the fixed 80px header.
        // ``overflow-hidden`` keeps the bg image from leaking out
        // when the page is narrower than the image's natural width.
        'relative w-full bg-slate-50 text-slate-900 pt-20 min-h-screen overflow-hidden',
      )}
    >
      {/* Lady-Justice backdrop — the Haitian coat of arms (palm
          + flags + drums + ``L'union fait la force`` ribbon), the
          Lady-Justice statue and a leather-bound ``Constitution
          d'Haïti`` volume on a dark navy stage. Anchored right so
          the coat of arms + statue sit behind the search column; a
          strong left-to-right slate-50 gradient mask fades the image
          into the page surface so the H1 / description / trust line
          on the left stay crisply readable. Hidden on mobile (img
          would sit under the text column). */}
      <div
        className="hidden md:block absolute inset-0 pointer-events-none select-none overflow-hidden z-0"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/lady-justice-bg.webp"
          alt=""
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-right opacity-[0.30]"
        />
        {/* Left → centre fade keeps the H1 / description / trust
            line on a clean slate-50 wash. ``via`` stop pushed to
            ~65 % and bumped to /90 opacity so the coat-of-arms
            metalwork on the right half doesn't bleed through into
            the headline area (AA contrast was fine before but the
            texture made the navy look soft). The image stays fully
            visible past ~75 % of the width — search card + pills
            sit on top of it. */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-50 from-20% via-slate-50/90 via-65% to-transparent" />
        {/* Bottom fade — protects the popular pills + footer trust
            line so they don't sit on a busy image area. */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-50 to-transparent" />
      </div>

      <div className="relative z-10 container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14 min-h-[calc(100vh-5rem)] flex flex-col justify-center">
        {/* 1) H1 + short intro paragraph. The previous monumental
            ``LexHaïti`` wordmark is gone — the brand already lives in
            the global header, and the surface now leads with the
            actual value proposition. */}
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] text-primary">
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

        {/* 4) Secondary search affordances — two separate links
            (advanced search + browse-all) separated by a vertical
            divider, immediately below the search card where the
            user's eye already is. The previous "advancedFull" combo
            string read as one link; users wanted them split so each
            destination is clickable on its own. */}
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Link
            href="/recherche/avancee"
            className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-primary transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
            {t('home.hero.advanced')}
          </Link>
          <span className="text-slate-300" aria-hidden>
            |
          </span>
          <Link
            href="/lois"
            className="font-medium text-slate-600 hover:text-primary transition-colors"
          >
            {t('home.hero.browse')}
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
