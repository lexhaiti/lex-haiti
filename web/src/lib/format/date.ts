/**
 * Bilingual date formatting for the public site.
 *
 * Dates from the backend arrive as ISO `YYYY-MM-DD` (no time, no
 * timezone — they're legal publication dates, not events). We render
 * them in long French/Kreyòl form ("28 avril 1987" / "28 avril 1987"),
 * because the audit caught raw ISO strings landing in card grids and
 * detail headers.
 *
 * Single canonical implementation. Three formerly-duplicated copies
 * (recherche/page.tsx, moniteur/[id]/page.tsx, MoniteurIssueCard) all
 * route through `formatLongDate()` here; the inline IIFE in LawDetail
 * uses `formatLongDate()` + a `du ` prefix at the call site.
 */

export const MONTHS = {
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
} as const

/**
 * Render an ISO date as a long, human-readable date in French or Kreyòl.
 *
 * - `iso` may be null/undefined; when missing, returns `fallback`
 *   (default empty string — historic behaviour of /recherche and
 *   /moniteur/[id]; pass `'—'` for card surfaces, or `undefined` for
 *   adapters that want to drop the field entirely).
 * - When `iso` is a non-empty string that doesn't match `YYYY-MM-DD`,
 *   the original is returned unchanged so we never lose information.
 */
export function formatLongDate(
  iso: string | null | undefined,
  lang: 'fr' | 'ht' = 'fr',
  fallback: string = '',
): string {
  if (!iso) return fallback
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const day = Number.parseInt(m[3], 10)
  const month = Number.parseInt(m[2], 10)
  return `${day} ${MONTHS[lang][month] ?? ''} ${m[1]}`
}
