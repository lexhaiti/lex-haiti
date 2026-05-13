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
  insertArticle,
  listTexts,
  type ArticleEmbed,
  type LegalTextListItem,
} from '@/lib/api/endpoints'
import { RichArticleEditor } from '../_editor/RichArticleEditor'
import { isHtmlEffectivelyEmpty } from '../_editor/utils'

/**
 * Modal for inserting a brand-new article into a legal text — the
 * amendment-insertion case (Article 9-1, 9 bis, …). The new article
 * is positioned relative to ``afterArticleId`` (slots immediately
 * after it, inherits its TOC heading) and anchored to the amending
 * law via the mandatory ``source_legal_text_id``.
 *
 * Heavy reuse of the AddVersionDialog UX: same typeahead source-law
 * picker, same "Importer ce texte →" empty-state fallback, same
 * cancel/save footer. The only structural differences are the
 * article-number field at the top, the lack of a current-version
 * pre-fill (insertions start blank), and the "Inserted after"
 * affordance showing which article is the anchor.
 */

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Slug of the parent legal text — the URL the new article lands in. */
  lawSlug: string
  /** Numeric id of the parent legal text, used to exclude self-
   *  amendments from the source-law picker. */
  lawId: number
  /** When set, the new article is inserted immediately after this
   *  article and inherits its TOC heading. When null, the editor is
   *  inserting at the top of the law (rare; usually opens via a
   *  contextual "Ajouter après cet article" button which always
   *  supplies an id). */
  afterArticleId: number | null
  /** Display label of the anchor article ("Article 9"), so the
   *  modal can confirm where the new row will land. */
  afterArticleLabel: string | null
  /** Insertion mode:
   *  - ``amendment`` (default): article is introduced by a modifying
   *    law. Source-law picker is shown + required. Writes a
   *    LegalChange row server-side.
   *  - ``correction``: the parser missed an article that's in the
   *    original text. No source-law picker, no LegalChange row. */
  mode?: 'amendment' | 'correction'
  lang: 'fr' | 'ht'
  /** Called with the freshly-created article after a successful save.
   *  Parent should refetch the law so the new row appears in the
   *  TOC + article list. */
  onCreated?: (article: ArticleEmbed) => void
}

