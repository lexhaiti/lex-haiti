'use client'

import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  PenLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Article {
  number: string
  heading_id?: number | null
  chapter?: string | null
  title_fr?: string | null
  title_ht?: string | null
  content_fr?: string | null
  content_ht?: string | null
  word_count?: number
  bookmarked?: boolean
}

interface Heading {
  id: number
  key: string
  parent_id?: number | null
  level?: string | null
  number?: string | null
  title_fr?: string | null
  title_ht?: string | null
  content_fr?: string | null
  content_ht?: string | null
  position?: number
}

/** A node in the heading tree with attached articles */
interface TocNode {
  heading: Heading
  articles: Article[]
  children: TocNode[]
}

interface TableOfContentsProps {
  articles: Article[]
  headings?: Heading[]
  currentLang: 'fr' | 'ht'
  onArticleSelect: (article: Article) => void
  selectedArticle?: string
  /** Search query driven by the page-level search panel above the article column. */
  externalQuery?: string
  hasPreamble?: boolean
  onPreambleClick?: () => void
  hasVisas?: boolean
  onVisasClick?: () => void
  hasConsiderants?: boolean
  onConsiderantsClick?: () => void
  /** Editor mode toggles inline heading-title editing. Public viewers
   *  see the same TOC with no edit affordances. */
  isEditor?: boolean
  /** Save handler for a heading-title inline edit. Called with the
   *  heading's database id and the new title in the current language.
   *  Parent is responsible for refetching the law so the new title
   *  flows back into the tree. */
  onHeadingTitleSave?: (
    headingId: number,
    field: 'title_fr' | 'title_ht',
    next: string,
  ) => Promise<void>
  /** Delete handler for a heading (Titre / Chapitre / Section / …).
   *  Receives the heading id and a flag indicating whether to lift
   *  child articles + sub-headings to the parent before deletion.
   *  Parent component shows a ConfirmDialog before invoking this and
   *  refetches the law on success. */
  onHeadingDelete?: (
    headingId: number,
    reparentChildren: boolean,
  ) => Promise<void>
  /** Open the "Add heading" modal anchored after this heading.
   *  ``afterHeading`` is the heading the new node should slot after;
   *  parent component owns the modal state. */
  onAddSiblingHeading?: (afterHeading: Heading) => void
  /** Open the "Add heading" modal as a child of this heading (used
   *  by the "+" button at the top of an expanded subtree). */
  onAddChildHeading?: (parent: Heading) => void
  /** Open the "Add heading" modal at the text root (no parent). */
  onAddRootHeading?: () => void
  /** Ordered list of heading ids on the path from the LegalText root
   *  down to the currently selected article (Titre → Chapitre → …).
   *  Every heading in this set is rendered in the active colour (red)
   *  so the path stays visible even if the article isn't scrolled
   *  into view — like a breadcrumb embedded in the tree.
   *  Auto-expanded on selection so the path is always visible. */
  activeHeadingIds?: number[]
}

/** Human-readable label for a heading level, prefixed onto the bare
 *  identifier ("I", "1", "A") so the TOC shows "Titre I" / "Chapitre 1"
 *  / "Section A" instead of relying on indentation alone. Matches how
 *  Haitian/French lawyers reference structural divisions in citations
 *  ("Titre III, Chapitre II"), so the UI reads the same way the source
 *  does. Unknown / missing levels fall back to the bare number. */
const LEVEL_LABELS: Record<string, { fr: string; ht: string }> = {
  part: { fr: 'Partie', ht: 'Pati' },
  book: { fr: 'Livre', ht: 'Liv' },
  title: { fr: 'Titre', ht: 'Tit' },
  chapter: { fr: 'Chapitre', ht: 'Chapit' },
  section: { fr: 'Section', ht: 'Seksyon' },
  subsection: { fr: 'Sous-section', ht: 'Sou-seksyon' },
}

function formatHeadingNumber(
  level: string | null | undefined,
  number: string | null | undefined,
  lang: 'fr' | 'ht',
): string {
  const num = (number ?? '').trim()
  if (!num) return ''
  const lbl = level ? LEVEL_LABELS[level] : undefined
  if (!lbl) return num
  return `${lbl[lang]} ${num}`
}

