/**
 * Legal-text-level status helpers.
 *
 * The `LegalText` row carries a status that's distinct from the per-
 * article status (some articles can be abrogated independently of their
 * parent text). This module owns:
 *   - the type union of valid text-level statuses
 *   - the bilingual pill rendering metadata (label, classes, icon)
 *   - the text→article status mapping used to inherit the parent
 *     status when an article has no explicit override
 *
 * Extracted from LawDetail.tsx so the 1200-line file stops being the
 * only place that knows about status semantics.
 */
import {
  AlertTriangle,
  Archive,
  CheckCircle,
  FileText,
  PauseCircle,
  XCircle,
} from 'lucide-react'
import React from 'react'

export type TextStatus =
  | 'in_force'
  | 'abrogated'
  | 'suspended'
  | 'partially_abrogated'
  | 'historical'
  | 'draft'

export const TEXT_STATUS_PILL: Record<
  TextStatus,
  {
    label: { fr: string; ht: string }
    cls: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  in_force: {
    label: { fr: 'En vigueur', ht: 'An vigè' },
    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: CheckCircle,
  },
  abrogated: {
    label: { fr: 'Abrogée', ht: 'Abwoje' },
    cls: 'bg-red-500/10 text-red-400 border-red-500/20',
    icon: XCircle,
  },
  suspended: {
    label: { fr: 'Suspendue', ht: 'Sispann' },
    cls: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    icon: PauseCircle,
  },
  partially_abrogated: {
    label: { fr: 'Partiellement abrogée', ht: 'Pasyèlman abwoje' },
    cls: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    icon: AlertTriangle,
  },
  historical: {
    label: { fr: 'Historique', ht: 'Istorik' },
    cls: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
    icon: Archive,
  },
  draft: {
    label: { fr: 'Brouillon', ht: 'Bwouyon' },
    cls: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
    icon: FileText,
  },
}

/**
 * Map a legal-text status to the equivalent article-level status.
 * Used so individual articles inherit the parent text's status when no
 * per-article override is set in the data.
 */
export function mapTextStatusToArticleStatus(
  textStatus: string | null | undefined,
):
  | 'in_force'
  | 'abrogated'
  | 'suspended'
  | 'transferred'
  | 'obsolete'
  | undefined {
  if (!textStatus) return undefined
  switch (textStatus) {
    case 'in_force':
      return 'in_force'
    case 'abrogated':
      return 'abrogated'
    case 'suspended':
      return 'suspended'
    case 'historical':
      return 'obsolete'
    case 'partially_abrogated':
      // Default to in_force; per-article status overrides for the abrogated ones.
      return 'in_force'
    default:
      return undefined
  }
}
