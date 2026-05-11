'use client'

/**
 * Translation worklist — every legal_text in the corpus, sorted by
 * translation gap (least translated first). Each row links into the
 * per-text translation editor (Stage 4).
 *
 * Filters: all | none | partial | complete — picks which coverage
 * bucket to show. "none" is the editor's natural starting point.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Languages, Loader2 } from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { useT } from '@/i18n/useT'
import {
  getTranslationWorklist,
  type TranslationWorklistItem,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

type Coverage = 'all' | 'none' | 'partial' | 'complete'

export default function TranslationWorklistPage() {
  const { isEditor, status } = useEditorMode()
  const { language } = useT()
  const isFr = language !== 'ht'

  const [coverage, setCoverage] = useState<Coverage>('all')
  const [items, setItems] = useState<TranslationWorklistItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!isEditor) return
    let cancelled = false
    setItems(null)
    getTranslationWorklist({ coverage, limit: 200 })
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? String(e))
      })
    return () => {
      cancelled = true
    }
  }, [isEditor, coverage])

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isEditor) {
    return (
      <div className="container py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 max-w-3xl">
          <p className="text-sm text-slate-700">
            {isFr
              ? 'Cette page est réservée aux éditeurs connectés.'
              : 'Paj sa a pou editè ki konekte sèlman.'}
          </p>
        </div>
      </div>
    )
  }

  const COVERAGE_LABELS: Record<Coverage, string> = isFr
    ? {
        all: 'Tous',
        none: 'Sans traduction',
        partial: 'Partiels',
        complete: 'Complets',
      }
    : {
        all: 'Tout',
        none: 'San tradiksyon',
        partial: 'Pasyèl',
        complete: 'Konplè',
      }

  return (
    <div className="container py-10 lg:py-12 space-y-6">
      <Breadcrumb
        variant="light"
        items={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: isFr ? 'Éditorial' : 'Editoryal', href: '/editorial' },
          { label: isFr ? 'Traductions' : 'Tradiksyon' },
        ]}
      />

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5" />
            {isFr ? 'Pipeline de traduction' : 'Pipeline tradiksyon'}
          </p>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
            {isFr ? 'Textes à traduire' : 'Tèks pou tradui'}
          </h1>
        </div>
        <div className="inline-flex p-1 rounded-md bg-slate-100">
          {(['all', 'none', 'partial', 'complete'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCoverage(c)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-semibold transition-all',
                coverage === c
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {COVERAGE_LABELS[c]}
            </button>
          ))}
        </div>
      </header>

      {err && <ErrorBanner>{err}</ErrorBanner>}

      {items === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Loader2 className="inline w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-10 text-center text-sm text-slate-600">
          {isFr
            ? 'Aucun texte dans cette catégorie.'
            : 'Pa gen tèks nan kategori sa a.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-slate-200 bg-white p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {it.category}
                    </span>
                    {it.editorial_status !== 'published' && (
                      <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
                        {isFr ? 'Brouillon' : 'Bouyon'}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/editorial/loi/${it.slug}/translate`}
                    className="text-sm font-bold text-slate-900 hover:text-primary truncate block"
                  >
                    {it.title_fr}
                  </Link>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      <span
                        className={cn(
                          it.pct === 100
                            ? 'text-emerald-700'
                            : it.pct === 0
                              ? 'text-amber-700'
                              : 'text-slate-900',
                        )}
                      >
                        {it.translated_articles}
                      </span>
                      <span className="text-slate-400"> / {it.total_articles}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 tabular-nums">
                      {it.pct}%
                    </p>
                  </div>
                  <div
                    className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden"
                    title={`${it.pct}%`}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        it.pct === 100
                          ? 'bg-emerald-500'
                          : it.pct === 0
                            ? 'bg-amber-400'
                            : 'bg-primary',
                      )}
                      style={{ width: `${it.pct}%` }}
                    />
                  </div>
                  <Link
                    href={`/editorial/loi/${it.slug}/translate`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-primary/5 text-slate-400 hover:text-primary"
                    aria-label={isFr ? 'Traduire' : 'Tradui'}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
