'use client'

import { useState, useTransition } from 'react'
import { Loader2, Save } from 'lucide-react'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast-simple'
import { useLanguage } from '@/i18n/LanguageContext'
import { ApiError } from '@/lib/api/client'
import {
  type LegalTextMetadataPatch,
  updateLegalTextMetadata,
} from '@/lib/api/endpoints'

const COPY = {
  fr: {
    title: 'Modifier les métadonnées',
    desc:
      'Champs édités en français et en kreyòl. Le slug et le statut éditorial ne sont pas modifiables ici.',
    titleFr: 'Titre (FR) *',
    titleHt: 'Titre (KW)',
    descFr: 'Description (FR)',
    descHt: 'Description (KW)',
    category: 'Catégorie',
    codeSubcategory: 'Sous-catégorie',
    legalStatus: 'Statut juridique',
    promulgationDate: 'Date de promulgation',
    publicationDate: 'Date de publication',
    moniteurRef: 'Référence Moniteur (numéro)',
    moniteurHint:
      '« Le Moniteur » est ajouté automatiquement à l’affichage. Saisissez seulement le numéro et la date — ex. « n° 47 du 4 juin 2014 ». Pas d’URL ni de lien.',
    comment: 'Commentaire (optionnel, journalisé)',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Métadonnées enregistrées',
    failed: 'Échec',
    titleFrEmpty: 'Le titre FR ne peut pas être vide.',
    none: 'Aucune',
  },
  ht: {
    title: 'Modifye metadata',
    desc:
      'Chan an fransè ak an kreyòl. Slug ak estati editoryal pa modifye isit la.',
    titleFr: 'Tit (FR) *',
    titleHt: 'Tit (KW)',
    descFr: 'Deskripsyon (FR)',
    descHt: 'Deskripsyon (KW)',
    category: 'Kategori',
    codeSubcategory: 'Sou-kategori',
    legalStatus: 'Estati jiridik',
    promulgationDate: 'Dat pwomilgasyon',
    publicationDate: 'Dat piblikasyon',
    moniteurRef: 'Referans Moniteur (nimewo)',
    moniteurHint:
      '« Le Moniteur » ajoute otomatikman lè y’ap afiche. Mete sèlman nimewo ak dat la — egz. « n° 47 du 4 jen 2014 ». Pa met URL ni lyen.',
    comment: 'Kòmantè (opsyonèl, jounalize)',
    cancel: 'Anile',
    save: 'Anrejistre',
    saving: 'Ap anrejistre…',
    saved: 'Metadata anrejistre',
    failed: 'Echwe',
    titleFrEmpty: 'Tit FR pa ka vid.',
    none: 'Okenn',
  },
}

const CATEGORY_OPTS = [
  { value: 'constitution', label: { fr: 'Constitution', ht: 'Konstitisyon' } },
  { value: 'code', label: { fr: 'Code', ht: 'Kòd' } },
  { value: 'loi', label: { fr: 'Loi', ht: 'Lwa' } },
  { value: 'decret', label: { fr: 'Décret', ht: 'Dekrè' } },
  { value: 'arrete', label: { fr: 'Arrêté', ht: 'Arète' } },
  { value: 'circulaire', label: { fr: 'Circulaire', ht: 'Sirkilè' } },
  { value: 'convention', label: { fr: 'Convention', ht: 'Konvansyon' } },
]

const SUBCATEGORY_OPTS = [
  { value: 'code_civil', label: 'Code civil' },
  { value: 'code_penal', label: 'Code pénal' },
  { value: 'code_travail', label: 'Code du travail' },
  { value: 'code_commerce', label: 'Code de commerce' },
  { value: 'code_rural', label: 'Code rural' },
  { value: 'code_procedure_civile', label: 'Code de procédure civile' },
  { value: 'code_procedure_penale', label: 'Code de procédure pénale' },
  { value: 'autre', label: 'Autre' },
]

const STATUS_OPTS = [
  { value: 'in_force', label: { fr: 'En vigueur', ht: 'An vigè' } },
  {
    value: 'partially_abrogated',
    label: { fr: 'Partiellement abrogé', ht: 'Pasyèlman abwoje' },
  },
  { value: 'abrogated', label: { fr: 'Abrogé', ht: 'Abwoje' } },
]

export type LegalTextMetadata = {
  slug: string
  title_fr: string
  title_ht: string | null
  description_fr: string | null
  description_ht: string | null
  promulgation_date: string | null
  publication_date: string | null
  moniteur_ref: string | null
  category: string
  code_subcategory: string | null
  status: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: LegalTextMetadata
  onSaved?: () => void
}

