/**
 * Article versions timeline — vertical timeline of past versions of a
 * single article. Extracted from ArticleViewer.tsx (was a 85-line inner
 * function) so the viewer is more reviewable and this panel can grow
 * independently when the backend wires real version data.
 */
'use client'

import React from 'react'

export interface VersionEntry {
  version: number
  status: 'in_force' | 'abrogated' | 'historical'
  effective_from: string
  effective_to?: string | null
  amended_by?: string | null
  href?: string | null
}

interface VersionsPanelProps {
  versions: VersionEntry[]
  currentLang: 'fr' | 'ht'
}

export function VersionsPanel({ versions, currentLang }: VersionsPanelProps) {
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
                  {v.effective_to
                    ? currentLang === 'fr'
                      ? `Du ${v.effective_from} au ${v.effective_to}`
                      : `${v.effective_from} – ${v.effective_to}`
                    : currentLang === 'fr'
                      ? `Depuis le ${v.effective_from}`
                      : `Depi ${v.effective_from}`}
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

      <p className="mt-4 text-[11px] italic text-slate-400">
        {currentLang === 'fr'
          ? 'Données fictives — bientôt connectées.'
          : 'Done fiktif — talè konsa.'}
      </p>
    </div>
  )
}
