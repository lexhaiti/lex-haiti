'use client'

/**
 * Amendments page for a single legal text — shows every change other
 * laws introduced into this one, split into three sections:
 *
 *   1. Articles modifiés     (kind=amend, has new_version_id)
 *   2. Nouveaux articles     (kind=add, single version)
 *   3. Articles abrogés      (kind=abrogate, status flip)
 *
 * Two backend fetches run in parallel:
 *   - ``/changes-received`` — the canonical 3-bucket list with the
 *     amending-law metadata for each row.
 *   - ``/amendments`` — full version bodies, used to compute the
 *     inline diff (v1 → current) on each modified article.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Archive,
  CheckCircle,
  ChevronDown,
  FileText,
  History,
  Loader2,
  PauseCircle,
  Plus,
  Sparkles,
  XCircle,
} from 'lucide-react'

import { useT } from '@/i18n/useT'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  getAmendmentsForText,
  listChangesReceivedBy,
} from '@/lib/api/endpoints'
import type {
  ArticleVersionRead,
  ArticleWithHistoryRead,
  LegalChangeReceivedRead,
} from '@/lib/api/endpoints'
import type { components } from '@/lib/api-types'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { diffHtml, type DiffOp } from '@/lib/diff/word-diff'
import { looksLikeHtml } from '@/components/law-details/_editor/utils'

type ArticleStatus = components['schemas']['ArticleStatus']

const STATUS_PILL: Record<
  ArticleStatus,
  {
    labelKey: string
    cls: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  in_force: {
    labelKey: 'amendments.statusInForce',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
  },
  abrogated: {
    labelKey: 'amendments.statusAbrogated',
    cls: 'bg-red-50 text-red-700 border-red-200',
    icon: XCircle,
  },
  suspended: {
    labelKey: 'amendments.statusSuspended',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: PauseCircle,
  },
  transferred: {
    labelKey: 'amendments.statusTransferred',
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: AlertTriangle,
  },
  obsolete: {
    labelKey: 'amendments.statusObsolete',
    cls: 'bg-slate-50 text-slate-600 border-slate-200',
    icon: Archive,
  },
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function inForceFromTo(
  from: string | null,
  to: string | null,
  lang: 'fr' | 'ht',
): string {
  if (lang === 'ht') {
    if (from && to) return `An vigè soti ${from} pou rive ${to}`
    if (from) return `An vigè depi ${from}`
    if (to) return `Jiska ${to}`
    return ''
  }
  if (from && to) return `En vigueur du ${from} au ${to}`
  if (from) return `En vigueur depuis le ${from}`
  if (to) return `Jusqu'au ${to}`
  return ''
}

function renderInlineDiff(ops: DiffOp[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let key = 0
  for (const op of ops) {
    if (op.op === 'equal') {
      nodes.push(<span key={key++}>{op.text}</span>)
      continue
    }
    if (op.op === 'delete') {
      nodes.push(
        <span
          key={key++}
          className="bg-red-100/70 line-through decoration-red-400 px-0.5 rounded-sm"
        >
          {op.text}
        </span>,
      )
      continue
    }
    nodes.push(
      <span key={key++} className="bg-emerald-100/70 px-0.5 rounded-sm">
        {op.text}
      </span>,
    )
  }
  return nodes
}

function VersionBody({ text }: { text: string | null | undefined }) {
  if (!text) return null
  if (looksLikeHtml(text)) {
    return (
      <div
        className="article-html text-sm text-slate-700 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    )
  }
  return (
    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
      {text}
    </p>
  )
}

/** Common bilingual i18n hook shape used by the helper components. */
type Tr = (key: string, opts?: { fallback?: string }) => string

