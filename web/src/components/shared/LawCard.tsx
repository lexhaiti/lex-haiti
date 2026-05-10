// src/components/shared/LawCard.tsx
//
// Stays 'use client' for now because both current call sites
// (recherche/page.tsx and AllLawsUI.tsx) are themselves client
// components — you can't render a server component from a client
// parent. This component is *RSC-compatible* though: it uses no React
// hooks and no framer-motion, only CSS-driven `group-hover:` utilities
// for the hover choreography. The day a parent gets refactored to RSC
// (e.g. recherche/page.tsx with server-fetched results), drop the
// 'use client' directive below for free.
//
// The previous framer-motion implementation shipped two `motion.div`
// wrappers per card with `whileHover` variants and a pulsing-ring
// effect (`repeat: Infinity`). All replaced by tailwind utilities,
// shrinking the client bundle and the per-card render cost.
'use client'

import Link from 'next/link'
import React from 'react'
import {
  ArrowUpRight,
  Ban,
  Calendar,
  CheckCircle2,
  Hash,
  Landmark,
  type LucideIcon,
  Pencil,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api-types'
import { toLawCardModel } from '@/lib/law-ui/toLawModel'
import type { DisplayItem } from '@/lib/hooks/useAllTexts'
import { HighlightText } from '@/lib/text/highlight'

type LegalTextListItem = components['schemas']['LegalTextListItem']
type SearchHit = components['schemas']['SearchHit']

export type CardStyle = 'grid' | 'list'

/**
 * Props are a discriminated union over how the card is fed:
 *   - `item` mode: a plain `LegalTextListItem` from `/legal-texts`
 *   - `displayItem` mode: a `DisplayItem` (text OR search hit) from
 *     the `useAllTexts` hook, which mixes listings and search results
 *     into one stream
 */
type SharedProps = {
  cardStyle?: CardStyle
  index?: number
  className?: string
  /** Wrap query matches in <mark> inside title + description + snippets. */
  query?: string
}

type Props =
  | (SharedProps & {
      item: LegalTextListItem
      language: 'fr' | 'ht'
    })
  | (SharedProps & {
      displayItem: DisplayItem
      language: 'fr' | 'ht'
    })

function statusBadgeMeta(badge?: {
  tone?: 'success' | 'warning' | 'danger' | 'neutral'
  icon?: LucideIcon
}): {
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  icon?: LucideIcon
} {
  const tone = badge?.tone ?? 'neutral'
  if (badge?.icon) return { tone, icon: badge.icon }
  if (tone === 'success') return { tone, icon: CheckCircle2 }
  if (tone === 'warning') return { tone, icon: Pencil }
  if (tone === 'danger') return { tone, icon: Ban }
  return { tone }
}

function badgeClass(tone: 'success' | 'warning' | 'danger' | 'neutral') {
  switch (tone) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'danger':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200'
  }
}

function subtitleIconFor(subtitle?: string): LucideIcon {
  if (!subtitle) return Hash
  if (/^\d{4}-\d{2}-\d{2}$/.test(subtitle)) return Calendar
  if (/^\d{4}$/.test(subtitle)) return Calendar
  if (subtitle.toLowerCase().includes('moniteur')) return Landmark
  return Hash
}

