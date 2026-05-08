'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useLanguage } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'

const COPY = {
  fr: {
    title: "Portail juridique de la République d'Haïti",
    description:
      "Bienvenue sur LexHaïti, le portail public de référence regroupant les ressources en ligne du droit haïtien — Constitutions, codes, lois, décrets et arrêtés. Les textes sont consultables en français et en kreyòl ayisyen, deux langues officielles de la République, à partir de sources publiques vérifiées.",
    findLabel: 'Trouver un texte',
    placeholder: 'Ex. : Article 1382, Code Civil',
    searchButton: 'Rechercher',
    advanced: 'Recherche avancée',
    browse: 'Tous les textes',
  },
  ht: {
    title: "Pòtal jiridik Repiblik d'Ayiti",
    description:
      "Byenveni sou LexHaïti, pòtal piblik referans ki rasanble resous an liy sou dwa ayisyen an — Konstitisyon, kòd, lwa, dekrè ak arete. Tèks yo disponib an fransè ak an kreyòl ayisyen, de lang ofisyèl Repiblik la, ki sòti nan sous piblik verifye.",
    findLabel: 'Jwenn yon tèks',
    placeholder: 'Egz. : Atik 1382, Kòd Sivil',
    searchButton: 'Chèche',
    advanced: 'Rechèch avanse',
    browse: 'Tout tèks yo',
  },
}

export default function HeroSection() {
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]
  const router = useRouter()
  const [query, setQuery] = useState('')

  const goSearch = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    router.push(`/lois?q=${encodeURIComponent(q)}`)
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
        <img
          src="/hero.png"
          alt=""
          aria-hidden="true"
          className={cn(
            'absolute inset-0 w-full h-full object-cover object-center',
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
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl sm:text-4xl md:text-5xl xl:text-[3.25rem] font-extrabold tracking-tight leading-[1.05] text-white"
          >
            {copy.title}
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
            {copy.description}
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
              {copy.findLabel}
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
                  placeholder={copy.placeholder}
                  aria-label={copy.findLabel}
                  className="w-full h-14 pl-11 pr-4 bg-transparent text-slate-900 placeholder:text-slate-400 placeholder:italic placeholder:text-sm text-base outline-none"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 sm:px-7 bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">{copy.searchButton}</span>
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href="/recherche/avancee"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-amber-300 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {copy.advanced}
              </Link>
              <span className="text-white/30" aria-hidden="true">|</span>
              <Link
                href="/lois"
                className="text-sm font-medium text-white/75 hover:text-amber-300 transition-colors"
              >
                {copy.browse}
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
