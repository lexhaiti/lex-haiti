// src/lib/law-ui/icons.ts
import type { LucideIcon } from 'lucide-react'
import { BookOpen, FileText, Gavel, Landmark, Scale } from 'lucide-react'
import type { components } from '@/lib/api-types'

type LegalCategory = components['schemas']['LegalCategory']
type CodeSubcategory = components['schemas']['CodeSubcategory']

export function iconForLaw(args: {
  category: LegalCategory
  code_subcategory?: CodeSubcategory | null
}): LucideIcon {
  const { category, code_subcategory } = args

  if (category === 'constitution') return Landmark

  if (category === 'code') {
    // optional finer mapping
    if (code_subcategory === 'code_penal') return Gavel
    if (code_subcategory === 'code_civil') return BookOpen
    if (code_subcategory === 'code_travail') return Scale
    return BookOpen
  }

  // decret/arrete/loi/circulaire → doc-ish icon
  return FileText
}
