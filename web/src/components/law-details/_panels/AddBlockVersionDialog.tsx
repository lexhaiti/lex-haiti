'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, Search, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  addBlockVersion,
  listTexts,
  type BlockVersionRead,
  type FormalBlockKind,
  type LegalTextListItem,
} from '@/lib/api/endpoints'
import { RichArticleEditor } from '../_editor/RichArticleEditor'
import { isHtmlEffectivelyEmpty } from '../_editor/utils'

/**
 * Modal for adding a new version of one of the four formal blocks
 * (preamble, visas, considérants, enacting formula) on a legal text.
 * Symmetric with AddVersionDialog (for articles): same typeahead
 * picker for the amending law, same "Importer ce texte →" empty
 * state, mandatory ``source_legal_text_id``.
 *
 * The block is bilingual — at least one of text_fr / text_ht must
 * carry the new content. Pre-fills both fields with the block's
 * current FR / HT so editors start from the in-force text and edit
 * the parts that change.
 */

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lawSlug: string
  lawId: number
  blockKind: FormalBlockKind
  /** Label shown in the dialog title ("Préambule", "Visas", …). */
  blockLabel: string
  /** Current FR / HT content of the block, pre-filled into the
   *  textareas so the editor edits the delta, not types from scratch. */
  currentTextFr: string | null
  currentTextHt: string | null
  lang: 'fr' | 'ht'
  /** Called with the newly-created version after a successful save.
   *  Parent should refetch the version list. */
  onCreated?: (version: BlockVersionRead) => void
}

