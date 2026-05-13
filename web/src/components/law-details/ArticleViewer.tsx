'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  GitCompare,
  History,
  Layers,
  Link2,
  Loader2,
  Languages,
  Pencil,
  Plus,
  Share2,
  Trash2,
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
  deleteArticle,
  listArticleVersions,
  resolveArticles,
  updateArticleContent,
  type ArticleContentPatch,
  type ArticleResolved,
  type ArticleVersionRead,
} from '@/lib/api/endpoints'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  mapCitations,
  type CitationEntry,
  type CitationRow,
  type SiblingArticle,
} from './citation-mapping'
import { VersionsPanel, type VersionEntry } from './_panels/VersionsPanel'
import { ComparePanel } from './_panels/ComparePanel'
import { CitationColumn } from './_panels/CitationColumn'
import { AddVersionDialog } from './_panels/AddVersionDialog'
import { AddArticleDialog } from './_panels/AddArticleDialog'
import { RichArticleEditor } from './_editor/RichArticleEditor'
import { isHtmlEffectivelyEmpty, looksLikeHtml } from './_editor/utils'

/** One step in the breadcrumb path from the LegalText down to this article. */
export interface BreadcrumbNode {
  id: number
  level: 'part' | 'book' | 'title' | 'chapter' | 'section' | 'subsection'
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
  }
