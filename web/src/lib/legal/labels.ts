/**
 * Centralised display labels for the legal taxonomy.
 *
 * Mirrors the backend `LegalCategory` and `CodeSubcategory` enums (see
 * backend/services/corpus/types.py). When the backend adds a category,
 * add it here too — the typed `CategoryKey` union forces TS callers to
 * handle the new value.
 *
 * Three formerly-duplicated maps (in MoniteurIssueCard, AllLawsUI,
 * editorial review page, and home/ActualitesSection) all route through
 * the helpers below. The decorative variant (badge background colour
 * for ActualitesSection) lives in `CATEGORY_BADGE_CLASS` and stays
 * decoupled from the labels themselves.
 */

export type CategoryKey =
  | 'constitution'
  | 'code'
  | 'loi'
  | 'decret'
  | 'arrete'
  | 'circulaire'
  | 'convention'
  | 'ordonnance'
  | 'communique'
  | 'correspondance'
  | 'promulgation'
  | 'errata'
  | 'autre'

export type SubcategoryKey =
  | 'code_civil'
  | 'code_penal'
  | 'code_procedure_civile'
  | 'code_procedure_penale'
  | 'code_travail'
  | 'code_commerce'
  | 'code_rural'
  | 'autre'

type Bilingual = { fr: string; ht: string }

// Note on typing: we use `Record<string, Bilingual>` (open) plus a
// `satisfies Record<CategoryKey, Bilingual>` (closed) so that:
//   - string indexing works for callers consuming URL params, backend
//     responses, etc. — values that arrive as `string` and can't be
//     narrowed without a runtime check
//   - adding a new `CategoryKey` without a corresponding label entry
//     fails the build at this file (the satisfies check is exhaustive)

/** Singular form: "Code", "Loi", "Décret", … — for badges, eyebrows. */
export const CATEGORY_LABELS = {
  constitution: { fr: 'Constitution', ht: 'Konstitisyon' },
  code: { fr: 'Code', ht: 'Kòd' },
  loi: { fr: 'Loi', ht: 'Lwa' },
  decret: { fr: 'Décret', ht: 'Dekrè' },
  arrete: { fr: 'Arrêté', ht: 'Arète' },
  circulaire: { fr: 'Circulaire', ht: 'Sirkilè' },
  convention: { fr: 'Convention', ht: 'Konvansyon' },
  ordonnance: { fr: 'Ordonnance', ht: 'Òdonans' },
  communique: { fr: 'Communiqué', ht: 'Kominike' },
  correspondance: { fr: 'Correspondance', ht: 'Korespondans' },
  promulgation: { fr: 'Promulgation', ht: 'Pwomilgasyon' },
  errata: { fr: 'Errata', ht: 'Erata' },
  autre: { fr: 'Autre', ht: 'Lòt' },
} satisfies Record<CategoryKey, Bilingual> as Record<string, Bilingual>

/** Plural form: "Codes", "Lois", "Décrets", … — for filter chips,
 * breadcrumbs, listing page titles. Kreyòl typically uses the singular
 * form even for plurals (no morphological plural marker), so several
 * entries are intentionally identical to CATEGORY_LABELS in the `ht`
 * column. */
export const CATEGORY_LABELS_PLURAL = {
  constitution: { fr: 'Constitutions', ht: 'Konstitisyon' },
  code: { fr: 'Codes', ht: 'Kòd' },
  loi: { fr: 'Lois', ht: 'Lwa' },
  decret: { fr: 'Décrets', ht: 'Dekrè' },
  arrete: { fr: 'Arrêtés', ht: 'Arète' },
  circulaire: { fr: 'Circulaires', ht: 'Sirkilè' },
  convention: { fr: 'Conventions', ht: 'Konvansyon' },
  ordonnance: { fr: 'Ordonnances', ht: 'Òdonans' },
  communique: { fr: 'Communiqués', ht: 'Kominike' },
  correspondance: { fr: 'Correspondances', ht: 'Korespondans' },
  promulgation: { fr: 'Promulgations', ht: 'Pwomilgasyon' },
  errata: { fr: 'Errata', ht: 'Erata' },
  autre: { fr: 'Autres', ht: 'Lòt' },
} satisfies Record<CategoryKey, Bilingual> as Record<string, Bilingual>

/** Code subcategories — the seven Haitian codes plus catch-all. */
export const SUBCATEGORY_LABELS = {
  code_civil: { fr: 'Code Civil', ht: 'Kòd Sivil' },
  code_penal: { fr: 'Code Pénal', ht: 'Kòd Penal' },
  code_procedure_civile: {
    fr: 'Code de Procédure Civile',
    ht: 'Kòd Pwosedi Sivil',
  },
  code_procedure_penale: {
    fr: 'Code de Procédure Pénale',
    ht: 'Kòd Pwosedi Penal',
  },
  code_travail: { fr: 'Code du Travail', ht: 'Kòd Travay' },
  code_commerce: { fr: 'Code de Commerce', ht: 'Kòd Komès' },
  code_rural: { fr: 'Code Rural', ht: 'Kòd Riral' },
  autre: { fr: 'Autre', ht: 'Lòt' },
} satisfies Record<SubcategoryKey, Bilingual> as Record<string, Bilingual>

/** Tailwind classes for category badges on the home `ActualitesSection`
 * (and any future surface that wants a coloured pill). Keep these
 * decoupled from the labels: the colour scheme is a design decision,
 * not a data attribute. */
export const CATEGORY_BADGE_CLASS: Partial<Record<CategoryKey, string>> = {
  constitution: 'bg-amber-100 text-amber-800',
  code: 'bg-blue-100 text-blue-800',
  loi: 'bg-indigo-100 text-indigo-800',
  decret: 'bg-emerald-100 text-emerald-800',
  arrete: 'bg-purple-100 text-purple-800',
  circulaire: 'bg-slate-100 text-slate-700',
  convention: 'bg-rose-100 text-rose-800',
  ordonnance: 'bg-cyan-100 text-cyan-800',
  communique: 'bg-orange-100 text-orange-800',
  correspondance: 'bg-yellow-100 text-yellow-800',
  promulgation: 'bg-teal-100 text-teal-800',
  errata: 'bg-pink-100 text-pink-800',
  autre: 'bg-slate-100 text-slate-600',
}

/** Resolve a category key to its localized label, with safe fallback to
 * the raw key for unexpected backend values. */
export function categoryLabel(
  key: string,
  lang: 'fr' | 'ht',
  opts?: { plural?: boolean },
): string {
  const map = opts?.plural ? CATEGORY_LABELS_PLURAL : CATEGORY_LABELS
  return map[key as CategoryKey]?.[lang] ?? key
}

/** Resolve a subcategory key to its localized label. */
export function subcategoryLabel(key: string, lang: 'fr' | 'ht'): string {
  return SUBCATEGORY_LABELS[key as SubcategoryKey]?.[lang] ?? key
}

/** Convenience: badge tailwind classes for a category, with a sane
 * default when the backend returns an unknown value. */
export function categoryBadgeClass(key: string): string {
  return CATEGORY_BADGE_CLASS[key as CategoryKey] ?? 'bg-slate-100 text-slate-600'
}