export function MetadataEditor({ open, onOpenChange, text, onSaved }: Props) {
  const { language } = useLanguage()
  const lang = (language as 'fr' | 'ht') ?? 'fr'
  const t = COPY[lang]
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  // Local form state, seeded from the current text. Reset whenever the
  // sheet reopens so editors don't carry stale drafts across sessions.
  const [form, setForm] = useState(() => ({
    title_fr: text.title_fr,
    title_ht: text.title_ht ?? '',
    description_fr: text.description_fr ?? '',
    description_ht: text.description_ht ?? '',
    promulgation_date: text.promulgation_date ?? '',
    publication_date: text.publication_date ?? '',
    moniteur_ref: text.moniteur_ref ?? '',
    category: text.category,
    code_subcategory: text.code_subcategory ?? '',
    status: text.status,
    comment: '',
  }))

  // Reset form on each open so changes don't leak across openings.
  function handleOpenChange(next: boolean) {
    if (next) {
      setForm({
        title_fr: text.title_fr,
        title_ht: text.title_ht ?? '',
        description_fr: text.description_fr ?? '',
        description_ht: text.description_ht ?? '',
        promulgation_date: text.promulgation_date ?? '',
        publication_date: text.publication_date ?? '',
        moniteur_ref: text.moniteur_ref ?? '',
        category: text.category,
        code_subcategory: text.code_subcategory ?? '',
        status: text.status,
        comment: '',
      })
    }
    onOpenChange(next)
  }

  function patch<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function save() {
    if (!form.title_fr.trim()) {
      toast(t.titleFrEmpty)
      return
    }
    // Build a minimal patch — only fields that actually changed. The backend
    // also no-ops unchanged values, but this keeps the audit log diff clean
    // and the request payload small.
    const original = {
      title_fr: text.title_fr,
      title_ht: text.title_ht ?? '',
      description_fr: text.description_fr ?? '',
      description_ht: text.description_ht ?? '',
      promulgation_date: text.promulgation_date ?? '',
      publication_date: text.publication_date ?? '',
      moniteur_ref: text.moniteur_ref ?? '',
      category: text.category,
      code_subcategory: text.code_subcategory ?? '',
      status: text.status,
    }
    const body: LegalTextMetadataPatch = {}
    ;(Object.keys(original) as (keyof typeof original)[]).forEach((key) => {
      const a = (form as Record<string, string>)[key].trim()
      const b = String(original[key] ?? '').trim()
      if (a === b) return
      // Empty string for nullable fields → null. title_fr is non-nullable.
      if (key === 'title_fr') {
        body.title_fr = a
      } else if (key === 'category') {
        body.category = a as LegalTextMetadataPatch['category']
      } else if (key === 'status') {
        body.status = a as LegalTextMetadataPatch['status']
      } else if (key === 'code_subcategory') {
        body.code_subcategory = a
          ? (a as LegalTextMetadataPatch['code_subcategory'])
          : null
      } else {
        ;(body as Record<string, string | null>)[key] = a === '' ? null : a
      }
    })

    if (Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }

    if (form.comment.trim()) body.comment = form.comment.trim()

    startTransition(async () => {
      try {
        await updateLegalTextMetadata(text.slug, body)
        toast(t.saved)
        onOpenChange(false)
        onSaved?.()
      } catch (err) {
        const code = err instanceof ApiError ? ` (${err.status})` : ''
        toast(`${t.failed}${code}`)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-8 pt-8 pb-2">
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>{t.desc}</SheetDescription>
        </SheetHeader>

        <div className="mt-2 space-y-6 px-8 pb-32">
          <Field label={t.titleFr}>
            <Input
              value={form.title_fr}
              onChange={(e) => patch('title_fr', e.target.value)}
              required
            />
          </Field>

          <Field label={t.titleHt}>
            <Input
              value={form.title_ht}
              onChange={(e) => patch('title_ht', e.target.value)}
            />
          </Field>

          <Field label={t.descFr}>
            <Textarea
              rows={3}
              value={form.description_fr}
              onChange={(e) => patch('description_fr', e.target.value)}
            />
          </Field>

          <Field label={t.descHt}>
            <Textarea
              rows={3}
              value={form.description_ht}
              onChange={(e) => patch('description_ht', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t.category}>
              <Select
                value={form.category}
                onValueChange={(v) => patch('category', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t.legalStatus}>
              <Select
                value={form.status}
                onValueChange={(v) => patch('status', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.category === 'code' && (
            <Field label={t.codeSubcategory}>
              <Select
                value={form.code_subcategory || '__none'}
                onValueChange={(v) =>
                  patch('code_subcategory', v === '__none' ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— {t.none} —</SelectItem>
                  {SUBCATEGORY_OPTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t.promulgationDate}>
              <Input
                type="date"
                value={form.promulgation_date}
                onChange={(e) => patch('promulgation_date', e.target.value)}
              />
            </Field>
            <Field label={t.publicationDate}>
              <Input
                type="date"
                value={form.publication_date}
                onChange={(e) => patch('publication_date', e.target.value)}
              />
            </Field>
          </div>

          <Field label={t.moniteurRef} hint={t.moniteurHint}>
            <Input
              value={form.moniteur_ref}
              onChange={(e) => patch('moniteur_ref', e.target.value)}
              placeholder="n° 47 du 4 juin 2014"
            />
          </Field>

          <Field label={t.comment}>
            <Textarea
              rows={2}
              value={form.comment}
              onChange={(e) => patch('comment', e.target.value)}
            />
          </Field>
        </div>

        <div className="fixed bottom-0 right-0 w-full sm:max-w-2xl lg:max-w-3xl border-t bg-white px-8 py-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t.cancel}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {pending ? t.saving : t.save}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
          {hint}
        </span>
      )}
    </label>
  )
}
