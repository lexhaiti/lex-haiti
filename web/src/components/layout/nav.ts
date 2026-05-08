/**
 * Footer navigation. Header navigation lives in `menu.ts` (mega-menu shape).
 */

export type NavItem = { href: string; labelKey: string }

export const footerLegal: NavItem[] = [
  // Use precise category / code_subcategory filters instead of fuzzy
  // search — predictable URLs, no false positives.
  {
    href: '/lois?category=constitution',
    labelKey: 'footer.legal.constitution',
  },
  {
    href: '/lois?category=code&code_subcategory=code_civil',
    labelKey: 'footer.legal.civil',
  },
  {
    href: '/lois?category=code&code_subcategory=code_penal',
    labelKey: 'footer.legal.penal',
  },
  {
    href: '/lois?category=code&code_subcategory=code_travail',
    labelKey: 'footer.legal.labour',
  },
]

export const footerResources: NavItem[] = [
  { href: '/lois', labelKey: 'footer.links.all' },
  { href: '/moniteur', labelKey: 'footer.links.moniteur' },
  { href: '/lois?sort=newest', labelKey: 'footer.links.updates' },
  { href: '/thematiques', labelKey: 'footer.links.themes' },
]

export const footerAbout: NavItem[] = [
  { href: '/a-propos', labelKey: 'footer.links.about' },
  { href: '/contact', labelKey: 'footer.links.contact' },
  { href: '/legal', labelKey: 'footer.links.legalNotice' },
  { href: '/privacy', labelKey: 'footer.links.privacy' },
]
