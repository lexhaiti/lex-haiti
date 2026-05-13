'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, FileEdit, Loader2 } from 'lucide-react'

import {
  listChangesMadeBy,
  type LegalChangeMadeRead,
} from '@/lib/api/endpoints'
import { cn } from '@/lib/utils'

/**
 * "Modifications apportées" panel — visible only to editors, mounted
 * on an amending law's detail page. Lists every article-edit this law
 * introduced into *other* texts (via the LegalChange graph). Empty by
 * design for most laws (only a few are amending texts); when empty,
 * the panel hides itself rather than showing a "Nothing here" placard.
 *
 * Each row is a deep link to the amended article inside its parent
 * text — the editor can hop there to see the timeline + diff for
 * that specific edit.
 */

// Block-kind → display label. The backend's BlockKind enum has more
// values (structural, signature_block…) but only the four versionable
// formal blocks land in LegalChange.amended_block_kind.
const BLOCK_LABEL: Record<string, { fr: string; ht: string }> = {
  preamble: { fr: 'Préambule', ht: 'Preanmbil' },
  visa: { fr: 'Visas', ht: 'Visa' },
  considerant: { fr: 'Considérants', ht: 'Konsideran' },
  enacting_formula: { fr: "Formule d'adoption", ht: 'Fòmil adopsyon' },
}

const CHANGE_KIND_LABEL: Record<
  string,
  { fr: string; ht: string; cls: string }
> = {
  amend: {
    fr: 'Modifié',
    ht: 'Modifye',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  abrogate: {
    fr: 'Abrogé',
    ht: 'Abwoje',
    cls: 'bg-red-50 text-red-700 border-red-200',
  },
  replace: {
    fr: 'Remplacé',
    ht: 'Ranplase',
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  add: {
    fr: 'Ajouté',
    ht: 'Ajoute',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  renumber: {
    fr: 'Renuméroté',
    ht: 'Renimewote',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  suspend: {
    fr: 'Suspendu',
    ht: 'Sispann',
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  restore: {
    fr: 'Rétabli',
    ht: 'Retabli',
    cls: 'bg-teal-50 text-teal-700 border-teal-200',
  },
}

interface Props {
  /** Slug of the amending law (the legal text whose detail page is
   *  currently displayed). */
  lawSlug: string
  lang: 'fr' | 'ht'
}

function formatDate(iso: string | null, lang: 'fr' | 'ht'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ChangesMadePanel({ lawSlug, lang }: Props) {
  const [rows, setRows] = useState<LegalChangeMadeRead[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listChangesMadeBy(lawSlug)
      .then((res) => {
        if (cancelled) return
        setRows(res)
      })
      .catch((e: any) => {
        if (cancelled) return
        setError(e?.body?.detail ?? e?.message ?? String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lawSlug])

  // Hide the whole panel when this law doesn't amend anything — most
  // texts don't, and an empty placard would clutter every detail page.
  if (!loading && (!rows || rows.length === 0)) {
    return null
  }

  return (
    <section className="mt-12 pt-8 border-t border-slate-200">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-amber-600" />
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-slate-600">
            {lang === 'fr'
              ? 'Modifications apportées'
              : 'Modifikasyon yo te fè'}
          </h2>
          {rows && rows.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {rows.length}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 italic">
          {lang === 'fr'
            ? 'Articles modifiés par ce texte dans d’autres lois.'
            : 'Atik tèks sa modifye nan lòt lwa yo.'}
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          {lang === 'fr' ? 'Chargement…' : 'Ap chaje…'}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">
          {lang === 'fr'
            ? `Erreur de chargement : ${error}`
            : `Erè chaje : ${error}`}
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {rows.map((r) => {
            const kindMeta = CHANGE_KIND_LABEL[r.change_kind] ?? {
              fr: r.change_kind,
              ht: r.change_kind,
              cls: 'bg-slate-100 text-slate-600 border-slate-200',
            }
            // A change row targets either an article OR a formal block
            // — the populated FK selects which. ``target`` flattens
            // the two shapes into one rendering branch.
            const target = r.amended_block_kind
              ? {
                  // Block edit — label like "Préambule" / "Visas".
                  label:
                    BLOCK_LABEL[r.amended_block_kind]?.[lang] ??
                    r.amended_block_kind,
                  versionNumber: r.new_block_version_number,
                  href: `/loi/${r.amended_text_slug}`,
                }
              : {
                  // Article edit — label like "Article 1444".
                  label:
                    (lang === 'fr' ? 'Article ' : 'Atik ') +
                    (r.amended_article_number ?? '—'),
                  versionNumber: r.new_version_number,
                  href: r.amended_article_slug
                    ? `/loi/${r.amended_text_slug}#${r.amended_article_slug}`
                    : `/loi/${r.amended_text_slug}`,
                }
            return (
              <li key={r.id}>
                <Link
                  href={target.href}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider',
                          kindMeta.cls,
                        )}
                      >
                        {kindMeta[lang]}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {r.amended_text_title_fr}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      <span className="text-slate-700">{target.label}</span>
                      {target.versionNumber != null && (
                        <>
                          {' · '}
                          <span className="font-mono">
                            v{target.versionNumber}
                          </span>
                        </>
                      )}
                      {r.effective_on && (
                        <>
                          {' · '}
                          {formatDate(r.effective_on, lang)}
                        </>
                      )}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
