'use client'

import { useRef, useState } from 'react'
import { ArrowRight, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

export default function HeroSearch() {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const { t, language } = useT()

  const suggestions =
    language === 'fr'
      ? [
          { text: 'Constitution 1987' },
          { text: 'Code Civil' },
          { text: 'Décrets Récents' },
        ]
      : [
          { text: 'Konstitisyon 1987' },
          { text: 'Kòd Sivil' },
          { text: 'Dekrè Resan' },
        ]

  function goSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    // Route to the cross-entity results page so a query like "CL-007-09-09"
    // or "Spécial N° 5" surfaces both matching laws and Moniteur issues.
    // /lois?q=… still works for in-listing filtered search.
    router.push(`/recherche?q=${encodeURIComponent(trimmed)}`)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    goSearch(query)
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      {/* Search Container — restrained, library-card feel */}
      <div
        className={cn(
          'animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both',
          'relative flex items-stretch gap-2',
          'p-1.5 sm:p-2 transition-all duration-300',
          'rounded-full',
          'bg-white',
          'ring-1 ring-white/20',
          isFocused
            ? 'shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] ring-white/40'
            : 'shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)]',
        )}
      >
        {/* Input Field */}
        <form onSubmit={onSubmit} className="flex-1 min-w-0">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={
              t('home.search.placeholder') || 'Search laws, articles...'
            }
            className={cn(
              'w-full bg-transparent px-4 sm:px-6 py-3 sm:py-3.5',
              'outline-none ring-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none',
              'text-sm sm:text-base placeholder:text-sm sm:placeholder:text-base',
              'text-slate-900 placeholder:text-slate-400',
            )}
            style={{ fontSize: '16px' }}
          />
        </form>

        {/* Search Button — solid slate, functional */}
        <div className="flex items-center">
          <Button
            onClick={() => goSearch(query)}
            className={cn(
              'h-10 sm:h-12 px-4 sm:px-6 rounded-full',
              'bg-slate-900 text-white font-semibold',
              'hover:bg-slate-800 transition-colors',
              'active:scale-[0.98]',
              'group',
            )}
          >
            <span className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-sm font-semibold">
                {t('home.search.button') || 'Search'}
              </span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Button>
        </div>
      </div>

      {/* Advanced search link — single line under input */}
      <div
        className="animate-in fade-in duration-500 fill-mode-both mt-3 flex justify-center"
        style={{ animationDelay: '350ms' }}
      >
        <Link
          href="/recherche/avancee"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white transition-colors underline-offset-4 hover:underline"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {language === 'fr' ? 'Recherche avancée' : 'Rechèch avanse'}
        </Link>
      </div>

      {/* Suggestions — quiet, like reference chips */}
      <div
        className="animate-in fade-in duration-500 fill-mode-both mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 px-2"
        style={{ animationDelay: '400ms' }}
      >
        <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-0.5 sm:mb-0 sm:mr-1">
          {t('home.search.suggestionsLabel') || 'Try'}:
        </span>
        <div className="flex flex-wrap justify-center gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => goSearch(s.text)}
              className={cn(
                'group rounded-full',
                'px-3 py-1 sm:px-3.5 sm:py-1.5 text-xs font-medium',
                'border border-white/15 bg-white/5',
                'text-slate-200 hover:text-white hover:border-white/30 hover:bg-white/10',
                'backdrop-blur-sm transition-colors',
                'active:scale-[0.98]',
              )}
              aria-label={`Search for ${s.text}`}
            >
              <span className="truncate">{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
