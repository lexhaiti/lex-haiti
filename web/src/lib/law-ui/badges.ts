import type { components } from '@/lib/api-types'
import type { LucideIcon } from 'lucide-react'
import { Ban, CheckCircle2, Pencil } from 'lucide-react'

type LegalStatus = components['schemas']['LegalStatus']
type LegalCategory = components['schemas']['LegalCategory']
type CodeSubcategory = components['schemas']['CodeSubcategory']

export type LawBadgeVariant = 'default' | 'outline' | 'glowing'

export type LawBadge = {
  text: string
  variant?: LawBadgeVariant
  icon?: LucideIcon
  tone?: 'success' | 'warning' | 'danger' | 'neutral'
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function statusLabel(status: LegalStatus): string {
  switch (status) {
    case 'in_force':
      return 'En vigueur'
    case 'partially_abrogated':
      return 'Partiellement abrogé'
    case 'abrogated':
      return 'Abrogé'
    default:
      return titleCase(String(status))
  }
}

function badgeForStatus(status: LegalStatus): LawBadge {
  if (status === 'in_force') {
    return {
      text: statusLabel(status),
      variant: 'glowing',
      icon: CheckCircle2,
      tone: 'success',
    }
  }
  if (status === 'partially_abrogated') {
    return {
      text: statusLabel(status),
      variant: 'default',
      icon: Pencil,
      tone: 'warning',
    }
  }
  if (status === 'abrogated') {
    return {
      text: statusLabel(status),
      variant: 'outline',
      icon: Ban,
      tone: 'danger',
    }
  }
  return { text: statusLabel(status), variant: 'default', tone: 'neutral' }
}

export function badgeForLaw(args: {
  status: LegalStatus
  category: LegalCategory
  code_subcategory?: CodeSubcategory | null
}): LawBadge {
  return badgeForStatus(args.status)
}
