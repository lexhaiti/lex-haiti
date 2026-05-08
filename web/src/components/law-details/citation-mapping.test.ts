import { describe, expect, it } from 'vitest'
import type { ArticleResolved } from '@/lib/api/endpoints'
import {
  mapCitations,
  type CitationRow,
  type SiblingArticle,
} from './citation-mapping'

const baseRow = (over: Partial<CitationRow>): CitationRow =>
  ({
    id: 1,
    source_node_type: 'article',
    source_node_id: 100,
    target_node_type: 'article',
    target_node_id: 200,
    relation: 'cites',
    source_paragraph: null,
    confidence: '0.85',
    extraction_method: 'regex',
    validated_by: 'test',
    editorial_status: 'published',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }) as CitationRow

describe('mapCitations', () => {
  it('resolves same-text article via siblings map', () => {
    const siblings = new Map<number, SiblingArticle>([
      [200, { id: 200, number: '8', slug: 'art-8' }],
    ])
    const result = mapCitations(
      [baseRow({ target_node_id: 200 })],
      'outbound',
      siblings,
      'constitution-1987',
      new Map(),
    )
    expect(result).toHaveLength(1)
    expect(result[0].target_label).toBe('Article 8')
    expect(result[0].href).toBe('/loi/constitution-1987?article=8')
    expect(result[0].relation).toBe('vise')
  })

  it('resolves cross-text article via resolver map with parent title', () => {
    const resolved = new Map<number, ArticleResolved>([
      [
        1382,
        {
          id: 1382,
          number: '1382',
          slug: 'art-1382',
          text_id: 5,
          text_slug: 'code-civil',
          text_title_fr: 'Code Civil',
        },
      ],
    ])
    const result = mapCitations(
      [baseRow({ target_node_id: 1382 })],
      'outbound',
      new Map(),
      undefined,
      resolved,
    )
    expect(result[0].target_label).toBe('Code Civil — Article 1382')
    expect(result[0].href).toBe('/loi/code-civil?article=1382')
  })

  it('falls back to "Article #id" when neither map has the target', () => {
    const result = mapCitations(
      [baseRow({ target_node_id: 9999 })],
      'outbound',
      new Map(),
      'constitution-1987',
      new Map(),
    )
    expect(result[0].target_label).toBe('Article #9999')
    expect(result[0].href).toBeNull()
  })

  it('flips source/target lookup based on direction (inbound)', () => {
    // Inbound = "X cites this article". Display the SOURCE side.
    const siblings = new Map<number, SiblingArticle>([
      [50, { id: 50, number: '198', slug: 'art-198' }],
    ])
    const result = mapCitations(
      [
        baseRow({
          source_node_id: 50, // who cites us
          target_node_id: 999, // us
        }),
      ],
      'inbound',
      siblings,
      'constitution-1987',
      new Map(),
    )
    expect(result[0].target_label).toBe('Article 198')
  })

  it('translates each backend relation to a French verb', () => {
    const cases: Array<[CitationRow['relation'], string]> = [
      ['cites', 'vise'],
      ['applies', 'applique'],
      ['interprets', 'interprete'],
      ['amends', 'modifie'],
      ['abrogates', 'abroge'],
      ['supersedes', 'modifie'],
    ]
    for (const [enumValue, expected] of cases) {
      const result = mapCitations(
        [baseRow({ relation: enumValue })],
        'outbound',
        new Map(),
        'x',
        new Map(),
      )
      expect(result[0].relation).toBe(expected)
    }
  })

  it('renders Decision targets as "Décision #id"', () => {
    const result = mapCitations(
      [baseRow({ target_node_type: 'decision', target_node_id: 42 })],
      'outbound',
      new Map(),
      undefined,
      new Map(),
    )
    expect(result[0].target_label).toBe('Décision #42')
    expect(result[0].href).toBeNull()
  })

  it('passes source_paragraph through as note', () => {
    const result = mapCitations(
      [baseRow({ source_paragraph: 'à l\'article 8 ci-après' })],
      'outbound',
      new Map(),
      'x',
      new Map(),
    )
    expect(result[0].note).toBe("à l'article 8 ci-après")
  })

  it('handles empty input', () => {
    expect(
      mapCitations([], 'outbound', new Map(), undefined, new Map()),
    ).toEqual([])
  })

  it('omits href when same-text resolution succeeds but lawSlug is missing', () => {
    const siblings = new Map<number, SiblingArticle>([
      [1, { id: 1, number: '1', slug: 'art-1' }],
    ])
    const result = mapCitations(
      [baseRow({ target_node_id: 1 })],
      'outbound',
      siblings,
      undefined, // no lawSlug — render label but no link
      new Map(),
    )
    expect(result[0].target_label).toBe('Article 1')
    expect(result[0].href).toBeNull()
  })
})
