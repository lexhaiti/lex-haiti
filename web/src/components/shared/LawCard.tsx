// src/components/shared/LawCard.tsx
'use client'

import Link from 'next/link'
import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
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
import { LawCardModel, toLawCardModel } from '@/lib/law-ui/toLawModel'
import type { DisplayItem } from '@/lib/hooks/useAllTexts'

type LegalTextListItem = components['schemas']['LegalTextListItem']
type SearchHit = components['schemas']['SearchHit']

export type CardStyle = 'grid' | 'list'

type Props =
  | {
      model: LawCardModel
      cardStyle?: CardStyle
      index?: number
      className?: string
    }
  | {
      item: LegalTextListItem
      language: 'fr' | 'ht'
      cardStyle?: CardStyle
      index?: number
      className?: string
    }
  | {
      displayItem: DisplayItem
      language: 'fr' | 'ht'
      cardStyle?: CardStyle
      index?: number
      className?: string
    }
  | {
      law: any // For backward compatibility or different models
      currentLang: 'fr' | 'ht'
      variant?: string
      cardStyle?: CardStyle
      index?: number
      className?: string
    }

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

function subtitleMetaIcon(subtitle?: string) {
  if (!subtitle) return Hash
  if (/^\d{4}-\d{2}-\d{2}$/.test(subtitle)) return Calendar
  if (/^\d{4}$/.test(subtitle)) return Calendar
  if (subtitle.toLowerCase().includes('moniteur')) return Landmark
  return Hash
}

