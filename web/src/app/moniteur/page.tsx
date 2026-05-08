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
import { Input } from '@/components/ui/input'
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
            ? 'Journal Officiel de la République d’Haïti.'
            : 'Jounal Ofisyèl Repiblik Ayiti.',
        })}
        icon={Newspaper}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: 'Le Moniteur' },
        ]}
      />

      <div className="container py-20 lg:py-32">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2 rounded-full mb-6"
          >
            <Calendar className="w-4 h-4 text-red-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
              {isFr ? 'Archives Numérisées' : 'Achiv Nimerize'}
            </span>
          </motion.div>
          <h2 className="text-3xl lg:text-5xl font-black text-slate-900 mb-6">
            {isFr
              ? 'Consulter le Journal Officiel'
              : 'Konsilte Jounal Ofisyèl la'}
          </h2>
          <p className="text-slate-500 text-lg lg:text-xl leading-relaxed">
            {isFr
              ? 'Accédez aux publications officielles, lois, décrets et arrêtés tels que parus dans Le Moniteur.'
              : 'Jwenn aksè ak piblikasyon ofisyèl, lwa, dekrè ak arète jan yo parèt nan Le Moniteur.'}
          </p>
        </div>

        {/* Search + Editorial filter row */}
        <div className="max-w-2xl mx-auto mb-16 space-y-4">
          <motion.form
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            onSubmit={(e) => e.preventDefault()}
          >
            <label htmlFor="moniteur-search" className="sr-only">
              {isFr
                ? 'Rechercher un numéro du Moniteur'
                : 'Chèche yon nimewo Moniteur'}
            </label>
            <div className="relative group">
              <div className="absolute inset-0 bg-red-600/5 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center bg-white border border-slate-200 rounded-full p-2 shadow-xl">
                <div className="pl-6 pr-3">
                  <Search className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </div>
                <Input
                  id="moniteur-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    isFr
                      ? 'Rechercher par numéro ou date...'
                      : 'Chèche pa nimewo oswa dat...'
                  }
                  className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 text-lg"
                />
                <Button
                  type="submit"
                  aria-label={isFr ? 'Rechercher' : 'Chèche'}
                  className="rounded-md bg-primary hover:bg-primary/90 text-white px-6 h-12 font-semibold transition-colors active:scale-[0.99]"
                >
                  {isFr ? 'Rechercher' : 'Chèche'}
                </Button>
              </div>
            </div>
          </motion.form>

          {isEditor && (
            <div className="flex justify-center">
              <div
                className={cn(
                  'inline-flex items-center rounded-full',
                  'border border-amber-200 bg-amber-50/70 backdrop-blur-sm',
                  'p-0.5 shadow-sm h-9',
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
                        'flex items-center gap-1.5 h-8 px-3 rounded-full',
                        'text-xs font-bold uppercase tracking-wider',
                        'transition-all',
                        active
                          ? 'bg-slate-900 text-white shadow-md'
                          : 'text-amber-900/80 hover:text-slate-900 hover:bg-white/60',
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
        </div>

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
            className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 max-w-5xl mx-auto"
          >
            {visibleIssues.map((issue) => {
              const status = STATUS_LABEL[issue.processing_status]
              const Icon = status?.Icon
              const isDraft = issue.processing_status !== 'published'
              const href = isEditor
                ? `/editorial/moniteur/${issue.id}/review`
                : `/moniteur/${issue.id}`

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
                      'group block rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-200 overflow-hidden',
                      isEditor && isDraft
                        ? 'border-l-4 border-l-amber-500'
                        : 'border-l-4 border-l-primary',
                    )}
                  >
                    {/* Header */}
                    <div className="px-6 pt-5 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-bold text-primary leading-tight">
                            Le Moniteur N° {issue.number}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatLongDate(issue.publication_date, lang)}
                            {issue.edition_label && (
                              <span className="text-slate-300"> · {issue.edition_label}</span>
                            )}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors flex-shrink-0 mt-1.5" />
                      </div>

                      {isEditor && status && (
                        <span
                          className={cn(
                            'mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md',
                            'border text-[10px] font-bold uppercase tracking-wider',
                            status.cls,
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

                    {/* Sommaire */}
                    {issue.sommaire.length > 0 && (
                      <div className="px-6 pb-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">
                          Sommaire
                        </p>
                        <ul className="space-y-1">
                          {issue.sommaire.map((s, idx) => (
                            <li
                              key={idx}
                              className="flex items-baseline gap-2 text-sm leading-snug"
                            >
                              <span className="text-slate-300 flex-shrink-0">•</span>
                              <span>
                                {s.category && (
                                  <span className="font-semibold text-slate-700">
                                    {CATEGORY_LABEL[s.category] ?? s.category}
                                  </span>
                                )}
                                {s.category && s.title && (
                                  <span className="text-slate-300"> — </span>
                                )}
                                <span className="text-slate-600">
                                  {titleCase(s.title ?? 'Sans titre')}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="px-6 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-400">
                      {issue.sommaire.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {issue.sommaire.length}{' '}
                          {issue.sommaire.length === 1
                            ? (isFr ? 'texte' : 'tèks')
                            : (isFr ? 'textes' : 'tèks')}
                        </span>
                      )}
                      {issue.page_count && (
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
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