export default function AmendementsPage() {
  const params = useParams()
  const slug = (params?.slug as string) ?? ''
  const { t, language } = useT()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'

  const [changes, setChanges] = useState<LegalChangeReceivedRead[] | null>(null)
  const [amendedArticles, setAmendedArticles] = useState<
    ArticleWithHistoryRead[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Section filter — null = show all three; otherwise isolate to one.
  // Driven by the stat tiles in the hero (click to filter, click the
  // active one again to clear).
  const [filter, setFilter] = useState<
    'modified' | 'added' | 'abrogated' | null
  >(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([listChangesReceivedBy(slug), getAmendmentsForText(slug)])
      .then(([c, a]) => {
        if (cancelled) return
        setChanges(c)
        setAmendedArticles(a)
      })
      .catch(() => {
        if (cancelled) return
        setError(t('amendments.error'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, t])

  // Index amended articles by id so the modified section can pair each
  // change-row with its version bodies (needed for the inline diff).
  const amendedById = useMemo(() => {
    const map = new Map<number, ArticleWithHistoryRead>()
    for (const a of amendedArticles ?? []) map.set(a.id, a)
    return map
  }, [amendedArticles])

  const modified = useMemo(
    () => (changes ?? []).filter((c) => c.change_kind === 'amend'),
    [changes],
  )
  const added = useMemo(
    () => (changes ?? []).filter((c) => c.change_kind === 'add'),
    [changes],
  )
  const abrogated = useMemo(
    () => (changes ?? []).filter((c) => c.change_kind === 'abrogate'),
    [changes],
  )

  return (
    <div className="min-h-screen bg-white">
      {/* Hero band — same navy treatment used across the law-detail
          pages. Full-width so the breakdown chips have room. */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-12 lg:py-20 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: t('amendments.crumbs.home'), href: '/' },
              { label: t('amendments.crumbs.laws'), href: '/lois' },
              {
                label: t('amendments.crumbs.constitution'),
                href: '/lois?category=constitution',
              },
              { label: t('amendments.crumbs.amendments') },
            ]}
          />

          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white"
          >
            {t('amendments.title')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-slate-300 text-lg lg:text-xl leading-relaxed max-w-3xl"
          >
            {t('amendments.subtitle')}
          </motion.p>

          {changes && changes.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-8 space-y-3 max-w-3xl"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatTile
                  count={modified.length}
                  labelKey="amendments.sections.modified.short"
                  color="emerald"
                  Icon={FileText}
                  active={filter === 'modified'}
                  onClick={() =>
                    setFilter((f) => (f === 'modified' ? null : 'modified'))
                  }
                  t={t}
                />
                <StatTile
                  count={added.length}
                  labelKey="amendments.sections.added.short"
                  color="sky"
                  Icon={Plus}
                  active={filter === 'added'}
                  onClick={() =>
                    setFilter((f) => (f === 'added' ? null : 'added'))
                  }
                  t={t}
                />
                <StatTile
                  count={abrogated.length}
                  labelKey="amendments.sections.abrogated.short"
                  color="rose"
                  Icon={XCircle}
                  active={filter === 'abrogated'}
                  onClick={() =>
                    setFilter((f) => (f === 'abrogated' ? null : 'abrogated'))
                  }
                  t={t}
                />
              </div>
              {filter !== null && (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="text-[11px] font-semibold uppercase tracking-widest text-slate-300 hover:text-white transition-colors inline-flex items-center gap-1.5"
                >
                  ← {t('amendments.showAll')}
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Body — full-width container (was max-w-4xl before). */}
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-10 lg:py-14 space-y-14">
        {loading && (
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t('amendments.loading')}</span>
          </div>
        )}

        {!loading && error && <ErrorBanner density="compact">{error}</ErrorBanner>}

        {!loading && !error && changes && changes.length === 0 && (
          <EmptyState
            title={t('amendments.empty.title')}
            description={t('amendments.empty.desc')}
            density="compact"
          />
        )}

        {!loading &&
          !error &&
          modified.length > 0 &&
          (filter === null || filter === 'modified') && (
          <Section
            id="modifies"
            title={t('amendments.sections.modified.title')}
            subtitle={t('amendments.sections.modified.subtitle')}
            count={modified.length}
            accent="emerald"
            Icon={FileText}
          >
            <div className="space-y-5">
              {modified.map((row) => (
                <ModifiedCard
                  key={row.id}
                  slug={slug}
                  row={row}
                  article={
                    row.amended_article_id
                      ? amendedById.get(row.amended_article_id)
                      : undefined
                  }
                  lang={lang}
                  t={t}
                />
              ))}
            </div>
          </Section>
        )}

        {!loading &&
          !error &&
          added.length > 0 &&
          (filter === null || filter === 'added') && (
          <Section
            id="ajoutes"
            title={t('amendments.sections.added.title')}
            subtitle={t('amendments.sections.added.subtitle')}
            count={added.length}
            accent="sky"
            Icon={Sparkles}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {added.map((row) => (
                <CompactChangeCard key={row.id} slug={slug} row={row} t={t} accent="sky" />
              ))}
            </div>
          </Section>
        )}

        {!loading &&
          !error &&
          abrogated.length > 0 &&
          (filter === null || filter === 'abrogated') && (
          <Section
            id="abroges"
            title={t('amendments.sections.abrogated.title')}
            subtitle={t('amendments.sections.abrogated.subtitle')}
            count={abrogated.length}
            accent="rose"
            Icon={XCircle}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {abrogated.map((row) => (
                <CompactChangeCard
                  key={row.id}
                  slug={slug}
                  row={row}
                  t={t}
                  accent="rose"
                  strike
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat tile (hero)
// ---------------------------------------------------------------------------

function StatTile({
  count,
  labelKey,
  color,
  Icon,
  active,
  onClick,
  t,
}: {
  count: number
  labelKey: string
  color: 'emerald' | 'sky' | 'rose'
  Icon: React.ComponentType<{ className?: string }>
  active?: boolean
  onClick?: () => void
  t: Tr
}) {
  const colorCls = {
    emerald: 'bg-emerald-500/10 border-emerald-300/30 text-emerald-200 hover:bg-emerald-500/15 hover:border-emerald-300/50',
    sky: 'bg-sky-500/10 border-sky-300/30 text-sky-200 hover:bg-sky-500/15 hover:border-sky-300/50',
    rose: 'bg-rose-500/10 border-rose-300/30 text-rose-200 hover:bg-rose-500/15 hover:border-rose-300/50',
  }[color]
  const activeColorCls = {
    emerald: 'bg-emerald-500/25 border-emerald-300 text-white ring-2 ring-emerald-300/50',
    sky: 'bg-sky-500/25 border-sky-300 text-white ring-2 ring-sky-300/50',
    rose: 'bg-rose-500/25 border-rose-300 text-white ring-2 ring-rose-300/50',
  }[color]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl border px-4 py-3 flex items-center gap-3 text-left transition-all',
        active ? activeColorCls : colorCls,
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-2xl font-black text-white leading-none tabular-nums">
          {count}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest mt-1 truncate">
          {t(labelKey)}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  id,
  title,
  subtitle,
  count,
  accent,
  Icon,
  children,
}: {
  id: string
  title: string
  subtitle: string
  count: number
  accent: 'emerald' | 'sky' | 'rose'
  Icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  const accentTextCls = {
    emerald: 'text-emerald-700',
    sky: 'text-sky-700',
    rose: 'text-rose-700',
  }[accent]
  const accentBgCls = {
    emerald: 'bg-emerald-50 border-emerald-200',
    sky: 'bg-sky-50 border-sky-200',
    rose: 'bg-rose-50 border-rose-200',
  }[accent]
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-1">
        <span
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-full border',
            accentBgCls,
            accentTextCls,
          )}
        >
          <Icon className="w-4 h-4" />
        </span>
        <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
          {title}
        </h2>
        <span className="ml-1 inline-flex items-center text-xs font-bold uppercase tracking-widest text-slate-400 tabular-nums">
          {count}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">{subtitle}</p>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Modified-article card — header + amending law line + inline diff (when
// version bodies are available) + collapsible full history.
// ---------------------------------------------------------------------------

function ModifiedCard({
  slug,
  row,
  article,
  lang,
  t,
}: {
  slug: string
  row: LegalChangeReceivedRead
  article?: ArticleWithHistoryRead
  lang: 'fr' | 'ht'
  t: Tr
}) {
  const versions = useMemo<ArticleVersionRead[]>(() => {
    if (!article?.versions) return []
    return [...article.versions].sort(
      (a, b) => (b.version_number ?? 0) - (a.version_number ?? 0),
    )
  }, [article])

  const latest = versions[0]
  const oldest = versions[versions.length - 1]
  const showDiff = versions.length >= 2 && latest !== oldest

  const diffOps = useMemo(() => {
    if (!showDiff) return null
    const a = lang === 'ht' && oldest.text_ht ? oldest.text_ht : oldest.text_fr
    const b = lang === 'ht' && latest.text_ht ? latest.text_ht : latest.text_fr
    return diffHtml(a, b)
  }, [showDiff, oldest, latest, lang])

  const [historyOpen, setHistoryOpen] = useState(false)

  const articleNumber = row.amended_article_number ?? ''
  const articleLabel = articleNumber.toLowerCase().startsWith('article')
    ? articleNumber
    : `Article ${articleNumber}`

  const currentStatus: ArticleStatus =
    (latest?.status as ArticleStatus | undefined) ?? 'in_force'
  const pill = STATUS_PILL[currentStatus]
  const PillIcon = pill.icon

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      <header className="flex items-baseline justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50/40">
        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
          <h3 className="text-lg lg:text-xl font-bold text-primary">
            <Link
              href={`/loi/${slug}?article=${encodeURIComponent(articleNumber)}`}
              className="hover:underline underline-offset-4"
            >
              {articleLabel}
            </Link>
          </h3>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md',
              'border text-[10px] font-bold uppercase tracking-wider',
              pill.cls,
            )}
          >
            <PillIcon className="w-3 h-3" />
            {t(pill.labelKey)}
          </span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 tabular-nums flex-shrink-0">
          {versions.length || 1} {t('amendments.versionLabel')}
          {(versions.length || 1) > 1 ? 's' : ''}
        </p>
      </header>

      <AmendingLine row={row} t={t} />

      {diffOps && (
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span>{t('amendments.diffLabel')}</span>
            <span className="text-slate-300">·</span>
            <span>
              v{oldest.version_number} → v{latest.version_number}
            </span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {renderInlineDiff(diffOps)}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setHistoryOpen((v) => !v)}
        aria-expanded={historyOpen}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-6 py-3 text-left',
          'text-xs font-bold uppercase tracking-widest text-slate-500',
          'hover:bg-slate-50 transition-colors',
          historyOpen ? 'bg-slate-50/60' : '',
        )}
      >
        <span className="inline-flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-slate-400" />
          {historyOpen
            ? t('amendments.hideHistory')
            : t('amendments.showHistory')}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-slate-400 transition-transform',
            historyOpen ? 'rotate-180' : '',
          )}
        />
      </button>

      {historyOpen && versions.length > 0 && (
        <ol className="divide-y divide-slate-100">
          {versions.map((v, idx) => {
            const vp = STATUS_PILL[v.status]
            const VIcon = vp.icon
            const fromLabel = formatDate(v.effective_from)
            const toLabel = formatDate(v.effective_to)
            const dateLabel = inForceFromTo(fromLabel, toLabel, lang)
            const text = lang === 'ht' && v.text_ht ? v.text_ht : v.text_fr
            const title = lang === 'ht' && v.title_ht ? v.title_ht : v.title_fr
            return (
              <li key={v.id} className="px-6 py-5">
                <div className="flex items-center flex-wrap gap-2 mb-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md',
                      'border text-[11px] font-bold uppercase tracking-wider',
                      vp.cls,
                    )}
                  >
                    <VIcon className="w-3 h-3" />
                    {t(vp.labelKey)}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 tabular-nums">
                    {t('amendments.versionLabel')} {v.version_number}{' '}
                    <span className="text-slate-300">{t('amendments.of')}</span>{' '}
                    {versions.length}
                  </span>
                  {dateLabel && (
                    <span className="text-[11px] text-slate-500 italic">
                      {dateLabel}
                    </span>
                  )}
                </div>
                {title && (
                  <h4 className="text-sm font-bold text-slate-700 mb-1">
                    {title}
                  </h4>
                )}
                {text ? (
                  <VersionBody text={text} />
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    {t('amendments.noText')}
                  </p>
                )}
                {idx === 0 && versions.length > 1 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                    <FileText className="w-3 h-3" />
                    {t('amendments.currentlyApplicable')}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </motion.article>
  )
}

// ---------------------------------------------------------------------------
// Compact card — used for the Added and Abrogated sections. Same shape:
// article number, amending-law link, effective date.
// ---------------------------------------------------------------------------

function CompactChangeCard({
  slug,
  row,
  t,
  accent,
  strike,
}: {
  slug: string
  row: LegalChangeReceivedRead
  t: Tr
  accent: 'sky' | 'rose'
  strike?: boolean
}) {
  const articleNumber = row.amended_article_number ?? ''
  const articleLabel = articleNumber.toLowerCase().startsWith('article')
    ? articleNumber
    : `Article ${articleNumber}`

  const accentRail = {
    sky: 'before:bg-sky-400',
    rose: 'before:bg-rose-400',
  }[accent]
  const numberCls = {
    sky: 'text-sky-700',
    rose: 'text-rose-700',
  }[accent]

  return (
    <Link
      href={`/loi/${slug}?article=${encodeURIComponent(articleNumber)}`}
      className={cn(
        'relative block rounded-lg border bg-white px-4 py-3 transition-all',
        'before:content-[""] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]',
        accentRail,
        'border-slate-200 hover:border-slate-300 hover:shadow-sm',
      )}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3
          className={cn(
            'text-base font-bold',
            numberCls,
            strike && 'line-through decoration-rose-400/60',
          )}
        >
          {articleLabel}
        </h3>
        {row.effective_on && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex-shrink-0">
            {formatDate(row.effective_on)}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 truncate">
        <span className="font-semibold text-slate-600">
          {t('amendments.amendedBy')}
        </span>{' '}
        <span className="text-slate-700 hover:underline underline-offset-2">
          {row.amending_text_title_fr}
        </span>
      </p>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Amending-law link line — shown on each modified-article card right
// under the header. "Modifié par <law title>" with link.
// ---------------------------------------------------------------------------

function AmendingLine({ row, t }: { row: LegalChangeReceivedRead; t: Tr }) {
  return (
    <div className="px-6 py-3 border-b border-slate-100 bg-amber-50/30">
      <p className="text-xs text-slate-700">
        <span className="font-semibold text-slate-500">
          {t('amendments.amendedBy')}
        </span>{' '}
        <Link
          href={`/loi/${row.amending_text_slug}`}
          className="font-semibold text-primary hover:underline underline-offset-2"
        >
          {row.amending_text_title_fr}
        </Link>
        {row.effective_on && (
          <>
            <span className="text-slate-300 mx-2">·</span>
            <span className="text-slate-500 italic">
              {t('amendments.inForceSince')}{' '}
              {formatDate(row.effective_on)}
            </span>
          </>
        )}
        {row.new_version_number != null && (
          <>
            <span className="text-slate-300 mx-2">·</span>
            <span className="text-slate-500 font-mono">
              v{row.new_version_number}
            </span>
          </>
        )}
      </p>
    </div>
  )
}
