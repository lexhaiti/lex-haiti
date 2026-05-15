'use client'

/**
 * Reusable in-place editor for the four formal blocks on a LegalText:
 * préambule, visas, considérants, enacting formula. (sovereignty_formula
 * is a fifth one we can wire later — same shape.)
 *
 * Backend wiring: PATCH /editorial/legal-texts/{slug}/metadata with
 * the bilingual field pair. Editor mutates one block at a time; saves
 * are immediate (no batch).
 *
 * UX rules:
 *   - Read-only by default. PenLine icon appears only when isEditor.
 *   - "Modifier" toggles a textarea seeded with the current value.
 *   - Save runs the PATCH and exits edit mode on success.
 *   - Cancel discards local edits.
 *   - The compact variant is used for one-line blocks (enacting
 *     formula); the textarea grows for multi-line blocks.
 *
 * Versions + Compare:
 *   - Editors always see Versions / Comparer / "+ Ajouter une version"
 *     affordances when the block is wired with ``lawSlug + lawId +
 *     blockKind``. Comparer is disabled (kept visible) until a second
 *     version exists.
 *   - Public viewers get Versions + Comparer when there's actually
 *     history to show (``versions.length >= 2``).
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlignCenter,
  AlignLeft,
  Check,
  ChevronDown,
  Clock,
  GitCompare,
  Loader2,
  PenLine,
  Plus,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatLongDate } from '@/lib/format/date'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  listBlockVersions,
  type BlockVersionRead,
  type FormalBlockKind,
} from '@/lib/api/endpoints'
import dynamic from 'next/dynamic'
// Lazy-load the editor + dialog bundles — same rationale as
// ArticleViewer: public readers shouldn't pay for the Tiptap editor
// or the version-creation dialog until they click an action chip.
const AddBlockVersionDialog = dynamic(
  () =>
    import('./_panels/AddBlockVersionDialog').then((m) => ({
      default: m.AddBlockVersionDialog,
    })),
  { ssr: false },
)
const BlockComparePanel = dynamic(
  () =>
    import('./_panels/BlockComparePanel').then((m) => ({
      default: m.BlockComparePanel,
    })),
  { ssr: false },
)
const RichArticleEditor = dynamic(
  () =>
    import('./_editor/RichArticleEditor').then((m) => ({
      default: m.RichArticleEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full min-h-[120px] rounded-md border border-slate-200 bg-slate-50/60 animate-pulse" />
    ),
  },
)
import { isHtmlEffectivelyEmpty, looksLikeHtml } from './_editor/utils'

export interface EditableFormalBlockProps {
  /** What the block currently shows. Either string or null. */
  value: string | null
  /** Whether the calling page is in editor mode. */
  isEditor: boolean
  /** Title shown on the collapsed/expanded header. */
  title: string
  /** Whether to mount as compact one-liner (enacting formula style) or
   *  expandable accordion (préambule/visas/considérants). */
  variant?: 'collapsible' | 'compact'
  /** Side-of-header hint text shown in slate-400. */
  hint?: string
  /** Initially expanded (collapsible variant only). Default: false. */
  defaultExpanded?: boolean
  /** Save handler — receives the new value (or null when cleared).
   *  Throws to surface an error to the user. */
  onSave: (newValue: string | null) => Promise<void>
  /** Bilingual i18n hook — pass `currentLang === 'fr'` from the parent. */
  isFr: boolean
  /** Parent legal-text slug — used as the API path component for
   *  versions endpoints. */
  lawSlug?: string
  /** Parent legal-text id — used to exclude self-amendments from the
   *  source-law picker in the add-version dialog. */
  lawId?: number
  /** Which formal block this is. */
  blockKind?: FormalBlockKind
  /** Current HT content of the block. The dialog needs both languages
   *  to pre-fill; ``value`` is whatever the page shows in the active
   *  language. */
  valueHt?: string | null
  /** True when the page is in Kreyòl but the Kreyòl variant is empty,
   *  so ``value`` is the French fallback. The header surfaces a small
   *  "Non traduit" pill explaining the substitution. Ignored when the
   *  page is in French. */
  fallbackToFr?: boolean
  /** Alignment for the compact display variant ('left' or 'center'). */
  align?: 'left' | 'center'
  /** Save handler for the alignment toggle. Editor-only. */
  onAlignChange?: (next: 'left' | 'center') => Promise<void>
}

