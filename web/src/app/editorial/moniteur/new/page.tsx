'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import {
  createLegalText,
  createMoniteurIssue,
  listEditorialTexts,
  setMoniteurSommaire,
  type LegalTextCreatePayload,
  type SommaireEntryInput,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

// Mirrors backend MoniteurDocumentType enum.
const DOC_TYPES = [
  { value: 'loi', label: 'Loi' },
  { value: 'decret', label: 'Décret' },
  { value: 'arrete', label: 'Arrêté' },
  { value: 'ordonnance', label: 'Ordonnance' },
  { value: 'convention', label: 'Convention' },
  { value: 'circulaire', label: 'Circulaire' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'code', label: 'Code' },
  { value: 'resolution', label: 'Résolution' },
  { value: 'promulgation', label: 'Promulgation' },
  { value: 'communique', label: 'Communiqué' },
  { value: 'correspondance', label: 'Correspondance' },
  { value: 'errata', label: 'Errata' },
  { value: 'note', label: 'Note éditoriale' },
  { value: 'autre', label: 'Autre' },
]

type TabKey = 'identity' | 'sommaire' | 'review'

type IssueDraft = {
  number: string
  year: string
  publication_date: string
  edition_label: string
  director: string
  director_role: string
  page_count: string
}

const EMPTY_ISSUE: IssueDraft = {
  number: '',
  year: String(new Date().getFullYear()),
  publication_date: '',
  edition_label: '',
  director: '',
  director_role: '',
  page_count: '',
}

type SommaireRowDraft = {
  uid: string // local-only, for React keys + drag-reorder
  detected_category: string
  display_title: string
  detected_date: string
  page_from: string
  page_to: string
  summary_fr: string
  legal_text_id: number | null
  legal_text_label: string | null // display only; the slug + title preview
  parent_uid: string | null
}

function makeRow(): SommaireRowDraft {
  return {
    uid: `r${Math.random().toString(36).slice(2, 10)}`,
    detected_category: 'arrete',
    display_title: '',
    detected_date: '',
    page_from: '',
    page_to: '',
    summary_fr: '',
    legal_text_id: null,
    legal_text_label: null,
    parent_uid: null,
  }
}

