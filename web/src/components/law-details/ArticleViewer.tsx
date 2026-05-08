'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  History,
  Layers,
  Link2,
  Loader2,
  Languages,
  Pencil,
  Share2,
  Volume2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast-simple'
import {
  citationsFromArticle,
  citationsToArticle,
  resolveArticles,
  updateArticleContent,
  type ArticleContentPatch,
  type ArticleResolved,
} from '@/lib/api/endpoints'
import {
  mapCitations,
  type CitationEntry,
  type CitationRow,
  type SiblingArticle,
} from './citation-mapping'

/** One step in the breadcrumb path from the LegalText down to this article. */
export interface BreadcrumbNode {
  id: number
  level: 'book' | 'title' | 'chapter' | 'section' | 'subsection'
  number?: string | null
  title_fr?: string | null
  title_ht?: string | null
}

type ArticleStatus =
  | 'in_force'
  | 'abrogated'
  | 'suspended'
  | 'transferred'
  | 'obsolete'

interface Article {
  id: number
  number: string
  chapter?: string | null
  title_fr?: string | null
  title_ht?: string | null
  content_fr?: string | null
  content_ht?: string | null
  word_count?: number
  status?: ArticleStatus
  effective_from?: string | null
  effective_to?: string | null
  transferred_to_article_id?: number | null
  version_number?: number | null
}

const STATUS_PILL: Record<
  ArticleStatus,
  {
    label: { fr: string; ht: string }
    cls: string
    rail: string
  }
> = {
  in_force: {
    label: { fr: 'En vigueur', ht: 'An vigè' },
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rail: 'from-emerald-400 to-emerald-600',
  },
  abrogated: {
    label: { fr: 'Abrogé', ht: 'Abwoje' },
    cls: 'bg-red-50 text-red-700 border-red-200',
    rail: 'from-red-400 to-red-600',
  },
  suspended: {
    label: { fr: 'Suspendu', ht: 'Sispann' },
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    rail: 'from-amber-400 to-amber-600',
  },
  transferred: {
    label: { fr: 'Transféré', ht: 'Transfere' },
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
    rail: 'from-blue-400 to-blue-600',
  },
  obsolete: {
    label: { fr: 'Obsolète', ht: 'Demode' },
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
    rail: 'from-slate-400 to-slate-500',
  },
}

const LEVEL_LABELS: Record<
  BreadcrumbNode['level'],
  { fr: string; ht: string }
> = {
  book: { fr: 'Livre', ht: 'Liv' },
  title: { fr: 'Titre', ht: 'Tit' },
  chapter: { fr: 'Chapitre', ht: 'Chapit' },
  section: { fr: 'Section', ht: 'Seksyon' },
  subsection: { fr: 'Sous-section', ht: 'Sou-seksyon' },
}

function formatEffectiveSince(
  from: string | null | undefined,
  lang: 'fr' | 'ht',
): string | null {
  if (!from) return null
  const d = new Date(from)
  const fmt = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return lang === 'fr' ? `En vigueur depuis le ${fmt}` : `An vigè depi ${fmt}`
}

// ---- Mock data — TODO(api): replace with real backend payload ---------------

interface ProvenanceEntry {
  kind: 'created' | 'modified' | 'abrogated'
  text_label: string
  article_ref?: string | null
  date: string
  href?: string | null
}


const MOCK_PROVENANCE: ProvenanceEntry[] = [
  {
    kind: 'modified',
    text_label: 'Loi n°2010-1487',
    article_ref: 'art. 17',
    date: '7 décembre 2010',
    href: '#',
  },
]

interface VersionEntry {
  version: number
  status: 'in_force' | 'abrogated' | 'historical'
  effective_from: string
  effective_to?: string | null
  amended_by?: string | null
  href?: string | null
}

const MOCK_VERSIONS: VersionEntry[] = [
  {
    version: 3,
    status: 'in_force',
    effective_from: '7 déc. 2010',
    effective_to: null,
    amended_by: 'Loi n°2010-1487 — art. 17',
    href: '#',
  },
  {
    version: 2,
    status: 'historical',
    effective_from: '1 janv. 1985',
    effective_to: '6 déc. 2010',
    amended_by: 'Décret-loi du 14 sept 1984',
    href: '#',
  },
  {
    version: 1,
    status: 'historical',
    effective_from: '27 mars 1825',
    effective_to: '31 déc. 1984',
    amended_by: null,
    href: '#',
  },
]

// MOCK_OUTBOUND / MOCK_INBOUND removed: citations are now fetched live via
// /api/v1/citations and rendered through `outboundEntries` / `inboundEntries`
// computed in the component. See backfill_citations.py for seeding.

const RELATION_META: Record<
  CitationEntry['relation'],
  { label: { fr: string; ht: string }; cls: string }