export function AddArticleDialog({
  open,
  onOpenChange,
  lawSlug,
  lawId,
  afterArticleId,
  afterArticleLabel,
  mode = 'amendment',
  lang,
  onCreated,
}: Props) {
  const isCorrection = mode === 'correction'
  const [number, setNumber] = useState('')
  const [titleFr, setTitleFr] = useState('')
  const [textFr, setTextFr] = useState('')
  const [textHt, setTextHt] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')

  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerResults, setPickerResults] = useState<LegalTextListItem[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [picked, setPicked] = useState<LegalTextListItem | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNumber('')
    setTitleFr('')
    setTextFr('')
    setTextHt('')
    setEffectiveFrom('')
    setPickerQuery('')
    setPickerResults([])
    setPicked(null)
    setError(null)
  }, [open])

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
    if (!number.trim()) {
      setError(
        lang === 'fr'
          ? 'Le numéro de l’article est obligatoire (ex. : 9-1 ou 9 bis).'
          : "Nimewo atik la obligatwa (egz. : 9-1 oswa 9 bis).",
      )
      return
    }
    if (isHtmlEffectivelyEmpty(textFr)) {
      setError(
        lang === 'fr'
          ? 'Le contenu (FR) ne peut pas être vide.'
          : 'Kontni (FR) pa ka vid.',
      )
      return
    }
    if (!isCorrection && !picked) {
      setError(
        lang === 'fr'
          ? "Choisissez le texte modificateur qui introduit cet article."
          : 'Chwazi tèks modifikatè ki entwodwi atik sa a.',
      )
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await insertArticle(lawSlug, {
        number: number.trim(),
        title_fr: titleFr.trim() || null,
        text_fr: textFr.trim(),
        // Rich-text HT — only send when the editor actually has
        // content. ``<p></p>`` would otherwise be saved as an
        // intentional empty body, hiding the missing translation.
        text_ht: isHtmlEffectivelyEmpty(textHt) ? null : textHt.trim(),
        after_article_id: afterArticleId,
        effective_from: effectiveFrom || null,
        // Parser-correction mode: omit source so no LegalChange is
        // written. Amendment mode: pass the picked law's id.
        source_legal_text_id: isCorrection ? null : picked!.id,
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
            {isCorrection
              ? lang === 'fr'
                ? "Corriger le parser : ajouter un article"
                : 'Korije pasè a : ajoute yon atik'
              : lang === 'fr'
                ? 'Ajouter un article'
                : 'Ajoute yon atik'}
          </DialogTitle>
          <DialogDescription>
            {(() => {
              if (isCorrection) {
                return lang === 'fr'
                  ? "Cas où le parser a oublié un article du texte original. Aucune loi modifiante n'est requise — l'article est considéré comme ayant toujours fait partie du texte."
                  : "Ka kote pasè a bliye yon atik nan tèks orijinal la. Pa gen lwa modifikatè ki obligatwa — atik la konsidere kòm te toujou fè pati tèks la."
              }
              if (afterArticleLabel) {
                return lang === 'fr'
                  ? `Le nouvel article sera inséré juste après ${afterArticleLabel}, dans la même section. Le texte qui l'introduit doit déjà exister dans le corpus.`
                  : `Nouvo atik la pral mete jis apre ${afterArticleLabel}, nan menm seksyon an. Tèks ki entwodwi l dwe deja egziste nan korpis la.`
              }
              return lang === 'fr'
                ? "Le nouvel article sera inséré au début du texte. Le texte qui l'introduit doit déjà exister dans le corpus."
                : 'Nouvo atik la pral mete nan kòmansman tèks la. Tèks ki entwodwi l dwe deja egziste nan korpis la.'
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          {/* Article number */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? 'Numéro de l’article *' : "Nimewo atik la *"}
            </label>
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={
                lang === 'fr'
                  ? 'Ex. : 9-1, 9 bis, 35-2…'
                  : "Egz. : 9-1, 9 bis, 35-2…"
              }
              className="font-mono"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              {lang === 'fr'
                ? 'La numérotation des amendements en France et en Haïti utilise le suffixe « -N » ou « bis / ter ». Aucun renumérotage des articles suivants — ils gardent leur numéro.'
                : 'Nimewotaj amannman an Fransè ak an Ayisyen sèvi ak sifiks « -N » oswa « bis / ter ». Atik ki vini apre yo kenbe nimewo yo.'}
            </p>
          </div>

          {/* Source-law picker — amendment mode only. In correction
              mode the article has no amending law, so the whole
              picker block is hidden and the save path passes
              ``source_legal_text_id=null``. */}
          {!isCorrection && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr'
                ? 'Texte qui introduit cet article *'
                : 'Tèks ki entwodwi atik sa *'}
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
          )}

          {/* Effective from */}
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
                ? "Optionnel — par défaut, la date de promulgation/publication du texte modificateur."
                : "Opsyonèl — pa default, dat pwomilgasyon/piblikasyon tèks modifikatè a."}
            </p>
          </div>

          {/* Title (optional) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? "Titre (FR, optionnel)" : "Tit (FR, opsyonèl)"}
            </label>
            <Input
              value={titleFr}
              onChange={(e) => setTitleFr(e.target.value)}
            />
          </div>

          {/* Content FR — rich editor, formatting (bold/italic/lists/
              align) survives the round trip to the backend sanitizer. */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? 'Contenu (FR) *' : 'Kontni (FR) *'}
            </label>
            <RichArticleEditor
              value={textFr}
              onChange={setTextFr}
              placeholder={
                lang === 'fr'
                  ? "Tapez ou collez le texte de l'article…"
                  : 'Tape oswa kole tèks atik la…'
              }
              ariaLabel={lang === 'fr' ? 'Contenu français' : 'Kontni fransè'}
              tone="amber"
              disabled={saving}
            />
          </div>

          {/* Content HT */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr'
                ? 'Contenu (KW, optionnel)'
                : 'Kontni (KW, opsyonèl)'}
            </label>
            <RichArticleEditor
              value={textHt}
              onChange={setTextHt}
              placeholder={
                lang === 'fr'
                  ? 'Tapez ou collez la traduction kreyòl…'
                  : 'Tape oswa kole tradiksyon kreyòl la…'
              }
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
            {lang === 'fr' ? "Créer l'article" : 'Kreye atik la'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
