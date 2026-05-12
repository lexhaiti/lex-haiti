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
  X,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

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
}

/** Build a tree from flat headings + attach articles to their heading nodes */
function buildTocTree(headings: Heading[], articles: Article[]): TocNode[] {
  // Map heading id -> TocNode
  const nodeMap = new Map<number, TocNode>()
  for (const h of headings) {
    nodeMap.set(h.id, { heading: h, articles: [], children: [] })
  }

  // Attach articles to their heading
  const unattached: Article[] = []
  for (const article of articles) {
    if (article.heading_id && nodeMap.has(article.heading_id)) {
      nodeMap.get(article.heading_id)!.articles.push(article)
    } else {
      unattached.push(article)
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

  // If there are articles without heading, create a virtual root
  if (unattached.length > 0) {
    roots.unshift({
      heading: {
        id: -1,
        key: '__general',
        number: null,
        title_fr: 'Dispositions générales',
        title_ht: 'Dispozisyon jeneral',
      },
      articles: unattached,
      children: [],
    })
  }

  return roots
}

/** Fallback: group articles by chapter string when no headings exist */
function buildFlatGroups(
  articles: Article[],
  currentLang: 'fr' | 'ht',
): TocNode[] {
  const groups = new Map<string, Article[]>()
  for (const a of articles) {
    const key =
      a.chapter ||
      (currentLang === 'fr' ? 'Dispositions générales' : 'Dispozisyon jeneral')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  return Array.from(groups.entries()).map(([label, arts], idx) => ({
    heading: {
      id: -(idx + 1),
      key: `__flat-${idx}`,
      number: label,
      title_fr: null,
      title_ht: null,
    },
    articles: arts,
    children: [],
  }))
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
}: TableOfContentsProps) {
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

  // Build the heading tree
  const tocTree = useMemo(() => {
    if (headings.length > 0) {
      return buildTocTree(headings, articles)
    }
    return buildFlatGroups(articles, currentLang)
  }, [headings, articles, currentLang])

  // Filter by search
  const filteredTree = useMemo(
    () => filterTree(tocTree, searchQuery, currentLang),
    [tocTree, searchQuery, currentLang],
  )

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
    walk(tocTree)
    setExpandedSections(keys)
  }

  const collapseAll = () => setExpandedSections({})

  // Scroll to selected article in TOC
  React.useEffect(() => {
    if (selectedArticle) {
      const el = document.getElementById(`toc-article-${selectedArticle}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedArticle])

  /** Render a single heading node recursively */
  const renderNode = (node: TocNode, depth: number = 0) => {
    const { heading, articles: nodeArticles, children } = node
    const isExpanded = !!expandedSections[heading.key]

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
        {/* Section header — hover changes color only, no background or shadow */}
        <button
          onClick={() => toggleSection(heading.key)}
          className={`w-full flex flex-col gap-1 px-3 py-2 text-left transition-colors group ${
            isTopLevel ? '' : 'py-1.5'
          }`}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-red-600 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-red-600 flex-shrink-0 transition-colors" />
            )}

            <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
              {heading.number && (
                <span
                  className={`font-black uppercase tracking-widest text-gray-900 group-hover:text-red-600 transition-colors flex-shrink-0 ${
                    isTopLevel ? 'text-xs' : 'text-[10px]'
                  }`}
                >
                  {heading.number}
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
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-red-600 transition-colors line-clamp-2 min-w-0">
                      {headingLabel}
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
        </button>

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
                          {article.number.toLowerCase().startsWith('article')
                            ? article.number
                            : `Art. ${article.number}`}
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
              <span>{currentLang === 'fr' ? 'Préambule' : 'Preanmbil'}</span>
            </button>
          )}
          {hasVisas && onVisasClick && (
            <button
              onClick={onVisasClick}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:text-red-600 transition-colors mb-1 ml-3"
            >
              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>{currentLang === 'fr' ? 'Visas' : 'Visa'}</span>
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
          {filteredTree.length > 0 ? (
            filteredTree.map((node) => renderNode(node, 0))
          ) : (
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
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