/**
 * Strip HTML + collapse whitespace to a single preview snippet, used
 * on the collapsed accordion header. Keeps the editor (and the reader)
 * oriented without having to expand each block to remember what's
 * inside.
 */
function previewSnippet(value: string | null, limit = 90): string {
  if (!value) return ''
  const plain = value
    .replace(/<\/(p|li|blockquote|h[1-6])>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= limit) return plain
  return plain.slice(0, limit).trimEnd() + '…'
}

export function EditableFormalBlock({
  value,
  isEditor,
  title,
  variant = 'collapsible',
  hint,
  defaultExpanded = false,
  onSave,
  isFr,
  lawSlug,
  lawId,
  blockKind,
  valueHt,
  fallbackToFr = false,
  align = 'left',
  onAlignChange,
}: EditableFormalBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Versioning state. ``canVersion`` means "we have the props to fetch
  // versions" — editors always see the affordances when canVersion;
  // public sees them when versions.length >= 2 (i.e. real history to
  // surface).
  const canVersion = !!lawSlug && lawId != null && !!blockKind
  const [versions, setVersions] = useState<BlockVersionRead[]>([])
  const [versionsExpanded, setVersionsExpanded] = useState(false)
  const [compareExpanded, setCompareExpanded] = useState(false)
  const [addVersionOpen, setAddVersionOpen] = useState(false)

  // Refs for scroll-into-view when the secondary panels open. Without
  // this, clicking Versions or Comparer on a block whose header sits
  // near the top of a long page silently appends the panel below the
  // viewport — the user clicks and nothing visible happens.
  const versionsPanelRef = useRef<HTMLDivElement>(null)
  const comparePanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!versionsExpanded) return
    // Slight delay so the AnimatePresence expand has at least rendered
    // the wrapper before the scroll math kicks in.
    const t = window.setTimeout(() => {
      versionsPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 100)
    return () => window.clearTimeout(t)
  }, [versionsExpanded])
  useEffect(() => {
    if (!compareExpanded) return
    const t = window.setTimeout(() => {
      comparePanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 100)
    return () => window.clearTimeout(t)
  }, [compareExpanded])

  function refetchVersions() {
    if (!canVersion || !lawSlug || !blockKind) return
    void listBlockVersions(lawSlug, blockKind)
      .then(setVersions)
      .catch(() => setVersions([]))
  }

  useEffect(() => {
    if (!canVersion) {
      setVersions([])
      return
    }
    refetchVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canVersion, lawSlug, blockKind])

  // Keep draft in sync when the live value updates from outside.
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  // Visibility rules for the action chips:
  // - Versions chip: editor sees always when canVersion; public sees
  //   only when there's real history (2+ versions).
  // - Compare chip: same — but it's *disabled* when there's only one
  //   version, so editors still see the affordance.
  const showVersionsChip = canVersion && (isEditor || versions.length >= 2)
  const showCompareChip = canVersion && (isEditor || versions.length >= 2)
  const canCompare = versions.length >= 2

  // Current (live) version object — used both for the header pill and
  // for the "Modifié par <X>" line shown inside the expanded body when
  // the live version was introduced by an amending law.
  const liveVersion = (() => {
    if (versions.length === 0) return null
    return versions.find((v) => v.editorial_status === 'published') ?? versions[0]
  })()
  const currentVersionPill = liveVersion
    ? {
        number: liveVersion.version_number,
        from: liveVersion.effective_from ?? null,
      }
    : null

  // Compact variant — unchanged from before; the redesign focuses on
  // the collapsible accordion.
  const renderCompact = () => (
    <div className="py-4 group">
      {editing ? (
        <div className="space-y-2">
          <RichArticleEditor
            value={draft}
            onChange={setDraft}
            placeholder={
              isFr
                ? 'Tapez ou collez la formule d’adoption…'
                : 'Tape oswa kole fòmil adopsyon an…'
            }
            ariaLabel={title}
            tone="amber"
            disabled={saving}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={cancel} disabled={saving} className={cancelBtnCls}>
              <X className="w-3 h-3" /> {isFr ? 'Annuler' : 'Anile'}
            </button>
            <button type="button" onClick={save} disabled={saving} className={saveBtnCls}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {isFr ? 'Enregistrer' : 'Sove'}
            </button>
          </div>
        </div>
      ) : value ? (
        <div className="flex items-start gap-2">
          {looksLikeHtml(value) ? (
            <div
              className={cn(
                'flex-1 text-sm font-semibold italic text-slate-500 tracking-wide leading-relaxed formal-block-html',
                align === 'center' ? 'text-center' : 'text-left',
              )}
              dangerouslySetInnerHTML={{ __html: value }}
            />
          ) : (
            <p
              className={cn(
                'flex-1 text-sm font-semibold italic text-slate-500 tracking-wide whitespace-pre-line leading-relaxed',
                align === 'center' ? 'text-center' : 'text-left',
              )}
            >
              {value}
            </p>
          )}
          {isEditor && onAlignChange && (
            <button
              type="button"
              onClick={() => {
                void onAlignChange(align === 'center' ? 'left' : 'center')
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-primary flex-shrink-0 mt-0.5"
              aria-label={
                align === 'center'
                  ? isFr ? 'Aligner à gauche' : 'Aliyen agoch'
                  : isFr ? 'Centrer' : 'Mete nan mitan'
              }
              title={
                align === 'center'
                  ? isFr ? 'Aligner à gauche' : 'Aliyen agoch'
                  : isFr ? 'Centrer' : 'Mete nan mitan'
              }
            >
              {align === 'center' ? <AlignLeft className="w-3.5 h-3.5" /> : <AlignCenter className="w-3.5 h-3.5" />}
            </button>
          )}
          {isEditor && (
            <button
              type="button"
              onClick={() => {
                setEditing(true)
                setDraft(value ?? '')
                setError(null)
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-primary flex-shrink-0 mt-0.5"
              aria-label={isFr ? 'Modifier' : 'Modifye'}
            >
              <PenLine className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : isEditor ? (
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setDraft('')
            setError(null)
          }}
          className="inline-flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-4 py-1.5 text-xs italic text-amber-800 hover:bg-amber-50 hover:border-amber-400 transition-colors"
        >
          <PenLine className="w-3 h-3" />
          {isFr ? `Ajouter — ${title.toLowerCase()}` : `Ajoute — ${title.toLowerCase()}`}
        </button>
      ) : null}
    </div>
  )

  // ── Collapsible variant — the redesign ─────────────────────────────
  const hasContent = !!value && !isHtmlEffectivelyEmpty(value)
  const snippet = previewSnippet(value)

  const renderCollapsible = () => (
    <div
      className={cn(
        'group rounded-xl border bg-white transition-all duration-200 overflow-hidden',
        expanded
          ? 'border-slate-200 shadow-sm'
          : 'border-slate-200/80 hover:border-slate-300 hover:shadow-sm',
      )}
    >
      {/* Header row — the whole bar is the toggle target. Flex layout:
          left-accent / chevron+title / snippet / version pill. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          'relative w-full flex items-center gap-3 px-4 py-3 text-left',
          'transition-colors',
          expanded
            ? 'bg-gradient-to-r from-primary/5 via-white to-white'
            : 'bg-white hover:bg-slate-50/60',
        )}
      >
        {/* Left accent rail — animates in when expanded. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-0 top-0 bottom-0 w-[3px] transition-colors',
            expanded ? 'bg-primary' : 'bg-transparent group-hover:bg-slate-200',
          )}
        />
        <ChevronDown
          className={cn(
            'w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200',
            expanded ? 'rotate-0 text-primary' : '-rotate-90',
          )}
        />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700 flex-shrink-0">
          {title}
        </span>
        {/* "Pa tradwi" pill — shown when the page is in Kreyòl but
            this block only has a French value, so we're displaying
            the French as fallback. Mirrors the same affordance on
            article-level fallback (ArticleViewer). */}
        {fallbackToFr && hasContent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0 cursor-help">
                {isFr ? 'FR' : 'FR'}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {isFr
                ? "Pas encore traduit en créole. Texte affiché en français."
                : "Poko tradwi an kreyòl. Tèks la afiche an franse."}
            </TooltipContent>
          </Tooltip>
        )}
        {/* Inline preview snippet — only when there's actual content
            and we're not currently expanded. Helps the reader scan the
            page without expanding each block individually. */}
        {!expanded && hasContent && (
          <span className="text-sm text-slate-500 italic truncate min-w-0 flex-1">
            {snippet}
          </span>
        )}
        {!expanded && !hasContent && hint && (
          <span className="text-xs text-slate-400 italic flex-shrink truncate">
            {hint}
          </span>
        )}
        {/* Right-side meta: version pill when there's history. */}
        {currentVersionPill && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0">
            <span>v{currentVersionPill.number}</span>
            {currentVersionPill.from && (
              <>
                <span className="text-emerald-300">·</span>
                <span className="font-medium normal-case tracking-normal text-emerald-700/80">
                  {currentVersionPill.from}
                </span>
              </>
            )}
          </span>
        )}
      </button>

      {/* Expanded body. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1">
              {/* "Modifié par X · En vigueur depuis Y" line — shows
                  whenever the live version was introduced by an
                  amending law. Matches the article-viewer pattern. */}
              {!editing && liveVersion?.source_amendment_slug && (
                <p className="mb-3 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>
                    {isFr ? 'Modifié par ' : 'Modifye pa '}
                    <a
                      href={`/loi/${liveVersion.source_amendment_slug}`}
                      className="font-semibold text-primary hover:underline underline-offset-2"
                    >
                      {liveVersion.source_amendment_title_fr ??
                        (isFr ? 'la loi modifiante' : 'lwa modifikatè a')}
                    </a>
                  </span>
                  {liveVersion.effective_from && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="italic">
                        {isFr ? 'En vigueur depuis le ' : 'An vigè depi '}
                        {liveVersion.effective_from}
                      </span>
                    </>
                  )}
                </p>
              )}
              {/* Action row — sits between the header and the content
                  so affordances are obvious without scrolling. The
                  chip set adapts: public sees Versions/Comparer only
                  when there's history; editors always see them. */}
              {!editing && (showVersionsChip || showCompareChip || isEditor) && (
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {showVersionsChip && (
                    <button
                      type="button"
                      onClick={() => setVersionsExpanded((v) => !v)}
                      aria-pressed={versionsExpanded}
                      className={cn(actionChipCls, versionsExpanded && actionChipActiveCls)}
                      title={isFr ? 'Historique des versions' : 'Istwa vèsyon'}
                    >
                      <Clock className="w-3 h-3" />
                      {isFr ? 'Versions' : 'Vèsyon'}
                      {versions.length > 0 && (
                        <span
                          className={cn(
                            'text-[10px] font-bold px-1 rounded',
                            versionsExpanded
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {versions.length}
                        </span>
                      )}
                    </button>
                  )}
                  {showCompareChip && (
                    <button
                      type="button"
                      onClick={() => setCompareExpanded((v) => !v)}
                      disabled={!canCompare}
                      aria-pressed={compareExpanded}
                      title={
                        canCompare
                          ? isFr ? 'Comparer deux versions' : 'Konpare de vèsyon'
                          : isFr
                            ? 'Disponible dès la seconde version'
                            : 'Disponib depi dezyèm vèsyon an'
                      }
                      className={cn(
                        actionChipCls,
                        compareExpanded && actionChipActiveCls,
                        !canCompare && actionChipDisabledCls,
                      )}
                    >
                      <GitCompare className="w-3 h-3" />
                      {isFr ? 'Comparer' : 'Konpare'}
                    </button>
                  )}
                  {isEditor && canVersion && (
                    <button
                      type="button"
                      onClick={() => setAddVersionOpen(true)}
                      className={addVersionChipCls}
                      title={
                        isFr
                          ? 'Ajouter une nouvelle version, ancrée à une loi modifiante'
                          : 'Ajoute yon nouvo vèsyon, ankre nan yon lwa modifikatè'
                      }
                    >
                      <Plus className="w-3 h-3" />
                      {isFr ? 'Ajouter une version' : 'Ajoute yon vèsyon'}
                    </button>
                  )}
                  {isEditor && hasContent && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true)
                        setDraft(value ?? '')
                        setError(null)
                      }}
                      className={editChipCls}
                      aria-label={isFr ? 'Modifier' : 'Modifye'}
                    >
                      <PenLine className="w-3 h-3" />
                      {isFr ? 'Modifier' : 'Modifye'}
                    </button>
                  )}
                </div>
              )}

              {/* Content / editor / empty-state slot. */}
              {editing ? (
                <div className="px-5 py-5 bg-amber-50/40 border border-amber-300 rounded-lg space-y-3">
                  <RichArticleEditor
                    value={draft}
                    onChange={setDraft}
                    placeholder={
                      isFr
                        ? 'Tapez le contenu de ce bloc…'
                        : 'Tape kontni blòk sa a…'
                    }
                    ariaLabel={title}
                    tone="amber"
                    disabled={saving}
                  />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={cancel} disabled={saving} className={cancelBtnCls}>
                      <X className="w-3 h-3" /> {isFr ? 'Annuler' : 'Anile'}
                    </button>
                    <button type="button" onClick={save} disabled={saving} className={saveBtnCls}>
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {isFr ? 'Enregistrer' : 'Sove'}
                    </button>
                  </div>
                </div>
              ) : hasContent ? (
                // Content sits flush in the outer card with no inner
                // border — previously this was a card-inside-a-card
                // (outer block + inner slate-bordered panel) which
                // doubled the visual frame for the same data. Now
                // the action-chip row above is the only divider; the
                // content reads as the primary body of the block.
                looksLikeHtml(value) ? (
                  <div
                    className="text-sm text-slate-700 leading-relaxed formal-block-html"
                    dangerouslySetInnerHTML={{ __html: value ?? '' }}
                  />
                ) : (
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {value}
                  </div>
                )
              ) : isEditor ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true)
                    setDraft('')
                    setError(null)
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-4 py-2 text-sm italic text-amber-800 hover:bg-amber-50 hover:border-amber-400 transition-colors"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  {isFr ? `Ajouter — ${title.toLowerCase()}` : `Ajoute — ${title.toLowerCase()}`}
                </button>
              ) : null}

              {/* Versions timeline — visible to anyone when toggled and
                  there's data to show. Ref drives scrollIntoView so
                  toggling on a long page brings the panel into the
                  viewport. */}
              {versionsExpanded && (
                <div ref={versionsPanelRef}>
                  <BlockVersionsTimeline versions={versions} isFr={isFr} />
                </div>
              )}
              {/* Compare panel — same. */}
              {compareExpanded && (
                <div ref={comparePanelRef}>
                  <BlockComparePanel versions={versions} isFr={isFr} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {canVersion && lawSlug && lawId != null && blockKind && (
        <AddBlockVersionDialog
          open={addVersionOpen}
          onOpenChange={setAddVersionOpen}
          lawSlug={lawSlug}
          lawId={lawId}
          blockKind={blockKind}
          blockLabel={title}
          currentTextFr={value ?? null}
          currentTextHt={valueHt ?? null}
          lang={isFr ? 'fr' : 'ht'}
          onCreated={() => {
            refetchVersions()
            setVersionsExpanded(true)
          }}
        />
      )}
    </div>
  )

  // Hide whole block if value is null and viewer isn't an editor.
  if (!hasContent && !isEditor) return null

  return variant === 'compact' ? renderCompact() : renderCollapsible()

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const trimmed = draft.trim()
      const next = isHtmlEffectivelyEmpty(trimmed) ? null : trimmed
      await onSave(next)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  function cancel() {
    setEditing(false)
    setDraft(value ?? '')
    setError(null)
  }
}

