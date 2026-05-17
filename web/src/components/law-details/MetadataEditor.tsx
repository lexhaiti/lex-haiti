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
import { useT } from '@/i18n/useT'
import { ApiError } from '@/lib/api/client'
import {
  type LegalTextMetadataPatch,
  updateLegalTextMetadata,
} from '@/lib/api/endpoints'

// Copy lives at `metadataEditor.*` and `editorial.import.legalText.{categoryOptions,statusOptions}.*`
// in i18n/{fr,ht}.ts.

const CATEGORY_VALUES = [
  'constitution',
  'code',
  'loi',
  'loi_constitutionnelle',
  'decret',
  'arrete',
  'circulaire',
  'convention',
  'ordonnance',
] as const

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

const STATUS_VALUES = ['in_force', 'partially_abrogated', 'abrogated'] as const

export type LegalTextMetadata = {
  slug: string
  title_fr: string
  title_ht: string | null
  /** Moniteur-verbatim form of the title (no date) — distinct from
   *  the citation-form ``title_*`` above. Rendered in the LawDetail
   *  body under the doc-type heading. */
  official_title_fr: string | null
  official_title_ht: string | null
  description_fr: string | null
  description_ht: string | null
  promulgation_date: string | null
  publication_date: string | null
  moniteur_ref: string | null
  category: string
  code_subcategory: string | null
  status: string
  // Page-1 + post-dispositif official metadata. All optional — old
  // corpus rows predate the columns and many older laws lack the
  // modern header structure entirely.
  official_number: string | null
  issuing_authority: string | null
  official_formula: string | null
  // Short formula that sits just *above* the article block on the
  // reader page — e.g. "Sur proposition de … le Sénat a adopté la
  // loi suivante :". Distinct from ``official_formula`` (the long
  // page-1 + post-dispositif sovereignty/promulgation block).
  enacting_formula_fr: string | null
  enacting_formula_ht: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: LegalTextMetadata
  onSaved?: () => void
  /** Fires when the saved patch changed the slug. Parent is
   *  responsible for navigating to the new URL (the LawDetail page
   *  uses ``router.replace`` so the back button doesn't return to
   *  the old slug). The argument is the new slug. */
  onSlugChanged?: (newSlug: string) => void
}