export function LawCard(props: Props) {
  const { cardStyle: cardStyleProp, query: highlightQuery, language } = props

  // Plain function call — no useMemo. Models are cheap (icon/color
  // lookup + bilingual field selection); React's reconciler handles
  // the rest. RSC compatibility note above explains the rationale.
  const model =
    'displayItem' in props
      ? toLawCardModel({
          item:
            props.displayItem.type === 'text'
              ? (props.displayItem.data as LegalTextListItem)
              : (props.displayItem.data as SearchHit).text,
          language,
        })
      : toLawCardModel({ item: props.item, language })

  const cardStyle: CardStyle = cardStyleProp ?? 'grid'

  const { href, title, subtitle, description, color, badge, stats } = model
  const Icon: LucideIcon = model.icon

  // Snippet rendering — only when card was fed from a SearchHit.
  const isHit = 'displayItem' in props && props.displayItem.type === 'hit'
  const hit: SearchHit | null = isHit
    ? (props.displayItem.data as SearchHit)
    : null

  // CSS variables let group-hover utilities reference the dynamic
  // per-card colour without inline-style on every element.
  const activeStyle = {
    '--card-theme': color,
    '--card-theme-light': `${color}15`,
    '--card-theme-medium': `${color}30`,
    '--card-theme-strong': `${color}20`,
    '--card-theme-tint': `${color}10`,
  } as React.CSSProperties

  const badgeText = badge?.text ?? 'Texte'
  const { tone, icon: StatusIcon } = statusBadgeMeta(badge)
  const SubtitleIcon = subtitleIconFor(subtitle)

  if (cardStyle === 'list') {
    return (
      <Link
        href={href}
        className={cn('block outline-none group', props.className)}
      >
        <div
          style={activeStyle}
          className={cn(
            'relative overflow-hidden rounded-xl bg-white transition-all duration-300',
            'border border-gray-100 hover:border-[var(--card-theme-medium)]',
            'shadow-sm hover:shadow-md hover:shadow-[var(--card-theme-light)]',
            'hover:-translate-y-0.5',
          )}
        >
          {/* Hover wash */}
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-white/50 via-white/30 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 backdrop-blur-sm" />

          {/* Left colour rail — scales in from the top on hover. */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[3px] z-20 origin-top scale-y-0 transition-transform duration-500 ease-out group-hover:scale-y-100 bg-[var(--card-theme)]"
          />

          <div className="relative z-10 pl-6 pr-4 py-4">
            <div className="flex gap-4">
              {/* Icon column */}
              <div className="flex-shrink-0 pt-1">
                <div
                  className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-full',
                    'border border-white/60 shadow-sm transition-all duration-500 backdrop-blur-md',
                    'group-hover:scale-105 group-hover:rotate-3',
                    'bg-[var(--card-theme-light)]',
                  )}
                  style={{ boxShadow: `0 2px 8px ${color}15` }}
                >
                  <Icon className="h-5 w-5 relative z-10" style={{ color }} />
                </div>
              </div>

              {/* Body column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3
                          className={cn(
                            'text-base font-semibold text-gray-900 truncate',
                            'group-hover:text-[var(--card-theme)] transition-colors duration-300',
                          )}
                          title={title}
                        >
                          <HighlightText text={title} query={highlightQuery} />
                        </h3>
                        {subtitle && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <SubtitleIcon className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {subtitle}
                            </span>
                          </div>
                        )}
                      </div>

                      {(description || (isHit && hit?.snippets?.length)) && (
                        <div className="hidden md:block flex-1 min-w-0">
                          {isHit && hit?.snippets?.length ? (
                            <div className="space-y-2">
                              {hit.snippets.map((snippet, si) => {
                                const sContent =
                                  language === 'ht'
                                    ? snippet.snippet_ht
                                    : snippet.snippet_fr
                                return (
                                  <div
                                    key={si}
                                    className="text-xs border-l-2 border-red-500/30 pl-3 py-1 bg-gray-50/50 rounded-r-lg"
                                  >
                                    <p className="font-bold text-gray-900 mb-1">
                                      Article {snippet.article.number}
                                    </p>
                                    <p className="text-gray-600 line-clamp-1 italic">
                                      &quot;
                                      <HighlightText
                                        text={sContent || ''}
                                        query={highlightQuery}
                                      />
                                      &quot;
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              <HighlightText
                                text={description ?? ''}
                                query={highlightQuery}
                              />
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border',
                        badgeClass(tone),
                        'transition-all duration-300 group-hover:shadow-sm',
                      )}
                    >
                      {StatusIcon && <StatusIcon className="h-3.5 w-3.5" />}
                      {badgeText}
                    </span>
                  </div>
                </div>

                {/* Mobile-only description row */}
                {description && (
                  <div className="md:hidden mb-3">
                    <p className="text-sm text-gray-600 line-clamp-2">
                      <HighlightText text={description} query={highlightQuery} />
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-6">
                    {(stats ?? []).slice(0, 2).map((stat, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {stat.label}
                        </span>
                        <span className="text-sm font-bold text-gray-700 font-mono">
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Action affordance — scales + tints on group hover. */}
                  <div
                    className={cn(
                      'relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 border',
                      'group-hover:scale-110 group-hover:rotate-[5deg] group-hover:bg-[var(--card-theme-strong)]',
                    )}
                    style={{
                      backgroundColor: `${color}10`,
                      color,
                      borderColor: `${color}20`,
                    }}
                  >
                    <ArrowUpRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom hover gradient — flows in left-to-right. */}
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-[var(--card-theme-light)]/0 via-[var(--card-theme-light)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>
      </Link>
    )
  }

  // ---- Grid (default) variant -------------------------------------------
  const badgeVariant = badge?.variant ?? 'default'
  return (
    <Link
      href={href}
      className={cn('block h-full outline-none group', props.className)}
    >
      <div
        style={activeStyle}
        className={cn(
          'relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-white transition-all duration-500',
          'border border-gray-100 hover:border-[var(--card-theme-medium)]',
          'shadow-sm hover:shadow-xl hover:shadow-[var(--card-theme-light)]',
          'hover:-translate-y-1',
        )}
      >
        {/* Top colour rail — scales in horizontally on hover. */}
        <div className="absolute top-0 left-0 right-0 h-1.5 z-20 origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100 bg-[var(--card-theme)]" />

        {/* Diagonal background tint on hover. */}
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-[var(--card-theme-light)] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        <div className="relative z-10 p-7 pt-9 flex flex-col h-full">
          <div className="mb-6 flex items-start justify-between">
            <div
              className={cn(
                'relative flex h-14 w-14 items-center justify-center rounded-full',
                'border border-white/60 shadow-sm transition-transform duration-500 backdrop-blur-md',
                'group-hover:scale-110 group-hover:rotate-3',
                'bg-[var(--card-theme-light)]',
              )}
            >
              <Icon className="h-7 w-7" style={{ color }} />
            </div>

            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider border',
                badgeClass(tone),
                badgeVariant === 'outline' && 'bg-transparent shadow-none',
              )}
            >
              {StatusIcon ? <StatusIcon className="h-3.5 w-3.5" /> : null}
              {badgeVariant === 'glowing' && tone === 'neutral' ? (
                <Sparkles className="h-3 w-3 fill-amber-500 text-amber-500" />
              ) : null}
              {badgeText}
            </span>
          </div>

          <div className="mb-8 flex-1">
            <h3 className="mb-2 text-xl font-bold text-gray-900 group-hover:text-[var(--card-theme)] transition-colors">
              <HighlightText text={title} query={highlightQuery} />
            </h3>

            {subtitle && (
              <div className="mb-4 inline-block rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 border border-gray-100">
                {subtitle}
              </div>
            )}

            {description && !isHit && (
              <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">
                <HighlightText text={description} query={highlightQuery} />
              </p>
            )}

            {isHit && hit && hit.snippets.length > 0 && (
              <div className="space-y-2 mt-2">
                {hit.snippets.slice(0, 1).map((snippet, si) => {
                  const sContent =
                    language === 'ht'
                      ? snippet.snippet_ht
                      : snippet.snippet_fr
                  return (
                    <div
                      key={si}
                      className="text-[11px] border-l-2 border-red-500/30 pl-2 py-0.5 bg-gray-50/50 rounded-r-lg italic text-gray-600 line-clamp-2"
                    >
                      &quot;
                      <HighlightText
                        text={sContent || ''}
                        query={highlightQuery}
                      />
                      &quot;
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-gray-100/80 pt-5">
            <div className="flex items-end justify-between">
              <div className="flex gap-6">
                {(stats ?? []).slice(0, 2).map((stat, i) => (
                  <div key={i} className="flex flex-col">
                    <span className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide leading-tight">
                      {stat.label}
                    </span>
                    <span className="text-sm font-bold text-gray-700 leading-tight font-mono">
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 border',
                  'group-hover:scale-110 group-hover:rotate-[5deg] group-hover:bg-[var(--card-theme-strong)]',
                )}
                style={{
                  backgroundColor: `${color}10`,
                  color,
                  borderColor: `${color}20`,
                }}
              >
                <ArrowUpRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
