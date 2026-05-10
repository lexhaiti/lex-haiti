/**
 * Side-by-side compare panel — two-version diff view for a single
 * article. Extracted from ArticleViewer.tsx (was a 75-line inner
 * function). The diff content is currently hard-coded mock data; once
 * the backend exposes per-version article content, swap the literal
 * strings for the real fetch.
 */
'use client'

import React, { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { VersionEntry } from './VersionsPanel'

interface ComparePanelProps {
  versions: VersionEntry[]
  currentLang: 'fr' | 'ht'
}

export function ComparePanel({ versions, currentLang }: ComparePanelProps) {
  const [from, setFrom] = useState<number>(versions[1]?.version ?? versions[0].version)
  const [to, setTo] = useState<number>(versions[0].version)

  return (
    <div className="pt-6">
      <p className="text-xs text-slate-500 mb-4">
        {currentLang === 'fr'
          ? 'Sélectionnez deux versions pour comparer.'
          : 'Chwazi de vèsyon pou konpare.'}
      </p>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <Select
          value={String(from)}
          onValueChange={(v) => setFrom(Number(v))}
        >
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.version} value={String(v.version)}>
                v{v.version} — {v.effective_from}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ArrowLeftRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <Select value={String(to)} onValueChange={(v) => setTo(Number(v))}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.version} value={String(v.version)}>
                v{v.version} — {v.effective_from}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            v{from}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            <span className="bg-red-100/70 line-through decoration-red-400 px-1">
              Tout fait quelconque de l’homme
            </span>
            , qui cause à autrui un dommage, oblige celui par la faute duquel
            il est arrivé à le réparer.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            v{to}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            <span className="bg-emerald-100/70 px-1">
              Toute personne
            </span>{' '}
            qui cause à autrui un dommage est tenue de le réparer.
          </p>
        </div>
      </div>
      <p className="mt-4 text-[11px] italic text-slate-400">
        {currentLang === 'fr'
          ? 'Diff fictif — moteur de comparaison à brancher.'
          : 'Diff fiktif — motè konparezon pou konekte.'}
      </p>
    </div>
  )
}
