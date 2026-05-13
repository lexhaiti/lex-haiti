'use client'

import { useState, useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

import {
  setMoniteurEntryParserProfile,
  type MoniteurEntryRead,
  type ParserProfile,
} from '@/lib/api/endpoints'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

// Profiles the editor can pin. Mirrors the backend ParserProfile enum.
// "generic" stays in the list as a manual override — the editor can pin
// it when the typ-specific profile produces worse results than the
// fallback (e.g. a malformed loi where the structural detection misfires).
const PROFILES: ReadonlyArray<ParserProfile> = [
  'constitution',
  'code',
  'loi',
  'executive_act',
  'circulaire',
  'communique',
  'generic',
]

type Props = {
  entry: MoniteurEntryRead
  /** Called with the refreshed entry after the override is saved. The
   *  parent updates its local state so the new content_ast is visible
   *  without a full refetch. */
  onSaved: (next: MoniteurEntryRead) => void
  /** Disable when the entry has been promoted (re-parsing would orphan
   *  the existing LegalText). */
  disabled?: boolean
}

/**
 * Compact chip that shows the entry's effective parser profile and lets
 * the editor pin a specific one. Auto = "let the pipeline pick from
 * detected_category". Saving triggers a synchronous re-parse so the
 * content_ast (and the structure preview drawn from it) updates in the
 * same click.
 */
export function ParserProfileChip({ entry, onSaved, disabled }: Props) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const effective = entry.parser_profile ?? null

  function applyChange(next: ParserProfile | null) {
    if (next === effective) return
    setError(null)
    startTransition(async () => {
      try {
        const updated = await setMoniteurEntryParserProfile(entry.id, {
          parser_profile: next,
          rerun: true,
        })
        onSaved(updated)
      } catch (e: any) {
        setError(e?.body?.detail ?? String(e))
      }
    })
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
        {t('editorial.moniteur.review.parserProfile', {
          fallback: 'Profil',
        })}
      </span>
      <div className="relative">
        <select
          value={effective ?? ''}
          disabled={disabled || pending}
          onChange={(e) =>
            applyChange((e.target.value || null) as ParserProfile | null)
          }
          aria-label={t('editorial.moniteur.review.parserProfileAria', {
            fallback: 'Choisir le profil de parseur',
          })}
          className={cn(
            'h-7 pl-2 pr-7 rounded-md border bg-white text-[11px] font-semibold uppercase tracking-wider',
            'cursor-pointer transition-colors',
            effective === null
              ? 'border-slate-300 text-slate-500'
              : 'border-amber-300 text-amber-800 bg-amber-50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-primary/30',
          )}
        >
          <option value="">
            {t('editorial.moniteur.review.parserProfileAuto', {
              fallback: 'auto',
            })}
          </option>
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {t(`editorial.moniteur.review.parserProfileValues.${p}`, {
                fallback: p,
              })}
            </option>
          ))}
        </select>
        {pending && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-amber-600 pointer-events-none" />
        )}
      </div>
      {effective !== null && !pending && (
        <Sparkles
          className="w-3 h-3 text-amber-600"
          aria-label={t('editorial.moniteur.review.parserProfilePinnedAria', {
            fallback: 'Profil épinglé manuellement',
          })}
        />
      )}
      {error && (
        <span className="text-[11px] text-red-600 ml-1">{error}</span>
      )}
    </div>
  )
}
