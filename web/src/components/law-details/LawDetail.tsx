'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Newspaper,
  PanelLeft,
  PanelLeftClose,
  PenLine,
  PauseCircle,
  RotateCcw,
  Search,
  Tags,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import ArticleViewer from './ArticleViewer'
import PreambleViewer from './PreambleViewer'
import TableOfContents from '@/components/law-details/TableOfContent'
import { EditorBar } from './EditorBar'
import { useLawDetail } from '@/lib/hooks/useLawDetail'
import { useLanguage } from '@/i18n/LanguageContext'
import { useT } from '@/i18n/useT'
import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { TextNotFound } from '@/components/law-details/TextNotFound'
import { useToast } from '@/components/ui/toast-simple'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { apiUrl } from '@/lib/api/client'
import { themeLabel } from '@/lib/themes'
import { formatLongDate } from '@/lib/format/date'
import {
  TEXT_STATUS_PILL,
  mapTextStatusToArticleStatus,
  type TextStatus,
} from './_helpers/textStatus'
import { DownloadDropdown } from './_panels/DownloadDropdown'
import { DeviseBanner } from './_panels/DeviseBanner'
import { IssuingAuthorityHeader } from './_panels/IssuingAuthorityHeader'
import { OfficialNumberTab } from './_panels/OfficialNumberTab'


const categoryLabels: Record<
  string,
  { fr: string; ht: string; color: string }
> = {
  constitution: {
    fr: 'Constitution',
    ht: 'Konstitisyon',
    color: 'bg-amber-500',
  },
  code: { fr: 'Code', ht: 'Kòd', color: 'bg-blue-500' },
  decret: { fr: 'Décret', ht: 'Dekrè', color: 'bg-green-500' },
  arrete: { fr: 'Arrêté', ht: 'Arète', color: 'bg-purple-500' },
  loi: { fr: 'Loi', ht: 'Lwa', color: 'bg-indigo-500' },
}