export function AddBlockVersionDialog({
  open,
  onOpenChange,
  lawSlug,
  lawId,
  blockKind,
  blockLabel,
  currentTextFr,
  currentTextHt,
  lang,
  onCreated,
}: Props) {
  const [textFr, setTextFr] = useState(currentTextFr ?? '')
  const [textHt, setTextHt] = useState(currentTextHt ?? '')
  const [effectiveFrom, setEffectiveFrom] = useState('')

  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerResults, setPickerResults] = useState<LegalTextListItem[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [picked, setPicked] = useState<LegalTextListItem | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTextFr(currentTextFr ?? '')
    setTextHt(currentTextHt ?? '')
    setEffectiveFrom('')
    setPickerQuery('')
    setPickerResults([])
    setPicked(null)
    setError(null)
  }, [open, currentTextFr, currentTextHt])

  useEffect(() => {
    if (!open) return
    const q = pickerQuery.trim()
    if (!q) {
      setPickerResults([])
      return
    }
    let cancelled = false
    setPickerLoading(true)
    const handle = setTimeout(() => {
      listTexts({ q, limit: 8 })
        .then((res) => {
          if (cancelled) return
          setPickerResults(res.items.filter((t) => t.id !== lawId))
        })
        .catch(() => {
          if (cancelled) return
          setPickerResults([])
        })
        .finally(() => {
          if (!cancelled) setPickerLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [open, pickerQuery, lawId])

  async function save() {
    const fr = textFr.trim()
    const ht = textHt.trim()
    const frEmpty = isHtmlEffectivelyEmpty(fr)
    const htEmpty = isHtmlEffectivelyEmpty(ht)
    if (frEmpty && htEmpty) {
      setError(
        lang === 'fr'
          ? "Saisissez au moins le contenu (FR) ou (KW)."
          : 'Antre omwen kontni (FR) oswa (KW).',
      )
      return
    }
    if (!picked) {
      setError(
        lang === 'fr'
          ? 'Choisissez le texte qui modifie ce bloc.'
          : 'Chwazi tèks ki modifye blòk sa a.',
      )
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await addBlockVersion(lawSlug, blockKind, {
        text_fr: frEmpty ? null : fr,
        text_ht: htEmpty ? null : ht,
        effective_from: effectiveFrom || null,
        source_legal_text_id: picked.id,
      })
      onCreated?.(result)
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.body?.detail ?? e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lang === 'fr'
              ? `Ajouter une version — ${blockLabel}`
              : `Ajoute yon vèsyon — ${blockLabel}`}
          </DialogTitle>
          <DialogDescription>
            {lang === 'fr'
              ? "Cette nouvelle version remplacera le contenu actuellement affiché. Le texte qui modifie ce bloc doit déjà exister dans le corpus."
              : "Vèsyon sa pral ranplase kontni ki parèt kounye a. Tèks ki modifye blòk sa a dwe deja egziste nan korpis la."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          {/* Source-law picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr'
                ? 'Texte qui modifie ce bloc *'
                : 'Tèks ki modifye blòk sa *'}
            </label>
            {picked ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {picked.title_fr}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {picked.publication_date
                      ? new Date(picked.publication_date).toLocaleDateString(
                          'fr-FR',
                          { day: 'numeric', month: 'short', year: 'numeric' },
                        )
                      : (picked.moniteur_ref ?? '')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null)
                    setPickerQuery('')
                  }}
                  className="text-slate-400 hover:text-red-600 flex-shrink-0"
                  aria-label={lang === 'fr' ? 'Changer' : 'Chanje'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={
                    lang === 'fr'
                      ? 'Rechercher un texte — ex. « Loi du 5 mars 2024 »'
                      : 'Chèche yon tèks — egz. « Lwa 5 mas 2024 »'
                  }
                  className="pl-9"
                  autoFocus
                />
                {pickerQuery.trim() && (
                  <div className="mt-1 rounded-md border border-slate-200 bg-white shadow-sm max-h-56 overflow-y-auto">
                    {pickerLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {lang === 'fr' ? 'Recherche…' : 'Ap chèche…'}
                      </div>
                    ) : pickerResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs">
                        <p className="text-slate-500 mb-1">
                          {lang === 'fr'
                            ? 'Aucun texte ne correspond à votre recherche.'
                            : 'Pa gen tèks ki koresponn ak rechèch ou a.'}
                        </p>
                        <Link
                          href={`/editorial/import?type=legal_text&q=${encodeURIComponent(
                            pickerQuery.trim(),
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          {lang === 'fr'
                            ? 'Importer ce texte →'
                            : 'Enpòte tèks sa →'}
                        </Link>
                      </div>
                    ) : (
                      <ul className="py-1">
                        {pickerResults.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => setPicked(t)}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm hover:bg-slate-50',
                                'flex flex-col gap-0.5',
                              )}
                            >
                              <span className="font-semibold text-slate-900 truncate">
                                {t.title_fr}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {t.publication_date
                                  ? new Date(
                                      t.publication_date,
                                    ).toLocaleDateString('fr-FR', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : t.moniteur_ref || t.category}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? "Date d'entrée en vigueur" : 'Dat antre an vigè'}
            </label>
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              {lang === 'fr'
                ? 'Optionnel — par défaut, la date de promulgation/publication du texte modificateur.'
                : 'Opsyonèl — pa default, dat pwomilgasyon/piblikasyon tèks modifikatè a.'}
            </p>
          </div>

          {/* Content FR — rich editor, pre-filled with current block. */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? 'Contenu (FR)' : 'Kontni (FR)'}
            </label>
            <RichArticleEditor
              value={textFr}
              onChange={setTextFr}
              ariaLabel={lang === 'fr' ? 'Contenu français' : 'Kontni fransè'}
              tone="amber"
              disabled={saving}
            />
          </div>

          {/* Content HT */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? 'Contenu (KW)' : 'Kontni (KW)'}
            </label>
            <RichArticleEditor
              value={textHt}
              onChange={setTextHt}
              ariaLabel={lang === 'fr' ? 'Contenu kreyòl' : 'Kontni kreyòl'}
              tone="blue"
              disabled={saving}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {lang === 'fr' ? 'Annuler' : 'Anile'}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
            ) : (
              <Check className="mr-2 w-4 h-4" />
            )}
            {lang === 'fr' ? 'Créer la version' : 'Kreye vèsyon an'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
