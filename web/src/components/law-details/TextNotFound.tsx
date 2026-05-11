'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/i18n/LanguageContext'
import { EmptyState } from '@/components/shared/EmptyState'

/**
 * Renders when a law slug doesn't resolve. Wraps the shared EmptyState in
 * the "attention" tone (red alert badge) so the missing-resource case is
 * visually distinct from a benign empty list. Lives inside the page's
 * normal SiteShell — no own header / no full-viewport min-height.
 */
export function TextNotFound() {
  const { language } = useLanguage()
  const isFr = language === 'fr'

  return (
    <div className="flex-1 flex items-center">
      <div className="container w-full">
        <EmptyState
          tone="attention"
          eyebrow={isFr ? 'Page introuvable' : 'Paj pa jwenn'}
          title={isFr ? 'Texte non trouvé' : 'Tèks pa jwenn'}
          description={
            isFr
              ? "Le texte que vous cherchez a peut-être été déplacé, ou il n'est pas encore numérisé. Revenez à la liste pour découvrir le corpus disponible."
              : 'Tèks ou ap chèche a ka deplase, oswa li poko nimerize. Retounen nan lis la pou dekouvri kòpis ki disponib.'
          }
          actions={
            <Link
              href="/lois"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-7 py-3 text-sm font-bold transition-all active:scale-[0.99]"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden />
              {isFr ? 'Retour à la liste' : 'Retounen nan lis la'}
            </Link>
          }
        />
      </div>
    </div>
  )
}
