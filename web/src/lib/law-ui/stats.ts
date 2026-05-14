import type { components } from '@/lib/api-types'

type LegalTextListItem = components['schemas']['LegalTextListItem']
type CodeSubcategory = components['schemas']['CodeSubcategory']
type LegalCategory = components['schemas']['LegalCategory']

export type LawStat = { label: string; value: string | number }

const QUICK_STATS_BY_SUBCATEGORY: Partial<
  Record<CodeSubcategory, [LawStat, LawStat]>
> = {
  code_civil: [
    { label: 'Articles', value: 2281 },
    { label: 'Mise à jour', value: 2023 },
  ],
  code_penal: [
    { label: 'Articles', value: 734 },
    { label: 'Régime', value: 'Sévère' },
  ],
  code_travail: [
    { label: 'Articles', value: 417 },
    { label: 'Social', value: 'Actif' },
  ],
}

// Slug-pinned overrides for high-profile texts whose default stats
// don't tell the right story. Empty for now — the Constitution used
// to hard-code "Version: 2024" here, but the real legal_status pulled
// from the row reads better ("Statut: En vigueur" via fallbackStats).
const QUICK_STATS_BY_SLUG: Record<string, [LawStat, LawStat]> = {}

function yearFromDate(d: string | null | undefined): string | number {
  if (!d) return '—'
  return d.slice(0, 4)
}

// Map raw status enum values to human-readable French labels — surfaced on
// fallback card stats. The audit caught raw "in_force" / "abrogated" landing
// in the grid when no slug-specific stats override applied.
const STATUS_LABEL_FR: Record<string, string> = {
  in_force: 'En vigueur',
  abrogated: 'Abrogé',
  amended: 'Modifié',
  suspended: 'Suspendu',
  partially_abrogated: 'Partiellement abrogé',
  historical: 'Historique',
  draft: 'Brouillon',
}

function fallbackStats(item: LegalTextListItem): [LawStat, LawStat] {
  const year = yearFromDate(item.publication_date)
  const left: LawStat = { label: 'Année', value: year }
  const right: LawStat =
    item.category === ('decret' as LegalCategory)
      ? { label: 'Type', value: 'Exécutif' }
      : {
          label: 'Statut',
          value: item.status
            ? (STATUS_LABEL_FR[item.status] ?? item.status)
            : '—',
        }
  return [left, right]
}

export function statsForLaw(item: LegalTextListItem): [LawStat, LawStat] {
  const bySlug = QUICK_STATS_BY_SLUG[item.slug]
  if (bySlug) return bySlug

  if (item.code_subcategory) {
    const bySub = QUICK_STATS_BY_SUBCATEGORY[item.code_subcategory]
    if (bySub) return bySub
  }

  return fallbackStats(item)
}