> = {
  vise: {
    label: { fr: 'vise', ht: 'vize' },
    cls: 'bg-slate-100 text-slate-700',
  },
  modifie: {
    label: { fr: 'modifie', ht: 'modifye' },
    cls: 'bg-amber-100 text-amber-800',
  },
  abroge: {
    label: { fr: 'abroge', ht: 'abwoje' },
    cls: 'bg-red-100 text-red-700',
  },
  applique: {
    label: { fr: 's’applique à', ht: 'aplike a' },
    cls: 'bg-indigo-100 text-indigo-700',
  },
  interprete: {
    label: { fr: 'interprète', ht: 'entèprete' },
    cls: 'bg-purple-100 text-purple-700',
  },
  application: {
    label: { fr: 'application', ht: 'aplikasyon' },
    cls: 'bg-indigo-100 text-indigo-700',
  },
  interpretation: {
    label: { fr: 'interprétation', ht: 'entèpretasyon' },
    cls: 'bg-purple-100 text-purple-700',
  },
  annulation: {
    label: { fr: 'annulation', ht: 'anilasyon' },
    cls: 'bg-red-100 text-red-700',
  },
}

// ----------------------------------------------------------------------------
// Body renderer — handles French legal enumerations (1°, a), 1)) inside paragraphs.
// TODO(api): once the parser produces structured enumeration data, drop the heuristic.

const ENUMERATION_RE = /(?<=^|\s)(\d+°|\d+\)|[a-z]\))(?=\s+\S)/gi

interface BodyBlock {
  isEnum: boolean
  marker?: string
  text: string
}

function splitParagraphIntoBlocks(paragraph: string): BodyBlock[] {
  const matches = [...paragraph.matchAll(ENUMERATION_RE)]
  if (matches.length === 0) return [{ isEnum: false, text: paragraph }]

  const blocks: BodyBlock[] = []
  const firstStart = matches[0].index ?? 0

  // Introducer (text before the first marker), e.g., "Pour être Président, il faut :"
  if (firstStart > 0) {
    const intro = paragraph.slice(0, firstStart).trim()
    if (intro) blocks.push({ isEnum: false, text: intro })
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const start = m.index ?? 0
    const end = i + 1 < matches.length ? matches[i + 1].index ?? paragraph.length : paragraph.length
    const segment = paragraph.slice(start, end).trim()
    const inner = segment.match(/^(\d+°|\d+\)|[a-z]\))\s+([\s\S]*)$/)
    if (inner) {
      blocks.push({ isEnum: true, marker: inner[1], text: inner[2].trim() })
    } else {
      blocks.push({ isEnum: false, text: segment })
    }
  }
  return blocks
}

function renderArticleBody(content: string, currentLang: 'fr' | 'ht') {
  const paragraphs = content
    .split(/\n\s*\n+/)
    .map((para) =>
      para
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)

  return paragraphs.map((paragraph, idx) => {
    const blocks = splitParagraphIntoBlocks(paragraph)
    return (
      <div key={idx} className="mb-4 last:mb-0 group relative">
        <a
          href={`#al-${idx + 1}`}
          id={`al-${idx + 1}`}
          className="absolute -left-6 top-0.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity text-sm font-medium select-none"
          aria-label={
            currentLang === 'fr'
              ? `Lien vers l’alinéa ${idx + 1}`
              : `Lyen pou alineya ${idx + 1}`
          }
        >
          ¶
        </a>
        {blocks.map((block, bIdx) =>
          block.isEnum ? (
            <div key={bIdx} className="flex gap-3 mt-2 first:mt-0">
              <span className="font-semibold text-slate-800 tabular-nums flex-shrink-0 select-none">
                {block.marker}
              </span>
              <span className="flex-1">{block.text}</span>
            </div>
          ) : (
            <p key={bIdx} className="mb-1.5 last:mb-0">
              {block.text}
            </p>
          ),
        )}
      </div>
    )
  })
}

// ----------------------------------------------------------------------------

interface ArticleViewerProps {
  article: Article | null
  lawTitle: string
  currentLang: 'fr' | 'ht'
  onPrevious: () => void
  onNext: () => void
  onShare: () => void
  onCopyLink: () => void
  hasPrevious: boolean
  hasNext: boolean
  breadcrumb?: BreadcrumbNode[]
  prevHint?: string | null
  nextHint?: string | null
  /**
   * Status to use when the article itself has no `status` field —
   * typically derived from the parent legal-text's status. So an
   * article belonging to an abrogated law inherits "abrogated" by default.
   */
  defaultStatus?: ArticleStatus
  /** Editor mode unlocks the inline edit affordance (pencil icon → editable
   *  title + body for the visible language). Public visitors never see it. */
  isEditor?: boolean
  /** Called after a successful save so the parent can refetch the law. */
  onArticleSaved?: () => void
  /** All articles in the parent text — used to resolve same-text citation
   *  targets (article id → "Article N" label + permalink). Pass null to
   *  fall back to generic "Article #id" labels. */
  siblingArticles?: SiblingArticle[]
  /** Slug of the parent legal text — used to build per-article permalinks
   *  inside the citations panel. */
  lawSlug?: string
}