export function MetadataEditor({
  open,
  onOpenChange,
  text,
  onSaved,
  onSlugChanged,
}: Props) {
  const { t } = useT()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  // Status labels reuse the `searchAdvanced.statusPills.*` keys; the same
  // `LegalStatus` enum values are surfaced on both screens.
  const statusLabel = (value: string): string =>
    t(`searchAdvanced.statusPills.${value}`)

  const categoryLabel = (value: string): string =>
    t(`editorial.import.legalText.categoryOptions.${value}`)

  // Local form state, seeded from the current text. Reset whenever the
  // sheet reopens so editors don't carry stale drafts across sessions.
  const [form, setForm] = useState(() => ({
    slug: text.slug,
    title_fr: text.title_fr,
    title_ht: text.title_ht ?? '',
    official_title_fr: text.official_title_fr ?? '',
    official_title_ht: text.official_title_ht ?? '',
    description_fr: text.description_fr ?? '',
    description_ht: text.description_ht ?? '',
    promulgation_date: text.promulgation_date ?? '',
    publication_date: text.publication_date ?? '',
    moniteur_ref: text.moniteur_ref ?? '',
    category: text.category,
    code_subcategory: text.code_subcategory ?? '',
    status: text.status,
    official_number: text.official_number ?? '',
    issuing_authority: text.issuing_authority ?? '',
    official_formula: text.official_formula ?? '',
    enacting_formula_fr: text.enacting_formula_fr ?? '',
    enacting_formula_ht: text.enacting_formula_ht ?? '',
    comment: '',
  }))

  // Reset form on each open so changes don't leak across openings.
  function handleOpenChange(next: boolean) {
    if (next) {
      setForm({
        slug: text.slug,
        title_fr: text.title_fr,
        title_ht: text.title_ht ?? '',
        official_title_fr: text.official_title_fr ?? '',
        official_title_ht: text.official_title_ht ?? '',
        description_fr: text.description_fr ?? '',
        description_ht: text.description_ht ?? '',
        promulgation_date: text.promulgation_date ?? '',
        publication_date: text.publication_date ?? '',
        moniteur_ref: text.moniteur_ref ?? '',
        category: text.category,
        code_subcategory: text.code_subcategory ?? '',
        status: text.status,
        official_number: text.official_number ?? '',
        issuing_authority: text.issuing_authority ?? '',
        official_formula: text.official_formula ?? '',
        enacting_formula_fr: text.enacting_formula_fr ?? '',
        enacting_formula_ht: text.enacting_formula_ht ?? '',
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
      toast(t('metadataEditor.titleFrEmpty'))
      return
    }
    // Slug format check — mirrors the backend ``_SLUG_RE`` so the
    // editor gets immediate feedback instead of a round-trip error
    // dressed up as a generic "failed" toast.
    const trimmedSlug = form.slug.trim()
    if (!trimmedSlug) {
      toast(t('metadataEditor.slugEmpty'))
      return
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/.test(trimmedSlug)) {
      toast(t('metadataEditor.slugInvalid'))
      return
    }
    // Build a minimal patch — only fields that actually changed. The backend
    // also no-ops unchanged values, but this keeps the audit log diff clean
    // and the request payload small.
    const original = {
      slug: text.slug,
      title_fr: text.title_fr,
      title_ht: text.title_ht ?? '',
      official_title_fr: text.official_title_fr ?? '',
      official_title_ht: text.official_title_ht ?? '',
      description_fr: text.description_fr ?? '',
      description_ht: text.description_ht ?? '',
      promulgation_date: text.promulgation_date ?? '',
      publication_date: text.publication_date ?? '',
      moniteur_ref: text.moniteur_ref ?? '',
      category: text.category,
      code_subcategory: text.code_subcategory ?? '',
      status: text.status,
      official_number: text.official_number ?? '',
      issuing_authority: text.issuing_authority ?? '',
      official_formula: text.official_formula ?? '',
      enacting_formula_fr: text.enacting_formula_fr ?? '',
      enacting_formula_ht: text.enacting_formula_ht ?? '',
    }
    const body: LegalTextMetadataPatch = {}
    ;(Object.keys(original) as (keyof typeof original)[]).forEach((key) => {
      const a = (form as Record<string, string>)[key].trim()
      const b = String(original[key] ?? '').trim()
      if (a === b) return
      // Empty string for nullable fields → null. title_fr + slug are
      // non-nullable on the backend, so they get passed through
      // verbatim (empty-slug validation happens above in the form
      // guards).
      if (key === 'title_fr') {
        body.title_fr = a
      } else if (key === 'slug') {
        body.slug = a
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
        const updated = await updateLegalTextMetadata(text.slug, body)
        toast(t('metadataEditor.saved'))
        onOpenChange(false)
        // If the slug changed, notify the parent so it can redirect
        // the URL — the old slug now 404s on subsequent reads.
        if (body.slug && updated.slug && updated.slug !== text.slug) {
          onSlugChanged?.(updated.slug)
        } else {
          onSaved?.()
        }
      } catch (err) {
        const code = err instanceof ApiError ? ` (${err.status})` : ''
        toast(`${t('metadataEditor.failed')}${code}`)
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
          <SheetTitle>{t('metadataEditor.title')}</SheetTitle>
          <SheetDescription>{t('metadataEditor.desc')}</SheetDescription>
        </SheetHeader>

        <div className="mt-2 space-y-6 px-8 pb-32">
          <Field label={t('metadataEditor.titleFr')}>
            <Input
              value={form.title_fr}
              onChange={(e) => patch('title_fr', e.target.value)}
              required
            />
          </Field>

          <Field label={t('metadataEditor.titleHt')}>
            <Input
              value={form.title_ht}
              onChange={(e) => patch('title_ht', e.target.value)}
            />
          </Field>

          {/* Moniteur-verbatim title — multi-line so editors can paste
              the original printed form which often wraps over 2–3
              lines (the page-1 sommaire and the heading above the
              issuing authority both carry the same long uppercase
              sentence). Kept in its own pair of fields so the
              citation-form title above stays clean. */}
          <Field
            label={t('metadataEditor.officialTitleFr')}
            hint={t('metadataEditor.officialTitleHint')}
          >
            <Textarea
              rows={3}
              value={form.official_title_fr}
              onChange={(e) => patch('official_title_fr', e.target.value)}
            />
          </Field>

          <Field label={t('metadataEditor.officialTitleHt')}>
            <Textarea
              rows={3}
              value={form.official_title_ht}
              onChange={(e) => patch('official_title_ht', e.target.value)}
            />
          </Field>

          {/* Slug override — the parser produces a slug from the
              title, which can run to 80+ characters for long
              arrêté titles. The editor can shorten it here. The
              backend validates the format and rejects collisions. */}
          <Field
            label={t('metadataEditor.slug')}
            hint={t('metadataEditor.slugHint')}
          >
            <Input
              value={form.slug}
              onChange={(e) => patch('slug', e.target.value)}
              className="font-mono text-sm"
              spellCheck={false}
            />
            {form.slug !== text.slug && (
              <p className="mt-1 text-[11px] text-amber-700">
                {t('metadataEditor.slugChangedWarning')}
              </p>
            )}
          </Field>

          <Field
            label={t('metadataEditor.descFr')}
            hint={t('metadataEditor.descHint')}
          >
            <Textarea
              rows={3}
              value={form.description_fr}
              onChange={(e) => patch('description_fr', e.target.value)}
            />
          </Field>

          <Field label={t('metadataEditor.descHt')}>
            <Textarea
              rows={3}
              value={form.description_ht}
              onChange={(e) => patch('description_ht', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('metadataEditor.category')}>
              <Select
                value={form.category}
                onValueChange={(v) => patch('category', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('metadataEditor.legalStatus')}>
              <Select
                value={form.status}
                onValueChange={(v) => patch('status', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.category === 'code' && (
            <Field label={t('metadataEditor.codeSubcategory')}>
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
                  <SelectItem value="__none">— {t('metadataEditor.none')} —</SelectItem>
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
            <Field label={t('metadataEditor.promulgationDate')}>
              <Input
                type="date"
                value={form.promulgation_date}
                onChange={(e) => patch('promulgation_date', e.target.value)}
              />
            </Field>
            <Field label={t('metadataEditor.publicationDate')}>
              <Input
                type="date"
                value={form.publication_date}
                onChange={(e) => patch('publication_date', e.target.value)}
              />
            </Field>
          </div>

          <Field label={t('metadataEditor.moniteurRef')} hint={t('metadataEditor.moniteurHint')}>
            <Input
              value={form.moniteur_ref}
              onChange={(e) => patch('moniteur_ref', e.target.value)}
              placeholder="n° 47 du 4 juin 2014"
            />
          </Field>

          {/* Official metadata block — page-1 + post-dispositif fields.
              Editable as plain text; the parser pre-fills these on
              import but the editor has the final word. */}
          <Field
            label={t('metadataEditor.officialNumber')}
            hint={t('metadataEditor.officialNumberHint')}
          >
            <Input
              value={form.official_number}
              onChange={(e) => patch('official_number', e.target.value)}
              placeholder="CL-007-09-09"
              className="font-mono"
            />
          </Field>

          <Field
            label={t('metadataEditor.issuingAuthority')}
            hint={t('metadataEditor.issuingAuthorityHint')}
          >
            <Textarea
              rows={3}
              value={form.issuing_authority}
              onChange={(e) => patch('issuing_authority', e.target.value)}
              placeholder="CORPS LÉGISLATIF"
              className="font-mono"
            />
          </Field>

          <Field
            label={t('metadataEditor.officialFormula')}
            hint={t('metadataEditor.officialFormulaHint')}
          >
            <Textarea
              rows={6}
              value={form.official_formula}
              onChange={(e) => patch('official_formula', e.target.value)}
              placeholder={'Votée au Sénat …\n\nDonné au Palais National …'}
              className="font-mono text-xs"
            />
          </Field>

          {/* Enacting formula — the short adoption line that sits
              just above the article block on the reader page
              ("Sur proposition de … le Sénat a adopté la loi
              suivante :"). Distinct from ``official_formula`` which
              is the long page-1 + post-dispositif sovereignty /
              promulgation block. Bilingual; either or both can be
              filled. */}
          <Field
            label={t('metadataEditor.enactingFormulaFr')}
            hint={t('metadataEditor.enactingFormulaHint')}
          >
            <Textarea
              rows={2}
              value={form.enacting_formula_fr}
              onChange={(e) => patch('enacting_formula_fr', e.target.value)}
              placeholder="Sur proposition de … le Sénat a adopté la loi suivante :"
              className="italic text-sm"
            />
          </Field>

          <Field label={t('metadataEditor.enactingFormulaHt')}>
            <Textarea
              rows={2}
              value={form.enacting_formula_ht}
              onChange={(e) => patch('enacting_formula_ht', e.target.value)}
              className="italic text-sm"
            />
          </Field>

          <Field label={t('metadataEditor.comment')}>
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
            {t('metadataEditor.cancel')}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {pending ? t('metadataEditor.saving') : t('metadataEditor.save')}
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
