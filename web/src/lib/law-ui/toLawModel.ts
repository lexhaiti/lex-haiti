import type { components } from '@/lib/api-types'
import { type LucideIcon, Sparkles } from 'lucide-react'
import { badgeForLaw, type LawBadge } from './badges'
import { colorFromSlug } from './colors'
import { iconForLaw } from './icons'
import { statsForLaw } from './stats'

type LegalTextListItem = components['schemas']['LegalTextListItem']

export type LawCardModel = {
  id: string
  slug: string
  href: string
  title: string
  subtitle?: string
  description?: string
  icon: LucideIcon
  color: string
  badge: LawBadge
  stats: { label: string; value: string | number }[]
}

const MONTHS_FR = [
  '',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const MONTHS_HT = [
  '',
  'janvye', 'fevriye', 'mas', 'avril', 'me', 'jen',
  'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm',
]

function formatLongDate(iso: string | undefined, lang: 'fr' | 'ht'): string | undefined {
  if (!iso) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const year = m[1]
  const month = Number.parseInt(m[2], 10)
  const day = Number.parseInt(m[3], 10)
  const months = lang === 'ht' ? MONTHS_HT : MONTHS_FR
  return `${day} ${months[month] ?? ''} ${year}`.trim()
}

// Descriptions that are pure data-provenance preambles (auto-imported source
// notes, draft warnings, etc.) repeat across many cards and crowd the grid
// without telling the user anything specific to the text. We hide them on
// the card and let the detail page surface the source elsewhere.
const _BOILERPLATE_PREFIXES = [
  'Texte numérisé',
  'Tèks dijitalize',
  'Données importées',
  'Done enpòte',
  'Source :',
  'Sous :',
]

function isBoilerplate(desc: string | undefined): boolean {
  if (!desc) return false
  const head = desc.trimStart()
  return _BOILERPLATE_PREFIXES.some((p) => head.startsWith(p))
}

export function toLawCardModel(args: {
  item: LegalTextListItem
  language: 'fr' | 'ht'
}): LawCardModel {
  const { item, language } = args

  if (!item) {
    return {
      id: '',
      slug: '',
      href: '#',
      title: 'Loading...',
      icon: Sparkles as LucideIcon,
      color: '#CBD5E1',
      badge: { text: 'Loading', variant: 'default' },
      stats: [],
    }
  }

  const title =
    language === 'ht' ? (item.title_ht ?? item.title_fr) : item.title_fr

  const rawDescription =
    language === 'ht'
      ? (item.description_ht ?? item.description_fr ?? undefined)
      : (item.description_fr ?? undefined)
  const description = isBoilerplate(rawDescription) ? undefined : rawDescription

  // subtitle priority: publication_date > moniteur_ref. Render the date in
  // long French/Kreyòl form ("28 avril 1987") instead of the raw ISO string
  // — the audit caught raw "1987-04-28" landing in the card grid.
  const subtitle =
    formatLongDate(item.publication_date, language) ??
    item.moniteur_ref ??
    undefined

  const [s1, s2] = statsForLaw(item)

  return {
    id: String(item.id),
    slug: item.slug,
    href: `/loi/${item.slug}`,
    title,
    subtitle,
    description,
    icon: iconForLaw({
      category: item.category,
      code_subcategory: item.code_subcategory,
    }),
    color: colorFromSlug(item.slug),
    badge: badgeForLaw({
      status: item.status,
      category: item.category,
      code_subcategory: item.code_subcategory,
    }),
    stats: [s1, s2],
  }
}