export default function ArticleViewer({
  article,
  currentLang = 'fr',
  onPrevious,
  onNext,
  onShare,
  onCopyLink,
  hasPrevious = false,
  hasNext = false,
  breadcrumb = [],
  prevHint = null,
  nextHint = null,
  defaultStatus,
  isEditor = false,
  onArticleSaved,
  siblingArticles,
  lawSlug,
}: ArticleViewerProps) {
  const { toast } = useToast()

  // All hooks must run unconditionally — null-article fallback is below.
  const [openPanel, setOpenPanel] = useState<
    'versions' | 'compare' | 'links' | null
  >(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Inline edit state — keyed by article.id so switching to a different
  // article cancels any in-flight edit instead of carrying drafts across.
  // `mode='mono'` edits the visible language only; `mode='bilingual'`
  // shows FR + HT side-by-side so the editor can add a Kreyòl translation
  // next to the existing French body.
  const [editing, setEditing] = useState<{
    articleId: number
    mode: 'mono' | 'bilingual'
    titleFrDraft: string
    titleHtDraft: string
    bodyFrDraft: string
    bodyHtDraft: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const isCurrentEdit = editing && article && editing.articleId === article.id
  const isBilingualEdit = isCurrentEdit && editing!.mode === 'bilingual'

  // Citation state — outgoing (this article cites X) and incoming (X cites
  // this article). Re-fetched whenever the selected article changes.
  const [outgoing, setOutgoing] = useState<CitationRow[]>([])
  const [incoming, setIncoming] = useState<CitationRow[]>([])
  useEffect(() => {
    if (!article) return
    const articleId = article.id
    let cancelled = false
    void Promise.all([
      citationsFromArticle(articleId),
      citationsToArticle(articleId),
    ])
      .then(([out, inc]) => {
        if (cancelled) return
        setOutgoing(out.items)
        setIncoming(inc.items)
      })
      .catch(() => {
        // Citations are non-essential — fall back to empty if the request fails.
        if (cancelled) return
        setOutgoing([])
        setIncoming([])
      })
    return () => {
      cancelled = true
    }
  }, [article?.id])

  // Build a quick lookup from sibling article id -> {number, slug} so the
  // citation panel can resolve same-text targets to "Article 192" with a
  // proper permalink. Cross-text targets are resolved via the
  // `/api/v1/articles/resolve` batch endpoint below.
  const articleById = useMemo(() => {
    const map = new Map<number, SiblingArticle>()
    for (const a of siblingArticles ?? []) {
      map.set(a.id, a)
    }
    return map
  }, [siblingArticles])

  // Cross-text resolver — for any cited article id we don't have in the
  // siblings list, batch-fetch its parent-text title + slug so the panel
  // can render "Code Civil — Article 1382" with a real permalink instead
  // of "Article #1234".
  const [resolvedById, setResolvedById] = useState<Map<number, ArticleResolved>>(
    () => new Map(),
  )
  useEffect(() => {
    const allTargets = [
      ...outgoing.map((c) =>
        c.target_node_type === 'article' ? c.target_node_id : null,
      ),
      ...incoming.map((c) =>
        c.source_node_type === 'article' ? c.source_node_id : null,
      ),
    ].filter((x): x is number => x !== null)
    const unknown = Array.from(
      new Set(allTargets.filter((id) => !articleById.has(id))),
    )
    if (unknown.length === 0) {
      setResolvedById(new Map())
      return
    }
    let cancelled = false
    void resolveArticles(unknown)
      .then((rows) => {
        if (cancelled) return
        const m = new Map<number, ArticleResolved>()
        for (const r of rows) m.set(r.id, r)
        setResolvedById(m)
      })
      .catch(() => {
        // Resolver failure is non-fatal — citations fall back to "Article #id".
        if (cancelled) return
        setResolvedById(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [outgoing, incoming, articleById])

  const outboundEntries = useMemo(
    () => mapCitations(outgoing, 'outbound', articleById, lawSlug, resolvedById),
    [outgoing, articleById, lawSlug, resolvedById],
  )
  const inboundEntries = useMemo(
    () => mapCitations(incoming, 'inbound', articleById, lawSlug, resolvedById),
    [incoming, articleById, lawSlug, resolvedById],
  )

  if (!article) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-12 text-center"
      >
        <FileText className="w-16 h-16 mx-auto text-gray-200 mb-4" />
        <h3 className="text-lg font-semibold text-gray-400">
          {currentLang === 'fr'
            ? 'Sélectionnez un article pour commencer'
            : 'Chwazi yon atik pou kòmanse'}
        </h3>
      </motion.div>
    )
  }

  const title =
    currentLang === 'ht' && article.title_ht
      ? article.title_ht
      : article.title_fr
  const content =
    currentLang === 'ht' && article.content_ht
      ? article.content_ht
      : article.content_fr

  // Effective status: an article cannot be more "in force" than its parent law.
  // If the law is abrogated/obsolete, every article is at least that — even if
  // the article row says `in_force`, that's stale data we don't surface to users.
  const status: ArticleStatus = (() => {
    const own = article.status
    if (defaultStatus === 'abrogated' || defaultStatus === 'obsolete') {
      return defaultStatus
    }
    return own ?? defaultStatus ?? 'in_force'
  })()
  const statusMeta = STATUS_PILL[status]
  const effectiveSince = formatEffectiveSince(article.effective_from, currentLang)

  const handleCopyText = () => {
    navigator.clipboard.writeText(`${title || ''}\n\n${content || ''}`)
    toast(currentLang === 'fr' ? 'Texte copié !' : 'Tèks kopye !')
  }

  const tCite = currentLang === 'fr' ? 'Cite' : 'Site'
  const tCitedBy = currentLang === 'fr' ? 'Citée par' : 'Site pa'

  const togglePanel = (panel: 'versions' | 'compare' | 'links') => {
    setOpenPanel((cur) => (cur === panel ? null : panel))
    // Smooth scroll the panel into view after expansion
    setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
  }

  const handleListen = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast(
        currentLang === 'fr'
          ? 'Lecture vocale non disponible sur ce navigateur'
          : 'Lekti vokal pa disponib sou navigatè sa a',
      )
      return
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }
    const utter = new SpeechSynthesisUtterance(
      `${title ? title + '. ' : ''}${content || ''}`,
    )
    utter.lang = currentLang === 'fr' ? 'fr-FR' : 'ht-HT'
    utter.onend = () => setIsSpeaking(false)
    utter.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utter)
    setIsSpeaking(true)
  }

  const startEdit = (mode: 'mono' | 'bilingual' = 'mono') => {
    if (!article) return
    setEditing({
      articleId: article.id,
      mode,
      titleFrDraft: article.title_fr ?? '',
      titleHtDraft: article.title_ht ?? '',
      bodyFrDraft: article.content_fr ?? '',
      bodyHtDraft: article.content_ht ?? '',
    })
  }
  const cancelEdit = () => {
    setEditing(null)
  }
  const saveEdit = async () => {
    if (!article || !editing || editing.articleId !== article.id) return
    const patch: ArticleContentPatch = {}

    // Mono-mode: only patch the visible language. Bilingual-mode: patch
    // both, but only the fields that actually changed (keeps the audit
    // log clean + avoids no-op version bumps).
    const visible = currentLang === 'ht' ? 'ht' : 'fr'
    const langs: Array<'fr' | 'ht'> =
      editing.mode === 'bilingual' ? ['fr', 'ht'] : [visible]

    for (const lang of langs) {
      const draftTitle =
        lang === 'fr' ? editing.titleFrDraft : editing.titleHtDraft
      const draftBody =
        lang === 'fr' ? editing.bodyFrDraft : editing.bodyHtDraft
      const original = lang === 'fr' ? article.title_fr : article.title_ht
      const originalBody = lang === 'fr' ? article.content_fr : article.content_ht

      const trimmedTitle = draftTitle.trim()
      const trimmedBody = draftBody.trim()
      const titleField = lang === 'ht' ? 'title_ht' : 'title_fr'
      const textField = lang === 'ht' ? 'text_ht' : 'text_fr'

      if (trimmedTitle !== (original ?? '').trim()) {
        patch[titleField] = trimmedTitle || null
      }
      if (trimmedBody !== (originalBody ?? '').trim()) {
        if (textField === 'text_fr' && !trimmedBody) {
          toast(
            currentLang === 'fr'
              ? 'Le texte français est obligatoire.'
              : 'Tèks fransè a obligatwa.',
          )
          return
        }
        ;(patch as Record<string, string | null>)[textField] = trimmedBody
      }
    }

    if (Object.keys(patch).length === 0) {
      setEditing(null)
      return
    }
    setSaving(true)
    try {
      await updateArticleContent(article.id, patch)
      toast(currentLang === 'fr' ? 'Article enregistré' : 'Atik anrejistre')
      setEditing(null)
      onArticleSaved?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      toast(
        currentLang === 'fr'
          ? `Échec de l'enregistrement : ${msg}`
          : `Echèk anrejistreman : ${msg}`,
      )
    } finally {
      setSaving(false)
    }
  }

  const utilityActions = [
    ...(isEditor && !isCurrentEdit
      ? [
          {
            icon: Pencil,
            label: currentLang === 'fr' ? 'Modifier' : 'Modifye',
            onClick: () => startEdit('mono'),
          },
          {
            icon: Languages,
            label:
              currentLang === 'fr'
                ? 'Édition bilingue (FR + HT)'
                : 'Edisyon bilang (FR + HT)',
            onClick: () => startEdit('bilingual'),
          },
        ]
      : []),
    {
      icon: Share2,
      label: currentLang === 'fr' ? 'Partager' : 'Pataje',
      onClick: onShare,
    },
    {
      icon: Link2,
      label: currentLang === 'fr' ? 'Copier le lien' : 'Kopye lyen',
      onClick: onCopyLink,
    },
    {
      icon: Copy,
      label: currentLang === 'fr' ? 'Copier le texte' : 'Kopye tèks',
      onClick: handleCopyText,
    },
    {
      icon: Volume2,
      label: isSpeaking
        ? currentLang === 'fr'
          ? 'Arrêter la lecture'
          : 'Sispann lekti'
        : currentLang === 'fr'
          ? 'Écouter'
          : 'Koute',
      onClick: handleListen,
    },
  ]

  return (
    <motion.div
      key={article.number}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-transparent"
    >
      {/* Header — no bottom border now */}
      <div className="pb-6">
        {/* Breadcrumb (left) + status pill + utility icons (right).
           The article number is the article-level <h2> — gives screen
           readers a real heading per article so the 499-article reader
           has a usable document outline. Visually identical to before. */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <nav
            aria-label={
              currentLang === 'fr'
                ? 'Chemin dans le texte'
                : 'Chemen nan tèks la'
            }
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 flex-wrap min-w-0"
          >
            {breadcrumb.map((node, i) => {
              const label = LEVEL_LABELS[node.level][currentLang]
              return (
                <span key={node.id} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                  <span className="font-medium text-gray-600">
                    {label} {node.number}
                  </span>
                </span>
              )
            })}
            {breadcrumb.length > 0 && (
              <ChevronRight className="w-3 h-3 text-gray-300" />
            )}
            <h2 className="font-bold text-slate-900 tracking-tight text-sm m-0">
              {article.number.toLowerCase().startsWith('article')
                ? article.number
                : `Article ${article.number}`}
            </h2>
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Badge
              variant="outline"
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusMeta.cls}`}
            >
              {statusMeta.label[currentLang]}
            </Badge>

            <span className="w-px h-5 bg-gray-200" />

            {/* 4 utility icons */}
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1">
                {utilityActions.map((a) => (
                  <Tooltip key={a.label}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={a.onClick}
                        aria-label={a.label}
                        className="w-11 h-11 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-primary hover:bg-slate-100 transition-colors"
                      >
                        <a.icon className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{a.label}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>
        </div>

        {/* Compact sub-line: effective date · version */}
        {(effectiveSince || (article.version_number ?? 0) > 1) && (
          <p className="text-xs text-slate-500 mb-3 flex items-center gap-2 flex-wrap">
            {effectiveSince && <span>{effectiveSince}</span>}
            {effectiveSince && (article.version_number ?? 0) > 1 && (
              <span className="text-slate-300">·</span>
            )}
            {(article.version_number ?? 0) > 1 && (
              <span className="font-medium text-slate-500">
                v{article.version_number}
              </span>
            )}
          </p>
        )}

        {isCurrentEdit ? (
          isBilingualEdit ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <input
                type="text"
                value={editing!.titleFrDraft}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, titleFrDraft: e.target.value } : prev,
                  )
                }
                placeholder="Titre (FR) — facultatif"
                aria-label="Titre français"
                className="w-full text-xl lg:text-2xl font-bold text-gray-900 leading-tight tracking-tight border-0 border-b-2 border-amber-300 focus:border-amber-500 focus:ring-0 outline-none px-0 py-1 bg-transparent placeholder:text-slate-300 placeholder:font-normal placeholder:italic"
              />
              <input
                type="text"
                value={editing!.titleHtDraft}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, titleHtDraft: e.target.value } : prev,
                  )
                }
                placeholder="Tit (HT) — opsyonèl"
                aria-label="Tit kreyòl"
                className="w-full text-xl lg:text-2xl font-bold text-gray-900 leading-tight tracking-tight border-0 border-b-2 border-blue-300 focus:border-blue-500 focus:ring-0 outline-none px-0 py-1 bg-transparent placeholder:text-slate-300 placeholder:font-normal placeholder:italic"
              />
            </div>
          ) : (
            <input
              type="text"
              value={
                currentLang === 'ht'
                  ? editing!.titleHtDraft
                  : editing!.titleFrDraft
              }
              onChange={(e) =>
                setEditing((prev) => {
                  if (!prev) return prev
                  return currentLang === 'ht'
                    ? { ...prev, titleHtDraft: e.target.value }
                    : { ...prev, titleFrDraft: e.target.value }
                })
              }
              placeholder={
                currentLang === 'fr'
                  ? `Titre (${currentLang.toUpperCase()}) — facultatif`
                  : `Tit (${currentLang.toUpperCase()}) — opsyonèl`
              }
              className="w-full text-2xl lg:text-3xl font-bold text-gray-900 mb-3 leading-tight tracking-tight border-0 border-b-2 border-amber-300 focus:border-amber-500 focus:ring-0 outline-none px-0 py-1 bg-transparent placeholder:text-slate-300 placeholder:font-normal placeholder:italic"
            />
          )
        ) : (
          title && (
            <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3 leading-tight tracking-tight">
              {title}
            </h3>
          )
        )}

        {/* NEW: Modification provenance */}
        {MOCK_PROVENANCE.length > 0 && (
          <ul className="mt-4 mb-5 space-y-1.5 text-sm">
            {MOCK_PROVENANCE.map((entry, idx) => {
              const verb =
                entry.kind === 'modified'
                  ? currentLang === 'fr'
                    ? 'Modifié par'
                    : 'Modifye pa'
                  : entry.kind === 'created'
                    ? currentLang === 'fr'
                      ? 'Création'
                      : 'Kreyasyon'
                    : currentLang === 'fr'
                      ? 'Abrogé par'
                      : 'Abwoje pa'
              const Icon = entry.kind === 'created' ? Layers : History
              return (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-slate-700"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>
                    <span className="font-medium text-slate-500">{verb}</span>{' '}
                    {entry.href ? (
                      <a
                        href={entry.href}
                        className="text-primary hover:underline font-medium"
                      >
                        {entry.text_label}
                      </a>
                    ) : (
                      <span className="font-medium">{entry.text_label}</span>
                    )}{' '}
                    <span className="text-slate-500">
                      du {entry.date}
                      {entry.article_ref ? ` — ${entry.article_ref}` : ''}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

      </div>

      {/* Article body — semantic accent rail */}
      <div className="py-6 sm:py-8">
        <article className="max-w-none">
          <div className="relative">
            <div
              className={`absolute -left-3 sm:-left-4 top-0 bottom-0 w-1 bg-gradient-to-b ${
                isCurrentEdit
                  ? 'from-amber-400 to-amber-600'
                  : statusMeta.rail
              } rounded-full`}
            />
            {isCurrentEdit ? (
              <div className="ml-5 sm:ml-6">
                {isBilingualEdit ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1.5">
                        Français (FR)
                      </p>
                      <textarea
                        value={editing!.bodyFrDraft}
                        onChange={(e) =>
                          setEditing((prev) =>
                            prev
                              ? { ...prev, bodyFrDraft: e.target.value }
                              : prev,
                          )
                        }
                        rows={Math.max(
                          6,
                          (editing!.bodyFrDraft.match(/\n/g)?.length ?? 0) + 4,
                        )}
                        placeholder="Texte de l'article (FR)"
                        aria-label="Texte français"
                        className="w-full text-base leading-relaxed text-gray-900 border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 rounded-md px-4 py-3 bg-amber-50/30 outline-none resize-y placeholder:text-slate-400 placeholder:italic font-sans"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-1.5">
                        Kreyòl (HT)
                      </p>
                      <textarea
                        value={editing!.bodyHtDraft}
                        onChange={(e) =>
                          setEditing((prev) =>
                            prev
                              ? { ...prev, bodyHtDraft: e.target.value }
                              : prev,
                          )
                        }
                        rows={Math.max(
                          6,
                          (editing!.bodyHtDraft.match(/\n/g)?.length ?? 0) + 4,
                        )}
                        placeholder="Tèks atik la (HT)"
                        aria-label="Tèks kreyòl"
                        className="w-full text-base leading-relaxed text-gray-900 border border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-md px-4 py-3 bg-blue-50/30 outline-none resize-y placeholder:text-slate-400 placeholder:italic font-sans"
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={
                      currentLang === 'ht'
                        ? editing!.bodyHtDraft
                        : editing!.bodyFrDraft
                    }
                    onChange={(e) =>
                      setEditing((prev) => {
                        if (!prev) return prev
                        return currentLang === 'ht'
                          ? { ...prev, bodyHtDraft: e.target.value }
                          : { ...prev, bodyFrDraft: e.target.value }
                      })
                    }
                    rows={Math.max(
                      6,
                      ((currentLang === 'ht'
                        ? editing!.bodyHtDraft
                        : editing!.bodyFrDraft
                      ).match(/\n/g)?.length ?? 0) + 4,
                    )}
                    placeholder={
                      currentLang === 'fr'
                        ? `Texte de l'article (${currentLang.toUpperCase()})`
                        : `Tèks atik la (${currentLang.toUpperCase()})`
                    }
                    className="w-full text-base lg:text-lg leading-relaxed text-gray-900 border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 rounded-md px-4 py-3 bg-amber-50/30 outline-none resize-y placeholder:text-slate-400 placeholder:italic font-sans"
                  />
                )}
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-slate-500">
                    {isBilingualEdit
                      ? currentLang === 'fr'
                        ? 'Édition bilingue : remplissez les deux colonnes pour synchroniser FR + HT.'
                        : 'Edisyon bilang : ranpli toulède kolòn yo pou senkronize FR + HT.'
                      : currentLang === 'fr'
                        ? `Vous éditez la version française. Les sauts de ligne sont conservés.`
                        : `W ap edite vèsyon kreyòl la. Liy nouvèl yo konsève.`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="rounded-full"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      {currentLang === 'fr' ? 'Annuler' : 'Anile'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveEdit}
                      disabled={saving}
                      className="rounded-full bg-primary text-white hover:bg-primary/90"
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                      )}
                      {currentLang === 'fr'
                        ? 'Enregistrer'
                        : 'Anrejistre'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ml-5 sm:ml-6 max-w-none text-gray-800 text-base lg:text-lg leading-relaxed legal-article">
                {renderArticleBody(content || '', currentLang)}
              </div>
            )}
          </div>
        </article>
      </div>

      {/* Action row — three accordion triggers (no top border, by request) */}
      <div className="pt-5">
        <div className="flex items-center gap-2 flex-wrap">
          <AccordionTrigger
            icon={History}
            label={currentLang === 'fr' ? 'Voir les versions' : 'Wè vèsyon yo'}
            count={MOCK_VERSIONS.length}
            open={openPanel === 'versions'}
            onClick={() => togglePanel('versions')}
          />
          <AccordionTrigger
            icon={ArrowLeftRight}
            label={
              currentLang === 'fr'
                ? 'Comparer les versions'
                : 'Konpare vèsyon'
            }
            open={openPanel === 'compare'}
            onClick={() => togglePanel('compare')}
          />
          <AccordionTrigger
            icon={Layers}
            label={currentLang === 'fr' ? 'Textes liés' : 'Tèks ki gen rapò'}
            count={outboundEntries.length + inboundEntries.length}
            open={openPanel === 'links'}
            onClick={() => togglePanel('links')}
          />
        </div>

        <div ref={panelRef}>
          <AnimatePresence initial={false}>
            {openPanel === 'versions' && (
              <motion.div
                key="versions"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <VersionsPanel
                  versions={MOCK_VERSIONS}
                  currentLang={currentLang}
                />
              </motion.div>
            )}
            {openPanel === 'compare' && (
              <motion.div
                key="compare"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <ComparePanel
                  versions={MOCK_VERSIONS}
                  currentLang={currentLang}
                />
              </motion.div>
            )}
            {openPanel === 'links' && (
              <motion.div
                key="links"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
                    <CitationColumn
                      title={tCite}
                      subtitle={
                        currentLang === 'fr'
                          ? 'Cet article fait référence à'
                          : 'Atik sa a refere ak'
                      }
                      entries={outboundEntries}
                      currentLang={currentLang}
                      direction="outbound"
                    />
                    <CitationColumn
                      title={tCitedBy}
                      subtitle={
                        currentLang === 'fr'
                          ? 'Textes qui s’appuient sur cet article'
                          : 'Tèks ki baze sou atik sa a'
                      }
                      entries={inboundEntries}
                      currentLang={currentLang}
                      direction="inbound"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Article nav — prev | current article | next */}
      <div className="border-t border-gray-200 mt-6 pt-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onPrevious}
            disabled={!hasPrevious}
            className="h-auto py-2 px-4 text-gray-600 hover:text-primary hover:bg-gray-100 group disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl"
          >
            <ChevronLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {currentLang === 'fr' ? 'Article précédent' : 'Atik anvan'}
            </span>
          </Button>

          <span className="text-sm font-semibold text-slate-700 tabular-nums">
            {article.number.toLowerCase().startsWith('article')
              ? article.number
              : `Article ${article.number}`}
          </span>

          <Button
            variant="ghost"
            onClick={onNext}
            disabled={!hasNext}
            className="h-auto py-2 px-4 text-gray-600 hover:text-primary hover:bg-gray-100 group disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {currentLang === 'fr' ? 'Article suivant' : 'Atik apre'}
            </span>
            <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

interface AccordionTriggerProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count?: number
  open: boolean
  onClick: () => void
}

