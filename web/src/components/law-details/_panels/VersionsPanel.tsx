/**
 * Article versions timeline — vertical timeline of past versions of a
 * single article. Reads real ``article_versions`` rows (mapped to
 * ``VersionEntry`` in the parent ArticleViewer).
 *
 * Date fallback: when a version row has no ``effective_from`` (typical
 * for v1 of historically-imported texts where the publication date
 * lives on the parent LegalText, not on the per-article version row),
 * the panel falls back to ``defaultFromDate`` so the timeline doesn't
 * show a blank "Depuis le ".
 */
'use client'

import React from 'react'
import { formatLongDate } from '@/lib/format/date'

export interface VersionEntry {
  version: number
  status: 'in_force' | 'abrogated' | 'historical'
  /** ISO yyyy-mm-dd, or '' when the version row carries no
   *  per-version effective_from (v1 of historical imports). The panel
   *  falls back to ``defaultFromDate`` for display in that case. */
  effective_from: string
  effective_to?: string | null
  amended_by?: string | null
  href?: string | null
}

interface VersionsPanelProps {
  versions: VersionEntry[]
  currentLang: 'fr' | 'ht'
  /** Fallback date for versions whose ``effective_from`` is blank —
   *  typically the parent LegalText's publication_date (or the
   *  Moniteur issue's date for historical imports). Optional; when
   *  absent the panel shows "—". */
  defaultFromDate?: string | null
}

export function VersionsPanel({
  versions,
  currentLang,
  defaultFromDate,
}: VersionsPanelProps) {
  // Long-form date renderer — '28 avril 2024' instead of raw ISO.
  // Falls back to defaultFromDate, then '—', so the timeline always
  // has something readable in the date slot.
  const fmt = (iso: string | null | undefined): string => {
    const value = iso || defaultFromDate || null
    if (!value) return '—'
    return formatLongDate(value, currentLang, '—')
  }

  return (
    <div className="pt-6">
      <p className="text-xs text-slate-500 mb-5">
        {currentLang === 'fr'
          ? 'Historique des versions de cet article — du plus récent au plus ancien.'
          : 'Istwa vèsyon atik sa a — pi resan an pi vye.'}
      </p>

      {/* Vertical timeline */}
      <ol className="relative pl-7">
        {/* Continuous line behind dots */}
        <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />

        {versions.map((v, idx) => {
          const isCurrent = v.status === 'in_force'
          const isLast = idx === versions.length - 1
          const fromDisplay = fmt(v.effective_from)
          const toDisplay = v.effective_to ? fmt(v.effective_to) : null
          return (
            <li
              key={v.version}
              className={`relative ${isLast ? '' : 'pb-6'}`}
            >
              {/* Dot on the timeline */}
              <span
                className={`absolute -left-[1.65rem] top-1.5 w-4 h-4 rounded-full border-[3px] flex items-center justify-center ${
                  isCurrent
                    ? 'bg-white border-emerald-500'
                    : 'bg-white border-gray-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isCurrent ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                />
              </span>

              <div className="flex items-baseline gap-3 flex-wrap mb-1">
                <span
                  className={`text-[11px] font-bold uppercase tracking-widest ${
                    isCurrent ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  v{v.version}
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  {toDisplay
                    ? currentLang === 'fr'
                      ? `Du ${fromDisplay} au ${toDisplay}`
                      : `${fromDisplay} – ${toDisplay}`
                    : currentLang === 'fr'
                      ? `Depuis le ${fromDisplay}`
                      : `Depi ${fromDisplay}`}
                </span>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {currentLang === 'fr' ? 'En vigueur' : 'An vigè'}
                  </span>
                )}
              </div>

              {v.amended_by && (
                <p className="text-xs text-slate-500">
                  {currentLang === 'fr' ? 'Modifié par' : 'Modifye pa'}{' '}
                  <a
                    href={v.href ?? '#'}
                    className="text-primary hover:underline font-medium"
                  >
                    {v.amended_by}
                  </a>
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
