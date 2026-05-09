'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Archive,
  CheckCircle,
  FileText,
  History,
  Loader2,
  PauseCircle,
  XCircle,
} from 'lucide-react'

import { useLanguage } from '@/i18n/LanguageContext'
import { getAmendmentsForText } from '@/lib/api/endpoints'
import type { ArticleWithHistoryRead } from '@/lib/api/endpoints'
import type { components } from '@/lib/api-types'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/shared/Breadcrumb'

type ArticleStatus = components['schemas']['ArticleStatus']

const COPY = {
  fr: {
    crumbs: { home: 'Accueil', laws: 'Lois', constitution: 'Constitution', amendments: 'Amendements' },
    title: 'Articles amendés',
    subtitle:
      "Tous les articles de ce texte qui ont fait l'objet d'au moins une modification depuis leur version originale. Les versions sont présentées de la plus récente à la plus ancienne.",
    countSingular: 'article amendé',
    countPlural: 'articles amendés',
    versionLabel: 'Version',
    of: 'sur',
    empty: {
      title: 'Aucun amendement enregistré',
      desc: "Ce texte ne possède pas encore d'articles avec plusieurs versions dans le corpus. Les amendements apparaîtront ici à mesure que les éditeurs ajoutent les versions historiques.",
    },
    error: 'Impossible de charger les amendements.',
    loading: 'Chargement…',
    inForceFromTo: (from: string | null, to: string | null) =>
      from && to
        ? `En vigueur du ${from} au ${to}`
        : from
          ? `En vigueur depuis le ${from}`
          : to
            ? `Jusqu'au ${to}`
            : '',
    noText: '(Texte non disponible)',
  },
  ht: {
    crumbs: { home: 'Akèy', laws: 'Lwa', constitution: 'Konstitisyon', amendments: 'Amandman' },
    title: 'Atik amande yo',
    subtitle:
      "Tout atik nan tèks sa a ki te modifye omwen yon fwa depi vèsyon orijinal yo. Vèsyon yo prezante depi pi resan jiska pi ansyen.",
    countSingular: 'atik amande',
    countPlural: 'atik amande',
    versionLabel: 'Vèsyon',
    of: 'sou',
    empty: {
      title: 'Pa gen amandman anrejistre',
      desc: 'Tèks sa a poko gen atik ak plizyè vèsyon nan kòpis la. Amandman yo ap parèt isit la lè editè yo ajoute vèsyon istorik yo.',
    },
    error: 'Pa kapab chaje amandman yo.',
    loading: 'Ap chaje…',
    inForceFromTo: (from: string | null, to: string | null) =>
      from && to
        ? `An vigè soti ${from} pou rive ${to}`
        : from
          ? `An vigè depi ${from}`
          : to
            ? `Jiska ${to}`
            : '',
    noText: '(Tèks pa disponib)',
  },
}

