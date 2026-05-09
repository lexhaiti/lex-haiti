'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileEdit,
  FileText,
  Layers,
  Loader2,
  Newspaper,
  Search,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  listMoniteurIssues,
  type MoniteurIssueRead,
} from '@/lib/api/endpoints'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { cn } from '@/lib/utils'

const MONTHS_FR = [
  '',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const MONTHS_HT = [
  '',
  'janvye', 'fevriye', 'mas', 'avril', 'me', 'jen',
  'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm',
]

function formatLongDate(iso: string | null, lang: 'fr' | 'ht'): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const day = Number.parseInt(m[3], 10)
  const month = Number.parseInt(m[2], 10)
  const months = lang === 'ht' ? MONTHS_HT : MONTHS_FR
  return `${day} ${months[month] ?? ''} ${m[1]}`
}

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

const CATEGORY_LABEL: Record<string, string> = {
  constitution: 'Constitution',
  code: 'Code',
  loi: 'Loi',
  decret: 'Décret',
  arrete: 'Arrêté',
  circulaire: 'Circulaire',
  convention: 'Convention',
  ordonnance: 'Ordonnance',
  communique: 'Communiqué',
  promulgation: 'Promulgation',
  errata: 'Errata',
  autre: 'Autre',
}

type EditorialFilter = 'all' | 'published' | 'draft'

const FILTER_OPTIONS: ReadonlyArray<{
  value: EditorialFilter
  icon: typeof CheckCircle2
  fr: string
  ht: string
}> = [
  { value: 'all', icon: Layers, fr: 'Tous', ht: 'Tout' },
  { value: 'published', icon: CheckCircle2, fr: 'Publiés', ht: 'Pibliye' },
  { value: 'draft', icon: FileEdit, fr: 'Brouillons', ht: 'Bouyon' },
]

function titleCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export default function Page() {
  const { t, language } = useT()
  const isFr = language === 'fr'
  const lang: 'fr' | 'ht' = isFr ? 'fr' : 'ht'
  const { isEditor } = useEditorMode()

  const [issues, setIssues] = useState<MoniteurIssueRead[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editorialFilter, setEditorialFilter] = useState<EditorialFilter>('published')

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
        icon={Newspaper}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: 'Le Moniteur' },
        ]}
      >
        {/* Search bar inside header — same pattern as /lois */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="mt-8 max-w-3xl flex items-stretch gap-0 rounded-lg overflow-hidden bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/15 focus-within:ring-2 focus-within:ring-amber-300/60 transition-shadow"
        >
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
        </motion.div>

        {isEditor && (
          <div className="mt-4">
            <div
              className={cn(
                'inline-flex items-center rounded-lg',
                'border border-amber-200/50 bg-amber-50/20 backdrop-blur-sm',
                'p-0.5 h-11',
              )}
              role="group"
              aria-label={isFr ? 'Filtre éditeur' : 'Filtè editè'}
            >
              {FILTER_OPTIONS.map((opt) => {
                const active = editorialFilter === opt.value
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditorialFilter(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center gap-1.5 h-10 px-3 rounded-md',
                      'text-xs font-bold uppercase tracking-wider',
                      'transition-all',
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-white/70 hover:text-white hover:bg-white/10',
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5', active ? 'opacity-100' : 'opacity-70')} />
                    <span>{isFr ? opt.fr : opt.ht}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </StandardPageHeader>

      <div className="container py-12 lg:py-20">

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
          </div>
        ) : visibleIssues.length > 0 ? (
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
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
              const href = isEditor
                ? `/editorial/moniteur/${issue.id}/review`
                : `/moniteur/${issue.id}`

              const numberDisplay = /^[0-9]/.test(issue.number)
                ? `N° ${issue.number}`
                : issue.number

              return (
                <motion.div
                  key={issue.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                >
                  <Link
                    href={href}
                    className={cn(
                      'group flex flex-col rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-xl transition-all duration-300 overflow-hidden h-full',
                      isEditor && isDraft
                        ? 'border-l-4 border-l-amber-500'
                        : '',
                    )}
                  >
                    {/* Header band */}
                    <div className="bg-primary px-6 py-5 relative overflow-hidden">
                      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.05)_100%)]" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-1">
                              Le Moniteur
                            </p>
                            <p className="text-xl font-black text-white leading-tight tracking-tight">
                              {numberDisplay}
                            </p>
                          </div>
                          <div className="p-2 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors flex-shrink-0">
                            <ArrowRight className="w-4 h-4 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-3 text-white/60 text-xs">
                          <Calendar className="w-3.5 h-3.5" />
                          <span className="font-medium">
                            {formatLongDate(issue.publication_date, lang)}
                          </span>
                          {issue.edition_label && (
                            <>
                              <span className="text-white/30">·</span>
                              <span>{issue.edition_label}</span>
                            </>
                          )}
                        </div>

                        {isEditor && status && (
                          <span
                            className={cn(
                              'mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md',
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
                      </div>
                    </div>

                    {/* Sommaire */}
                    {issue.sommaire.length > 0 && (
                      <div className="px-6 py-4 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">
                          Sommaire
                        </p>
                        <ul className="space-y-2">
                          {issue.sommaire.map((s, idx) => (
                            <li
                              key={idx}
                              className="flex items-baseline gap-2.5 text-sm leading-snug"
                            >
                              <span className="w-1 h-1 rounded-full bg-red-500 flex-shrink-0 mt-[0.45em]" />
                              <span>
                                {s.category && (
                                  <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                                    {CATEGORY_LABEL[s.category] ?? s.category}
                                  </span>
                                )}
                                {s.category && s.title && (
                                  <span className="text-slate-300"> — </span>
                                )}
                                <span className="text-slate-500">
                                  {titleCase(s.title ?? 'Sans titre')}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="px-6 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center gap-5 text-xs text-slate-400 mt-auto">
                      {issue.sommaire.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          {issue.sommaire.length}{' '}
                          {issue.sommaire.length === 1
                            ? (isFr ? 'texte' : 'tèks')
                            : (isFr ? 'textes' : 'tèks')}
                        </span>
                      )}
                      {issue.page_count && (
                        <span className="inline-flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          {issue.page_count} pages
                        </span>
                      )}
                    </div>
                  </Link>
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
