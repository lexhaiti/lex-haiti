'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

// Hero copy is centralised under `home.hero.*` in i18n/{fr,ht}.ts.
// Suggestion chips stay here because they mix copy with routing data
// (label + (q OR href)) — moving them into i18n would force the messages
// catalogue to carry route paths, which doesn't belong there.
const SUGGESTIONS: Record<
  'fr' | 'ht',
  Array<{ label: string; q?: string; href?: string }>
> = {
  fr: [
    { label: 'Constitution 1987', q: 'Constitution 1987' },
    { label: 'Code Civil', q: 'Code Civil' },
    { label: 'Droit du Travail', href: '/lois?theme=droit_travail' },
    { label: 'Le Moniteur', href: '/moniteur' },
  ],
  ht: [
    { label: 'Konstitisyon 1987', q: 'Constitution 1987' },
    { label: 'Kòd Sivil', q: 'Code Civil' },
    { label: 'Dwa travay', href: '/lois?theme=droit_travail' },
    { label: 'Le Moniteur', href: '/moniteur' },
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
        // Clean hero: full-bleed photographic background (hero.png).
        // Text floats directly on the gradient — no translucent panel chrome.
        'relative w-full bg-primary text-white overflow-hidden',
        // Mobile uses ~700px (compact, no big empty space above/below).
        // Tablet (incl. iPad Pro 12.9" portrait at 1024px, which hits
        // Tailwind's `lg`) uses 600px. Real desktop only kicks in at xl
        // (1280px+) where we fill the full viewport.
        'min-h-[700px] md:min-h-[600px] xl:min-h-screen pt-20 flex items-center',
      )}
    >
      {/* Background fills only the visible hero band (below the 80px header
          reserve from pt-20), so the full palm + image composition lives
          inside the visible viewport instead of partly hiding behind the
          fixed header. */}
      <div className="absolute top-20 inset-x-0 bottom-0 z-0 select-none pointer-events-none">
        {/* ``next/image`` with ``fill`` so it inherits the parent's
            absolute box. Next.js then serves WebP/AVIF on demand
            (huge win vs the 1.88 MB raw PNG it replaced), generates
            a width-targeted srcset, and adds the priority preload
            hint so this image becomes the LCP candidate. ``sizes``
            tells the loader which width to fetch per viewport so we
            don't ship the 1920px source to a phone. */}
        <Image
          src="/hero.png"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className={cn(
            'object-cover object-center',
            // Mobile: slight scale-up so the image crops a bit top + bottom
            // (cinematic letterbox feel) while the palm stays centered.
            'scale-[1.08] origin-center',
            // Tablet (incl. iPad Pro 12.9" portrait): scale the image up so
            // the palm silhouette reads bigger, and shift it down a touch so
            // the full palm sits lower / more centered in the visible band.
            'md:scale-[1.4] md:translate-y-[10%]',
            // Desktop (xl+): back to natural size.
            'xl:scale-100 xl:translate-y-0',
          )}
        />
        {/* Mobile + all iPads (incl. Pro 12.9" portrait at 1024px): uniform
            heavy navy wash so the palmis silhouette reads as a subtle
            backdrop. */}
        <div className="absolute inset-0 bg-primary/75 xl:hidden" />
        {/* Tablet/iPad: right-side gradient mask that fully blacks out Lady
            Justice (she sits in the right ~35% of the image). Combined with
            the wash above, the right edge becomes pure navy and only the
            centered palm silhouette stays visible. */}
        <div className="absolute inset-y-0 right-0 w-2/5 bg-gradient-to-l from-primary via-primary/85 to-transparent xl:hidden" />
        {/* Real desktop (xl+ ≈ 1280px): directional left-to-right gradient —
            strong on left (where typography lives), fades right (where the
            statue + books should read clearly). */}
        <div className="absolute inset-0 hidden xl:block bg-gradient-to-r from-primary via-primary/80 to-transparent from-0% via-45% to-75%" />
        {/* Bottom darkening — protects the search input area on all sizes. */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary/85 to-transparent" />
      </div>

      <div className="relative z-10 container py-12 w-full">
        <div className="w-full xl:w-[78%]">
          {/* Latin maxim eyebrow — same maxim used on /a-propos's quote
              card, here as a small italic line above the H1 to anchor
              the project's mission ("publicity of law is the foundation
              of liberty") on the front door. Kept restrained so the H1
              stays visually dominant. */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-xs sm:text-sm italic text-amber-300/80 mb-3"
          >
            <span className="not-italic font-bold uppercase tracking-[0.18em] text-amber-300/60 mr-2">
              ⁂
            </span>
            Publicitas iuris fundamentum libertatis.
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-3xl sm:text-4xl md:text-5xl xl:text-[3.25rem] font-extrabold tracking-tight leading-[1.05] text-white"
          >
            {t('home.hero.title')}
          </motion.h1>

          {/* Amber accent — picks up the warm bronze of the palmis relief. */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-6 h-[3px] w-28 bg-amber-400 origin-left"
          />

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg text-white/85 leading-relaxed"
          >
            {t('home.hero.description')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8"
          >
            <label
              htmlFor="hero-search"
              className="block text-sm font-semibold text-white/90 mb-2"
            >
              {t('home.hero.findLabel')}
            </label>

            <form
              onSubmit={onSubmit}
              className={cn(
                'flex items-stretch gap-0 rounded-lg overflow-hidden',
                'bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]',
                'ring-1 ring-white/15',
                'focus-within:ring-2 focus-within:ring-amber-300/60',
                'transition-shadow',
              )}
            >
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="hero-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('home.hero.placeholder')}
                  aria-label={t('home.hero.findLabel')}
                  className="w-full h-14 pl-11 pr-4 bg-transparent text-slate-900 placeholder:text-slate-400 placeholder:italic placeholder:text-sm text-base outline-none"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 sm:px-7 bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">{t('home.hero.searchButton')}</span>
              </button>
            </form>

            {/* Quick-pick chips — most-likely entry points for visitors
                who land without a query in mind. Mix of search shortcuts
                and direct navigation, each routed to whichever surface
                makes sense. Sits above the advanced/browse links so it's
                the first discoverable affordance after the search bar. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-4 flex flex-wrap items-center gap-2"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/55 mr-1">
                {t('home.hero.suggestionsLabel')}
              </span>
              {SUGGESTIONS[lang].map((s) => {
                const cls =
                  'inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/90 hover:bg-white/15 hover:border-white/35 transition-colors backdrop-blur-sm'
                if ('href' in s && s.href) {
                  return (
                    <Link key={s.label} href={s.href} className={cls}>
                      {s.label}
                    </Link>
                  )
                }
                if ('q' in s && s.q) {
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => goSearch(s.q!)}
                      className={cls}
                    >
                      {s.label}
                    </button>
                  )
                }
                return null
              })}
            </motion.div>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href="/recherche/avancee"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-amber-300 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {t('home.hero.advanced')}
              </Link>
              <span className="text-white/30" aria-hidden="true">|</span>
              <Link
                href="/lois"
                className="text-sm font-medium text-white/75 hover:text-amber-300 transition-colors"
              >
                {t('home.hero.browse')}
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
