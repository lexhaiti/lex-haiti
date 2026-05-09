// Server Component — fetches recent texts at request time and renders
// the cards server-side. Uses the typed `listTexts()` API client (with
// the new `recently_updated` server sort) so the previous bare fetch
// against `/api/v1/legal-texts?sort=recently_updated` is gone.

import Link from 'next/link'
import { ArrowRight, Calendar, FileText } from 'lucide-react'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { listTexts, type LegalTextListItem } from '@/lib/api/endpoints'
import { getT } from '@/i18n/server'

const COPY = {
  fr: {
    eyebrow: 'Actualités',
    title: 'Récemment ajouté ou modifié',
    subtitle:
      'Le corpus est vivant : nouveaux textes intégrés, articles révisés par les éditeurs, sources mises à jour.',
    seeAll: 'Voir tous les textes',
    empty: 'Pas de mise à jour récente.',
  },
  ht: {
    eyebrow: 'Aktyalite',
    title: 'Sa ki ajoute oswa modifye dènyèman',
    subtitle:
      'Kòpis la vivan : nouvo tèks entegre, atik revize pa editè yo, sous mete ajou.',
    seeAll: 'Wè tout tèks yo',
    empty: 'Pa gen mizajou resan.',
  },
}

const CATEGORY_LABEL: Record<
  string,
  { fr: string; ht: string; cls: string }
> = {
  constitution: {
    fr: 'Constitution',
    ht: 'Konstitisyon',
    cls: 'bg-amber-100 text-amber-800',
  },
  code: { fr: 'Code', ht: 'Kòd', cls: 'bg-blue-100 text-blue-800' },
  loi: { fr: 'Loi', ht: 'Lwa', cls: 'bg-indigo-100 text-indigo-800' },
  decret: { fr: 'Décret', ht: 'Dekrè', cls: 'bg-emerald-100 text-emerald-800' },
  arrete: {
    fr: 'Arrêté',
    ht: 'Arète',
    cls: 'bg-purple-100 text-purple-800',
  },
}

function formatDate(iso: string | null | undefined, lang: 'fr' | 'ht'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function ActualitesSection() {
  const t = await getT()
  const lang = t.language
  const copy = COPY[lang]

  let items: LegalTextListItem[] = []
  try {
    const res = await listTexts({
      limit: 4,
      offset: 0,
      sort: 'recently_updated',
    })
    items = res.items.slice(0, 4)
  } catch {
    // Soft fail — homepage stays usable even if the API hiccups.
  }

  return (
    <section className="relative w-full bg-slate-50/40 py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        <SectionHeading
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle}
          action={
            <Link
              href="/lois"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors group"
            >
              {copy.seeAll}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        />

        {items.length === 0 ? (
          <p className="text-sm text-slate-400 italic">{copy.empty}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {items.map((it) => {
              const title =
                lang === 'ht' && it.title_ht ? it.title_ht : it.title_fr
              const desc =
                lang === 'ht' && it.description_ht
                  ? it.description_ht
                  : it.description_fr
              const cat = CATEGORY_LABEL[it.category] ?? CATEGORY_LABEL.loi
              return (
                <Link
                  key={it.slug}
                  href={`/loi/${it.slug}`}
                  className="group flex flex-col h-full rounded-xl border border-slate-200 bg-white p-5 lg:p-6 transition-all duration-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${cat.cls}`}
                    >
                      {cat[lang]}
                    </span>
                    <FileText className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                  <h3 className="text-base lg:text-[15px] font-bold text-primary mb-2 leading-snug line-clamp-2">
                    {title}
                  </h3>
                  {desc && (
                    <p className="text-xs lg:text-[13px] text-slate-500 leading-relaxed line-clamp-3 mb-3">
                      {desc}
                    </p>
                  )}
                  {(it.updated_at || it.publication_date) && (
                    <div className="mt-auto flex items-center gap-1.5 text-[11px] text-slate-400 pt-3 border-t border-slate-100">
                      <Calendar className="w-3 h-3" />
                      {formatDate(
                        it.updated_at ?? it.publication_date,
                        lang,
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        {/* Mobile "see all" link */}
        <div className="mt-8 sm:hidden text-center">
          <Link
            href="/lois"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {copy.seeAll}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