/** Render the per-language article-number label for a row in the TOC
 *  or the breadcrumb / reader header.
 *
 *  French legal tradition stores the first article as the literal
 *  string ``"premier"`` (and its alinéas as ``premier-1``,
 *  ``premier-2`` …). That spelling has no direct equivalent in Kreyòl:
 *  N° 36-A writes ``Atik 1`` / ``1-1`` in Arabic numerals. We map
 *  the FR canonical number to its HT counterpart here so the TOC,
 *  the reader header, and any breadcrumb stay consistent without
 *  needing per-article ``number_ht`` columns in the DB.
 *
 *  Pre-numbered legacy strings starting with "article" are returned
 *  verbatim — the parser produced them whole and we shouldn't
 *  double-prefix.
 */
function formatArticleNumber(
  rawNumber: string,
  lang: 'fr' | 'ht',
): string {
  const num = rawNumber.trim()
  if (!num) return ''
  if (num.toLowerCase().startsWith('article')) return num
  const prefix = lang === 'ht' ? 'Atik' : 'Art.'
  // "premier" → "1" (HT only). Sub-articles ``premier-N`` → ``1-N``.
  const ht = num === 'premier'
    ? '1'
    : num.startsWith('premier-')
      ? `1-${num.slice('premier-'.length)}`
      : num
  return `${prefix} ${lang === 'ht' ? ht : num}`
}

/** TOC build result. ``roots`` is the heading tree (each node carries
 *  its attached articles + sub-nodes). ``orphans`` is the flat list
 *  of articles with no ``heading_id`` — they render at the very top
 *  of the TOC, *without* a wrapping heading row. (We used to synthesize
 *  a "Dispositions générales" header for them, which surprised editors
 *  who added an article without specifying a section.) */
type TocBuildResult = { roots: TocNode[]; orphans: Article[] }