function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) return <>{text}</>

  const parts = text.split(new RegExp(`(${query})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-red-500/20 text-red-700 font-bold rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

export function LawCard(props: Props) {
  const model = useMemo(() => {
    if ('model' in props) return props.model
    if ('displayItem' in props) {
      const item =
        props.displayItem.type === 'text'
          ? (props.displayItem.data as LegalTextListItem)
          : (props.displayItem.data as SearchHit).text
      return toLawCardModel({ item, language: props.language })
    }
    if ('item' in props)
      return toLawCardModel({ item: props.item, language: props.language })
    if ('law' in props) {
      const language = (props as any).currentLang ?? 'fr'
      return toLawCardModel({
        item: props.law as any,
        language,
      })
    }
    return toLawCardModel({ item: undefined as any, language: 'fr' })
  }, [props])

  const cardStyle: CardStyle = props.cardStyle ?? 'grid'

  const { href, title, subtitle, description, color, badge, stats } = model
  const Icon: LucideIcon = model.icon

  // Deep search logic
  const isHit = 'displayItem' in props && props.displayItem.type === 'hit'
  const hit = isHit ? (props.displayItem.data as SearchHit) : null
  const language = 'language' in props ? props.language : 'fr'

  const activeStyle = {
    '--card-theme': color,
    '--card-theme-light': `${color}15`,
    '--card-theme-medium': `${color}30`,
  } as React.CSSProperties

  const badgeText = badge?.text ?? 'Texte'
  const { tone, icon: StatusIcon } = statusBadgeMeta(badge)
  const SubtitleIcon = subtitleMetaIcon(subtitle)

  if (cardStyle === 'list') {
    return (
      <Link
        href={href}
        className={cn('block outline-none group', props.className)}
      >
        <motion.div
          initial="rest"
          whileHover="hover"
          animate="rest"
          viewport={{ once: true, margin: '-50px' }}
          style={activeStyle}
          className={cn(
            'relative overflow-hidden rounded-xl bg-white transition-all duration-300',
            'border border-gray-100 hover:border-[var(--card-theme-medium)]',
            'shadow-sm hover:shadow-md hover:shadow-[var(--card-theme-light)]',
            'hover:-translate-y-0.5',
          )}
        >
          {/* Glass morphism background on hover */}
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-white/50 via-white/30 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 backdrop-blur-sm" />

          {/* Animated color strip on left - uses card theme color (same as grid variant) */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[3px] z-20 origin-top scale-y-0 transition-transform duration-500 ease-out group-hover:scale-y-100"
            style={{ backgroundColor: 'var(--card-theme)' }}
          />

          <div className="relative z-10 pl-6 pr-4 py-4">
            {/* Two-column wrapper */}
            <div className="flex gap-4">
              {/* First column: Icon with glass morphism */}
              <div className="flex-shrink-0 pt-1">
                <div
                  className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-full',
                    'border border-white/60 shadow-sm transition-all duration-500',
                    'group-hover:scale-105 group-hover:rotate-3 backdrop-blur-md',
                    'before:absolute before:inset-0 before:rounded-full before:bg-white/30 before:backdrop-blur-sm before:opacity-0 before:group-hover:opacity-100 before:transition-opacity',
                  )}
                  style={{
                    backgroundColor: 'var(--card-theme-light)',
                    boxShadow: `0 2px 8px ${color}15`,
                  }}
                >
                  <Icon className="h-5 w-5 relative z-10" style={{ color }} />
                </div>
              </div>

              {/* Second column: Two rows */}
              <div className="flex-1 min-w-0">
                {/* First row: Title and description in two columns, then badge */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  {/* Title and description container */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-4">
                      {/* Title column */}
                      <div className="flex-1 min-w-0">
                        <h3
                          className={cn(
                            'text-base font-semibold text-gray-900 truncate',
                            'group-hover:text-[var(--card-theme)] transition-colors duration-300',
                          )}
                          title={title}
                        >
                          {title}
                        </h3>
                        {/* Subtitle under title */}
                        {subtitle && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <SubtitleIcon className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {subtitle}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Description column - desktop only */}
                      {(description || (isHit && hit?.snippets?.length)) && (
                        <div className="hidden md:block flex-1 min-w-0">
                          {isHit && hit?.snippets?.length ? (
                            <div className="space-y-2">
                              {hit.snippets.map((snippet, si) => {
                                const sFr = snippet.snippet_fr
                                const sHt = snippet.snippet_ht
                                const sContent =
                                  language === 'ht' ? sHt : sFr
                                return (
                                  <div
                                    key={si}
                                    className="text-xs border-l-2 border-red-500/30 pl-3 py-1 bg-gray-50/50 rounded-r-lg"
                                  >
                                    <p className="font-bold text-gray-900 mb-1">
                                      Article {snippet.article.number}
                                    </p>
                                    <p className="text-gray-600 line-clamp-1 italic">
                                      "
                                      <HighlightText
                                        text={sContent || ''}
                                        query={
                                          (props as any).displayItem?.data
                                            ?.query
                                        }
                                      />
                                      "
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {description}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Badge on the right */}
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

                {/* Mobile description */}
                {description && (
                  <div className="md:hidden mb-3">
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {description}
                    </p>
                  </div>
                )}

                {/* Second row: Stats and button */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  {/* Stats */}
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

                  {/* Button - same rounded style as grid variant */}
                  <motion.div
                    initial={false}
                    whileHover={{
                      scale: 1.1,
                      rotate: 5,
                      backgroundColor: `${color}20`,
                    }}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 border"
                    style={{
                      backgroundColor: `${color}10`,
                      color,
                      borderColor: `${color}20`,
                    }}
                  >
                    <motion.div
                      animate={{ x: 0, y: 0 }}
                      whileHover={{ x: 2, y: -2 }}
                      transition={{ type: 'spring', stiffness: 400 }}
                    >
                      <ArrowUpRight className="h-5 w-5" />
                    </motion.div>

                    {/* Pulsing ring effect on hover */}
                    <motion.div
                      className="absolute inset-0 rounded-full border"
                      style={{ borderColor: color }}
                      initial={{ scale: 1, opacity: 0.3 }}
                      whileHover={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.6, 0.3],
                      }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>

          {/* Subtle hover gradient overlay */}
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-[var(--card-theme-light)]/0 via-[var(--card-theme-light)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </motion.div>
      </Link>
    )
  }

  // default "card" (grid)
  const badgeVariant = badge?.variant ?? 'default'
  return (
    <Link
      href={href}
      className={cn('block h-full outline-none group', props.className)}
    >
      <motion.div
        initial="rest"
        whileHover="hover"
        animate="rest"
        viewport={{ once: true, margin: '-50px' }}
        style={activeStyle}
        className={cn(
          'relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-white transition-all duration-500',
          'border border-gray-100 hover:border-[var(--card-theme-medium)]',
          'shadow-sm hover:shadow-xl hover:shadow-[var(--card-theme-light)]',
          'hover:-translate-y-1',
        )}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1.5 z-20 origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100"
          style={{ backgroundColor: 'var(--card-theme)' }}
        />

        <div className="absolute inset-0 z-0 bg-gradient-to-br from-[var(--card-theme-light)] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        <div className="relative z-10 p-7 pt-9 flex flex-col h-full">
          <div className="mb-6 flex items-start justify-between">
            <div
              className={cn(
                'relative flex h-14 w-14 items-center justify-center rounded-full',
                'border border-white/60 shadow-sm transition-transform duration-500',
                'group-hover:scale-110 group-hover:rotate-3 backdrop-blur-md',
              )}
              style={{ backgroundColor: 'var(--card-theme-light)' }}
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
              {title}
            </h3>

            {subtitle && (
              <div className="mb-4 inline-block rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 border border-gray-100">
                {subtitle}
              </div>
            )}

            {description && !isHit && (
              <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">
                {description}
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
                      "
                      <HighlightText
                        text={sContent || ''}
                        query={(props as any).displayItem?.data?.query}
                      />
                      "
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

              <motion.div
                initial={false}
                whileHover={{
                  scale: 1.1,
                  rotate: 5,
                  backgroundColor: `${color}20`,
                }}
                className="relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 border"
                style={{
                  backgroundColor: `${color}10`,
                  color,
                  borderColor: `${color}20`,
                }}
              >
                <motion.div
                  animate={{ x: 0, y: 0 }}
                  whileHover={{ x: 2, y: -2 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                >
                  <ArrowUpRight className="h-5 w-5" />
                </motion.div>

                <motion.div
                  className="absolute inset-0 rounded-full border"
                  style={{ borderColor: color }}
                  initial={{ scale: 1, opacity: 0.3 }}
                  whileHover={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  )
}