function AccordionTrigger({
  icon: Icon,
  label,
  count,
  open,
  onClick,
}: AccordionTriggerProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all border ${
        open
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-slate-700 border-gray-200 hover:border-primary hover:text-primary'
      }`}
      aria-expanded={open}
    >
      <Icon className="w-4 h-4" />
      <span className="font-medium">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            open ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {count}
        </span>
      )}
      <ChevronRight
        className={`w-3.5 h-3.5 transition-transform ${
          open ? 'rotate-90' : ''
        }`}
      />
    </button>
  )
}

interface VersionsPanelProps {
  versions: VersionEntry[]
  currentLang: 'fr' | 'ht'
}

function VersionsPanel({ versions, currentLang }: VersionsPanelProps) {
  return (
    <div className="pt-6">
      <p className="text-xs text-slate-500 mb-5">
        {currentLang === 'fr'
          ? 'Historique des versions de cet article — du plus récent au plus ancien.'
          : 'Istwa vèsyon atik sa a — pi resan an pi vye.'}
      </p>

      {/* Vertical timeline */}
      <ol className="relative pl-7">
        {/* Continuous line behind dots */}
        <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />

        {versions.map((v, idx) => {
          const isCurrent = v.status === 'in_force'
          const isLast = idx === versions.length - 1
          return (
            <li
              key={v.version}
              className={`relative ${isLast ? '' : 'pb-6'}`}
            >
              {/* Dot on the timeline */}
              <span
                className={`absolute -left-[1.65rem] top-1.5 w-4 h-4 rounded-full border-[3px] flex items-center justify-center ${
                  isCurrent
                    ? 'bg-white border-emerald-500'
                    : 'bg-white border-gray-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isCurrent ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                />
              </span>

              <div className="flex items-baseline gap-3 flex-wrap mb-1">
                <span
                  className={`text-[11px] font-bold uppercase tracking-widest ${
                    isCurrent ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  v{v.version}
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  {v.effective_to
                    ? currentLang === 'fr'
                      ? `Du ${v.effective_from} au ${v.effective_to}`
                      : `${v.effective_from} – ${v.effective_to}`
                    : currentLang === 'fr'
                      ? `Depuis le ${v.effective_from}`
                      : `Depi ${v.effective_from}`}
                </span>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {currentLang === 'fr' ? 'En vigueur' : 'An vigè'}
                  </span>
                )}
              </div>

              {v.amended_by && (
                <p className="text-xs text-slate-500">
                  {currentLang === 'fr' ? 'Modifié par' : 'Modifye pa'}{' '}
                  <a
                    href={v.href ?? '#'}
                    className="text-primary hover:underline font-medium"
                  >
                    {v.amended_by}
                  </a>
                </p>
              )}
            </li>
          )
        })}
      </ol>

      <p className="mt-4 text-[11px] italic text-slate-400">
        {currentLang === 'fr'
          ? 'Données fictives — bientôt connectées.'
          : 'Done fiktif — talè konsa.'}
      </p>
    </div>
  )
}

interface ComparePanelProps {
  versions: VersionEntry[]
  currentLang: 'fr' | 'ht'
}

function ComparePanel({ versions, currentLang }: ComparePanelProps) {
  const [from, setFrom] = useState<number>(versions[1]?.version ?? versions[0].version)
  const [to, setTo] = useState<number>(versions[0].version)

  return (
    <div className="pt-6">
      <p className="text-xs text-slate-500 mb-4">
        {currentLang === 'fr'
          ? 'Sélectionnez deux versions pour comparer.'
          : 'Chwazi de vèsyon pou konpare.'}
      </p>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <Select
          value={String(from)}
          onValueChange={(v) => setFrom(Number(v))}
        >
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.version} value={String(v.version)}>
                v{v.version} — {v.effective_from}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ArrowLeftRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <Select value={String(to)} onValueChange={(v) => setTo(Number(v))}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.version} value={String(v.version)}>
                v{v.version} — {v.effective_from}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            v{from}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            <span className="bg-red-100/70 line-through decoration-red-400 px-1">
              Tout fait quelconque de l’homme
            </span>
            , qui cause à autrui un dommage, oblige celui par la faute duquel
            il est arrivé à le réparer.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            v{to}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            <span className="bg-emerald-100/70 px-1">
              Toute personne
            </span>{' '}
            qui cause à autrui un dommage est tenue de le réparer.
          </p>
        </div>
      </div>
      <p className="mt-4 text-[11px] italic text-slate-400">
        {currentLang === 'fr'
          ? 'Diff fictif — moteur de comparaison à brancher.'
          : 'Diff fiktif — motè konparezon pou konekte.'}
      </p>
    </div>
  )
}

interface CitationColumnProps {
  title: string
  subtitle: string
  entries: CitationEntry[]
  currentLang: 'fr' | 'ht'
  direction: 'outbound' | 'inbound'
}

function CitationColumn({
  title,
  subtitle,
  entries,
  currentLang,
  direction,
}: CitationColumnProps) {
  // Group by relation type
  const grouped = entries.reduce<Record<string, CitationEntry[]>>(
    (acc, entry) => {
      ;(acc[entry.relation] ||= []).push(entry)
      return acc
    },
    {},
  )

  const arrowIcon =
    direction === 'outbound' ? (
      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
    ) : (
      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
    )

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          {arrowIcon}
          <h4 className="text-sm font-bold text-slate-800 tracking-tight">
            {title}
          </h4>
          <span className="text-xs font-medium text-slate-400">
            ({entries.length})
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 italic">
          {currentLang === 'fr' ? 'Aucun lien.' : 'Pa gen lyen.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {Object.entries(grouped).map(([relation, items]) => (
            <li key={relation}>
              <div className="mb-1.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    RELATION_META[relation as CitationEntry['relation']].cls
                  }`}
                >
                  {
                    RELATION_META[relation as CitationEntry['relation']].label[
                      currentLang
                    ]
                  }
                </span>
              </div>
              <ul className="ml-1 space-y-1.5">
                {items.map((c, idx) => (
                  <li key={idx} className="text-sm">
                    {c.href ? (
                      <a
                        href={c.href}
                        className="text-primary hover:underline font-medium"
                      >
                        {c.target_label}
                      </a>
                    ) : (
                      <span className="font-medium text-slate-800">
                        {c.target_label}
                      </span>
                    )}
                    {c.note && (
                      <span className="text-slate-500"> — {c.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

