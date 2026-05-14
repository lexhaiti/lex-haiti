/**
 * Side-by-side compare panel for formal-block versions (préambule,
 * visas, considérants, enacting formula). Mirrors the article-side
 * ComparePanel: two dropdowns + a swap button, word-level diff
 * computed locally from the version bodies, deletions struck on the
 * left and insertions highlighted on the right.
 *
 * Same diff engine as the article comparer — see
 * ``@/lib/diff/word-diff``.
 */
'use client'

import React, { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BlockVersionRead } from '@/lib/api/endpoints'
import { diffHtml, type DiffOp } from '@/lib/diff/word-diff'

interface BlockComparePanelProps {
  versions: BlockVersionRead[]
  isFr: boolean
}

function renderSide(ops: DiffOp[], side: 'old' | 'new') {
  const nodes: React.ReactNode[] = []
  let key = 0
  for (const op of ops) {
    if (op.op === 'equal') {
      nodes.push(<span key={key++}>{op.text}</span>)
      continue
    }
    if (side === 'old' && op.op === 'delete') {
      nodes.push(
        <span
          key={key++}
          className="bg-red-100/70 line-through decoration-red-400 px-0.5 rounded-sm"
        >
          {op.text}
        </span>,
      )
      continue
    }
    if (side === 'new' && op.op === 'insert') {
      nodes.push(
        <span
          key={key++}
          className="bg-emerald-100/70 px-0.5 rounded-sm"
        >
          {op.text}
        </span>,
      )
    }
  }
  return nodes
}

export function BlockComparePanel({ versions, isFr }: BlockComparePanelProps) {
  // Default: compare the previous version against the latest. The
  // backend returns versions newest-first.
  const [fromId, setFromId] = useState<number>(
    versions[1]?.id ?? versions[0]?.id ?? 0,
  )
  const [toId, setToId] = useState<number>(versions[0]?.id ?? 0)

  const versionsById = useMemo(() => {
    const map = new Map<number, BlockVersionRead>()
    for (const v of versions) map.set(v.id, v)
    return map
  }, [versions])

  const fromVersion = versionsById.get(fromId)
  const toVersion = versionsById.get(toId)

  const ops = useMemo(() => {
    if (!fromVersion || !toVersion) return []
    return diffHtml(fromVersion.text_fr, toVersion.text_fr)
  }, [fromVersion, toVersion])

  if (versions.length < 2) {
    return (
      <p className="mt-3 px-5 py-3 text-xs italic text-slate-400">
        {isFr
          ? 'Aucune comparaison possible — une seule version pour le moment.'
          : 'Pa gen konparezon posib — sèlman yon vèsyon pou kounye a.'}
      </p>
    )
  }

  const isSameVersion = fromId === toId

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs text-slate-500 mb-4">
        {isFr
          ? 'Sélectionnez deux versions pour comparer.'
          : 'Chwazi de vèsyon pou konpare.'}
      </p>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <Select value={String(fromId)} onValueChange={(v) => setFromId(Number(v))}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                v{v.version_number}
                {v.effective_from ? ` — ${v.effective_from}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => {
            const tmp = fromId
            setFromId(toId)
            setToId(tmp)
          }}
          aria-label={isFr ? 'Inverser les versions' : 'Echanje vèsyon yo'}
          className="text-slate-400 hover:text-slate-700 flex-shrink-0"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>
        <Select value={String(toId)} onValueChange={(v) => setToId(Number(v))}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                v{v.version_number}
                {v.effective_from ? ` — ${v.effective_from}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isSameVersion ? (
        <p className="text-xs italic text-slate-400">
          {isFr
            ? 'Choisissez deux versions différentes pour afficher les différences.'
            : 'Chwazi de vèsyon diferan pou wè diferans yo.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4 bg-white">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              v{fromVersion?.version_number}
              {fromVersion?.effective_from
                ? ` — ${fromVersion.effective_from}`
                : ''}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {renderSide(ops, 'old')}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 bg-white">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              v{toVersion?.version_number}
              {toVersion?.effective_from
                ? ` — ${toVersion.effective_from}`
                : ''}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {renderSide(ops, 'new')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
