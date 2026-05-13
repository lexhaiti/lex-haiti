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
 *   - "Edit" toggles a textarea seeded with the current value.
 *   - Save runs the PATCH and exits edit mode on success.
 *   - Cancel discards local edits.
 *   - The compact variant is used for one-line blocks (enacting
 *     formula); the textarea grows for multi-line blocks.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlignCenter,
  AlignLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  PenLine,
  Plus,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatLongDate } from '@/lib/format/date'
import {
  listBlockVersions,
  type BlockVersionRead,
  type FormalBlockKind,
} from '@/lib/api/endpoints'
import { AddBlockVersionDialog } from './_panels/AddBlockVersionDialog'

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
  // --- Versioning (Option A) — all four below must be provided for
  // the "Versions" accordion + "Ajouter une version" affordance to
  // render. When any is missing the block stays version-less, same
  // shape as before this opt-in was added. ---
  /** Parent legal-text slug — used as the API path component. */
  lawSlug?: string
  /** Parent legal-text id — used to exclude self-amendments from the
   *  source-law picker in the add-version dialog. */
  lawId?: number
  /** Which formal block this is. */
  blockKind?: FormalBlockKind
  /** Current HT content of the block. Mirrors ``value`` for the
   *  visible-language side; the dialog needs both to pre-fill. The
   *  ``value`` prop is whatever the page shows in the active language. */
  valueHt?: string | null
  /** Alignment for the compact display variant ('left' or 'center').
   *  Only meaningful when ``variant === 'compact'``. Defaults to
   *  'left' to match the article-body alignment. */
  align?: 'left' | 'center'
  /** Save handler for the alignment toggle. Editor-only. When
   *  unset, the toggle isn't shown. */
  onAlignChange?: (next: 'left' | 'center') => Promise<void>
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
  align = 'left',
  onAlignChange,
}: EditableFormalBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Versioning state — only fetched when the four versioning props are
  // present AND editor mode is on. Public viewers don't surface block
  // history today, same UX call as the article side.
  const versioningEnabled =
    isEditor && !!lawSlug && lawId != null && !!blockKind
  const [versions, setVersions] = useState<BlockVersionRead[]>([])
  const [versionsExpanded, setVersionsExpanded] = useState(false)
  const [addVersionOpen, setAddVersionOpen] = useState(false)

  function refetchVersions() {
    if (!versioningEnabled || !lawSlug || !blockKind) return
    void listBlockVersions(lawSlug, blockKind)
      .then(setVersions)
      .catch(() => setVersions([]))
  }

  useEffect(() => {
    if (!versioningEnabled) {
      setVersions([])
      return
    }
    refetchVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versioningEnabled, lawSlug, blockKind])

  // Keep draft in sync when the live value updates from outside.
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  // Compact variant — no accordion, content always shown. Reads as
  // a left-aligned paragraph (formal adoption lines often span two
  // or three lines: "Sur proposition de …\nLe Sénat a adopté la loi
  // suivante :"). ``whitespace-pre-line`` preserves newlines the
  // editor typed in the textarea.
  const renderCompact = () => (
    <div className="py-4 group">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(3, (draft.match(/\n/g)?.length ?? 0) + 2)}
            className="w-full rounded-md border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary italic"
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
          <p
            className={cn(
              'flex-1 text-sm font-semibold italic text-slate-500 tracking-wide whitespace-pre-line leading-relaxed',
              align === 'center' ? 'text-center' : 'text-left',
            )}
          >
            {value}
          </p>
          {isEditor && onAlignChange && (
            // Two-state alignment toggle — quick affordance to flip
            // between left and center without opening MetadataEditor.
            // Editor-only. Hidden when no save handler is plumbed in.
            <button
              type="button"
              onClick={() => {
                void onAlignChange(align === 'center' ? 'left' : 'center')
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-primary flex-shrink-0 mt-0.5"
              aria-label={
                align === 'center'
                  ? isFr
                    ? 'Aligner à gauche'
                    : 'Aliyen agoch'
                  : isFr
                    ? 'Centrer'
                    : 'Mete nan mitan'
              }
              title={
                align === 'center'
                  ? isFr
                    ? 'Aligner à gauche'
                    : 'Aliyen agoch'
                  : isFr
                    ? 'Centrer'
                    : 'Mete nan mitan'
              }
            >
              {align === 'center' ? (
                <AlignLeft className="w-3.5 h-3.5" />
              ) : (
                <AlignCenter className="w-3.5 h-3.5" />
              )}
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
        // Empty + editor: invite the editor to fill it. Without this,
        // a missing compact block (e.g. enacting_formula_fr null) was
        // an invisible row with only a hover-only pencil — the editor
        // didn't see anything to click on.
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
          {isFr
            ? `Ajouter — ${title.toLowerCase()}`
            : `Ajoute — ${title.toLowerCase()}`}
        </button>
      ) : null}
    </div>
  )

  // Collapsible variant
  const renderCollapsible = () => (
    <div>
      <div className="w-full flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors group">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-red-600 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span className="text-sm font-bold uppercase tracking-widest text-slate-600">
            {title}
          </span>
          {hint && (
            <span className="text-xs text-slate-400 ml-2">{hint}</span>
          )}
        </button>
        {isEditor && expanded && !editing && versioningEnabled && (
          // Versions chip toggles the inline timeline below the
          // content. Always rendered in editor mode — even at v1 it's
          // useful (shows the effective_from we'll supersede).
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setVersionsExpanded((v) => !v)
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors',
              versionsExpanded
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-700 border-slate-200 hover:border-primary hover:text-primary',
            )}
            aria-pressed={versionsExpanded}
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
        {isEditor && expanded && !editing && versioningEnabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setAddVersionOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-colors"
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
        {isEditor && expanded && !editing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
              setDraft(value ?? '')
              setError(null)
            }}
            className="text-slate-400 hover:text-primary transition-colors"
            aria-label={isFr ? 'Modifier' : 'Modifye'}
          >
            <PenLine className="w-4 h-4" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {editing ? (
              <div className="mt-3 px-5 py-5 bg-amber-50/40 border border-amber-300 rounded-lg space-y-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.max(4, (draft.match(/\n/g)?.length ?? 0) + 3)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder={
                    isFr
                      ? 'Tapez le contenu de ce bloc…'
                      : 'Tape kontni blòk sa a…'
                  }
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
            ) : (
              <div className="mt-3 px-5 py-5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {value}
              </div>
            )}
            {/* Versions timeline — editor-only, inline under the
                block content. Same vocabulary as the article-side
                VersionsPanel: numbered dots, effective range, the
                latest entry marked "En vigueur". */}
            {versioningEnabled && versionsExpanded && (
              <BlockVersionsTimeline
                versions={versions}
                isFr={isFr}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Add-version modal — mounted at the block root so the Radix
          portal positions it relative to the viewport. ``onCreated``
          refetches the timeline so the new row shows up immediately
          in the accordion above. */}
      {versioningEnabled && lawSlug && lawId != null && blockKind && (
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

  // Hide whole block if value is null and editor is not active.
  // (Editors still don't see hidden blocks here — they should add the
  // field via the MetadataEditor first; that ships separately.)
  if (!value && !isEditor) return null

  return variant === 'compact' ? renderCompact() : renderCollapsible()

  // ── helpers ─────────────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    setError(null)
    try {
      const trimmed = draft.trim()
      await onSave(trimmed === '' ? null : trimmed)
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
 *
 * "Current" semantics: the version with the highest version_number
 * AND editorial_status=published is the live one; everything below
 * is historical. Falls back to the latest row when no published
 * version exists (typical for newly-added drafts that haven't been
 * approved yet).
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
  // Find the current version — latest published, else just the most
  // recent row (versions are passed newest-first from the API).
  const currentIdx = versions.findIndex(
    (v) => v.editorial_status === 'published',
  )
  const liveId = (currentIdx >= 0 ? versions[currentIdx] : versions[0]).id

  return (
    <ol className="relative pl-7 mt-3 px-5 py-4 bg-slate-50/60 border border-slate-200 rounded-lg">
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
                  ? isFr
                    ? `Du ${from} au ${to}`
                    : `${from} – ${to}`
                  : isFr
                    ? `Depuis le ${from}`
                    : `Depi ${from}`}
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