> = {
  in_force: {
    label: { fr: 'En vigueur', ht: 'An vigè' },
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  abrogated: {
    label: { fr: 'Abrogé', ht: 'Abwoje' },
    cls: 'bg-red-50 text-red-700 border-red-200',
  },
  suspended: {
    label: { fr: 'Suspendu', ht: 'Sispann' },
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  transferred: {
    label: { fr: 'Transféré', ht: 'Transfere' },
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  obsolete: {
    label: { fr: 'Obsolète', ht: 'Demode' },
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
  },
}

const LEVEL_LABELS: Record<
  BreadcrumbNode['level'],
  { fr: string; ht: string }
> = {
  part: { fr: 'Partie', ht: 'Pati' },
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

// Modification provenance ("Modifié par X") was previously rendered
// from a hardcoded MOCK_PROVENANCE constant. Removed — the line will
// come back when the citation graph is wired here (inbound citations
// of relation `modifie` against this article). Until then we don't
// fake the provenance to visitors.

// MOCK_VERSIONS deleted. VersionsPanel + ComparePanel imports remain
// in `_panels/` so the components are ready to wire when the per-
// article versions endpoint ships; the triggers in this file are
// hidden in the meantime.

// MOCK_OUTBOUND / MOCK_INBOUND removed: citations are now fetched live via
// /api/v1/citations and rendered through `outboundEntries` / `inboundEntries`
// computed in the component. See backfill_citations.py for seeding.
//
// RELATION_META (relation → bilingual label + colour classes) was moved
// into the CitationColumn panel where it's consumed.

// ----------------------------------------------------------------------------
// Body renderer — handles French legal enumerations (1°, a), 1)) inside paragraphs.
// TODO(api): once the parser produces structured enumeration data, drop the heuristic.

// Rich-text bodies emitted by the Tiptap editor start with a block-
// level tag (``<p>``, ``<ul>``, etc.). The backend's HTML sanitizer
// allowlists a tight set of tags + a single ``text-align`` style, so
// we can render through ``dangerouslySetInnerHTML`` without further
// scrubbing. Legacy plain-text bodies (imports made before Tiptap
// shipped) fall through to the paragraph splitter below so the
// French-enumeration heuristics still apply.

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
  if (looksLikeHtml(content)) {
    // Sanitized server-side; safe to inject. Wrap in the same legal-
    // article container so prose styles still apply.
    return (
      <div
        className="article-html"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    )
  }
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
  /** Numeric id of the parent legal text. Used by the editor "Add
   *  version" flow to exclude self-amendments from the source-law
   *  picker (a law can't amend itself). */
  lawId?: number
  /** Parent LegalText's publication / promulgation date (ISO
   *  yyyy-mm-dd). Used as the v1 ``effective_from`` fallback in the
   *  Versions panel — historically-imported articles often carry no
   *  per-version date because their publication date lives on the
   *  parent text, not on the article_versions row. */
  lawPublicationDate?: string | null
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
  lawId,
  lawPublicationDate,
}: ArticleViewerProps) {
  const { toast } = useToast()

  // All hooks must run unconditionally — null-article fallback is below.
  const [openPanel, setOpenPanel] = useState<
    'versions' | 'compare' | 'links' | null
  >(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  // Add-version modal — editor opens it from the action row to create
  // a new version anchored to an amending law.
  const [addVersionOpen, setAddVersionOpen] = useState(false)
  // Add-article modal — editor opens it to insert a new article
  // (typically "N-1" or "N bis") immediately after the current one,
  // anchored to the amending law that introduced it. The mode flag
  // toggles between "amendment" (anchored to a source law) and
  // "correction" (parser missed the article, no source law) — both
  // share the same modal component, only the picker differs.
  const [addArticleOpen, setAddArticleOpen] = useState(false)
  const [addArticleMode, setAddArticleMode] = useState<
    'amendment' | 'correction'
  >('amendment')
  // Delete confirmation — staged so the ConfirmDialog can show the
  // version count + amending-law count before the editor commits.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  // Version state — full history for this article. Editor-only fetch
  // (public viewers never need it; the current_version is already
  // inlined in the ArticleEmbed shape they consume). Re-fetched
  // whenever the selected article changes so switching articles
  // doesn't show the previous one's timeline.
  const [versions, setVersions] = useState<ArticleVersionRead[]>([])
  useEffect(() => {
    if (!article || !isEditor) {
      setVersions([])
      return
    }
    const articleId = article.id
    let cancelled = false
    void listArticleVersions(articleId)
      .then((rows) => {
        if (cancelled) return
        // Newest first — versions come back ordered by version_number
        // ascending, but the timeline reads top-to-bottom newest-to-
        // oldest, matching the convention on Légifrance / EUR-Lex.
        setVersions([...rows].reverse())
      })
      .catch(() => {
        if (cancelled) return
        setVersions([])
      })
    return () => {
      cancelled = true
    }
  }, [article?.id, isEditor])

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

  // Map the backend ArticleVersionRead shape into the VersionEntry the
  // VersionsPanel + ComparePanel consume. The panel's "status" field
  // is timeline-style ("in_force" for the latest live version,
  // "historical" for past ones), which is slightly different from the
  // per-article ArticleStatus enum — we treat the *latest* in_force
  // version as the current one and stamp older versions as historical
  // regardless of their own per-version status.
  const versionEntries = useMemo<VersionEntry[]>(() => {
    if (!versions.length) return []
    const sortedAsc = [...versions].sort(
      (a, b) => a.version_number - b.version_number,
    )
    const currentIdx = (() => {
      // Latest in_force wins; fall back to the highest version number.
      for (let i = sortedAsc.length - 1; i >= 0; i--) {
        if (sortedAsc[i].status === 'in_force') return i
      }
      return sortedAsc.length - 1
    })()
    return sortedAsc.map<VersionEntry>((v, i) => ({
      version: v.version_number,
      status:
        i === currentIdx
          ? 'in_force'
          : v.status === 'abrogated'
            ? 'abrogated'
            : 'historical',
      effective_from: v.effective_from ?? '',
      effective_to: v.effective_to ?? null,
      amended_by: null,
      href: null,
    })).reverse() // newest first, matches timeline reading order
  }, [versions])

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
        // Tiptap emits ``<p></p>`` for a cleared editor — treat that
        // as empty so the "FR body is required" rule fires on an
        // empty rich-text doc, not just on an empty plain-text one.
        const bodyIsEmpty = isHtmlEffectivelyEmpty(trimmedBody)
        if (textField === 'text_fr' && bodyIsEmpty) {
          toast(
            currentLang === 'fr'
              ? 'Le texte français est obligatoire.'
              : 'Tèks fransè a obligatwa.',
          )
          return
        }
        ;(patch as Record<string, string | null>)[textField] =
          bodyIsEmpty ? null : trimmedBody
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

        {/* Modification provenance ("Modifié par …") will render here
            once the citation graph is wired in. Hidden for now —
            shipping the mock data confused visitors. */}

      </div>

      {/* Article body — status is already conveyed by the pill above
          (En vigueur / Abrogé / Suspendu / …); a coloured left rail
          duplicated that signal and added visual noise. Editing-state
          framing comes back via the textarea's amber border while
          the editor is typing. */}
      <div className="py-6 sm:py-8">
        <article className="max-w-none">
          <div className="relative">
            {isCurrentEdit ? (
              <div>
                {isBilingualEdit ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1.5">
                        Français (FR)
                      </p>
                      <RichArticleEditor
                        value={editing!.bodyFrDraft}
                        onChange={(html) =>
                          setEditing((prev) =>
                            prev ? { ...prev, bodyFrDraft: html } : prev,
                          )
                        }
                        placeholder="Texte de l'article (FR)"
                        ariaLabel="Texte français"
                        tone="amber"
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-1.5">
                        Kreyòl (HT)
                      </p>
                      <RichArticleEditor
                        value={editing!.bodyHtDraft}
                        onChange={(html) =>
                          setEditing((prev) =>
                            prev ? { ...prev, bodyHtDraft: html } : prev,
                          )
                        }
                        placeholder="Tèks atik la (HT)"
                        ariaLabel="Tèks kreyòl"
                        tone="blue"
                        disabled={saving}
                      />
                    </div>
                  </div>
                ) : (
                  <RichArticleEditor
                    value={
                      currentLang === 'ht'
                        ? editing!.bodyHtDraft
                        : editing!.bodyFrDraft
                    }
                    onChange={(html) =>
                      setEditing((prev) => {
                        if (!prev) return prev
                        return currentLang === 'ht'
                          ? { ...prev, bodyHtDraft: html }
                          : { ...prev, bodyFrDraft: html }
                      })
                    }
                    placeholder={
                      currentLang === 'fr'
                        ? `Texte de l'article (${currentLang.toUpperCase()})`
                        : `Tèks atik la (${currentLang.toUpperCase()})`
                    }
                    ariaLabel={
                      currentLang === 'fr' ? 'Texte français' : 'Tèks kreyòl'
                    }
                    tone="amber"
                    disabled={saving}
                  />
                )}
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-slate-500">
                    {isBilingualEdit
                      ? currentLang === 'fr'
                        ? 'Édition bilingue : remplissez les deux colonnes pour synchroniser FR + HT.'
                        : 'Edisyon bilang : ranpli toulède kolòn yo pou senkronize FR + HT.'
                      : currentLang === 'fr'
                        ? 'Gras, italique, listes et alignement sont conservés à l’enregistrement.'
                        : 'Gra, italik, lis ak aliyman yo konsève lè w anrejistre.'}
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
              <div className="max-w-none text-gray-800 text-base lg:text-lg leading-relaxed legal-article">
                {renderArticleBody(content || '', currentLang)}
              </div>
            )}
          </div>
        </article>
      </div>

      {/* Action row — accordion triggers.
          - "Textes liés" is public-facing, driven by real inbound +
            outbound citations from /api/v1/citations. Hidden when the
            total count is zero.
          - "Versions" + "Comparer" are editor-only. Powered by the
            real /articles/{id}/versions endpoint; the triggers only
            render when there's something useful to show (a multi-
            version history). */}
      {(outboundEntries.length + inboundEntries.length > 0 || isEditor) && (
        <div className="pt-5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Textes liés — visible to the public when there are
                citations to show, and *always* visible in editor mode
                even at zero so the editor can confirm the article
                truly has no links rather than guess from absence. */}
            {(outboundEntries.length + inboundEntries.length > 0 ||
              isEditor) && (
              <AccordionTrigger
                icon={Layers}
                label={currentLang === 'fr' ? 'Textes liés' : 'Tèks ki gen rapò'}
                count={outboundEntries.length + inboundEntries.length}
                open={openPanel === 'links'}
                onClick={() => togglePanel('links')}
              />
            )}
            {isEditor && (
              <>
                {/* Versions — always visible to editors. Even at v1
                    the panel is useful (it shows the in-force date,
                    which is also what "Ajouter une version" will
                    supersede). */}
                <AccordionTrigger
                  icon={Clock}
                  label={currentLang === 'fr' ? 'Versions' : 'Vèsyon'}
                  count={versionEntries.length || undefined}
                  open={openPanel === 'versions'}
                  onClick={() => togglePanel('versions')}
                />
                {/* Comparer — always visible to editors but disabled
                    when there's nothing to compare against. Keeps the
                    affordance discoverable rather than hiding it
                    until a second version exists. */}
                <AccordionTrigger
                  icon={GitCompare}
                  label={currentLang === 'fr' ? 'Comparer' : 'Konpare'}
                  open={openPanel === 'compare'}
                  disabled={versionEntries.length < 2}
                  onClick={() => togglePanel('compare')}
                  disabledTitle={
                    currentLang === 'fr'
                      ? 'Disponible dès la seconde version'
                      : 'Disponib depi dezyèm vèsyon an'
                  }
                />
              </>
            )}
            {/* Editor-only "Add version" affordance. Always visible in
                editor mode so the *first* amendment can be created
                even when the article only has its initial version. */}
            {isEditor && lawId != null && (
              <button
                type="button"
                onClick={() => setAddVersionOpen(true)}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-colors"
                title={
                  currentLang === 'fr'
                    ? 'Créer une nouvelle version anchored à une loi modifiante'
                    : 'Kreye yon nouvo vèsyon ankre nan yon lwa modifikatè'
                }
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">
                  {currentLang === 'fr' ? 'Ajouter une version' : 'Ajoute yon vèsyon'}
                </span>
              </button>
            )}
            {/* Editor-only "Insert article after this one" — covers the
                amendment-insertion case (Article 9-1, 9 bis…). The new
                article slots immediately after the current one and
                inherits its TOC heading. Distinct from "Ajouter une
                version" — that supersedes the current article's
                content; this introduces a new article entirely. */}
            {isEditor && lawId != null && (
              <button
                type="button"
                onClick={() => {
                  setAddArticleMode('amendment')
                  setAddArticleOpen(true)
                }}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-colors"
                title={
                  currentLang === 'fr'
                    ? 'Insérer un nouvel article via amendement (ex. Article 9-1, 9 bis…)'
                    : 'Mete yon nouvo atik via amannman (egz. Atik 9-1, 9 bis…)'
                }
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">
                  {currentLang === 'fr'
                    ? 'Ajouter un article (amendement)'
                    : 'Ajoute yon atik (amannman)'}
                </span>
              </button>
            )}
            {/* Parser-correction sibling — same modal, source-law
                picker hidden. Used when the OCR/parser missed an
                article from the original text. */}
            {isEditor && lawId != null && (
              <button
                type="button"
                onClick={() => {
                  setAddArticleMode('correction')
                  setAddArticleOpen(true)
                }}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm bg-white text-slate-700 border border-slate-200 hover:border-slate-400 hover:text-slate-900 transition-colors"
                title={
                  currentLang === 'fr'
                    ? 'Le parser a oublié un article du texte original ? Ajoutez-le ici.'
                    : 'Pasè a bliye yon atik nan tèks orijinal la ? Ajoute l isit.'
                }
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">
                  {currentLang === 'fr'
                    ? 'Corriger le parser'
                    : 'Korije pasè a'}
                </span>
              </button>
            )}
            {/* Delete this article — destructive, gated behind a
                ConfirmDialog showing the version count. */}
            {isEditor && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm bg-white text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors"
                title={
                  currentLang === 'fr'
                    ? "Supprimer cet article du texte (parser-cleanup)"
                    : 'Efase atik sa nan tèks la (netwaye pasè)'
                }
              >
                <Trash2 className="w-4 h-4" />
                <span className="font-medium">
                  {currentLang === 'fr' ? 'Supprimer' : 'Efase'}
                </span>
              </button>
            )}
          </div>

          <div ref={panelRef}>
            <AnimatePresence initial={false}>
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
              {openPanel === 'versions' && (
                <motion.div
                  key="versions"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <VersionsPanel
                    versions={versionEntries}
                    currentLang={currentLang}
                    defaultFromDate={lawPublicationDate}
                  />
                </motion.div>
              )}
              {openPanel === 'compare' && versionEntries.length >= 2 && (
                <motion.div
                  key="compare"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <ComparePanel
                    versions={versionEntries}
                    currentLang={currentLang}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Article nav — prev | current article | next.
          Mobile (< sm): chevron-only buttons + the centered article
          number, otherwise the "ARTICLE PRÉCÉDENT" / "ARTICLE SUIVANT"
          labels overflow the narrow content column.
          Center number is bilingual — "Article 1" in fr, "Atik 1" in
          ht — and tolerates inputs that already carry the prefix. */}
      <div className="border-t border-gray-200 mt-6 pt-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label={currentLang === 'fr' ? 'Article précédent' : 'Atik anvan'}
            className="h-auto py-2 px-3 sm:px-4 text-gray-600 hover:text-primary hover:bg-gray-100 group disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl"
          >
            <ChevronLeft className="w-4 h-4 sm:mr-2 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest text-gray-500">
              {currentLang === 'fr' ? 'Article précédent' : 'Atik anvan'}
            </span>
          </Button>

          <span className="text-sm font-semibold text-slate-700 tabular-nums">
            {(() => {
              // Strip any leading "Article" / "Atik" so we can re-prefix
              // consistently in the active language.
              const stripped = article.number
                .replace(/^(article|atik)\s+/i, '')
                .trim()
              const prefix = currentLang === 'ht' ? 'Atik' : 'Article'
              return `${prefix} ${stripped}`
            })()}
          </span>

          <Button
            variant="ghost"
            onClick={onNext}
            disabled={!hasNext}
            aria-label={currentLang === 'fr' ? 'Article suivant' : 'Atik apre'}
            className="h-auto py-2 px-3 sm:px-4 text-gray-600 hover:text-primary hover:bg-gray-100 group disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl"
          >
            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest text-gray-500">
              {currentLang === 'fr' ? 'Article suivant' : 'Atik apre'}
            </span>
            <ChevronRight className="w-4 h-4 sm:ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>

      {/* Editor-only add-version modal. Mounted at the root so the
          Radix portal positions it relative to the viewport, not the
          article column. Refetches the version list on success via
          ``onCreated`` so the timeline reflects the new entry. */}
      {isEditor && lawId != null && (
        <AddVersionDialog
          open={addVersionOpen}
          onOpenChange={setAddVersionOpen}
          articleId={article.id}
          articleNumber={article.number}
          currentTextFr={content}
          currentTextHt={null}
          currentTitleFr={title ?? null}
          excludeLegalTextId={lawId}
          lang={currentLang}
          onCreated={() => {
            void listArticleVersions(article.id).then((rows) => {
              setVersions([...rows].reverse())
            })
            onArticleSaved?.()
          }}
        />
      )}
      {/* Editor-only insert-article modal — companion to AddVersion.
          Slots a new article (Article 9-1, 9 bis…) right after the
          current one. ``onCreated`` triggers a parent refetch so the
          TOC and article-nav pick up the new row immediately. The
          ``mode`` prop is reset by the two trigger buttons in the
          action row above. */}
      {isEditor && lawId != null && lawSlug && (
        <AddArticleDialog
          open={addArticleOpen}
          onOpenChange={setAddArticleOpen}
          lawSlug={lawSlug}
          lawId={lawId}
          afterArticleId={article.id}
          afterArticleLabel={
            currentLang === 'ht'
              ? `Atik ${article.number}`
              : `Article ${article.number}`
          }
          mode={addArticleMode}
          lang={currentLang}
          onCreated={() => onArticleSaved?.()}
        />
      )}
      {/* Delete-article confirm. Hard delete with cascade — the
          article and all its versions are wiped, plus any LegalChange
          rows targeting it. Confirms with the version count so the
          editor sees what's about to be lost. */}
      {isEditor && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={(o) => {
            if (!o && !deleting) setDeleteOpen(false)
          }}
          onConfirm={async () => {
            setDeleting(true)
            try {
              await deleteArticle(article.id)
              setDeleteOpen(false)
              onArticleSaved?.()
            } catch (e) {
              toast(
                currentLang === 'fr'
                  ? `Échec : ${(e as any)?.body?.detail ?? (e as Error).message}`
                  : `Echèk : ${(e as any)?.body?.detail ?? (e as Error).message}`,
              )
            } finally {
              setDeleting(false)
            }
          }}
          title={
            currentLang === 'fr'
              ? `Supprimer l’article ${article.number} ?`
              : `Efase atik ${article.number} ?`
          }
          description={
            <div className="space-y-2">
              <p>
                {currentLang === 'fr'
                  ? 'Cette suppression est irréversible. Elle retire :'
                  : 'Efaze sa pa ka anile. Li retire :'}
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>
                  {versions.length || 1}{' '}
                  {currentLang === 'fr'
                    ? versions.length > 1
                      ? 'versions de l’article'
                      : "version de l'article"
                    : 'vèsyon atik la'}
                </li>
                <li>
                  {currentLang === 'fr'
                    ? "tout lien d'amendement entrant pointant sur cet article"
                    : 'tout lyen amannman ki pwente sou atik sa'}
                </li>
              </ul>
            </div>
          }
          confirmLabel={
            currentLang === 'fr'
              ? 'Supprimer définitivement'
              : 'Efase definitivman'
          }
          cancelLabel={currentLang === 'fr' ? 'Annuler' : 'Anile'}
          destructive
          loading={deleting}
        />
      )}
    </motion.div>
  )
}

interface AccordionTriggerProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count?: number
  open: boolean
  onClick: () => void
  /** When true, the trigger is rendered greyed-out and ignores clicks.
   *  Used for editor-only triggers that should stay visible (so the
   *  affordance is discoverable) but aren't currently actionable —
   *  e.g. "Comparer" before a second version exists. */
  disabled?: boolean
  /** Tooltip shown on the disabled trigger, explaining why it's
   *  inactive. Ignored when ``disabled`` is false. */
  disabledTitle?: string
}

function AccordionTrigger({
  icon: Icon,
  label,
  count,
  open,
  onClick,
  disabled,
  disabledTitle,
}: AccordionTriggerProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      title={disabled ? disabledTitle : undefined}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all border ${
        disabled
          ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
          : open
            ? 'bg-primary text-white border-primary'
            : 'bg-white text-slate-700 border-gray-200 hover:border-primary hover:text-primary'
      }`}
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