// ── Action-row chip styles ──────────────────────────────────────────────

const actionChipCls = cn(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]',
  'font-semibold border bg-white text-slate-700 border-slate-200',
  'hover:border-primary hover:text-primary transition-colors',
)
const actionChipActiveCls = cn(
  'bg-primary text-white border-primary hover:text-white hover:border-primary',
)
const actionChipDisabledCls = cn(
  'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed',
  'hover:border-slate-200 hover:text-slate-400',
)
const addVersionChipCls = cn(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]',
  'font-semibold bg-amber-50 text-amber-800 border border-amber-200',
  'hover:bg-amber-100 hover:border-amber-300 transition-colors',
)
const editChipCls = cn(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]',
  'font-semibold bg-white text-slate-500 border border-slate-200',
  'hover:text-primary hover:border-primary transition-colors',
)

const cancelBtnCls = cn(
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300',
  'bg-white px-3 py-1.5 text-xs font-semibold text-slate-600',
  'hover:border-slate-400 disabled:opacity-50',
)

const saveBtnCls = cn(
  'inline-flex items-center gap-1.5 rounded-md bg-primary text-white',
  'px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50',
)

/**
 * Inline version-timeline for a formal block. Smaller-scale than the
 * article-side VersionsPanel — same vertical dot-and-line vocabulary
 * but condensed (one line per version) so it tucks under the
 * accordion content without dominating the page.
 */
