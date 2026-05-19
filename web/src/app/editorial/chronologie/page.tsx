'use client'

/**
 * Editorial-only Chronologie de la législation haïtienne.
 *
 * Surfaces ``legislation_index_entries`` — the 1,728 historical
 * references seeded from the Ministère de la Justice's 2001
 * ``Index Chronologique de la Législation Haïtienne (1804-2000)``.
 *
 * Editors filter by section / in-force status / year-range and
 * search inside the description column. The row's "imported?"
 * column links into the LawDetail page once an editor has tied the
 * index entry to an ingested LegalText. ``in_force_status`` is
 * editable inline — the canonical surfacing rule is that ``unknown``
 * stays ``unknown`` until a human checks, and the public site (once
 * it surfaces this data) shows ``unknown`` verbatim so visitors
 * don't infer "in force" from silence.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  Search,
  ShieldQuestion,
} from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { useT } from '@/i18n/useT'
import {
  getChronologieStats,
  listChronologie,
  updateChronologieEntry,
  type LegislationIndexEntryRead,
  type LegislationIndexStats,
  type LegislationInForceStatus,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: LegislationInForceStatus[] = [
  'unknown',
  'in_force',
  'abrogated',
  'superseded',
  'modified',
]

const STATUS_PILL: Record<
  LegislationInForceStatus,
  { cls: string; label_fr: string; label_ht: string }
> = {
  unknown: {
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    label_fr: 'Inconnu',
    label_ht: 'Pa konnen',
  },
  in_force: {
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label_fr: 'En vigueur',
    label_ht: 'Anvigè',
  },
  abrogated: {
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
    label_fr: 'Abrogé',
    label_ht: 'Aboli',
  },
  superseded: {
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    label_fr: 'Remplacé',
    label_ht: 'Ranplase',
  },
  modified: {
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
    label_fr: 'Modifié',
    label_ht: 'Modifye',
  },
}

const PAGE_SIZE = 100

export default function ChronologiePage() {
  const { isEditor, status } = useEditorMode()
  const { language } = useT()
  const isFr = language !== 'ht'

  const [stats, setStats] = useState<LegislationIndexStats | null>(null)
  const [items, setItems] = useState<LegislationIndexEntryRead[] | null>(null)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)

  // Filters
  const [section, setSection] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<
    LegislationInForceStatus | undefined
  >(undefined)
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [onlyImported, setOnlyImported] = useState<boolean | undefined>(undefined)
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getChronologieStats())
    } catch (e) {
      setErr((e as Error)?.message ?? String(e))
    }
  }, [])

  const fetchList = useCallback(
    async (off: number) => {
      try {
        const yf = parseInt(yearFrom, 10)
        const yt = parseInt(yearTo, 10)
        const resp = await listChronologie({
          limit: PAGE_SIZE,
          offset: off,
          section: section || undefined,
          in_force_status: statusFilter,
          year_from: Number.isFinite(yf) ? yf : undefined,
          year_to: Number.isFinite(yt) ? yt : undefined,
          only_imported: onlyImported,
          q: qDebounced || undefined,
        })
        setItems(resp.items)
        setTotal(resp.total)
        setOffset(off)
      } catch (e) {
        setErr((e as Error)?.message ?? String(e))
      }
    },
    [section, statusFilter, yearFrom, yearTo, onlyImported, qDebounced],
  )

  useEffect(() => {
    if (!isEditor) return
    fetchStats()
  }, [isEditor, fetchStats])

  useEffect(() => {
    if (!isEditor) return
    setItems(null)
    fetchList(0)
  }, [
    isEditor,
    section,
    statusFilter,
    yearFrom,
    yearTo,
    onlyImported,
    qDebounced,
    fetchList,
  ])

  const handleStatusChange = useCallback(
    async (id: number, next: LegislationInForceStatus) => {
      // Optimistic update; the API stamps verified_at when status flips.
      setItems((prev) =>
        prev
          ? prev.map((row) =>
              row.id === id ? { ...row, in_force_status: next } : row,
            )
          : prev,
      )
      try {
        const updated = await updateChronologieEntry(id, { in_force_status: next })
        setItems((prev) =>
          prev ? prev.map((row) => (row.id === id ? updated : row)) : prev,
        )
        // Refresh aggregate counters in the stats card.
        fetchStats()
      } catch (e) {
        setErr((e as Error)?.message ?? String(e))
        // Roll back on failure
        fetchList(offset)
      }
    },
    [fetchList, fetchStats, offset],
  )

  const sections = useMemo(() => {
    if (!stats?.by_section) return []
    return Object.entries(stats.by_section)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [stats])

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isEditor) {
    return (
      <div className="container py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 max-w-3xl">
          <p className="text-sm text-slate-700">
            {isFr
              ? 'Cette page est réservée aux éditeurs connectés.'
              : 'Paj sa a pou editè ki konekte sèlman.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-10 lg:py-12 space-y-6">
      <Breadcrumb
        variant="light"
        items={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: isFr ? 'Éditorial' : 'Editoryal', href: '/editorial' },
          { label: isFr ? 'Chronologie' : 'Chronoloji' },
        ]}
      />

      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5" />
          {isFr ? 'Index chronologique' : 'Endèks kwonolojik'}
        </p>
        <h1 className="text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
          {isFr
            ? 'Chronologie de la législation haïtienne'
            : 'Kwonoloji lejislasyon ayisyen an'}
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">
          {isFr
            ? "Références extraites de l'Index Chronologique de la Législation Haïtienne (1804-2000) publié par le Ministère de la Justice en 2001. Chaque entrée est une citation historique — elle existe avant que le texte sous-jacent ne soit ingéré."
            : "Referans yo soti nan Endèks Kwonolojik Lejislasyon Ayisyen an (1804-2000), Ministè Lajistis, 2001. Chak antre se yon referans istorik — li egziste anvan menm tèks la enpòte."}
        </p>
      </header>

      {/* In-force status caveat — central to the editorial brief. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold mb-1">
            {isFr
              ? 'Statut « en vigueur » : vérification éditoriale en cours.'
              : 'Estati « anvigè » : verifikasyon editoryal kontinye.'}
          </p>
          <p className="leading-relaxed">
            {isFr
              ? "La majorité des entrées sont marquées « Inconnu » : nous savons que ces textes ont existé, mais nous n'avons pas encore vérifié s'ils ont été abrogés, modifiés ou remplacés. Tant qu'un éditeur ne confirme pas le statut, la version publique de LexHaïti affichera explicitement « Inconnu » — il n'y a pas de présomption de force exécutoire."
              : "Pifò antre yo make « Pa konnen » : nou konnen tèks sa yo te egziste, men nou poko verifye si yo aboli, modifye oswa ranplase. Tan ke yon editè poko konfime estati a, vèsyon piblik LexHaiti ap afiche « Pa konnen » klèman — pa gen prezompsyon ke yo nan vigè."}
          </p>
        </div>
      </div>

      {err && <ErrorBanner>{err}</ErrorBanner>}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile
            label={isFr ? 'Total' : 'Total'}
            value={stats.total.toLocaleString()}
            icon={Database}
          />
          <StatTile
            label={isFr ? 'Sections' : 'Seksyon'}
            value={String(stats.sections)}
            icon={CalendarRange}
          />
          {STATUS_OPTIONS.map((s) => (
            <StatTile
              key={s}
              label={isFr ? STATUS_PILL[s].label_fr : STATUS_PILL[s].label_ht}
              value={(stats.by_in_force_status[s] ?? 0).toLocaleString()}
              icon={
                s === 'in_force'
                  ? CheckCircle2
                  : s === 'unknown'
                    ? ShieldQuestion
                    : AlertTriangle
              }
              tone={
                s === 'in_force'
                  ? 'emerald'
                  : s === 'unknown'
                    ? 'slate'
                    : 'amber'
              }
            />
          )).slice(0, 3)}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Section */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isFr ? 'Section' : 'Seksyon'}
            </label>
            <select
              value={section ?? ''}
              onChange={(e) => setSection(e.target.value || undefined)}
              className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm"
            >
              <option value="">
                {isFr ? 'Toutes les sections' : 'Tout seksyon yo'}
              </option>
              {sections.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          </div>
          {/* Status */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isFr ? 'Statut' : 'Estati'}
            </label>
            <select
              value={statusFilter ?? ''}
              onChange={(e) =>
                setStatusFilter(
                  (e.target.value || undefined) as
                    | LegislationInForceStatus
                    | undefined,
                )
              }
              className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm"
            >
              <option value="">{isFr ? 'Tous' : 'Tout'}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {isFr ? STATUS_PILL[s].label_fr : STATUS_PILL[s].label_ht}
                </option>
              ))}
            </select>
          </div>
          {/* Year range */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isFr ? 'Année — de' : 'Ane — depi'}
            </label>
            <input
              type="number"
              placeholder="1804"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              className="w-24 h-9 px-3 rounded-md border border-slate-200 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isFr ? 'à' : 'rive'}
            </label>
            <input
              type="number"
              placeholder="2000"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              className="w-24 h-9 px-3 rounded-md border border-slate-200 text-sm tabular-nums"
            />
          </div>
          {/* Imported toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isFr ? 'Importé ?' : 'Enpòte ?'}
            </label>
            <select
              value={
                onlyImported === undefined
                  ? ''
                  : onlyImported
                    ? 'yes'
                    : 'no'
              }
              onChange={(e) => {
                const v = e.target.value
                setOnlyImported(v === '' ? undefined : v === 'yes')
              }}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm"
            >
              <option value="">{isFr ? 'Tous' : 'Tout'}</option>
              <option value="yes">{isFr ? 'Oui' : 'Wi'}</option>
              <option value="no">{isFr ? 'Non' : 'Non'}</option>
            </select>
          </div>
          {/* Search */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {isFr ? 'Recherche' : 'Rechèch'}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  isFr
                    ? 'ex : impôt, séparation des biens, …'
                    : 'eg : taks, separasyon byen, …'
                }
                className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Result list */}
      {items === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Loader2 className="inline w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-10 text-center text-sm text-slate-600">
          {isFr ? 'Aucune entrée.' : 'Pa gen antre.'}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {isFr ? 'Résultats' : 'Rezilta'}: {offset + 1}–
              {offset + items.length} / {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fetchList(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isFr ? 'Précédent' : 'Anvan'}
              </button>
              <button
                type="button"
                onClick={() => fetchList(offset + PAGE_SIZE)}
                disabled={offset + items.length >= total}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isFr ? 'Suivant' : 'Pwochen'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">
                    #
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">
                    {isFr ? 'Description' : 'Deskripsyon'}
                  </th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">
                    {isFr ? 'Date acte' : 'Dat akt'}
                  </th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">
                    {isFr ? 'Moniteur' : 'Moniteur'}
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">
                    {isFr ? 'Statut' : 'Estati'}
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">
                    {isFr ? 'Importé' : 'Enpòte'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">
                      {it.display_order + 1}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="text-slate-800">{it.description_fr}</p>
                      {it.section && (
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">
                          {it.section}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700 whitespace-nowrap text-xs tabular-nums">
                      {it.act_date ? (
                        new Date(it.act_date).toLocaleDateString(
                          isFr ? 'fr-FR' : 'fr-FR',
                        )
                      ) : (
                        <span className="text-slate-400">
                          {it.act_date_raw ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-600 whitespace-nowrap">
                      {it.moniteur_number ? (
                        <>
                          N° {it.moniteur_number}
                          {it.moniteur_date && (
                            <span className="block text-slate-400">
                              {new Date(it.moniteur_date).toLocaleDateString(
                                'fr-FR',
                              )}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={it.in_force_status}
                        onChange={(e) =>
                          handleStatusChange(
                            it.id,
                            e.target.value as LegislationInForceStatus,
                          )
                        }
                        className={cn(
                          'text-xs px-2 py-1 rounded border font-semibold',
                          STATUS_PILL[it.in_force_status].cls,
                        )}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {isFr
                              ? STATUS_PILL[s].label_fr
                              : STATUS_PILL[s].label_ht}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {it.legal_text_id && it.legal_text_slug ? (
                        <Link
                          href={`/lois/${it.legal_text_slug}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          target="_blank"
                        >
                          {isFr ? 'Voir' : 'Wè'}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'slate',
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'slate' | 'emerald' | 'amber'
}) {
  const tones = {
    slate: 'text-slate-500',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
  } as const
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className={cn('flex items-center gap-1.5', tones[tone])}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className="mt-1 text-xl font-black text-slate-900 tabular-nums">
        {value}
      </p>
    </div>
  )
}
