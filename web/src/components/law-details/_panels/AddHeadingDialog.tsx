'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  insertHeading,
  type LegalHeadingInsertInput,
  type LegalHeadingRead,
} from '@/lib/api/endpoints'

/**
 * Modal for inserting a new TOC heading (Titre / Chapitre / Section
 * / …) into a legal text. Used to fix parser output that missed a
 * structural break — same family as ``AddArticleDialog`` but for
 * structural nodes instead of articles.
 *
 * Anchor: when ``afterHeadingId`` is supplied, the new heading slots
 * immediately after that heading and inherits its parent. When
 * ``parentId`` is supplied (with ``afterHeadingId`` null), the new
 * heading is appended at the end of that parent's children. Exactly
 * one of the two must be set; the caller decides based on which
 * affordance the editor clicked.
 */

type HeadingLevel = LegalHeadingInsertInput['level']

const LEVELS: ReadonlyArray<{ value: HeadingLevel; fr: string; ht: string }> = [
  { value: 'part', fr: 'Partie', ht: 'Pati' },
  { value: 'book', fr: 'Livre', ht: 'Liv' },
  { value: 'title', fr: 'Titre', ht: 'Tit' },
  { value: 'chapter', fr: 'Chapitre', ht: 'Chapit' },
  { value: 'section', fr: 'Section', ht: 'Seksyon' },
  { value: 'subsection', fr: 'Sous-section', ht: 'Sou-seksyon' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lawSlug: string
  /** Anchor — exactly one of these is meaningful. */
  afterHeadingId: number | null
  parentId: number | null
  /** Pre-selected level. Defaults to ``section`` — the most common
   *  parser-correction case. */
  defaultLevel?: HeadingLevel
  /** Label of the anchor (e.g. "Titre III") shown in the dialog
   *  description so the editor sees where the new heading lands. */
  anchorLabel: string | null
  lang: 'fr' | 'ht'
  onCreated?: (heading: LegalHeadingRead) => void
}

export function AddHeadingDialog({
  open,
  onOpenChange,
  lawSlug,
  afterHeadingId,
  parentId,
  defaultLevel = 'section',
  anchorLabel,
  lang,
  onCreated,
}: Props) {
  const [level, setLevel] = useState<HeadingLevel>(defaultLevel)
  const [keyVal, setKeyVal] = useState('')
  const [number, setNumber] = useState('')
  const [titleFr, setTitleFr] = useState('')
  const [titleHt, setTitleHt] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLevel(defaultLevel)
    setKeyVal('')
    setNumber('')
    setTitleFr('')
    setTitleHt('')
    setError(null)
  }, [open, defaultLevel])

  // Derive a sensible default key from level + number as the editor
  // types ("chapter-iii", "section-2") — keys must be unique within
  // the text. Editor can override.
  function autofillKey(nextLevel: HeadingLevel, nextNumber: string) {
    const num = nextNumber.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (!num) return
    setKeyVal(`${nextLevel}-${num}`)
  }

  async function save() {
    const trimmedKey = keyVal.trim()
    if (!trimmedKey) {
      setError(
        lang === 'fr'
          ? 'La clé est obligatoire (identifiant unique dans le texte, ex. « chapter-iii »).'
          : 'Kle a obligatwa (idantifyan inik nan tèks la, egz. « chapter-iii »).',
      )
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await insertHeading(lawSlug, {
        key: trimmedKey,
        level,
        number: number.trim() || null,
        title_fr: titleFr.trim() || null,
        title_ht: titleHt.trim() || null,
        after_heading_id: afterHeadingId,
        parent_id: afterHeadingId == null ? parentId : null,
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {lang === 'fr' ? 'Ajouter une section' : 'Ajoute yon seksyon'}
          </DialogTitle>
          <DialogDescription>
            {afterHeadingId != null && anchorLabel
              ? lang === 'fr'
                ? `La nouvelle section sera insérée juste après ${anchorLabel}, au même niveau.`
                : `Nouvo seksyon an pral mete jis apre ${anchorLabel}, nan menm nivo a.`
              : parentId != null && anchorLabel
                ? lang === 'fr'
                  ? `La nouvelle section sera ajoutée à la fin de ${anchorLabel}.`
                  : `Nouvo seksyon an pral ajoute nan fen ${anchorLabel}.`
                : lang === 'fr'
                  ? 'La nouvelle section sera ajoutée à la racine du texte.'
                  : 'Nouvo seksyon an pral ajoute nan rasin tèks la.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                {lang === 'fr' ? 'Niveau *' : 'Nivo *'}
              </label>
              <Select
                value={level}
                onValueChange={(v) => {
                  const nextLevel = v as HeadingLevel
                  setLevel(nextLevel)
                  if (number.trim()) autofillKey(nextLevel, number)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                {lang === 'fr' ? 'Numéro' : 'Nimewo'}
              </label>
              <Input
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value)
                  autofillKey(level, e.target.value)
                }}
                placeholder={
                  level === 'section' ? 'II, 2, A…' : 'I, II, III…'
                }
                className="font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? 'Clé (unique dans le texte) *' : 'Kle (inik nan tèks la) *'}
            </label>
            <Input
              value={keyVal}
              onChange={(e) => setKeyVal(e.target.value)}
              placeholder="chapter-iii"
              className="font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              {lang === 'fr'
                ? 'Identifiant interne — généré automatiquement depuis le niveau + numéro.'
                : 'Idantifyan entèn — kreye otomatikman depi nivo + nimewo.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? 'Titre (FR)' : 'Tit (FR)'}
            </label>
            <Textarea
              value={titleFr}
              onChange={(e) => setTitleFr(e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'fr' ? 'Titre (KW)' : 'Tit (KW)'}
            </label>
            <Textarea
              value={titleHt}
              onChange={(e) => setTitleHt(e.target.value)}
              rows={2}
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
            {lang === 'fr' ? 'Créer la section' : 'Kreye seksyon an'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
