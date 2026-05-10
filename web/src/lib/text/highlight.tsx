/**
 * Canonical query-highlighting helpers.
 *
 * Wraps every occurrence of any query token inside `text` in a `<mark>`.
 * Matching is case- AND accent-insensitive ("president" matches
 * "président" and vice versa), but the rendered slices preserve the
 * original casing/accents from `text`.
 *
 * Multi-word queries split on whitespace; tokens shorter than 2
 * characters are dropped to avoid noisy single-letter highlights
 * (otherwise a query like "à" would highlight every `a`).
 *
 * Two surface APIs for ergonomic reasons:
 *   - <HighlightText text query /> — JSX component, used inside cards
 *     where the JSX flow is most natural.
 *   - highlightMatches(text, query) — function, returns ReactNode for
 *     callers that already build elements imperatively (e.g. inline
 *     templating in lists).
 *
 * Both share the same internal token + range merging logic, so the
 * rendering is identical regardless of which surface a caller uses.
 */
import React from 'react'

/** Strip combining marks; lowercase. Used internally + exported for callers
 * that need to do their own accent-insensitive matching (e.g. filters). */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Tokenize a free-text query for highlighting:
 *   - lowercased + accent-stripped
 *   - whitespace-split
 *   - tokens shorter than 2 chars dropped
 * Returns [] when nothing useful remains, so callers can short-circuit. */
export function tokenizeQuery(query: string | undefined): string[] {
  if (!query || !query.trim()) return []
  return stripAccents(query.trim())
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}

/**
 * Compute non-overlapping match ranges of any token inside `text`. Sorted
 * by start position; overlapping ranges are merged. Pure function — used
 * by both surface APIs and exported for tests / advanced callers.
 */
export function findHighlightRanges(
  text: string,
  query: string | undefined,
): Array<[number, number]> {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return []
  const stripped = stripAccents(text)

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
  if (ranges.length === 0) return []
  ranges.sort((a, b) => a[0] - b[0])

  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && last[1] >= r[0]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

/** Tailwind class string used for the `<mark>` element. Centralised so
 * a future design tweak (color, weight, padding) lives in one place. */
const MARK_CLASS =
  'bg-amber-100 text-amber-900 rounded-sm px-0.5 font-semibold'

/** Function-form helper. Returns a React node — string when there's
 * nothing to highlight, fragment with `<mark>` runs otherwise. */
export function highlightMatches(
  text: string | null | undefined,
  query?: string,
): React.ReactNode {
  if (!text) return text ?? ''
  const merged = findHighlightRanges(text, query)
  if (merged.length === 0) return text

  const out: React.ReactNode[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (cursor < start) out.push(text.slice(cursor, start))
    out.push(
      <mark key={`${start}-${end}`} className={MARK_CLASS}>
        {text.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return <>{out}</>
}

/** JSX-component form. Identical rendering to highlightMatches() — pick
 * whichever reads more naturally at the call site. */
export function HighlightText({
  text,
  query,
}: {
  text: string | null | undefined
  query?: string
}) {
  return <>{highlightMatches(text, query)}</>
}