const STATUS_PILL: Record<
  ArticleStatus,
  {
    label: { fr: string; ht: string }
    cls: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  in_force: {
    label: { fr: 'En vigueur', ht: 'An vigè' },
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
  },
  abrogated: {
    label: { fr: 'Abrogée', ht: 'Abwoje' },
    cls: 'bg-red-50 text-red-700 border-red-200',
    icon: XCircle,
  },
  suspended: {
    label: { fr: 'Suspendue', ht: 'Sispann' },
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: PauseCircle,
  },
  transferred: {
    label: { fr: 'Transférée', ht: 'Transfere' },
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: AlertTriangle,
  },
  obsolete: {
    label: { fr: 'Obsolète', ht: 'Obsolè' },
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

export default function AmendementsPage() {
  const params = useParams()
  const slug = (params?.slug as string) ?? ''
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]

  const [articles, setArticles] = useState<ArticleWithHistoryRead[] | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getAmendmentsForText(slug)
      .then((data) => {
        if (cancelled) return
        setArticles(data)
      })
      .catch(() => {
        if (cancelled) return
        setError(copy.error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, copy.error])

  return (
    <div className="min-h-screen bg-white">
      {/* Page header — matches the standard navy band used across pages,
          with a count + back-to-text link instead of a generic subtitle. */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        <div className="relative z-10 container py-12 lg:py-20 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: copy.crumbs.home, href: '/' },
              { label: copy.crumbs.laws, href: '/lois' },
              {
                label: copy.crumbs.constitution,
                href: '/lois?category=constitution',
              },
              { label: copy.crumbs.amendments },
            ]}
          />

          <div className="max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white"
            >
              {copy.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-slate-300 text-lg lg:text-xl leading-relaxed border-l-2 border-red-600 pl-6"
            >
              {copy.subtitle}
            </motion.p>
            {articles && articles.length > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-6 text-sm font-bold uppercase tracking-widest text-slate-400"
              >
                {articles.length}{' '}
                {articles.length === 1
                  ? copy.countSingular
                  : copy.countPlural}
              </motion.p>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="container py-12 lg:py-16 max-w-4xl">
        {loading && (
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{copy.loading}</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && articles && articles.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
            <History className="w-10 h-10 mx-auto text-slate-300 mb-4" />
            <p className="text-base font-bold text-primary mb-2">
              {copy.empty.title}
            </p>
            <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              {copy.empty.desc}
            </p>
          </div>
        )}

        {!loading && !error && articles && articles.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.06 },
              },
            }}
            className="space-y-6"
          >
            {articles.map((article) => (
              <AmendedArticleCard
                key={article.id}
                article={article}
                lang={lang}
                copy={copy}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AmendedArticleCard — one card per amended article, listing all its
// versions newest-first with status pills + effective dates.
// ---------------------------------------------------------------------------

function AmendedArticleCard({
  article,
  lang,
  copy,
}: {
  article: ArticleWithHistoryRead
  lang: 'fr' | 'ht'
  copy: (typeof COPY)['fr']
}) {
  // Sort versions newest first — version_number ASC in the DB; we want DESC
  // so the current version is on top.
  const versions = [...(article.versions ?? [])].sort(
    (a, b) => (b.version_number ?? 0) - (a.version_number ?? 0),
  )

  const articleNumber = String(article.number)
  const articleLabel = articleNumber.toLowerCase().startsWith('article')
    ? articleNumber
    : `Article ${articleNumber}`

  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      <header className="flex items-baseline justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50/40">
        <h2 className="text-lg lg:text-xl font-bold text-primary">
          <Link
            href={`/loi/constitution-1987?article=${articleNumber}`}
            className="hover:underline underline-offset-4"
          >
            {articleLabel}
          </Link>
        </h2>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 tabular-nums">
          {versions.length} {copy.versionLabel}
          {versions.length > 1 ? 's' : ''}
        </p>
      </header>

      <ol className="divide-y divide-slate-100">
        {versions.map((v, idx) => {
          const pill = STATUS_PILL[v.status]
          const Icon = pill.icon
          const fromLabel = formatDate(v.effective_from)
          const toLabel = formatDate(v.effective_to)
          const dateLabel = copy.inForceFromTo(fromLabel, toLabel)

          const text = lang === 'ht' && v.text_ht ? v.text_ht : v.text_fr
          const title =
            lang === 'ht' && v.title_ht ? v.title_ht : v.title_fr

          return (
            <li key={v.id} className="px-6 py-5">
              <div className="flex items-center flex-wrap gap-2 mb-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md',
                    'border text-[11px] font-bold uppercase tracking-wider',
                    pill.cls,
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {pill.label[lang]}
                </span>

                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 tabular-nums">
                  {copy.versionLabel} {v.version_number}{' '}
                  <span className="text-slate-300">{copy.of}</span>{' '}
                  {versions.length}
                </span>

                {dateLabel && (
                  <span className="text-[11px] text-slate-500 italic">
                    {dateLabel}
                  </span>
                )}
              </div>

              {title && (
                <h3 className="text-sm font-bold text-slate-700 mb-1">
                  {title}
                </h3>
              )}
              {text ? (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {text}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">{copy.noText}</p>
              )}
              {idx === 0 && versions.length > 1 && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                  <FileText className="w-3 h-3" />
                  {lang === 'fr'
                    ? 'Version actuellement applicable'
                    : 'Vèsyon ki aplikab kounye a'}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </motion.article>
  )
}