export default function NewMoniteurPage() {
  const router = useRouter()
  const [active, setActive] = useState<TabKey>('identity')
  const [issue, setIssue] = useState<IssueDraft>(EMPTY_ISSUE)
  const [rows, setRows] = useState<SommaireRowDraft[]>([makeRow()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = useMemo(() => validate(issue, rows), [issue, rows])
  const canCreate = errors.identity.length === 0

  function updateIssue<K extends keyof IssueDraft>(k: K, v: IssueDraft[K]) {
    setIssue((s) => ({ ...s, [k]: v }))
  }
  function updateRow(uid: string, patch: Partial<SommaireRowDraft>) {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, makeRow()])
  }
  function removeRow(uid: string) {
    setRows((rs) => {
      const filtered = rs.filter((r) => r.uid !== uid)
      // Clear parent links that pointed at this row.
      return filtered.map((r) =>
        r.parent_uid === uid ? { ...r, parent_uid: null } : r,
      )
    })
  }
  function moveRow(uid: string, direction: -1 | 1) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.uid === uid)
      if (i < 0) return rs
      const j = i + direction
      if (j < 0 || j >= rs.length) return rs
      const next = rs.slice()
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const created = await createMoniteurIssue({
        number: issue.number.trim(),
        year: Number(issue.year),
        publication_date: emptyToNull(issue.publication_date),
        edition_label: emptyToNull(issue.edition_label),
        director: emptyToNull(issue.director),
        director_role: emptyToNull(issue.director_role),
      })
      const nonEmpty = rows.filter(
        (r) =>
          r.display_title.trim() ||
          r.legal_text_id !== null ||
          r.detected_category === 'note',
      )
      if (nonEmpty.length > 0) {
        const uidToPosition = new Map(
          nonEmpty.map((r, i) => [r.uid, i] as const),
        )
        const payload: any[] = nonEmpty.map((r, i) => ({
          detected_category: r.detected_category,
          display_title: emptyToNull(r.display_title) ?? undefined,
          detected_title: emptyToNull(r.display_title) ?? undefined,
          detected_date: emptyToNull(r.detected_date) ?? undefined,
          summary_fr: emptyToNull(r.summary_fr) ?? undefined,
          page_from: r.page_from ? Number(r.page_from) : undefined,
          page_to: r.page_to ? Number(r.page_to) : undefined,
          legal_text_id: r.legal_text_id ?? undefined,
          parent_position:
            r.parent_uid && uidToPosition.has(r.parent_uid)
              ? uidToPosition.get(r.parent_uid)
              : undefined,
        }))
        await setMoniteurSommaire(created.id, payload as SommaireEntryInput[])
      }
      router.push(`/moniteur/${encodeURIComponent(created.slug ?? created.id)}?view=editor`)
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
    <div className="min-h-screen bg-white pb-24">
      {/* Same navy hero band as /editorial/loi/new + the editorial
          dashboard so the wizards read as one surface. */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-10 lg:py-14 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: 'Éditorial', href: '/editorial' },
              { label: 'Le Moniteur', href: '/editorial/moniteur' },
              { label: 'Nouveau' },
            ]}
          />
          <h1 className="animate-in fade-in slide-in-from-top-2 duration-500 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            Nouveau numéro du Moniteur
          </h1>
          <p className="animate-in fade-in duration-500 delay-100 fill-mode-both mt-3 text-slate-300 text-base lg:text-lg leading-relaxed max-w-3xl">
            Saisie structurée d&apos;un numéro du journal officiel — métadonnées
            de couverture et sommaire. Chaque entrée du sommaire peut lier un
            texte juridique existant ou en créer un nouveau à la volée.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
        <TabStrip active={active} onChange={setActive} errors={errors} />

        <div className="mt-6 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-6 sm:p-8">
          {active === 'identity' && (
            <IdentitySection
              issue={issue}
              update={updateIssue}
              errors={errors.identity}
            />
          )}
          {active === 'sommaire' && (
            <SommaireSection
              rows={rows}
              update={updateRow}
              add={addRow}
              remove={removeRow}
              move={moveRow}
              errors={errors.sommaire}
            />
          )}
          {active === 'review' && (
            <ReviewSection issue={issue} rows={rows} errors={errors.identity} />
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 ring-1 ring-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <ActionBar
        active={active}
        onPrev={() => setActive(prev(active))}
        onNext={() => setActive(next(active))}
        onSave={save}
        canSave={canCreate}
        saving={saving}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Tab strip + nav
// ──────────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: 'identity', label: '1. Édition', desc: 'Numéro, date, directeur' },
  { key: 'sommaire', label: '2. Sommaire', desc: 'Lier des textes / notes' },
  { key: 'review', label: '3. Revue', desc: 'Vérifier et créer' },
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
    <nav
      className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4"
      aria-label="Sections du formulaire"
    >
      {TABS.map((t) => {
        const hasErr =
          (t.key === 'identity' && errors.identity.length > 0) ||
          (t.key === 'sommaire' && errors.sommaire.length > 0)
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
  issue,
  update,
  errors,
}: {
  issue: IssueDraft
  update: <K extends keyof IssueDraft>(k: K, v: IssueDraft[K]) => void
  errors: string[]
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Numéro" required>
          <input
            value={issue.number}
            onChange={(e) => update('number', e.target.value)}
            placeholder='40 · "Spécial 51"'
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
        <Field label="Année" required>
          <input
            type="number"
            value={issue.year}
            onChange={(e) => update('year', e.target.value)}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
        <Field label="Date de publication" required>
          <input
            type="date"
            value={issue.publication_date}
            onChange={(e) => update('publication_date', e.target.value)}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
      </div>

      <Field
        label="Étiquette d'édition"
        help='Optionnel — "Numéro Spécial", "Numéro Extraordinaire".'
      >
        <input
          value={issue.edition_label}
          onChange={(e) => update('edition_label', e.target.value)}
          className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Directeur">
          <input
            value={issue.director}
            onChange={(e) => update('director', e.target.value)}
            placeholder="Ronald Saint Jean"
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
        <Field label="Titre du directeur">
          <input
            value={issue.director_role}
            onChange={(e) => update('director_role', e.target.value)}
            placeholder="Directeur Général"
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
      </div>

      <Field label="Nombre de pages">
        <input
          type="number"
          value={issue.page_count}
          onChange={(e) => update('page_count', e.target.value)}
          className="block w-full max-w-[160px] rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
        />
      </Field>

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
//  Tab 2 — Sommaire
// ──────────────────────────────────────────────────────────────────────

function SommaireSection({
  rows,
  update,
  add,
  remove,
  move,
  errors,
}: {
  rows: SommaireRowDraft[]
  update: (uid: string, patch: Partial<SommaireRowDraft>) => void
  add: () => void
  remove: (uid: string) => void
  move: (uid: string, direction: -1 | 1) => void
  errors: string[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600 max-w-xl">
          Le sommaire est la liste des actes publiés dans ce numéro. Vous
          pouvez lier un texte juridique déjà saisi dans LexHaïti, ou bien
          déclarer une entrée sans lien pour la compléter plus tard.
          <br />
          <strong>Au moins une entrée</strong> est nécessaire pour qu&apos;un
          numéro soit publié — le brouillon, lui, peut rester vide.
        </p>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter une entrée
        </button>
      </div>

      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.uid}>
            <SommaireRow
              row={r}
              index={i}
              total={rows.length}
              allRows={rows}
              onChange={(p) => update(r.uid, p)}
              onRemove={() => remove(r.uid)}
              onMoveUp={() => move(r.uid, -1)}
              onMoveDown={() => move(r.uid, 1)}
            />
          </li>
        ))}
      </ol>

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

function SommaireRow({
  row,
  index,
  total,
  allRows,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  row: SommaireRowDraft
  index: number
  total: number
  allRows: SommaireRowDraft[]
  onChange: (p: Partial<SommaireRowDraft>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const canMoveUp = index > 0
  const canMoveDown = index < total - 1
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Entrée #{index + 1}
          </div>
          <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              aria-label="Monter cette entrée"
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-l-md"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              aria-label="Descendre cette entrée"
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-r-md border-l border-slate-200"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Type">
          <select
            value={row.detected_category}
            onChange={(e) => onChange({ detected_category: e.target.value })}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          >
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Page (de)">
          <input
            type="number"
            value={row.page_from}
            onChange={(e) => onChange({ page_from: e.target.value })}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
        <Field label="Page (à)">
          <input
            type="number"
            value={row.page_to}
            onChange={(e) => onChange({ page_to: e.target.value })}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Titre affiché dans le sommaire" required>
          <input
            value={row.display_title}
            onChange={(e) => onChange({ display_title: e.target.value })}
            placeholder="Arrêté du 5 juin 2020 sanctionnant le PNPPS"
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field
          label="Lier à un texte juridique"
          help="Optionnel. Tapez le titre pour rechercher dans les brouillons et les textes publiés, ou créez un nouveau texte à partir de cette entrée."
        >
          <LegalTextPicker
            seedTitle={row.display_title}
            seedCategory={row.detected_category}
            seedDate={row.detected_date}
            selectedId={row.legal_text_id}
            selectedLabel={row.legal_text_label}
            onSelect={(id, label) =>
              onChange({ legal_text_id: id, legal_text_label: label })
            }
            onClear={() =>
              onChange({ legal_text_id: null, legal_text_label: null })
            }
          />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date de l'acte">
          <input
            type="date"
            value={row.detected_date}
            onChange={(e) => onChange({ detected_date: e.target.value })}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
        <Field
          label="Acte parent (promulgation)"
          help="Si cette entrée est une promulgation présidentielle d'un acte plus haut dans la liste."
        >
          <select
            value={row.parent_uid ?? ''}
            onChange={(e) =>
              onChange({ parent_uid: e.target.value || null })
            }
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          >
            <option value="">— aucun —</option>
            {allRows
              .filter((r) => r.uid !== row.uid)
              .map((r, i) => (
                <option key={r.uid} value={r.uid}>
                  #{allRows.indexOf(r) + 1} —{' '}
                  {r.display_title || '(sans titre)'}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Résumé / description (FR)">
          <textarea
            rows={2}
            value={row.summary_fr}
            onChange={(e) => onChange({ summary_fr: e.target.value })}
            className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
          />
        </Field>
      </div>
    </div>
  )
}

// LegalText autocomplete picker + "create new from this row" CTA
function LegalTextPicker({
  seedTitle,
  seedCategory,
  seedDate,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
}: {
  seedTitle: string
  seedCategory: string
  seedDate: string
  selectedId: number | null
  selectedLabel: string | null
  onSelect: (id: number, label: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<
    Array<{ id: number; slug: string; title_fr: string; category: string }>
  >([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res: any = await listEditorialTexts({
          q: q || undefined,
          limit: 10,
        })
        const items = (res?.items ?? []) as any[]
        setResults(
          items.map((it: any) => ({
            id: it.id,
            slug: it.slug,
            title_fr: it.title_fr ?? '(sans titre)',
            category: it.category ?? '',
          })),
        )
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [q, open])

  if (selectedId !== null) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-sm">
        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        <span className="text-emerald-900 truncate flex-1">
          {selectedLabel ?? `Texte #${selectedId}`}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-emerald-700 hover:text-emerald-900"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 focus-within:border-slate-500 h-full">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Rechercher dans les textes juridiques…"
              className="block w-full border-0 bg-transparent text-sm focus:ring-0 py-2"
            />
            {loading && (
              <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
            )}
          </div>
          {open && (q || results.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">
                  {loading ? 'Recherche…' : 'Aucun résultat.'}
                </div>
              ) : (
                <ul>
                  {results.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // mousedown so the click fires before the input's
                          // onBlur closes the dropdown.
                          e.preventDefault()
                          onSelect(it.id, `${it.title_fr} (${it.slug})`)
                          setOpen(false)
                          setQ('')
                        }}
                        className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                      >
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {it.title_fr}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                          <span className="px-1 py-px rounded bg-slate-100 uppercase">
                            {it.category}
                          </span>
                          /loi/{it.slug}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-100 shrink-0"
          title="Créer un nouveau texte juridique à partir de cette entrée"
        >
          <Plus className="w-3.5 h-3.5" />
          Créer
        </button>
      </div>

      {showCreate && (
        <QuickCreateLegalTextModal
          seedTitle={seedTitle}
          seedCategory={seedCategory}
          seedDate={seedDate}
          onClose={() => setShowCreate(false)}
          onCreated={(id, label) => {
            setShowCreate(false)
            onSelect(id, label)
          }}
        />
      )}
    </>
  )
}

// Minimal in-modal create form. Pre-fills from the sommaire row so
// the editor can stay in flow: enter sommaire row → create text →
// auto-link. Submits straight to ``POST /editorial/legal-texts``
// (status ``draft``). Full editing — articles, signers, formal
// blocks beyond title/description — happens later on the
// ``/editorial/loi/[slug]`` page.
function QuickCreateLegalTextModal({
  seedTitle,
  seedCategory,
  seedDate,
  onClose,
  onCreated,
}: {
  seedTitle: string
  seedCategory: string
  seedDate: string
  onClose: () => void
  onCreated: (id: number, label: string) => void
}) {
  const [titleFr, setTitleFr] = useState(seedTitle.trim())
  const [titleHt, setTitleHt] = useState('')
  const [category, setCategory] = useState(seedCategory)
  const [descFr, setDescFr] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [manualSlug, setManualSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const derivedSlug = useMemo(() => deriveSlug(titleFr), [titleFr])
  const slug = slugTouched ? manualSlug : derivedSlug

  async function submit() {
    setError(null)
    if (!titleFr.trim()) {
      setError('Le titre français est obligatoire.')
      return
    }
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError(
        'Le slug doit être en minuscules ASCII (lettres, chiffres, tirets).',
      )
      return
    }
    setSaving(true)
    try {
      const payload: LegalTextCreatePayload = {
        slug,
        category,
        jurisdiction: 'HT',
        title_fr: titleFr.trim(),
        title_ht: titleHt.trim() || null,
        description_fr: descFr.trim() || null,
        promulgation_date: seedDate || null,
        status: 'in_force',
      }
      const created: any = await createLegalText(payload)
      onCreated(created.id, `${created.title_fr} (${created.slug})`)
    } catch (e: any) {
      const msg =
        e?.body?.detail ??
        e?.body?.message ??
        (typeof e?.message === 'string' ? e.message : 'Échec de la création.')
      setError(String(msg))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            Créer un texte juridique
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-slate-500 hover:text-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm">
          <p className="text-xs text-slate-500">
            Brouillon rapide pré-rempli depuis cette entrée du sommaire.
            Vous pourrez compléter les blocs (visas, considérants,
            articles, signataires) sur la page d&apos;édition après la
            création.
          </p>

          <Field label="Type" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
            >
              <option value="loi">Loi</option>
              <option value="decret">Décret</option>
              <option value="arrete">Arrêté</option>
              <option value="ordonnance">Ordonnance</option>
              <option value="convention">Convention</option>
              <option value="circulaire">Circulaire</option>
              <option value="code">Code</option>
              <option value="constitution">Constitution</option>
              <option value="communique">Communiqué</option>
              <option value="avis">Avis</option>
              <option value="other_regulatory">Autre acte réglementaire</option>
            </select>
          </Field>

          <Field label="Titre (FR)" required>
            <input
              value={titleFr}
              onChange={(e) => setTitleFr(e.target.value)}
              className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
              placeholder="Décret du… / Arrêté du…"
            />
          </Field>

          <Field label="Titre (HT)">
            <input
              value={titleHt}
              onChange={(e) => setTitleHt(e.target.value)}
              className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
            />
          </Field>

          <Field label="Slug (permalien)" required>
            <input
              value={slug}
              onChange={(e) => {
                setManualSlug(e.target.value)
                setSlugTouched(true)
              }}
              className="block w-full rounded-md border-slate-300 bg-white text-sm font-mono focus:border-slate-500 focus:ring-slate-500"
            />
            {slug && (
              <p className="mt-1 text-xs text-slate-500 font-mono">
                /loi/{slug}
              </p>
            )}
          </Field>

          <Field label="Description courte (FR)">
            <textarea
              value={descFr}
              onChange={(e) => setDescFr(e.target.value)}
              rows={2}
              className="block w-full rounded-md border-slate-300 bg-white text-sm focus:border-slate-500 focus:ring-slate-500"
            />
          </Field>

          {error && (
            <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Créer et lier
          </button>
        </div>
      </div>
    </div>
  )
}

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

// ──────────────────────────────────────────────────────────────────────
//  Tab 3 — Review
// ──────────────────────────────────────────────────────────────────────

function ReviewSection({
  issue,
  rows,
  errors,
}: {
  issue: IssueDraft
  rows: SommaireRowDraft[]
  errors: string[]
}) {
  const nonEmpty = rows.filter(
    (r) => r.display_title.trim() || r.legal_text_id !== null,
  )
  return (
    <div className="space-y-6">
      <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 p-5 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Aperçu
        </h3>
        <div className="text-xl font-bold text-slate-900">
          Le Moniteur — N°{' '}
          {issue.number || (
            <span className="italic text-slate-400">…</span>
          )}
        </div>
        <div className="text-sm text-slate-600">
          {issue.publication_date || (
            <span className="italic text-slate-400">Sans date</span>
          )}
          {issue.edition_label ? ` · ${issue.edition_label}` : ''}
          {issue.director ? ` · ${issue.director}` : ''}
        </div>
        <div className="mt-3">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            Sommaire ({nonEmpty.length})
          </div>
          {nonEmpty.length === 0 ? (
            <p className="text-sm italic text-slate-500">
              Aucune entrée. Vous pourrez en ajouter après la création.
            </p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {nonEmpty.map((r, i) => (
                <li
                  key={r.uid}
                  className="flex items-start gap-2 text-slate-700"
                >
                  <span className="text-slate-400 font-mono text-xs mt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-[10px] uppercase tracking-wider font-bold text-slate-700 shrink-0">
                    {
                      DOC_TYPES.find((d) => d.value === r.detected_category)
                        ?.label
                    }
                  </span>
                  <span className="flex-1">
                    {r.display_title || (
                      <span className="italic text-slate-400">
                        (sans titre)
                      </span>
                    )}
                    {r.legal_text_id !== null && (
                      <span className="ml-2 text-xs text-emerald-700 font-semibold">
                        ↪ texte lié
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">À compléter :</p>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-800">
          Vous pouvez créer le numéro maintenant. La page d&apos;édition
          permettra de réordonner et compléter le sommaire avant publication.
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
//  Action bar + primitives
// ──────────────────────────────────────────────────────────────────────

function ActionBar({
  active,
  onPrev,
  onNext,
  onSave,
  canSave,
  saving,
}: {
  active: TabKey
  onPrev: () => void
  onNext: () => void
  onSave: () => void
  canSave: boolean
  saving: boolean
}) {
  const isFirst = active === 'identity'
  const isLast = active === 'review'
  return (
    <div className="fixed inset-x-0 bottom-0 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        <Link
          href="/editorial/moniteur"
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
              Créer le numéro
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
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

// ──────────────────────────────────────────────────────────────────────
//  Validation
// ──────────────────────────────────────────────────────────────────────

function validate(
  issue: IssueDraft,
  rows: SommaireRowDraft[],
): { identity: string[]; sommaire: string[] } {
  const id: string[] = []
  if (!issue.number.trim()) id.push('Le numéro est obligatoire.')
  if (!issue.year.trim() || !/^\d{4}$/.test(issue.year)) {
    id.push("L'année doit être un nombre à 4 chiffres.")
  }
  if (!issue.publication_date) {
    id.push('La date de publication est obligatoire.')
  }
  const som: string[] = []
  const nonEmpty = rows.filter(
    (r) => r.display_title.trim() || r.legal_text_id !== null,
  )
  for (const r of nonEmpty) {
    if (!r.display_title.trim()) {
      som.push(
        `Une entrée a un texte lié mais pas de titre affiché — ajoutez un titre.`,
      )
      break
    }
  }
  return { identity: id, sommaire: som }
}

function emptyToNull(s: string): string | null {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}
function next(t: TabKey): TabKey {
  return t === 'identity' ? 'sommaire' : t === 'sommaire' ? 'review' : 'review'
}
function prev(t: TabKey): TabKey {
  return t === 'review' ? 'sommaire' : t === 'sommaire' ? 'identity' : 'identity'
}
