'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, Calendar, FileText } from 'lucide-react'
import type { MoniteurIssueRead } from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Wrap query matches inside `text` in `<mark>`. Case- and accent-
 * insensitive. Mirrors the helper in LawCard so result-card visuals
 * stay consistent across surfaces. Multi-word queries are tokenized
 * on whitespace; tokens shorter than 2 characters are dropped.
 */
function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!text || !query || !query.trim()) return <>{text}</>
  const stripped = stripAccents(text)
  const tokens = stripAccents(query.trim())
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return <>{text}</>

  const ranges: Array<[number, number]> = []
  for (const tok of tokens) {
    let idx = 0
    while (idx < stripped.length) {
      const found = stripped.indexOf(tok, idx)
      if (found < 0) break
      ranges.push([found, found + tok.length])
      idx = found + tok.length
    }
  }
  if (ranges.length === 0) return <>{text}</>
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && last[1] >= r[0]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }

  const out: React.ReactNode[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (cursor < start) out.push(text.slice(cursor, start))
    out.push(
      <mark
        key={`${start}-${end}`}
        className="bg-amber-100 text-amber-900 rounded-sm px-0.5 font-semibold"
      >
        {text.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return <>{out}</>
}

const MONTHS = {
  fr: [
    '',
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ],
  ht: [
    '',
    'janvye', 'fevriye', 'mas', 'avril', 'me', 'jen',
    'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm',
  ],
}

function formatLongDate(iso: string | null | undefined, lang: 'fr' | 'ht'): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const day = Number.parseInt(m[3], 10)
  const month = Number.parseInt(m[2], 10)
  return `${day} ${MONTHS[lang][month] ?? ''} ${m[1]}`
}

function smartIssueNumber(raw: string): string {
  return /^[0-9]/.test(raw) ? `N° ${raw}` : raw
}

const CATEGORY_LABEL: Record<string, string> = {
  constitution: 'Constitution',
  code: 'Code',
  loi: 'Loi',
  decret: 'Décret',
  arrete: 'Arrêté',
  circulaire: 'Circulaire',
  convention: 'Convention',
  ordonnance: 'Ordonnance',
  communique: 'Communiqué',
  promulgation: 'Promulgation',
  errata: 'Errata',
  autre: 'Autre',
}

function titleCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/**
 * Single canonical card for a Moniteur issue. Used on:
 *
 *   - the /moniteur listing page
 *   - the home page's MoniteurRecentSection
 *   - any future surface that lists Moniteur issues (e.g. an editor
 *     dashboard preview)
 *
 * Layout invariants — all cards in a grid have **the same width** (from
 * the parent grid) and **the same height** (from the `h-full` + flex
 * column with `mt-auto` on the footer + a capped sommaire body):
 *
 *   • Header band — fixed height. Le Moniteur eyebrow + big issue
 *     number + date + edition badge.
 *   • Sommaire — capped at `sommaireLimit` items (default 4). When
 *     there are more, a "+N de plus" hint replaces the overflow so the
 *     card height stays bounded. Each item title truncates with line-
 *     clamp-2 to avoid runaway height when one entry has a long title.
 *   • Footer — fixed height, pushed to the bottom with `mt-auto`. Text
 *     count + page count.
 *
 * `variant` controls the visual density:
 *   - "default" (used on the /moniteur listing) — full sommaire detail.
 *   - "compact" (used on the homepage recents) — same shape, smaller
 *     padding so the card reads as a teaser instead of a full preview.
 */
export function MoniteurIssueCard({
  issue,
  href,
  lang,
  variant = 'default',
  sommaireLimit = 4,
  className,
  query,
}: {
  issue: MoniteurIssueRead
  href?: string
  lang: 'fr' | 'ht'
  variant?: 'default' | 'compact'
  sommaireLimit?: number
  className?: string
  /** When set, query matches inside the issue number, edition label,
   *  and sommaire titles/numbers are wrapped in `<mark>`. Used by the
   *  cross-entity /recherche page so visitors see why the issue card
   *  surfaced for their query. */
  query?: string
}) {
  const target = href ?? `/moniteur/${issue.id}`
  const numberDisplay = smartIssueNumber(issue.number)
  const sommaire = issue.sommaire ?? []
  const visible = sommaire.slice(0, sommaireLimit)
  const overflow = Math.max(0, sommaire.length - visible.length)

  const isCompact = variant === 'compact'

  return (
    <Link
      href={target}
      className={cn(
        'group flex flex-col rounded-2xl bg-white border border-slate-200/80',
        'hover:border-slate-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]',
        'transition-all duration-200 overflow-hidden h-full',
        className,
      )}
    >
      {/* Header band — navy, with subtle diagonal sheen. */}
      <div
        className={cn(
          'relative bg-primary text-white overflow-hidden',
          isCompact ? 'px-5 py-4' : 'px-6 py-5',
        )}
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.05)_100%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/55 mb-0.5">
              Le Moniteur
            </p>
            <p
              className={cn(
                'font-black tracking-tight leading-tight truncate',
                isCompact ? 'text-lg' : 'text-xl',
              )}
            >
              <HighlightText text={numberDisplay} query={query} />
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-white/60 text-xs">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatLongDate(issue.publication_date, lang)}
              </span>
              {issue.edition_label && (
                <>
                  <span className="text-white/30">·</span>
                  <span>
                    <HighlightText text={issue.edition_label} query={query} />
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="p-2 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors flex-shrink-0">
            <ArrowRight className="w-4 h-4 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>

      {/* Sommaire body — capped at sommaireLimit + "+N" overflow row.
          Always renders so the card height stays consistent across the
          grid even when an issue has zero entries. */}
      <div
        className={cn(
          'flex-1 min-h-0',
          isCompact ? 'px-5 py-3' : 'px-6 py-4',
        )}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">
          {lang === 'fr' ? 'Sommaire' : 'Somè'}
        </p>
        {visible.length > 0 ? (
          <ul className="space-y-1.5">
            {visible.map((s, idx) => (
              <li
                key={idx}
                className="flex items-baseline gap-2 text-sm leading-snug"
              >
                <span className="w-1 h-1 rounded-full bg-red-500 flex-shrink-0 mt-[0.45em]" />
                <span className="line-clamp-2">
                  {s.category && (
                    <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wide mr-1">
                      {CATEGORY_LABEL[s.category] ?? s.category}
                    </span>
                  )}
                  {s.number && (
                    <span className="font-mono text-[11px] text-slate-500 mr-1">
                      N° <HighlightText text={s.number} query={query} />
                    </span>
                  )}
                  <span className="text-slate-600">
                    <HighlightText
                      text={titleCase(
                        s.title ?? (lang === 'fr' ? 'Sans titre' : 'San tit'),
                      )}
                      query={query}
                    />
                  </span>
                </span>
              </li>
            ))}
            {overflow > 0 && (
              <li className="text-xs italic text-slate-400 pl-3">
                {lang === 'fr'
                  ? `+ ${overflow} de plus…`
                  : `+ ${overflow} ankò…`}
              </li>
            )}
          </ul>
        ) : (
          <p className="text-xs italic text-slate-400">
            {lang === 'fr' ? 'Sommaire non indexé.' : 'Somè pa endekse.'}
          </p>
        )}
      </div>

      {/* Footer — pinned to bottom via mt-auto on the wrapper above so
          all cards in the grid line up regardless of sommaire length. */}
      <div
        className={cn(
          'border-t border-slate-100 bg-slate-50/60 mt-auto flex items-center gap-5 text-xs text-slate-500',
          isCompact ? 'px-5 py-2.5' : 'px-6 py-3',
        )}
      >
        {sommaire.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            {sommaire.length}{' '}
            {sommaire.length === 1
              ? lang === 'fr' ? 'texte' : 'tèks'
              : lang === 'fr' ? 'textes' : 'tèks'}
          </span>
        )}
        {issue.page_count && (
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            {issue.page_count} pages
          </span>
        )}
      </div>
    </Link>
  )
}