export default function LawDetail() {
  const { language } = useLanguage()
  const { t } = useT()
  const { toast } = useToast()
  const currentLang = language as 'fr' | 'ht'
  const [selectedArticle, setSelectedArticle] = useState<any>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // V2 page-level search (replaces TOC's internal search input)
  const [pageSearchScope, setPageSearchScope] = useState<'sommaire' | 'code'>(
    'sommaire',
  )
  const [pageSearchQuery, setPageSearchQuery] = useState('')

  const params = useParams()
  const slug = params?.slug as string
  const searchParams = useSearchParams()

  const { isEditor, user: editorUser } = useEditorMode()
  const { data: law, isLoading, isError, refetch } = useLawDetail(slug)

  // Find current article index
  const currentArticleIndex = useMemo(() => {
    if (!selectedArticle || !law?.articles) return -1
    return law.articles.findIndex(
      (a: any) => a.number === selectedArticle.number,
    )
  }, [selectedArticle, law?.articles])

  // Walk the heading tree from the selected article up to the LegalText root.
  // Used for the in-article breadcrumb (Titre → Chapitre → Art.).
  const articleBreadcrumb = useMemo(() => {
    if (!selectedArticle?.heading_id || !law?.headings) return []
    const byId = new Map<number, (typeof law.headings)[number]>(
      law.headings.map((h) => [h.id, h]),
    )
    const path: typeof law.headings = []
    let current: (typeof law.headings)[number] | undefined = byId.get(
      selectedArticle.heading_id,
    )
    let safety = 10 // belt-and-braces against accidental cycles
    while (current && safety-- > 0) {
      path.unshift(current)
      current = current.parent_id ? byId.get(current.parent_id) : undefined
    }
    return path
  }, [selectedArticle, law?.headings])

  // Bloc-style nav hints (Légifrance-flavored). When the prev/next article
  // sits under a different heading than the current one, append the heading
  // label so editors see "Art. 12 · Chapitre III" — the cue that the bloc
  // crosses a structural boundary.
  const blocHints = useMemo(() => {
    if (!law?.articles || !law?.headings || currentArticleIndex < 0) {
      return { prev: null as string | null, next: null as string | null }
    }
    const HEADING_LABEL: Record<string, { fr: string; ht: string }> = {
      book: { fr: 'Livre', ht: 'Liv' },
      title: { fr: 'Titre', ht: 'Tit' },
      chapter: { fr: 'Chapitre', ht: 'Chapit' },
      section: { fr: 'Section', ht: 'Seksyon' },
      subsection: { fr: 'Sous-section', ht: 'Sou-seksyon' },
    }
    const headingsById = new Map(law.headings.map((h) => [h.id, h]))
    const currentHeadingId = selectedArticle?.heading_id ?? null

    const hint = (article: any | undefined): string | null => {
      if (!article) return null
      const numStr = String(article.number ?? '')
      const numLabel = numStr.toLowerCase().startsWith('article')
        ? numStr
        : `Art. ${numStr}`
      const crosses = article.heading_id !== currentHeadingId
      if (!crosses || !article.heading_id) return numLabel
      const h = headingsById.get(article.heading_id)
      if (!h) return numLabel
      const lvl = HEADING_LABEL[h.level as keyof typeof HEADING_LABEL]
      const lvlLabel = lvl ? lvl[currentLang] : h.level
      return `${numLabel} · ${lvlLabel} ${h.number ?? ''}`.trim()
    }

    return {
      prev: hint(law.articles[currentArticleIndex - 1]),
      next: hint(law.articles[currentArticleIndex + 1]),
    }
  }, [law?.articles, law?.headings, currentArticleIndex, selectedArticle?.heading_id, currentLang])

  // Auto-select an article on mount.
  // Priority: ?article=N from the URL (deep-link from search snippets) →
  // first article in the list as a fallback.
  useEffect(() => {
    if (!law?.articles || law.articles.length === 0 || selectedArticle) return
    const requested = searchParams?.get('article') ?? null
    if (requested) {
      const target = law.articles.find(
        (a: any) => String(a.number) === requested,
      )
      if (target) {
        setSelectedArticle(target)
        return
      }
    }
    setSelectedArticle(law.articles[0])
  }, [law, selectedArticle, searchParams])

  // Re-bind selectedArticle to the freshest copy whenever law.articles
  // changes (e.g. after an inline edit refetched the law). Match by id so
  // an article rename doesn't lose the selection. Falls back to number.
  useEffect(() => {
    if (!selectedArticle || !law?.articles) return
    const fresh = law.articles.find(
      (a: any) => a.id === selectedArticle.id,
    ) ??
      law.articles.find((a: any) => a.number === selectedArticle.number)
    if (fresh && fresh !== selectedArticle) {
      setSelectedArticle(fresh)
    }
  }, [law?.articles, selectedArticle])

  // Set default sidebar state based on screen size
  useEffect(() => {
    const isMobile = window.innerWidth < 1024
    setIsSidebarOpen(!isMobile)
  }, [])

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // useRef must be called before any early returns (Rules of Hooks)
  const articleViewerRef = React.useRef<HTMLDivElement>(null)
  const preambleRef = React.useRef<HTMLDivElement>(null)
  const visasRef = React.useRef<HTMLDivElement>(null)
  const considerantsRef = React.useRef<HTMLDivElement>(null)
  const [preambleExpanded, setPreambleExpanded] = useState(false)
  const [visasExpanded, setVisasExpanded] = useState(false)
  const [considerantsExpanded, setConsiderantsExpanded] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-red-600" />
      </div>
    )
  }

  if (isError || !law) {
    return <TextNotFound />
  }

  const title =
    currentLang === 'ht' && law.title_ht ? law.title_ht : law.title_fr
  const description =
    currentLang === 'ht' && law.description_ht
      ? law.description_ht
      : law.description_fr
  const category = categoryLabels[law.category] || categoryLabels.loi

  const handleArticleSelect = (article: any) => {
    setSelectedArticle(article)
    // Scroll the article viewer into view
    setTimeout(() => {
      articleViewerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 100)
  }

  const handlePrevious = () => {
    if (law.articles && currentArticleIndex > 0) {
      setSelectedArticle(law.articles[currentArticleIndex - 1])
    }
  }

  const handleNext = () => {
    if (law.articles && currentArticleIndex < law.articles.length - 1) {
      setSelectedArticle(law.articles[currentArticleIndex + 1])
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Handle share
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: description ?? undefined,
          url: window.location.href,
        })
      } catch (error) {
        console.log('Error sharing:', error)
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      toast(t('lawDetail.actions.linkCopied'))
    }
  }

  // Handle copy link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast(t('lawDetail.actions.linkCopied'))
  }

  // Related laws logic (placeholders for now if backend doesn't provide them)
  const relatedLaws: any[] = []

  return (
    <div
      className={`min-h-screen bg-white ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}
    >
      {/* Header */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        {/* Spacer reserving the fixed menu nav's height (h-20). Decoupling
            menu clearance from the inner padding lets us use balanced py-*
            below for symmetric top/bottom space inside the dark band. */}
        <div aria-hidden className="h-20" />
        <div className="relative z-10 container py-12 lg:py-20">
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[600px] h-[300px] bg-white/5 blur-[100px] rounded-full pointer-events-none" />

          <Breadcrumb
            className="mb-8"
            items={[
              { label: t('lawDetail.breadcrumb.home'), href: '/' },
              { label: t('lawDetail.breadcrumb.laws'), href: '/lois' },
              { label: category[currentLang] },
            ]}
          />

          {/* Hero is a vertical stack of self-contained sections, each
              left-aligned and using the full container width:
                1. Category + status badges (with optional N° officiel)
                2. Title + description
                3. Metadata row (year / articles / Moniteur ref) + download
                4. Theme chips
              The DeviseBanner + IssuingAuthorityHeader are NOT in the
              hero — per design, they sit in the document body, just
              above the visas (mirroring how a printed legal act lays
              out: identity preamble in the body, not in the masthead). */}
          <div className="flex flex-col gap-8 lg:gap-10">
            {/* ── 1. Badges ──────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-3"
            >
              <Badge className="bg-red-600 text-white border-0 shadow-lg shadow-red-900/20 px-4 py-1.5 font-bold uppercase tracking-wider text-[10px] rounded-full">
                {category[currentLang]}
              </Badge>
              {(() => {
                const status = (law.status as TextStatus) ?? 'in_force'
                const meta = TEXT_STATUS_PILL[status] ?? TEXT_STATUS_PILL.in_force
                const StatusIcon = meta.icon
                return (
                  <Badge
                    className={`border ${meta.cls} px-4 py-1.5 font-bold uppercase tracking-wider text-[10px] rounded-full`}
                  >
                    <StatusIcon className="w-3 h-3 mr-1.5" />
                    {meta.label[currentLang]}
                  </Badge>
                )
              })()}
              {/* Inline alongside the badges — the official number is the
                  intrinsic identifier of the act, conceptually a third
                  badge (after category + status). The devise +
                  issuing-authority block is rendered later, in the body. */}
              {law.official_number && (
                <OfficialNumberTab
                  value={law.official_number}
                  category={law.category}
                  lang={currentLang}
                />
              )}
            </motion.div>

            {/* ── 2. Title + description ─────────────────────────────── */}
            <div className="flex flex-col gap-6 lg:gap-8">
              <motion.h1
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl lg:text-6xl font-black leading-[1.1] tracking-tight text-white drop-shadow-sm"
              >
                {title}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-slate-300 text-lg lg:text-xl leading-relaxed border-l-2 border-red-600 pl-6"
              >
                {description}
              </motion.p>
            </div>

            {/* ── 3. Metadata row (download icon sits next to the
                reference at the end) ───────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap items-center gap-x-8 gap-y-5"
            >
              <div className="contents">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/5 rounded-full border border-white/10">
                    <Calendar className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
                      {t('lawDetail.meta.year')}
                    </p>
                    <p className="text-white font-bold">
                      {law.publication_date?.slice(0, 4) ?? '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/5 rounded-full border border-white/10">
                    <FileText className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
                      {t('lawDetail.meta.content')}
                    </p>
                    <p className="text-white font-bold">
                      {law.articles?.length || 0}{' '}
                      {t('lawDetail.meta.articles')}
                    </p>
                  </div>
                </div>

                {(() => {
                  // Structured Moniteur link (from the ingestion pipeline)
                  // takes precedence over the legacy free-text field.
                  if (law.moniteur_issue_id) {
                    const pubDate = law.moniteur_issue_publication_date
                    const formatted = formatLongDate(pubDate, 'fr')
                    const dateStr = formatted ? `du ${formatted}` : ''
                    return (
                      <Link
                        href={`/moniteur/${law.moniteur_issue_id}`}
                        className="flex items-center gap-4 group/moniteur"
                      >
                        <div className="p-3 bg-white/5 rounded-full border border-white/10 group-hover/moniteur:bg-white/10 transition-colors">
                          <Newspaper className="w-5 h-5 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
                            {currentLang === 'fr' ? 'Publié dans' : 'Pibliye nan'}
                          </p>
                          <p className="text-white font-medium truncate max-w-[24rem] group-hover/moniteur:underline">
                            <em className="italic font-semibold">Le Moniteur</em>{' '}
                            <span className="font-normal text-slate-200">
                              {/^[0-9]/.test(law.moniteur_issue_number ?? '') ? `N° ${law.moniteur_issue_number}` : law.moniteur_issue_number} {dateStr}
                            </span>
                          </p>
                        </div>
                      </Link>
                    )
                  }
                  // Fallback: legacy free-text moniteur_ref field.
                  const raw = (law.moniteur_ref ?? '').trim()
                  if (!raw) return null
                  if (/^https?:\/\//i.test(raw)) return null
                  if (/^source\s*:/i.test(raw)) return null
                  const alreadyPrefixed = /^(?:le\s+)?moniteur\b/i.test(raw)
                  const body = alreadyPrefixed
                    ? raw.replace(/^(?:le\s+)?moniteur\b\s*/i, '')
                    : raw
                  return (
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white/5 rounded-full border border-white/10">
                        <Newspaper className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
                          {currentLang === 'fr' ? 'Référence' : 'Referans'}
                        </p>
                        <p className="text-white font-medium truncate max-w-[24rem]">
                          <em className="italic font-semibold">Le Moniteur</em>{' '}
                          <span className="font-normal text-slate-200">
                            {body}
                          </span>
                        </p>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <DownloadDropdown slug={slug} language={language} />
            </motion.div>

            {/* ── 4. Theme chips ─────────────────────────────────────── */}
            {law.theme_tags && law.theme_tags.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-1">
                  <Tags className="w-3.5 h-3.5" />
                  {currentLang === 'fr' ? 'Thématiques' : 'Tèm'}
                </span>
                {law.theme_tags.map((tag: any) => {
                  const label = themeLabel(tag.theme, currentLang) ?? tag.theme
                  const isEditor = tag.source === 'editor'
                  return (
                    <Link
                      key={tag.theme}
                      href={`/lois?theme=${tag.theme}`}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
                        isEditor
                          ? 'bg-white text-slate-900 hover:bg-amber-100 ring-1 ring-amber-300/50'
                          : 'bg-white/10 text-slate-200 hover:bg-white/15 ring-1 ring-white/10',
                      )}
                    >
                      {label}
                    </Link>
                  )
                })}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative container">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          {/* Table of Contents - Mobile Accordion / Desktop Sidebar */}
          {law.articles && law.articles.length > 0 && (
            <div className="block lg:hidden w-full mb-4">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <PanelLeft className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="font-bold uppercase tracking-widest text-xs text-slate-700">
                    {currentLang === 'fr' ? 'Sommaire' : 'Somè'}
                  </span>
                </div>
                <ChevronRight
                  className={cn(
                    'w-5 h-5 text-gray-400 transition-transform duration-300',
                    isSidebarOpen && 'rotate-90',
                  )}
                />
              </button>

              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="h-[500px]">
                      <TableOfContents
                        articles={law.articles}
                        headings={law.headings}
                        currentLang={currentLang}
                        onArticleSelect={(article) => {
                          handleArticleSelect(article)
                          setIsSidebarOpen(false)
                        }}
                        selectedArticle={selectedArticle?.number}
                        externalQuery={
                          pageSearchScope === 'sommaire' ? pageSearchQuery : ''
                        }
                        hasPreamble={!!law.preamble_fr}
                        onPreambleClick={() => {
                          setPreambleExpanded(true)
                          setIsSidebarOpen(false)
                          setTimeout(() => {
                            preambleRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                          }, 100)
                        }}
                        hasVisas={!!law.visas_fr}
                        onVisasClick={() => {
                          setVisasExpanded(true)
                          setIsSidebarOpen(false)
                          setTimeout(() => {
                            visasRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                          }, 100)
                        }}
                        hasConsiderants={!!law.considerants_fr}
                        onConsiderantsClick={() => {
                          setConsiderantsExpanded(true)
                          setIsSidebarOpen(false)
                          setTimeout(() => {
                            considerantsRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                          }, 100)
                        }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Desktop Sidebar Toggle */}
          {law.articles && law.articles.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden lg:flex fixed bottom-6 right-6 z-40 shadow-lg bg-white border-gray-200 rounded-full w-12 h-12 p-0"
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-5 h-5" />
              ) : (
                <PanelLeft className="w-5 h-5" />
              )}
            </Button>
          )}

          {/* Table of Contents Sidebar (Desktop) */}
          <AnimatePresence>
            {isSidebarOpen && law.articles && law.articles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={
                  // 25% wide column with grey bg + a ::before pseudo that bleeds
                  // 100vw to the left so the grey reaches the screen edge.
                  // Vertical padding inside the column makes the grey area
                  // flush with hero (top) and footer (bottom).
                  "hidden lg:block lg:flex-shrink-0 lg:w-[25%] lg:bg-slate-50/70 lg:border-r lg:border-gray-200 lg:pr-6 lg:py-8 lg:relative lg:before:content-[''] lg:before:absolute lg:before:inset-y-0 lg:before:right-full lg:before:w-screen lg:before:bg-slate-50/70 lg:before:pointer-events-none"
                }
              >
                <div className="lg:sticky lg:top-24 h-[calc(100vh-12rem)]">
                  <TableOfContents
                    articles={law.articles}
                    headings={law.headings}
                    currentLang={currentLang}
                    onArticleSelect={handleArticleSelect}
                    selectedArticle={selectedArticle?.number}
                    externalQuery={
                      pageSearchScope === 'sommaire' ? pageSearchQuery : ''
                    }
                    hasPreamble={!!law.preamble_fr}
                    onPreambleClick={() => {
                      setPreambleExpanded(true)
                      setTimeout(() => {
                        preambleRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }, 100)
                    }}
                    hasVisas={!!law.visas_fr}
                    onVisasClick={() => {
                      setVisasExpanded(true)
                      setTimeout(() => {
                        visasRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }, 100)
                    }}
                    hasConsiderants={!!law.considerants_fr}
                    onConsiderantsClick={() => {
                      setConsiderantsExpanded(true)
                      setTimeout(() => {
                        considerantsRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }, 100)
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 lg:py-8">
            {/* Top search panel — Légifrance-style scope radio + input */}
            {law.articles && law.articles.length > 0 && (
              <div className="mb-6">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-6 text-sm text-slate-700 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="searchScope"
                        checked={pageSearchScope === 'sommaire'}
                        onChange={() => setPageSearchScope('sommaire')}
                        className="accent-primary"
                      />
                      <span>
                        {currentLang === 'fr'
                          ? 'Rechercher dans le sommaire'
                          : 'Chèche nan tab matyè'}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="searchScope"
                        checked={pageSearchScope === 'code'}
                        onChange={() => {
                          setPageSearchScope('code')
                          toast(
                            currentLang === 'fr'
                              ? 'Recherche plein-texte bientôt disponible'
                              : 'Rechèch plen tèks talè konsa',
                          )
                        }}
                        className="accent-primary"
                      />
                      <span>
                        {currentLang === 'fr'
                          ? 'Rechercher dans tout le code'
                          : 'Chèche nan tout kòd la'}
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={pageSearchQuery}
                        onChange={(e) => setPageSearchQuery(e.target.value)}
                        placeholder={
                          currentLang === 'fr' ? 'Rechercher' : 'Chèche'
                        }
                        className="w-full h-11 pl-4 pr-12 rounded-lg border border-gray-300 bg-gray-50 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                      />
                      <button
                        type="button"
                        aria-label={
                          currentLang === 'fr' ? 'Rechercher' : 'Chèche'
                        }
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-md bg-primary text-white hover:bg-primary/90"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                    {pageSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPageSearchQuery('')}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {currentLang === 'fr' ? 'Réinitialiser' : 'Reinisyalize'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Identity preamble — devise nationale + autorité émettrice
                rendered HERE (in the document body) rather than in the
                hero. Mirrors how a printed legal act lays out: identity
                opens the document, not the masthead. Hidden when there's
                no issuing_authority on the row. */}
            {law.issuing_authority && (
              <div className="mb-8 flex flex-col items-center gap-3 text-slate-700">
                <DeviseBanner />
                <IssuingAuthorityHeader value={law.issuing_authority} />
              </div>
            )}

            {/* Pre-article blocks: Préambule → Visas → Considérants → Formule d'adoption */}
            {law.articles && law.articles.length > 0 && (law.preamble_fr || law.visas_fr || law.considerants_fr || law.enacting_formula_fr) && (
              <div className="mb-8 space-y-3">
                {law.preamble_fr && (
                  <div ref={preambleRef} className="scroll-mt-24">
                    <button
                      onClick={() => setPreambleExpanded(!preambleExpanded)}
                      className="w-full flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors text-left group"
                    >
                      {preambleExpanded ? (
                        <ChevronDown className="w-4 h-4 text-red-600 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className="text-sm font-bold uppercase tracking-widest text-slate-600">
                        {currentLang === 'fr' ? 'Préambule' : 'Preanmbil'}
                      </span>
                    </button>
                    <AnimatePresence>
                      {preambleExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 px-5 py-5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {law.preamble_fr}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {law.visas_fr && (
                  <div ref={visasRef} className="scroll-mt-24">
                    <button
                      onClick={() => setVisasExpanded(!visasExpanded)}
                      className="w-full flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors text-left group"
                    >
                      {visasExpanded ? (
                        <ChevronDown className="w-4 h-4 text-red-600 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className="text-sm font-bold uppercase tracking-widest text-slate-600">
                        Visas
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">
                        {currentLang === 'fr' ? 'Vu les articles...' : 'Wi atik yo...'}
                      </span>
                    </button>
                    <AnimatePresence>
                      {visasExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 px-5 py-5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {law.visas_fr}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {law.considerants_fr && (
                  <div ref={considerantsRef} className="scroll-mt-24">
                    <button
                      onClick={() => setConsiderantsExpanded(!considerantsExpanded)}
                      className="w-full flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors text-left group"
                    >
                      {considerantsExpanded ? (
                        <ChevronDown className="w-4 h-4 text-red-600 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className="text-sm font-bold uppercase tracking-widest text-slate-600">
                        {currentLang === 'fr' ? 'Considérants' : 'Konsideran'}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">
                        {currentLang === 'fr' ? 'Considérant que...' : 'Konsidere ke...'}
                      </span>
                    </button>
                    <AnimatePresence>
                      {considerantsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 px-5 py-5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {law.considerants_fr}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {law.enacting_formula_fr && (
                  <div className="py-4 text-center">
                    <p className="text-sm font-semibold italic text-slate-500 tracking-wide">
                      {law.enacting_formula_fr}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div ref={articleViewerRef} className="mb-8 scroll-mt-24">
              {law.articles && law.articles.length > 0 ? (
                <ArticleViewer
                  article={selectedArticle}
                  lawTitle={title}
                  currentLang={currentLang}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  onShare={handleShare}
                  onCopyLink={handleCopyLink}
                  hasPrevious={currentArticleIndex > 0}
                  hasNext={currentArticleIndex < law.articles.length - 1}
                  breadcrumb={articleBreadcrumb}
                  prevHint={blocHints.prev}
                  nextHint={blocHints.next}
                  defaultStatus={mapTextStatusToArticleStatus(law.status)}
                  isEditor={isEditor}
                  onArticleSaved={refetch}
                  siblingArticles={law.articles as any}
                  lawSlug={law.slug}
                />
              ) : (
                /* Preamble-only mode: legal_text has no articles[] yet
                   (typical for historical constitutions and other texts
                   that haven't been structured by an editor). */
                <PreambleViewer
                  title={title}
                  text={law.preamble_fr}
                  currentLang={currentLang}
                />
              )}
            </div>

            {/* Signataires */}
            {law.signers && law.signers.length > 0 && (
              <div className="mb-12 pt-8 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-6">
                  <PenLine className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {currentLang === 'fr' ? 'Signataires' : 'Siyatè'}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                  {law.signers.map((signer: any) => (
                    <div key={signer.id} className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-slate-900">
                        {signer.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {currentLang === 'ht' && signer.function_ht
                          ? signer.function_ht
                          : signer.function_fr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Editor floating bar — visible only when signed in */}
            {isEditor && law && (
              <EditorBar
                slug={law.slug}
                status={
                  (law.editorial_status ?? 'draft') as
                    | 'draft'
                    | 'pending_review'
                    | 'published'
                    | 'rejected'
                }
                editorEmail={editorUser?.email ?? null}
                metadata={{
                  slug: law.slug,
                  title_fr: law.title_fr,
                  title_ht: law.title_ht ?? null,
                  description_fr: law.description_fr ?? null,
                  description_ht: law.description_ht ?? null,
                  promulgation_date: law.promulgation_date ?? null,
                  publication_date: law.publication_date ?? null,
                  moniteur_ref: law.moniteur_ref ?? null,
                  category: law.category,
                  code_subcategory: law.code_subcategory ?? null,
                  status: law.status,
                  official_number: law.official_number ?? null,
                  issuing_authority: law.issuing_authority ?? null,
                  official_formula: law.official_formula ?? null,
                }}
                onChanged={refetch}
              />
            )}

            {/* The OfficialFormula box and the SignatureGrid that
                used to live here have been removed — the existing
                "Signataires" 2-column list above (line 944) is the
                canonical signers display, and the verbatim formula
                duplicated the devise that opens the body. */}

            {/* Related Laws */}
            {relatedLaws.length > 0 && (
              <div className="mt-12">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">
                  {currentLang === 'fr'
                    ? 'Textes connexes'
                    : 'Tèks ki gen rapò'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {relatedLaws.map((relatedLaw) => (
                    <Link
                      key={relatedLaw.id}
                      href={`/lois/${relatedLaw.slug}`}
                      className="group block"
                    >
                      <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-gray-300 hover:shadow-lg transition-all duration-200">
                        <div className="flex items-start justify-between mb-3">
                          <Badge className={`${relatedLaw.color} text-white`}>
                            {categoryLabels[relatedLaw.category][currentLang]}
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
                        </div>
                        <h4 className="text-lg font-semibold text-gray-900 group-hover:text-primary transition-colors">
                          {relatedLaw.title}
                        </h4>
                        <p className="text-sm text-gray-500 mt-2">
                          {relatedLaw.description}
                        </p>
                        <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
                          <span>{relatedLaw.year}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {currentLang === 'fr' ? 'En vigueur' : 'An vigè'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

