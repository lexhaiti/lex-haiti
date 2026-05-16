'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import {
  createLegalText,
  type LegalTextCreatePayload,
} from '@/lib/api/endpoints'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

// Same Tiptap-backed editor the other formal blocks use (preamble /
// visa / considérants / mentions procédurales / enacting / closing
// formula on the LawDetail edit panels). Dynamic-imported so the
// editor JS isn't pulled on the public read paths.
const RichArticleEditor = dynamic(
  () =>
    import(
      '@/components/law-details/_editor/RichArticleEditor'
    ).then((m) => ({ default: m.RichArticleEditor })),
  { ssr: false },
)

// Slug shape the backend enforces (services/editorial/service.py:_SLUG_RE):
// lowercase ASCII letters / digits / hyphens, 1-200, no leading/trailing
// hyphen. The wizard derives a slug from title_fr on first edit, but the
// editor can override before save.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function deriveSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200)
}

type TabKey = 'identity' | 'blocks' | 'review'

const CATEGORIES = [
  { value: 'loi', label: 'Loi' },
  { value: 'decret', label: 'Décret' },
  { value: 'arrete', label: 'Arrêté' },
  { value: 'circulaire', label: 'Circulaire' },
  { value: 'ordonnance', label: 'Ordonnance' },
  { value: 'convention', label: 'Convention' },
  { value: 'code', label: 'Code' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'communique', label: 'Communiqué' },
  { value: 'avis', label: 'Avis' },
  { value: 'other_regulatory', label: 'Autre acte réglementaire' },
]

const CODE_SUBCATS = [
  { value: 'code_civil', label: 'Code civil' },
  { value: 'code_penal', label: 'Code pénal' },
  { value: 'code_travail', label: 'Code du travail' },
  { value: 'code_commerce', label: 'Code de commerce' },
  { value: 'code_rural', label: 'Code rural' },
  { value: 'code_procedure_civile', label: 'Code de procédure civile' },
  { value: 'code_procedure_penale', label: 'Code de procédure pénale' },
  { value: 'autre', label: 'Autre' },
]

const STATUSES = [
  { value: 'in_force', label: 'En vigueur' },
  { value: 'abrogated', label: 'Abrogée' },
  { value: 'partially_abrogated', label: 'Partiellement abrogée' },
  { value: 'not_yet_in_force', label: 'Non encore en vigueur' },
  { value: 'historical', label: 'Historique' },
]

type Draft = {
  category: string
  code_subcategory: string | null
  title_fr: string
  title_ht: string
  description_fr: string
  description_ht: string
  slug: string
  slugTouched: boolean
  status: string
  jurisdiction: string
  issuing_authority: string
  promulgation_date: string
  publication_date: string
  moniteur_ref: string
  preamble_fr: string
  preamble_ht: string
  visas_fr: string
  visas_ht: string
  considerants_fr: string
  considerants_ht: string
  mentions_procedurales_fr: string
  mentions_procedurales_ht: string
  enacting_formula_fr: string
  enacting_formula_ht: string
  official_formula: string
}

const EMPTY_DRAFT: Draft = {
  category: 'arrete',
  code_subcategory: null,
  title_fr: '',
  title_ht: '',
  description_fr: '',
  description_ht: '',
  slug: '',
  slugTouched: false,
  status: 'in_force',
  jurisdiction: 'HT',
  issuing_authority: '',
  promulgation_date: '',
  publication_date: '',
  moniteur_ref: '',
  preamble_fr: '',
  preamble_ht: '',
  visas_fr: '',
  visas_ht: '',
  considerants_fr: '',
  considerants_ht: '',
  mentions_procedurales_fr: '',
  mentions_procedurales_ht: '',
  enacting_formula_fr: '',
  enacting_formula_ht: '',
  official_formula: '',
}