function BlockVersionsTimeline({
  versions,
  isFr,
}: {
  versions: BlockVersionRead[]
  isFr: boolean
}) {
  if (versions.length === 0) {
    return (
      <p className="mt-3 px-5 py-3 text-xs text-slate-500 italic">
        {isFr
          ? "Aucune version enregistrée pour ce bloc."
          : 'Pa gen vèsyon anrejistre pou blòk sa a.'}
      </p>
    )
  }
  const currentIdx = versions.findIndex(
    (v) => v.editorial_status === 'published',
  )
  const liveId = (currentIdx >= 0 ? versions[currentIdx] : versions[0]).id

  return (
    <ol className="relative pl-7 mt-4 pt-4 border-t border-slate-100">
      <div className="absolute left-6 top-5 bottom-5 w-px bg-slate-200" />
      {versions.map((v, idx) => {
        const isCurrent = v.id === liveId
        const isLast = idx === versions.length - 1
        const fromIso = v.effective_from
        const toIso = v.effective_to
        const from = fromIso ? formatLongDate(fromIso, isFr ? 'fr' : 'ht', '—') : '—'
        const to = toIso ? formatLongDate(toIso, isFr ? 'fr' : 'ht', '—') : null
        return (
          <li key={v.id} className={isLast ? '' : 'pb-3'}>
            <span
              className={cn(
                'absolute -left-[0.4rem] w-3 h-3 rounded-full border-[2.5px] flex items-center justify-center bg-white',
                isCurrent ? 'border-emerald-500' : 'border-slate-300',
              )}
            >
              <span
                className={cn(
                  'w-1 h-1 rounded-full',
                  isCurrent ? 'bg-emerald-500' : 'bg-slate-300',
                )}
              />
            </span>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-widest',
                  isCurrent ? 'text-emerald-700' : 'text-slate-400',
                )}
              >
                v{v.version_number}
              </span>
              <span className="text-xs font-semibold text-slate-700">
                {to
                  ? isFr ? `Du ${from} au ${to}` : `${from} – ${to}`
                  : isFr ? `Depuis le ${from}` : `Depi ${from}`}
              </span>
              {isCurrent && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {isFr ? 'En vigueur' : 'An vigè'}
                </span>
              )}
              {v.editorial_status === 'draft' && !isCurrent && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                  {isFr ? 'Brouillon' : 'Brouyon'}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
