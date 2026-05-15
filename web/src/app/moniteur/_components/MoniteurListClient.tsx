'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Newspaper,
  Plus,
  Search,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  listMoniteurIssues,
  moniteurIssueSlug,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { cn } from '@/lib/utils'
import {
  EditorialFilter,
  type EditorialStatusFilter,
} from '@/components/shared/EditorialFilter'
import { MoniteurIssueCard } from '@/components/shared/MoniteurIssueCard'
import { LoadingState } from '@/components/shared/LoadingState'

const STATUS_LABEL: Record<
  MoniteurIssueRead['processing_status'],
  { fr: string; ht: string; cls: string; Icon: any }
> = {
  uploaded: {
    fr: 'Téléversé', ht: 'Telechaje',
    cls: 'bg-slate-100 text-slate-700 border-slate-200', Icon: FileText,
  },
  ocr_pending: {
    fr: 'OCR en cours', ht: 'OCR ap mache',
    cls: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Loader2,
  },
  parsed: {
    fr: 'Analysé', ht: 'Analize',
    cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock,
  },
  reviewed: {
    fr: 'Revu', ht: 'Revize',
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', Icon: CheckCircle2,
  },
  published: {
    fr: 'Publié', ht: 'Pibliye',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2,
  },
  failed: {
    fr: 'Échec', ht: 'Echèk',
    cls: 'bg-red-50 text-red-700 border-red-200', Icon: AlertTriangle,
  },
}

/**
 * Client list view for /moniteur — interactive search, editorial
 * filter, and grid of cards. Wrapped by an RSC route file
 * (`../page.tsx`) that emits per-route metadata.
 */
