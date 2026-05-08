'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
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

// Status pill metadata — only surfaced to editors. Public visitors don't
// see processing states; they only ever see fully-published issues.
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

export default function Page() {
  const { t, language } = useT()
  const isFr = language === 'fr'
  const lang: 'fr' | 'ht' = isFr ? 'fr' : 'ht'
  const { isEditor } = useEditorMode()

  const [issues, setIssues] = useState<MoniteurIssueRead[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    // Editors see every issue (drafts, in-progress parses, failed) — they
    // need to know what's in the pipeline. Public visitors only see
    // editorially-published issues.
    listMoniteurIssues({ only_published: !isEditor, limit: 100 })
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
  }, [isEditor])

  const visibleIssues = query.trim()
    ? issues.filter((i) => {
        const q = query.trim().toLowerCase()
        return (
          i.number.toLowerCase().includes(q) ||
          (i.publication_date ?? '').includes(q) ||
          (i.edition_label ?? '').toLowerCase().includes(q)
        )
      })
    : issues

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

        <motion.form
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          onSubmit={(e) => e.preventDefault()}
          className="max-w-2xl mx-auto mb-16"
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
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
          >
            {visibleIssues.map((issue) => {
              // Editor cards link to the review/inspect page in /editorial.
              // Public visitor cards have no link target until per-issue
              // public detail pages exist (TODO: /moniteur/{id}).
              const editorHref = `/editorial/moniteur/${issue.id}/review`
              const status = STATUS_LABEL[issue.processing_status]
              const Icon = status?.Icon
              const isDraft = issue.processing_status !== 'published'

              const card = (
                <>
                  <div className="relative flex-shrink-0">
                    <FileText
                      className="h-10 w-10 lg:h-12 lg:w-12 text-primary"
                      strokeWidth={1.5}
                    />
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 left-1.5 h-2.5 w-2.5 lg:h-3 lg:w-3 rounded-full bg-red-600 ring-2 ring-white"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base lg:text-lg font-bold text-primary leading-tight">
                      Le Moniteur n° {issue.number}
                    </p>
                    <p className="mt-1 text-sm text-primary/80">
                      {isFr ? 'du' : 'nan'}{' '}
                      {formatLongDate(issue.publication_date, lang)}
                    </p>
                    {/* Editor sees the live processing status as a pill.
                        Public visitors never see in-flight states. */}
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
                    {(issue.edition_label || issue.candidates_count > 0) && (
                      <p className="mt-2 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                        {issue.edition_label && <span>{issue.edition_label}</span>}
                        {issue.edition_label && issue.candidates_count > 0 && (
                          <span className="text-slate-300">·</span>
                        )}
                        {issue.candidates_count > 0 && (
                          <span>
                            {issue.candidates_count}{' '}
                            {isFr ? 'lois indexées' : 'lwa endekse'}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </>
              )

              const cardCls = cn(
                'group flex items-start gap-4 rounded-md bg-white border border-slate-200 border-b-2 px-5 py-5 lg:px-6 lg:py-6 hover:border-slate-300 hover:shadow-md transition-all duration-200',
                // Draft visual cue for editors — amber instead of navy bottom
                // so an issue still in pipeline reads as "in progress".
                isEditor && isDraft
                  ? 'border-b-amber-500'
                  : 'border-b-primary',
              )

              return isEditor ? (
                <motion.div
                  key={issue.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                >
                  <Link href={editorHref} className={cardCls}>
                    {card}
                  </Link>
                </motion.div>
              ) : (
                <motion.article
                  key={issue.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className={cardCls}
                >
                  {card}
                </motion.article>
              )
            })}
          </motion.div>
        ) : (
          /* Honest empty state — no published issues yet. The ingestion
             pipeline will populate this view automatically once issues
             are reviewed and published from /editorial/moniteur. */
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
