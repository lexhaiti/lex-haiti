'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/i18n/LanguageContext'
import { Breadcrumb } from '@/components/shared/Breadcrumb'

/**
 * Renders when a law slug doesn't resolve. Matches the navy-hero pattern
 * the rest of the law-detail surface uses — page title in the hero,
 * recovery action in the body — so a 404 reads as part of the same
 * surface and not a generic error screen.
 */
export function TextNotFound() {
  const { language } = useLanguage()
  const isFr = language === 'fr'

  return (
    <div className="bg-white min-h-[60vh] flex flex-col">
      {/* Navy hero — same treatment as the law-detail / amendements
          pages so a 404 doesn't feel like a different app. */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-10 lg:py-16 pt-28 lg:pt-32">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
              { label: isFr ? 'Lois' : 'Lwa', href: '/lois' },
              { label: isFr ? 'Texte non trouvé' : 'Tèks pa jwenn' },
            ]}
          />
          <p className="text-xs font-bold uppercase tracking-widest text-red-300 mb-2">
            {isFr ? 'Page introuvable' : 'Paj pa jwenn'}
          </p>
          <h1 className="animate-in fade-in slide-in-from-top-2 duration-500 text-3xl lg:text-5xl font-black tracking-tight text-white">
            {isFr ? 'Texte non trouvé' : 'Tèks pa jwenn'}
          </h1>
        </div>
      </div>

      {/* Body — the recovery copy + back link, no border-or-card
          framing since the hero above already provides the structure. */}
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-10 py-12 lg:py-16 text-center">
        <p className="text-base text-slate-600 leading-relaxed">
          {isFr
            ? "Le texte que vous cherchez a peut-être été déplacé, ou il n'est pas encore numérisé. Revenez à la liste pour découvrir le corpus disponible."
            : 'Tèks ou ap chèche a ka deplase, oswa li poko nimerize. Retounen nan lis la pou dekouvri kòpis ki disponib.'}
        </p>
        <div className="mt-8">
          <Link
            href="/lois"
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-7 py-3 text-sm font-bold transition-all active:scale-[0.99]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            {isFr ? 'Retour à la liste' : 'Retounen nan lis la'}
          </Link>
        </div>
      </div>
    </div>
  )
}