/** Build a tree from flat headings + attach articles to their heading nodes */
function buildTocTree(headings: Heading[], articles: Article[]): TocBuildResult {
  // Map heading id -> TocNode
  const nodeMap = new Map<number, TocNode>()
  for (const h of headings) {
    nodeMap.set(h.id, { heading: h, articles: [], children: [] })
  }

  // Attach articles to their heading; articles with no/unknown
  // heading_id end up in ``orphans`` and render flat at the TOC root.
  const orphans: Article[] = []
  for (const article of articles) {
    if (article.heading_id && nodeMap.has(article.heading_id)) {
      nodeMap.get(article.heading_id)!.articles.push(article)
    } else {
      orphans.push(article)
    }
  }

  // Build parent-child relationships
  const roots: TocNode[] = []
  for (const h of headings) {
    const node = nodeMap.get(h.id)!
    if (h.parent_id && nodeMap.has(h.parent_id)) {
      nodeMap.get(h.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort children by position
  const sortNodes = (nodes: TocNode[]) => {
    nodes.sort(
      (a, b) => (a.heading.position ?? 0) - (b.heading.position ?? 0),
    )
    for (const n of nodes) sortNodes(n.children)
  }
  sortNodes(roots)

  return { roots, orphans }
}

/** Fallback when no headings exist: every article is an orphan. The
 *  previous behaviour synthesised a "Dispositions générales" wrapper
 *  per ``chapter`` string, but the chapter field was rarely populated
 *  and the wrapper was misleading — flat works better. */
function buildFlatGroups(articles: Article[]): TocBuildResult {
  return { roots: [], orphans: articles.slice() }
}

/** Count all articles in a node and its descendants */
function countArticles(node: TocNode): number {
  return (
    node.articles.length +
    node.children.reduce((sum, c) => sum + countArticles(c), 0)
  )
}

/** Collect all articles from a tree (for filtering) */
function collectAllArticles(nodes: TocNode[]): Article[] {
  const result: Article[] = []
  const walk = (n: TocNode) => {
    result.push(...n.articles)
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return result
}

/** Filter tree by search query, returning a new tree with only matching articles */
function filterTree(
  nodes: TocNode[],
  query: string,
  lang: 'fr' | 'ht',
): TocNode[] {
  if (!query.trim()) return nodes
  const q = query.toLowerCase()

  const filterNode = (node: TocNode): TocNode | null => {
    const matchingArticles = node.articles.filter((a) => {
      const title = lang === 'ht' && a.title_ht ? a.title_ht : a.title_fr
      const content =
        lang === 'ht' && a.content_ht ? a.content_ht : a.content_fr
      return (
        a.number?.toLowerCase().includes(q) ||
        title?.toLowerCase().includes(q) ||
        content?.toLowerCase().includes(q)
      )
    })

    const filteredChildren = node.children
      .map(filterNode)
      .filter(Boolean) as TocNode[]

    if (matchingArticles.length === 0 && filteredChildren.length === 0) {
      return null
    }

    return { ...node, articles: matchingArticles, children: filteredChildren }
  }

  return nodes.map(filterNode).filter(Boolean) as TocNode[]
}

export default function TableOfContents({
  articles = [],
  headings = [],
  currentLang = 'fr',
  onArticleSelect,
  selectedArticle,
  externalQuery,
  hasPreamble,
  onPreambleClick,
  hasVisas,
  onVisasClick,
  hasConsiderants,
  onConsiderantsClick,
  isEditor = false,
  onHeadingTitleSave,
  onHeadingDelete,
  onAddSiblingHeading,
  onAddChildHeading,
  onAddRootHeading,
  activeHeadingIds,
}: TableOfContentsProps) {
  // Lookup-friendly set for "is this heading on the active path?"
  // checks during render. Memoised so we don't rebuild it on every
  // mouseenter / keystroke.
  const activePathSet = useMemo(
    () => new Set(activeHeadingIds ?? []),
    [activeHeadingIds],
  )
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({})
  const searchQuery = externalQuery ?? ''

  // Inline-edit state for heading titles. Only one heading can be in
  // edit mode at a time — keyed by heading_id so the right row gets
  // its textbox. Local draft is held here, not in the parent — the
  // parent only learns about a change when the editor saves.
  const [editingHeadingId, setEditingHeadingId] = useState<number | null>(null)
  const [headingDraft, setHeadingDraft] = useState<string>('')
  const [headingSaving, setHeadingSaving] = useState<boolean>(false)
  const [headingError, setHeadingError] = useState<string | null>(null)
  // Pending-delete state for the heading-delete ConfirmDialog. Set
  // when the editor clicks the Trash icon on a heading row; cleared
  // on confirm or cancel. The dialog mounts once at the bottom of
  // the tree so we don't render one per row.
  const [pendingDelete, setPendingDelete] = useState<Heading | null>(null)
  const [deletingHeading, setDeletingHeading] = useState(false)

  function startEditHeading(h: Heading) {
    const current =
      (currentLang === 'ht' ? h.title_ht : h.title_fr) ?? ''
    setEditingHeadingId(h.id)
    setHeadingDraft(current)
    setHeadingError(null)
  }
  function cancelEditHeading() {
    setEditingHeadingId(null)
    setHeadingDraft('')
    setHeadingError(null)
  }
  async function saveEditHeading(h: Heading) {
    if (!onHeadingTitleSave) return
    setHeadingSaving(true)
    setHeadingError(null)
    try {
      const field: 'title_fr' | 'title_ht' =
        currentLang === 'ht' ? 'title_ht' : 'title_fr'
      await onHeadingTitleSave(h.id, field, headingDraft.trim())
      cancelEditHeading()
    } catch (e) {
      setHeadingError(e instanceof Error ? e.message : String(e))
    } finally {
      setHeadingSaving(false)
    }
  }

  // Build the heading tree. ``orphans`` is the flat list of articles
  // with no ``heading_id`` — they render at the top of the TOC without
  // a wrapping heading row.
  const tocTree = useMemo(() => {
    if (headings.length > 0) {
      return buildTocTree(headings, articles)
    }
    return buildFlatGroups(articles)
  }, [headings, articles])

  // Filter by search — runs over the heading tree only; orphans use a
  // dedicated filter so a search query like "1382" finds an orphan
  // article that no heading contains.
  const filteredTree = useMemo(
    () => filterTree(tocTree.roots, searchQuery, currentLang),
    [tocTree.roots, searchQuery, currentLang],
  )
  const filteredOrphans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return tocTree.orphans
    return tocTree.orphans.filter((a) => {
      const title =
        currentLang === 'ht' && a.title_ht ? a.title_ht : a.title_fr
      const content =
        currentLang === 'ht' && a.content_ht ? a.content_ht : a.content_fr
      return (
        a.number?.toLowerCase().includes(q) ||
        title?.toLowerCase().includes(q) ||
        content?.toLowerCase().includes(q)
      )
    })
  }, [tocTree.orphans, searchQuery, currentLang])

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const expandAll = () => {
    const keys: Record<string, boolean> = {}
    const walk = (nodes: TocNode[]) => {
      for (const n of nodes) {
        keys[n.heading.key] = true
        walk(n.children)
      }
    }
    walk(tocTree.roots)
    setExpandedSections(keys)
  }

  const collapseAll = () => setExpandedSections({})

  // Accordion-style expansion: when an article is selected, ONLY the
  // headings on the path to that article stay expanded. Every other
  // branch closes. The intent is "let me see exactly where I am, no
  // distractions" — clicking Article 89 in Titre III shouldn't leave
  // Titre II's full subtree open and forcing the user to scroll past
  // it.
  //
  // Manual user actions (toggleSection / expandAll / collapseAll)
  // override the accordion: once you click a chevron to open or close
  // a branch, that survives until the NEXT article selection. The
  // accordion only re-applies when `activeHeadingIds` changes, i.e.
  // when a new article is picked — not on every render.
  React.useEffect(() => {
    if (!activeHeadingIds || activeHeadingIds.length === 0) return
    const idToKey = new Map(headings.map((h) => [h.id, h.key]))
    const activeKeys = new Set(
      activeHeadingIds
        .map((id) => idToKey.get(id))
        .filter((k): k is string => Boolean(k)),
    )
    setExpandedSections(() => {
      const next: Record<string, boolean> = {}
      for (const key of activeKeys) {
        next[key] = true
      }
      return next
    })
  }, [activeHeadingIds, headings])

  // Scroll the selected article into view inside the TOC. Two
  // requestAnimationFrame ticks let React + framer-motion settle the
  // expand-collapse from the accordion effect above before we measure
  // the target's position — otherwise the target is still offscreen
  // (or doesn't yet exist in the DOM) when scrollIntoView fires.
  //
  // ``block: 'center'`` keeps the row visually centred in the scroll
  // viewport with surrounding context — ``nearest`` would skip the
  // scroll when the target is already barely on-screen, which feels
  // sticky when navigating sequentially through articles.
  React.useEffect(() => {
    if (!selectedArticle) return
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = document.getElementById(`toc-article-${selectedArticle}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [selectedArticle, expandedSections])

  /** Render a single heading node recursively */
  const renderNode = (node: TocNode, depth: number = 0) => {
    const { heading, articles: nodeArticles, children } = node
    const isExpanded = !!expandedSections[heading.key]
    // True when this heading is an ancestor of (or contains) the
    // currently selected article. Used to red-highlight the entire
    // path from the root down to the article, so the user always
    // sees the structural context — like a breadcrumb embedded in
    // the tree, not just on the article row itself.
    const isOnActivePath = activePathSet.has(heading.id)

    const headingLabel =
      currentLang === 'ht' && heading.title_ht
        ? heading.title_ht
        : heading.title_fr
    const headingContent =
      currentLang === 'ht' && heading.content_ht
        ? heading.content_ht
        : heading.content_fr

    // Level-based styling
    const isTopLevel = depth === 0
    const indent = depth > 0 ? `ml-${Math.min(depth * 3, 9)}` : ''

    return (
      <div key={heading.key} className={`mb-1 ${indent}`}>
        {/* Section header — rendered as a button-like div, not a real
            <button>, because in editor mode the row contains inline
            action buttons (pencil to rename, plus to insert sibling).
            A <button> inside a <button> is invalid HTML and trips
            React's hydration check. Keyboard / a11y semantics are
            preserved via role + tabIndex + onKeyDown. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleSection(heading.key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleSection(heading.key)
            }
          }}
          className={`w-full flex flex-col gap-1 px-3 py-2 text-left transition-colors group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-sm ${
            isTopLevel ? '' : 'py-1.5'
          }`}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-red-600 flex-shrink-0" />
            ) : (
              <ChevronRight
                className={`w-4 h-4 flex-shrink-0 transition-colors ${
                  isOnActivePath
                    ? 'text-red-600'
                    : 'text-gray-400 group-hover:text-red-600'
                }`}
              />
            )}

            <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
              {heading.number && (
                <span
                  className={`font-black uppercase tracking-widest transition-colors flex-shrink-0 ${
                    isTopLevel ? 'text-xs' : 'text-[10px]'
                  } ${
                    isOnActivePath
                      ? 'text-red-600'
                      : 'text-gray-900 group-hover:text-red-600'
                  }`}
                >
                  {formatHeadingNumber(
                    heading.level,
                    heading.number,
                    currentLang,
                  )}
                </span>
              )}
              {heading.number && (headingLabel || isEditor) && (
                <span
                  className="text-gray-300 flex-shrink-0 text-[10px]"
                  aria-hidden
                >
                  ·
                </span>
              )}
              {editingHeadingId === heading.id ? (
                /* Inline edit mode for this heading title. Clicking
                   inside doesn't propagate to the toggle button. */
                <span
                  className="flex items-center gap-1.5 flex-1 min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    autoFocus
                    value={headingDraft}
                    disabled={headingSaving}
                    onChange={(e) => setHeadingDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveEditHeading(heading)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEditHeading()
                      }
                    }}
                    className="flex-1 min-w-0 rounded-md border border-amber-300 bg-amber-50/50 px-2 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    placeholder={
                      currentLang === 'fr'
                        ? 'Titre de la section…'
                        : 'Tit seksyon an…'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => saveEditHeading(heading)}
                    disabled={headingSaving}
                    className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                    aria-label={currentLang === 'fr' ? 'Enregistrer' : 'Sove'}
                  >
                    {headingSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditHeading}
                    disabled={headingSaving}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                    aria-label={currentLang === 'fr' ? 'Annuler' : 'Anile'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ) : (
                <>
                  {headingLabel ? (
                    <span
                      className={`text-sm font-semibold transition-colors line-clamp-2 min-w-0 ${
                        isOnActivePath
                          ? 'text-red-600'
                          : 'text-gray-700 group-hover:text-red-600'
                      }`}
                    >
                      {headingLabel}
                      {/* Page is Kreyòl but this heading only has a
                          French title → flag the fallback so editors
                          and readers know it isn't translated yet. */}
                      {currentLang === 'ht' && !heading.title_ht && heading.title_fr && (
                        <span
                          className="ml-1.5 inline-flex align-middle text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1 py-0 cursor-help"
                          title="Poko tradwi an kreyòl"
                        >
                          FR
                        </span>
                      )}
                    </span>
                  ) : isEditor ? (
                    /* Editor sees a placeholder for missing title so
                       they can click to add one — the parser sometimes
                       finds the number but not the title (truncated
                       OCR). */
                    <span className="text-sm italic text-slate-400 line-clamp-2 min-w-0">
                      {currentLang === 'fr' ? 'Sans titre' : 'San tit'}
                    </span>
                  ) : null}
                  {isEditor && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditHeading(heading)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-primary flex-shrink-0"
                      aria-label={
                        currentLang === 'fr'
                          ? 'Modifier le titre'
                          : 'Modifye tit la'
                      }
                    >
                      <PenLine className="w-3 h-3" />
                    </button>
                  )}
                  {isEditor && onAddSiblingHeading && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddSiblingHeading(heading)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-emerald-600 flex-shrink-0"
                      aria-label={
                        currentLang === 'fr'
                          ? 'Ajouter une section après celle-ci'
                          : 'Ajoute yon seksyon apre sa'
                      }
                      title={
                        currentLang === 'fr'
                          ? 'Ajouter une section après celle-ci (parser-cleanup)'
                          : 'Ajoute yon seksyon apre sa (netwaye pasè)'
                      }
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                  {isEditor && onHeadingDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingDelete(heading)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 flex-shrink-0"
                      aria-label={
                        currentLang === 'fr'
                          ? 'Supprimer cette section'
                          : 'Efase seksyon sa'
                      }
                      title={
                        currentLang === 'fr'
                          ? 'Supprimer (parser-cleanup)'
                          : 'Efase (netwaye pasè)'
                      }
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>

          </div>

          {headingError && editingHeadingId === heading.id && (
            <p className="text-[11px] text-red-600 ml-6">{headingError}</p>
          )}

          {headingContent && isExpanded && (
            <p className="ml-6 text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
              {headingContent}
            </p>
          )}
        </div>

        {/* Expanded content: articles + child headings */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {/* Direct articles */}
              {nodeArticles.length > 0 && (
                <div className="ml-6 mt-1 mb-2">
                  {nodeArticles.map((article) => {
                    const isSelected = selectedArticle === article.number
                    const title =
                      currentLang === 'ht' && article.title_ht
                        ? article.title_ht
                        : article.title_fr

                    return (
                      <button
                        key={article.number}
                        id={`toc-article-${article.number}`}
                        onClick={() => onArticleSelect(article)}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors group/item ${
                          isSelected
                            ? 'text-red-600 font-semibold'
                            : 'text-gray-600 hover:text-red-600'
                        }`}
                      >
                        <FileText
                          className={`w-3.5 h-3.5 flex-shrink-0 ${
                            isSelected
                              ? 'text-red-600'
                              : 'text-gray-400 group-hover/item:text-red-600 transition-colors'
                          }`}
                        />
                        <span
                          className={`flex-shrink-0 tabular-nums ${
                            isSelected ? '' : 'text-gray-900'
                          }`}
                        >
                          {formatArticleNumber(article.number, currentLang)}
                        </span>
                        {title && (
                          <span className="text-xs text-gray-500 truncate min-w-0">
                            — {title}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Child heading nodes (recursive) */}
              {children.length > 0 && (
                <div className="ml-2">
                  {children.map((child) => renderNode(child, depth + 1))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col max-w-full">
      {/* Header */}
      <div className="pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {currentLang === 'fr' ? 'Sommaire' : 'Somè'}
          </div>
          <div className="flex items-center gap-2">
            {/* Editor-only "Add at root" — opens the AddHeadingDialog
                with no anchor, creating a new top-level Titre / Livre /
                Partie. Sub-headings get their own + button on hover. */}
            {isEditor && onAddRootHeading && (
              <button
                onClick={onAddRootHeading}
                className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors"
                title={
                  currentLang === 'fr'
                    ? 'Ajouter une section à la racine'
                    : 'Ajoute yon seksyon nan rasin'
                }
                aria-label={
                  currentLang === 'fr'
                    ? 'Ajouter une section à la racine'
                    : 'Ajoute yon seksyon nan rasin'
                }
              >
                <Plus className="w-3 h-3 text-emerald-600" />
              </button>
            )}
            <button
              onClick={expandAll}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title={currentLang === 'fr' ? 'Tout ouvrir' : 'Ouvri tout'}
            >
              <Maximize2 className="w-3 h-3 text-gray-500" />
            </button>
            <button
              onClick={collapseAll}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title={currentLang === 'fr' ? 'Tout fermer' : 'Fèmen tout'}
            >
              <Minimize2 className="w-3 h-3 text-gray-500" />
            </button>
          </div>
        </div>

      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="pt-3">
          {hasPreamble && onPreambleClick && (
            <button
              onClick={onPreambleClick}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:text-red-600 transition-colors mb-1"
            >
              <ChevronRight className="w-4 h-4 text-red-600 flex-shrink-0" />
              {/* Kreyòl: "Premye koze" is the canonical translation
                  used in N° 36-A — keep them aligned. The previous
                  "Preanmbil" was a literal anglicisation that doesn't
                  match the Konstitisyon's own wording. */}
              <span>{currentLang === 'fr' ? 'Préambule' : 'Premye koze'}</span>
            </button>
          )}
          {hasVisas && onVisasClick && (
            <button
              onClick={onVisasClick}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:text-red-600 transition-colors mb-1 ml-3"
            >
              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {/* Kreyòl uses "Viza" (z, not s) — matches the
                  Konstitisyon's own orthography. */}
              <span>{currentLang === 'fr' ? 'Visas' : 'Viza'}</span>
            </button>
          )}
          {hasConsiderants && onConsiderantsClick && (
            <button
              onClick={onConsiderantsClick}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:text-red-600 transition-colors mb-1 ml-3"
            >
              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>{currentLang === 'fr' ? 'Considérants' : 'Konsideran'}</span>
            </button>
          )}
          {/* Orphan articles — sit at the top of the TOC scroll area,
              with no wrapping heading row. Used to be a synthetic
              "Dispositions générales" group; that was misleading
              because the title was made up by the renderer. Each row
              is the same button used inside renderNode for attached
              articles. */}
          {filteredOrphans.length > 0 && (
            <div className="mb-3">
              {filteredOrphans.map((article) => {
                const isSelected = selectedArticle === article.number
                const title =
                  currentLang === 'ht' && article.title_ht
                    ? article.title_ht
                    : article.title_fr
                return (
                  <button
                    key={article.number}
                    id={`toc-article-${article.number}`}
                    onClick={() => onArticleSelect(article)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors group/item ${
                      isSelected
                        ? 'text-red-600 font-semibold'
                        : 'text-gray-600 hover:text-red-600'
                    }`}
                  >
                    <FileText
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected
                          ? 'text-red-600'
                          : 'text-gray-400 group-hover/item:text-red-600 transition-colors'
                      }`}
                    />
                    <span
                      className={`flex-shrink-0 tabular-nums ${
                        isSelected ? '' : 'text-gray-900'
                      }`}
                    >
                      {formatArticleNumber(article.number, currentLang)}
                    </span>
                    {title && (
                      <span className="text-xs text-gray-500 truncate min-w-0">
                        — {title}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          {filteredTree.length > 0 ? (
            filteredTree.map((node) => renderNode(node, 0))
          ) : filteredOrphans.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-8 text-center text-gray-400"
            >
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {currentLang === 'fr'
                  ? 'Aucun article trouvé'
                  : 'Pa gen atik jwenn'}
              </p>
            </motion.div>
          ) : null}
        </div>
      </ScrollArea>

      {/* Heading-delete confirm. Two stages baked in:
          1. Default — if the heading has child articles / sub-headings,
             confirm with ``reparentChildren=true`` so the contents
             survive (lifted to the parent).
          2. Empty heading — same dialog, but the body just says it's
             empty and the cascade flag is a no-op. */}
      {onHeadingDelete && (
        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(o) => {
            if (!o && !deletingHeading) setPendingDelete(null)
          }}
          onConfirm={async () => {
            if (!pendingDelete) return
            setDeletingHeading(true)
            try {
              // Default cascade: reparent. Editor would have to drag
              // contents elsewhere first if they wanted a subtree
              // wipe (not supported through this surface).
              await onHeadingDelete(pendingDelete.id, true)
              setPendingDelete(null)
            } finally {
              setDeletingHeading(false)
            }
          }}
          title={
            currentLang === 'fr'
              ? `Supprimer « ${pendingDelete?.title_fr ?? pendingDelete?.number ?? ''} » ?`
              : `Efase « ${pendingDelete?.title_fr ?? pendingDelete?.number ?? ''} » ?`
          }
          description={
            currentLang === 'fr'
              ? "Les articles et sous-sections de cette section seront déplacés vers la section parente (sans perte). La section elle-même sera supprimée."
              : 'Atik ak sou-seksyon yo pral deplase nan seksyon paran an (san pèdi). Seksyon an menm pral efase.'
          }
          confirmLabel={
            currentLang === 'fr' ? 'Supprimer' : 'Efase'
          }
          cancelLabel={currentLang === 'fr' ? 'Annuler' : 'Anile'}
          destructive
          loading={deletingHeading}
        />
      )}
    </div>
  )
}
