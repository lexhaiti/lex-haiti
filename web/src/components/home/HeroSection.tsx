'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Gavel,
  Landmark,
  Newspaper,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

// Quick-pick examples sit next to the search input (small chips) and
// also as the prominent ``POPULAIRES`` row below the search card (big
// cards with icons). They mix copy + routing data so they don't
// belong in the i18n catalogue.

type Chip = { label: string; q?: string; href?: string }

const CHIPS: Record<'fr' | 'ht', Chip[]> = {
  fr: [
    { label: 'Article 1382', q: 'Article 1382' },
    { label: 'Constitution 1987', q: 'Constitution 1987' },
    { label: 'Droit du Travail', href: '/lois?theme=droit_travail' },
    { label: 'Le Moniteur', href: '/moniteur' },
    { label: 'Code Pénal', q: 'Code Pénal' },
  ],
  ht: [
    { label: 'Atik 1382', q: 'Article 1382' },
    { label: 'Konstitisyon 1987', q: 'Constitution 1987' },
    { label: 'Dwa travay', href: '/lois?theme=droit_travail' },
    { label: 'Le Moniteur', href: '/moniteur' },
    { label: 'Kòd Penal', q: 'Code Pénal' },
  ],
}

// Big quick-access cards under the search card. Icon is paired by
// type — Constitution gets the book, codes the gavel, themes the
// briefcase, Moniteur the newspaper.
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
        // Light tool-style hero — the previous immersive navy + palm
        // image worked as a "welcome to LexHaïti" billboard but didn't
        // serve the actual primary task (find a text). This rebuild
        // mirrors Légifrance / Westlaw conventions: clean light
        // surface, search-first, ranked secondary affordances.
        'relative w-full bg-slate-50 text-slate-900 pt-20',
      )}
    >
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* 1) Brand row — duplicates the global header brand on
            purpose: this surface reads as the project's "front desk"
            and the centered wordmark + italic subtitle act as a
            tonal anchor, like the inscription on a public building.
            No divider below — the slate-tinted headline card next
            does the visual separation on its own. */}
        <div className="text-center">
          <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
            Lex<span className="text-red-600">Haïti</span>
          </div>
          <p className="mt-2 text-sm sm:text-base md:text-lg italic text-slate-500">
            {t('home.hero.brandSubtitle')}
          </p>
        </div>

        {/* 2) Hero card — the value-prop block. Tinted slate surface
            (not pure white) so it reads as a "headline panel" sitting
            above the white search card below. Content centred to
            mirror the brand row above; description has its own
            ``max-w-4xl mx-auto`` so very-wide screens don't stretch
            it to unreadable single-line widths. */}
        <div className="mt-8 rounded-2xl bg-slate-100/60 ring-1 ring-slate-200/70 px-6 sm:px-10 py-8 sm:py-10 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-slate-900">
            {t('home.hero.tagline')}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed max-w-4xl mx-auto">
            {t('home.hero.description')}
          </p>
        </div>

        {/* 3) Search card — white surface, generous shadow. The
            primary action of the whole page. Pill-shaped input + dark
            navy CTA mirror the mockup. */}
        <div className="mt-6 rounded-2xl bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.18)] ring-1 ring-slate-100 px-5 sm:px-8 py-6 sm:py-7">
          <label htmlFor="hero-search" className="sr-only">
            {t('home.hero.findLabel')}
          </label>
          <form
            onSubmit={onSubmit}
            className="flex flex-col sm:flex-row items-stretch gap-3"
          >
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
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
              <ArrowRight className="w-4 h-4" />
              {t('home.hero.searchButton')}
            </button>
          </form>

          {/* Compact chip row below the input — small visual cues
              for common queries; clicking shoots straight to results. */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">
              {t('home.hero.quickExamples')}
            </span>
            {CHIPS[lang].map((c) => {
              const cls =
                'inline-flex items-center rounded-full bg-slate-50 ring-1 ring-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:ring-slate-300 transition-colors'
              if ('href' in c && c.href) {
                return (
                  <Link key={c.label} href={c.href} className={cls}>
                    {c.label}
                  </Link>
                )
              }
              if ('q' in c && c.q) {
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => goSearch(c.q!)}
                    className={cls}
                  >
                    {c.label}
                  </button>
                )
              }
              return null
            })}
          </div>
        </div>

        {/* 4) POPULAIRES — big icon-cards for the four canonical
            entry points. White, soft shadow, amber icon glyph. */}
        <div className="mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-4">
            {t('home.hero.suggestionsLabel')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {POPULAR[lang].map((p) => {
              const inner = (
                <span className="inline-flex items-center gap-2.5">
                  <p.Icon className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-slate-800">
                    {p.label}
                  </span>
                </span>
              )
              const cls = cn(
                'flex items-center justify-center sm:justify-start',
                'rounded-full bg-white ring-1 ring-slate-200 px-4 py-3',
                'shadow-[0_2px_6px_-2px_rgba(15,23,42,0.08)]',
                'hover:ring-slate-300 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.12)] transition-all',
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

        {/* 5) Bottom row — advanced search on the left, institutional
            trust line in the center. Two halves of the same message:
            "here's how to dig deeper" + "here's why you can trust the
            corpus". */}
        <div className="mt-10 mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-slate-500">
          <Link
            href="/recherche/avancee"
            className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-primary transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {t('home.hero.advancedFull')}
          </Link>
          <div className="inline-flex items-center gap-2.5 text-slate-500">
            <Landmark className="w-4 h-4 flex-shrink-0" aria-hidden />
            <span>{t('home.hero.trustSources')}</span>
            <span className="text-slate-300" aria-hidden>
              |
            </span>
            <span>{t('home.hero.trustAccess')}</span>
          </div>
        </div>
      </div>

    </section>
  )
}