export default function NewLegalTextPage() {
  useT() // primes the language context — i18n catalogue not strictly
         // needed yet but keeps the layout chrome consistent with the
         // rest of /editorial.
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [activeTab, setActiveTab] = useState<TabKey>('identity')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-derive slug from title_fr until the editor types directly into
  // the slug field — same affordance the existing import panel uses.
  const effectiveSlug = draft.slugTouched
    ? draft.slug
    : deriveSlug(draft.title_fr)

  const errors = useMemo(() => validate(draft, effectiveSlug), [
    draft,
    effectiveSlug,
  ])
  const canSave = errors.identity.length === 0

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function save(publish = false) {
    setSaving(true)
    setError(null)
    try {
      const payload: LegalTextCreatePayload = {
        slug: effectiveSlug,
        category: draft.category,
        code_subcategory:
          draft.category === 'code' ? draft.code_subcategory : null,
        jurisdiction: draft.jurisdiction || 'HT',
        title_fr: draft.title_fr.trim(),
        title_ht: emptyToNull(draft.title_ht),
        description_fr: emptyToNull(draft.description_fr),
        description_ht: emptyToNull(draft.description_ht),
        status: draft.status,
        issuing_authority: emptyToNull(draft.issuing_authority),
        promulgation_date: emptyToNull(draft.promulgation_date),
        publication_date: emptyToNull(draft.publication_date),
        moniteur_ref: emptyToNull(draft.moniteur_ref),
        preamble_fr: emptyToHtmlOrNull(draft.preamble_fr),
        preamble_ht: emptyToHtmlOrNull(draft.preamble_ht),
        visas_fr: emptyToHtmlOrNull(draft.visas_fr),
        visas_ht: emptyToHtmlOrNull(draft.visas_ht),
        considerants_fr: emptyToHtmlOrNull(draft.considerants_fr),
        considerants_ht: emptyToHtmlOrNull(draft.considerants_ht),
        mentions_procedurales_fr: emptyToHtmlOrNull(
          draft.mentions_procedurales_fr,
        ),
        mentions_procedurales_ht: emptyToHtmlOrNull(
          draft.mentions_procedurales_ht,
        ),
        enacting_formula_fr: emptyToHtmlOrNull(draft.enacting_formula_fr),
        enacting_formula_ht: emptyToHtmlOrNull(draft.enacting_formula_ht),
        official_formula: emptyToHtmlOrNull(draft.official_formula),
      }
      const created = await createLegalText(payload)
      // Stay on the wizard chrome until the editor can publish or add
      // articles; the existing /editorial/loi/[slug] page handles the
      // article + heading workflow, so we redirect there. Editor can
      // still flip to published from there.
      router.push(
        `/editorial/loi/${encodeURIComponent(created.slug)}${publish ? '?just_created=1&publish=1' : '?just_created=1'}`,
      )
    } catch (e: any) {
      const msg =
        e?.body?.detail ??
        e?.body?.message ??
        (typeof e?.message === 'string' ? e.message : 'Échec de la sauvegarde')
      setError(String(msg))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb
          items={[
            { label: 'Éditorial', href: '/editorial' },
            { label: 'Textes juridiques', href: '/editorial/loi' },
            { label: 'Nouveau' },
          ]}
        />

        <header className="mt-4 mb-8">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Nouveau texte juridique
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Saisie structurée d&apos;un texte juridique — loi, décret, arrêté,
            code, communiqué. Les articles, les signataires et la liaison à
            un numéro du Moniteur se complètent sur la page d&apos;édition
            après la création.
          </p>
        </header>

        <TabStrip
          active={activeTab}
          onChange={setActiveTab}
          errors={errors}
        />

        <div className="mt-6 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-6 sm:p-8">
          {activeTab === 'identity' && (
            <IdentitySection
              draft={draft}
              effectiveSlug={effectiveSlug}
              update={update}
              errors={errors.identity}
            />
          )}
          {activeTab === 'blocks' && (
            <BlocksSection draft={draft} update={update} />
          )}
          {activeTab === 'review' && (
            <ReviewSection
              draft={draft}
              effectiveSlug={effectiveSlug}
              errors={errors.identity}
            />
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 ring-1 ring-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <ActionBar
        activeTab={activeTab}
        onPrev={() => setActiveTab(prevTab(activeTab))}
        onNext={() => setActiveTab(nextTab(activeTab))}
        onSave={() => save(false)}
        canSave={canSave}
        saving={saving}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Tab strip
// ──────────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: 'identity', label: '1. Identité', desc: 'Type, titre, slug, dates' },
  { key: 'blocks', label: '2. Préambule et blocs', desc: 'Vu / Considérant / Formule' },
  { key: 'review', label: '3. Revue', desc: 'Vérifier et créer le brouillon' },
]

function TabStrip({
  active,
  onChange,
  errors,
}: {
  active: TabKey
  onChange: (t: TabKey) => void
  errors: ReturnType<typeof validate>
}) {
  return (
    <nav className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4" aria-label="Sections du formulaire">
      {TABS.map((t) => {
        const hasErr =
          t.key === 'identity' && errors.identity.length > 0
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'text-left rounded-lg px-4 py-3 ring-1 transition',
              active === t.key
                ? 'bg-slate-900 text-white ring-slate-900'
                : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-400',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{t.label}</span>
              {hasErr && (
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                    active === t.key
                      ? 'bg-amber-300 text-slate-900'
                      : 'bg-amber-100 text-amber-800',
                  )}
                >
                  À compléter
                </span>
              )}
            </div>
            <div
              className={cn(
                'text-xs mt-0.5',
                active === t.key ? 'text-slate-300' : 'text-slate-500',
              )}
            >
              {t.desc}
            </div>
          </button>
        )
      })}
    </nav>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Tab 1 — Identity
// ──────────────────────────────────────────────────────────────────────

function IdentitySection({
  draft,
  effectiveSlug,
  update,
  errors,
}: {
  draft: Draft
  effectiveSlug: string
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void
  errors: string[]
}) {
  return (
    <div className="space-y-6">
      <FieldGroup label="Type d'acte" required>
        <select
          value={draft.category}
          onChange={(e) => update('category', e.target.value)}
          className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FieldGroup>

      {draft.category === 'code' && (
        <FieldGroup label="Sous-catégorie du code" required>
          <select
            value={draft.code_subcategory ?? ''}
            onChange={(e) =>
              update('code_subcategory', e.target.value || null)
            }
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          >
            <option value="">— choisir —</option>
            {CODE_SUBCATS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FieldGroup>
      )}

      <FieldGroup label="Titre" required help="La version française est obligatoire. La version créole est recommandée pour la publication.">
        <BilingualInput
          frValue={draft.title_fr}
          htValue={draft.title_ht}
          onChange={(fr, ht) => {
            update('title_fr', fr)
            update('title_ht', ht)
          }}
          placeholderFr="Décret du 8 août 2025 instaurant l'état d'urgence…"
          placeholderHt="Dekrè 8 out 2025 ki tabli eta dijans…"
        />
      </FieldGroup>

      <FieldGroup label="Description courte" help="Une phrase qui apparaît sur les listes et les liens. Optionnel.">
        <BilingualInput
          frValue={draft.description_fr}
          htValue={draft.description_ht}
          onChange={(fr, ht) => {
            update('description_fr', fr)
            update('description_ht', ht)
          }}
          textarea
          placeholderFr="Résumé d'une phrase…"
          placeholderHt="Rezime nan yon fraz…"
        />
      </FieldGroup>

      <FieldGroup
        label="Slug (permalien)"
        required
        help="Dérivé du titre. Verrouillé après la création — un permalien LexHaïti est définitif."
      >
        <input
          type="text"
          value={effectiveSlug}
          onChange={(e) => {
            update('slug', e.target.value)
            update('slugTouched', true)
          }}
          className="block w-full rounded-md border-slate-300 bg-white text-sm font-mono focus:border-slate-500 focus:ring-slate-500"
        />
        {effectiveSlug && (
          <p className="mt-1 text-xs text-slate-500">
            URL publique :{' '}
            <span className="font-mono">
              /loi/{effectiveSlug}
            </span>
          </p>
        )}
      </FieldGroup>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup label="Statut">
          <select
            value={draft.status}
            onChange={(e) => update('status', e.target.value)}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Juridiction" help='Par défaut HT.'>
          <input
            type="text"
            value={draft.jurisdiction}
            onChange={(e) => update('jurisdiction', e.target.value)}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup label="Date de promulgation">
          <input
            type="date"
            value={draft.promulgation_date}
            onChange={(e) => update('promulgation_date', e.target.value)}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </FieldGroup>
        <FieldGroup label="Date de publication">
          <input
            type="date"
            value={draft.publication_date}
            onChange={(e) => update('publication_date', e.target.value)}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Autorité émettrice">
        <textarea
          value={draft.issuing_authority}
          onChange={(e) => update('issuing_authority', e.target.value)}
          rows={2}
          placeholder="Conseil Présidentiel de Transition · Président de la République · Conseil des Ministres…"
          className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
        />
      </FieldGroup>

      <FieldGroup
        label="Référence Moniteur (texte libre)"
        help="Optionnel. Pour rattacher à un numéro structuré, utiliser le formulaire « Nouveau Moniteur » et y lier ce texte."
      >
        <input
          type="text"
          value={draft.moniteur_ref}
          onChange={(e) => update('moniteur_ref', e.target.value)}
          placeholder="N° 102 du 12 juin 2020"
          className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
        />
      </FieldGroup>

      {errors.length > 0 && (
        <ul className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-800 list-disc list-inside space-y-1">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Tab 2 — Formal blocks
// ──────────────────────────────────────────────────────────────────────

function BlocksSection({
  draft,
  update,
}: {
  draft: Draft
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Tous ces blocs sont optionnels à la création. Vous pourrez les
        compléter, les éditer en HTML enrichi et y ajouter la traduction
        créole sur la page d&apos;édition après avoir créé le brouillon.
      </p>
      <BlockField
        label="Préambule"
        hint="Rare — surtout les constitutions."
        frValue={draft.preamble_fr}
        htValue={draft.preamble_ht}
        onChange={(fr, ht) => {
          update('preamble_fr', fr)
          update('preamble_ht', ht)
        }}
      />
      <BlockField
        label="Visas — « Vu … »"
        frValue={draft.visas_fr}
        htValue={draft.visas_ht}
        onChange={(fr, ht) => {
          update('visas_fr', fr)
          update('visas_ht', ht)
        }}
      />
      <BlockField
        label="Considérants"
        frValue={draft.considerants_fr}
        htValue={draft.considerants_ht}
        onChange={(fr, ht) => {
          update('considerants_fr', fr)
          update('considerants_ht', ht)
        }}
      />
      <BlockField
        label="Mentions procédurales"
        hint="« Sur le rapport… » / « Et après délibération… »"
        frValue={draft.mentions_procedurales_fr}
        htValue={draft.mentions_procedurales_ht}
        onChange={(fr, ht) => {
          update('mentions_procedurales_fr', fr)
          update('mentions_procedurales_ht', ht)
        }}
      />
      <BlockField
        label="Formule d'adoption"
        hint="« DÉCRÈTE », « ARRÊTE », « Le Corps Législatif a voté la loi suivante »"
        frValue={draft.enacting_formula_fr}
        htValue={draft.enacting_formula_ht}
        onChange={(fr, ht) => {
          update('enacting_formula_fr', fr)
          update('enacting_formula_ht', ht)
        }}
      />
      <FieldGroup
        label="Formule de clôture"
        help="« Donné au Palais National… » — apparaît en bloc italique au-dessus des signataires."
      >
        <RichArticleEditor
          value={draft.official_formula}
          onChange={(html: string) => update('official_formula', html)}
          ariaLabel="Formule de clôture"
          placeholder="Donné au Palais National, à Port-au-Prince, le 8 août 2025, An 222e de l'Indépendance."
          tone="amber"
        />
      </FieldGroup>
    </div>
  )
}

function BlockField({
  label,
  hint,
  frValue,
  htValue,
  onChange,
}: {
  label: string
  hint?: string
  frValue: string
  htValue: string
  onChange: (fr: string, ht: string) => void
}) {
  return (
    <FieldGroup label={label} help={hint}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            🇫🇷 Français
          </div>
          <RichArticleEditor
            value={frValue}
            onChange={(html: string) => onChange(html, htValue)}
            ariaLabel={`${label} (FR)`}
            placeholder={`${label} en français…`}
          />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            🇭🇹 Kreyòl
          </div>
          <RichArticleEditor
            value={htValue}
            onChange={(html: string) => onChange(frValue, html)}
            ariaLabel={`${label} (HT)`}
            placeholder={`${label} an kreyòl…`}
          />
        </div>
      </div>
    </FieldGroup>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Tab 3 — Review
// ──────────────────────────────────────────────────────────────────────

function ReviewSection({
  draft,
  effectiveSlug,
  errors,
}: {
  draft: Draft
  effectiveSlug: string
  errors: string[]
}) {
  const cat = CATEGORIES.find((c) => c.value === draft.category)?.label
  return (
    <div className="space-y-6">
      <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Aperçu
        </h3>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            {cat}
          </div>
          <div className="text-xl font-bold text-slate-900">
            {draft.title_fr || (
              <span className="italic text-slate-400">Sans titre</span>
            )}
          </div>
          {draft.title_ht && (
            <div className="text-sm italic text-slate-600">
              {draft.title_ht}
            </div>
          )}
          {draft.description_fr && (
            <p className="text-sm text-slate-700 mt-2">
              {draft.description_fr}
            </p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Pair label="Permalien" value={`/loi/${effectiveSlug}`} mono />
          <Pair label="Statut" value={statusLabel(draft.status)} />
          <Pair
            label="Date de promulgation"
            value={draft.promulgation_date || '—'}
          />
          <Pair
            label="Date de publication"
            value={draft.publication_date || '—'}
          />
        </dl>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">À compléter avant création :</p>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-800">
          Toutes les exigences sont remplies. Vous pouvez créer le brouillon —
          la suite (articles, signataires, lien Moniteur) se complète sur la
          page d&apos;édition.
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Action bar (sticky bottom)
// ──────────────────────────────────────────────────────────────────────

function ActionBar({
  activeTab,
  onPrev,
  onNext,
  onSave,
  canSave,
  saving,
}: {
  activeTab: TabKey
  onPrev: () => void
  onNext: () => void
  onSave: () => void
  canSave: boolean
  saving: boolean
}) {
  const isLast = activeTab === 'review'
  const isFirst = activeTab === 'identity'
  return (
    <div className="fixed inset-x-0 bottom-0 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        <Link
          href="/editorial/loi"
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
        >
          Annuler
        </Link>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={onPrev}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Précédent
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Suivant
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Créer le brouillon
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Small primitives
// ──────────────────────────────────────────────────────────────────────

function FieldGroup({
  label,
  required,
  help,
  children,
}: {
  label: string
  required?: boolean
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
        {label}
        {required && <span className="text-amber-600">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
    </div>
  )
}

function BilingualInput({
  frValue,
  htValue,
  onChange,
  textarea = false,
  rows = 2,
  placeholderFr,
  placeholderHt,
}: {
  frValue: string
  htValue: string
  onChange: (fr: string, ht: string) => void
  textarea?: boolean
  rows?: number
  placeholderFr?: string
  placeholderHt?: string
}) {
  const InputTag = (textarea ? 'textarea' : 'input') as any
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          🇫🇷 Français
        </div>
        <InputTag
          value={frValue}
          onChange={(e: any) => onChange(e.target.value, htValue)}
          rows={textarea ? rows : undefined}
          placeholder={placeholderFr}
          className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
        />
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
          🇭🇹 Kreyòl
        </div>
        <InputTag
          value={htValue}
          onChange={(e: any) => onChange(frValue, e.target.value)}
          rows={textarea ? rows : undefined}
          placeholder={placeholderHt}
          className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
        />
      </div>
    </div>
  )
}

function Pair({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <>
      <dt className="text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd
        className={cn(
          'text-slate-800 font-semibold truncate',
          mono && 'font-mono text-[11px]',
        )}
      >
        {value}
      </dd>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Validation + helpers
// ──────────────────────────────────────────────────────────────────────

function validate(d: Draft, slug: string): { identity: string[] } {
  const out: string[] = []
  if (!d.title_fr.trim()) out.push('Le titre français est obligatoire.')
  if (!slug || !SLUG_RE.test(slug)) {
    out.push(
      'Le slug doit être en minuscules ASCII (lettres, chiffres, tirets ; pas de tiret au début ni à la fin).',
    )
  }
  if (d.category === 'code' && !d.code_subcategory) {
    out.push('Choisissez la sous-catégorie du code.')
  }
  return { identity: out }
}

function emptyToNull(s: string): string | null {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}
function emptyToHtmlOrNull(s: string): string | null {
  const t = (s ?? '').trim()
  if (t === '') return null
  // Plain-text input from the wizard textarea is wrapped in <p>
  // paragraphs so the sanitiser + dangerouslySetInnerHTML on the
  // public side renders consistently with HTML-edited content.
  if (/<[a-z]/i.test(t)) return t
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.replace(/\n/g, ' ').trim())}</p>`)
    .join('')
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
function statusLabel(v: string): string {
  return STATUSES.find((s) => s.value === v)?.label ?? v
}
function nextTab(t: TabKey): TabKey {
  return t === 'identity' ? 'blocks' : t === 'blocks' ? 'review' : 'review'
}
function prevTab(t: TabKey): TabKey {
  return t === 'review' ? 'blocks' : t === 'blocks' ? 'identity' : 'identity'
}
