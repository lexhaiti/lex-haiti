/**
 * Citation column — renders the inbound or outbound citations of a
 * single article, grouped by relation type (vise / modifie / abroge /
 * applique / interprete / …). Extracted from ArticleViewer.tsx.
 */
'use client'

import React from 'react'
import { ArrowUpRight, ExternalLink } from 'lucide-react'
import type { CitationEntry } from '../citation-mapping'

/** Bilingual labels + colour classes for each citation relation. Lives
 *  here (not in citation-mapping.ts) because the labels are a *display*
 *  concern; the mapping module stays pure-data. */
const RELATION_META: Record<
  CitationEntry['relation'],
  { label: { fr: string; ht: string }; cls: string }
> = {
  vise: {
    label: { fr: 'vise', ht: 'vize' },
    cls: 'bg-slate-100 text-slate-700',
  },
  modifie: {
    label: { fr: 'modifie', ht: 'modifye' },
    cls: 'bg-amber-100 text-amber-800',
  },
  abroge: {
    label: { fr: 'abroge', ht: 'abwoje' },
    cls: 'bg-red-100 text-red-700',
  },
  applique: {
    label: { fr: 's’applique à', ht: 'aplike a' },
    cls: 'bg-indigo-100 text-indigo-700',
  },
  interprete: {
    label: { fr: 'interprète', ht: 'entèprete' },
    cls: 'bg-purple-100 text-purple-700',
  },
  application: {
    label: { fr: 'application', ht: 'aplikasyon' },
    cls: 'bg-indigo-100 text-indigo-700',
  },
  interpretation: {
    label: { fr: 'interprétation', ht: 'entèpretasyon' },
    cls: 'bg-purple-100 text-purple-700',
  },
  annulation: {
    label: { fr: 'annulation', ht: 'anilasyon' },
    cls: 'bg-red-100 text-red-700',
  },
}

interface CitationColumnProps {
  title: string
  subtitle: string
  entries: CitationEntry[]
  currentLang: 'fr' | 'ht'
  direction: 'outbound' | 'inbound'
}

export function CitationColumn({
  title,
  subtitle,
  entries,
  currentLang,
  direction,
}: CitationColumnProps) {
  // Group by relation type
  const grouped = entries.reduce<Record<string, CitationEntry[]>>(
    (acc, entry) => {
      ;(acc[entry.relation] ||= []).push(entry)
      return acc
    },
    {},
  )

  const arrowIcon =
    direction === 'outbound' ? (
      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
    ) : (
      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
    )

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          {arrowIcon}
          <h4 className="text-sm font-bold text-slate-800 tracking-tight">
            {title}
          </h4>
          <span className="text-xs font-medium text-slate-400">
            ({entries.length})
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 italic">
          {currentLang === 'fr' ? 'Aucun lien.' : 'Pa gen lyen.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {Object.entries(grouped).map(([relation, items]) => (
            <li key={relation}>
              <div className="mb-1.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    RELATION_META[relation as CitationEntry['relation']].cls
                  }`}
                >
                  {
                    RELATION_META[relation as CitationEntry['relation']].label[
                      currentLang
                    ]
                  }
                </span>
              </div>
              <ul className="ml-1 space-y-1.5">
                {items.map((c, idx) => (
                  <li key={idx} className="text-sm">
                    {c.href ? (
                      <a
                        href={c.href}
                        className="text-primary hover:underline font-medium"
                      >
                        {c.target_label}
                      </a>
                    ) : (
                      <span className="font-medium text-slate-800">
                        {c.target_label}
                      </span>
                    )}
                    {c.note && (
                      <span className="text-slate-500"> — {c.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