export default function MoniteurListClient() {
  const { t, language } = useT()
  const isFr = language === 'fr'
  const lang: 'fr' | 'ht' = isFr ? 'fr' : 'ht'
  const { isEditor } = useEditorMode()

  const [issues, setIssues] = useState<MoniteurIssueRead[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editorialFilter, setEditorialFilter] = useState<EditorialStatusFilter>('published')

  useEffect(() => {
    let cancelled = false
    const onlyPublished = isEditor ? editorialFilter === 'published' : true
    listMoniteurIssues({ only_published: onlyPublished, limit: 100 })
      .then((res) => {
        if (cancelled) return
        setIssues(res.items)
      })
      .catch(() => {
        if (cancelled) return
        setIssues([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isEditor, editorialFilter])

  const filteredByQuery = query.trim()
    ? issues.filter((i) => {
        const q = query.trim().toLowerCase()
        return (
          i.number.toLowerCase().includes(q) ||
          (i.publication_date ?? '').includes(q) ||
          (i.edition_label ?? '').toLowerCase().includes(q) ||
          i.sommaire.some((s) => s.title?.toLowerCase().includes(q))
        )
      })
    : issues

  const visibleIssues = isEditor && editorialFilter === 'draft'
    ? filteredByQuery.filter((i) => i.processing_status !== 'published')
    : filteredByQuery

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={t('moniteur.title', { fallback: 'Le Moniteur' })}
        subtitle={t('moniteur.subtitle', {
          fallback: isFr
            ? "Journal Officiel de la République d'Haïti."
            : 'Jounal Ofisyèl Repiblik Ayiti.',
        })}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: 'Le Moniteur' },
        ]}
      >
        {/* Search bar inside header — same pattern as /lois */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both mt-8 max-w-3xl flex items-stretch gap-0 rounded-lg overflow-hidden bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/15 focus-within:ring-2 focus-within:ring-amber-300/60 transition-shadow">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isFr
                  ? 'Rechercher par numéro, date ou contenu…'
                  : 'Chèche pa nimewo, dat oswa konteni…'
              }
              aria-label={isFr ? 'Rechercher dans le Moniteur' : 'Chèche nan Moniteur'}
              className="w-full h-14 pl-11 pr-4 bg-transparent text-slate-900 placeholder:text-slate-400 placeholder:italic placeholder:text-sm text-base outline-none"
              style={{ fontSize: '16px' }}
            />
          </div>
          <button
            type="button"
            aria-label={isFr ? 'Rechercher' : 'Chèche'}
            className="inline-flex items-center gap-2 px-5 sm:px-7 bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">
              {isFr ? 'Rechercher' : 'Chèche'}
            </span>
          </button>
        </div>

        {isEditor && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <EditorialFilter
              value={editorialFilter}
              onChange={setEditorialFilter}
            />
            {/* Editor-only quick action — opens the Moniteur side of
                the import flow directly with the type pre-selected.
                Visible only when ``isEditor`` is true, so the public
                /moniteur page stays clean. */}
            <Link
              href="/editorial/import?type=moniteur"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-400 text-slate-900 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-amber-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('moniteurList.importButton', {
                fallback: 'Importer un numéro',
              })}
            </Link>
            {/* "Vue éditeur" moved to the per-issue page
                (/moniteur/{slug}) — clicking an issue card opens its
                detail there, where the editor toggle swaps the public
                layout for the review work surface inline. The
                top-level button used to live here but it added a
                navigation hop and forced the editor to lose the list
                hero/search/filter on every click. */}
          </div>
        )}
      </StandardPageHeader>

      <div className="container py-12 lg:py-20">

        {loading ? (
          <LoadingState />
        ) : visibleIssues.length > 0 ? (
          <motion.div
            // `key` forces a fresh mount whenever the filter changes so the
            // stagger animation re-runs against the new card set. Using
            // `whileInView` here was racy after a filter switch — when the
            // grid remounted already inside the viewport, the
            // IntersectionObserver sometimes never fired, leaving the
            // children locked at their `hidden` (opacity-0) variant and
            // making the page look empty even though results were loaded.
            key={`grid-${editorialFilter}`}
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.04 },
              },
            }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6"
          >
            {visibleIssues.map((issue) => {
              const status = STATUS_LABEL[issue.processing_status]
              const Icon = status?.Icon
              const isDraft = issue.processing_status !== 'published'
              // Same URL for everyone — the destination renders an
              // editor toggle inline when the viewer is signed in.
              // Cards no longer fork the route by role.
              const href = `/moniteur/${moniteurIssueSlug(issue)}`

              return (
                <motion.div
                  key={issue.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="relative h-full"
                >
                  <MoniteurIssueCard
                    issue={issue}
                    href={href}
                    lang={lang}
                    sommaireLimit={4}
                    className={
                      isEditor && isDraft
                        ? 'border-l-4 border-l-amber-500'
                        : undefined
                    }
                  />
                  {/* Editor-only status pill, overlaid on top-right of the
                      card. Kept out of the shared component because only
                      editors see this and it'd otherwise clutter the
                      public surface's API. */}
                  {isEditor && status && Icon && (
                    <span
                      className={cn(
                        'absolute top-3 right-12 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md',
                        'bg-white/15 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm',
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-3 h-3',
                          issue.processing_status === 'ocr_pending' && 'animate-spin',
                        )}
                      />
                      {status[lang]}
                    </span>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-12 rounded-[3rem] bg-slate-50 border border-slate-100 text-center"
          >
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm">
              <Newspaper className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">
              {isFr ? 'Bientôt disponible' : 'Byento disponib'}
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-10">
              {isFr
                ? 'La base de données complète du Moniteur est en cours de numérisation. Vous pouvez déjà retrouver les textes principaux dans la section Lois.'
                : 'Baz done konplè Moniteur a ap nimerize. Ou ka deja jwenn tèks prensipal yo nan seksyon Lwa.'}
            </p>
            <Button
              variant="outline"
              className="rounded-full border-slate-200 hover:bg-white hover:border-red-600 hover:text-red-600 px-8 h-12 font-bold transition-all"
              onClick={() => (window.location.href = '/lois')}
            >
              {isFr ? 'Voir les lois disponibles' : 'Wè lwa ki disponib yo'}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
