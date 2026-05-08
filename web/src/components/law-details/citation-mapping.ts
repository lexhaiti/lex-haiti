/**
 * Citation row → display entry mapping.
 *
 * Extracted from `ArticleViewer.tsx` so the rendering logic can be unit-
 * tested without instantiating the whole React component. The viewer
 * imports `mapCitations` and renders the resulting `CitationEntry[]`
 * inside its accordion.
 */
import type { components } from '@/lib/api-types'
import type { ArticleResolved } from '@/lib/api/endpoints'

export type CitationRow = components['schemas']['CitationRead']

export type SiblingArticle = {
  id: number
  number: string
  slug: string
}

/** Display shape rendered by `CitationColumn`. */
export interface CitationEntry {
  relation:
    | 'vise'
    | 'modifie'
    | 'abroge'
    | 'applique'
    | 'interprete'
    | 'application'
    | 'interpretation'
    | 'annulation'
  target_label: string
  href?: string | null
  note?: string | null
}

// Backend `CitationRelation` enum → French verbs the existing
// CitationColumn already styles. Direction is handled by the column
// header ("Cite" vs "Cité par"); the per-row badge stays the same in
// both directions.
export const RELATION_MAP: Record<string, CitationEntry['relation']> = {
  cites: 'vise',
  applies: 'applique',
  interprets: 'interprete',
  distinguishes: 'interprete',
  amends: 'modifie',
  abrogates: 'abroge',
  supersedes: 'modifie',
}

/**
 * Convert backend citation rows to display entries.
 *
 * Resolution strategy:
 *  1. Same-text article → use the local `articleById` map for "Article N".
 *  2. Cross-text article → look up `resolvedById` (populated by a batch
 *     fetch to `/api/v1/articles/resolve`) for "Code Civil — Article 1382".
 *  3. Article we can't resolve yet → "Article #id" placeholder.
 *  4. Decision / Texte targets → generic labels with the id.
 */
export function mapCitations(
  rows: CitationRow[],
  direction: 'outbound' | 'inbound',
  articleById: Map<number, SiblingArticle>,
  lawSlug: string | undefined,
  resolvedById: Map<number, ArticleResolved>,
): CitationEntry[] {
  return rows.map((c) => {
    const otherType =
      direction === 'outbound' ? c.target_node_type : c.source_node_type
    const otherId =
      direction === 'outbound' ? c.target_node_id : c.source_node_id

    let target_label: string
    let href: string | null = null

    if (otherType === 'article') {
      const sibling = articleById.get(otherId)
      if (sibling) {
        target_label = `Article ${sibling.number}`
        href = lawSlug
          ? `/loi/${lawSlug}?article=${encodeURIComponent(sibling.number)}`
          : null
      } else {
        const resolved = resolvedById.get(otherId)
        if (resolved) {
          target_label = `${resolved.text_title_fr} — Article ${resolved.number}`
          href = `/loi/${resolved.text_slug}?article=${encodeURIComponent(resolved.number)}`
        } else {
          target_label = `Article #${otherId}`
        }
      }
    } else if (otherType === 'decision') {
      target_label = `Décision #${otherId}`
    } else {
      target_label = `Texte #${otherId}`
    }

    return {
      relation: RELATION_MAP[c.relation as string] ?? 'vise',
      target_label,
      href,
      note: c.source_paragraph ?? undefined,
    }
  })
}
