// RSC — pure content browser for the 12 cross-cutting legal themes.
// Editorial layout: no card chrome, no per-item icons, no gradient
// panels. Three quiet sections stacked vertically; each theme is a
// numbered row with a generous title + one-line description. The
// rhythm + numerals do the visual work, not colour.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import { getServerLanguage, getT } from '@/i18n/server'

// ---------------------------------------------------------------------------
// Theme catalogue — mirrors the Thématiques megamenu (3 sections of 4) and
// the LegalTheme enum on the backend. Adding a theme here also requires:
//   • backend/packages/schemas/enums.py (LegalTheme)
//   • backend/services/corpus/themes.py (THEME_KEYWORDS_FR / _HT)
//   • web/src/i18n/{fr,ht}.ts (menu.themes.*)
// ---------------------------------------------------------------------------

type ThemeItem = {
  /** Backend LegalTheme enum value — used for ?theme=… URL */
  key: string
  labelKey: string
  descKey: string
}

type ThemeSection = {
  titleKey: string
  descKey: string
  items: ThemeItem[]
}

const SECTIONS: ThemeSection[] = [
  {
    titleKey: 'menu.themes.col1Title',
    descKey: 'menu.themes.col1Desc',
    items: [
      { key: 'droit_societes', labelKey: 'menu.themes.societes', descKey: 'menu.themes.societesDesc' },
      { key: 'droit_fiscal', labelKey: 'menu.themes.fiscal', descKey: 'menu.themes.fiscalDesc' },
      { key: 'droit_bancaire', labelKey: 'menu.themes.bancaire', descKey: 'menu.themes.bancaireDesc' },
      { key: 'propriete_intellectuelle', labelKey: 'menu.themes.pi', descKey: 'menu.themes.piDesc' },
    ],
  },
  {
    titleKey: 'menu.themes.col2Title',
    descKey: 'menu.themes.col2Desc',
    items: [
      { key: 'droit_travail', labelKey: 'menu.themes.travail', descKey: 'menu.themes.travailDesc' },
      { key: 'protection_sociale', labelKey: 'menu.themes.protection', descKey: 'menu.themes.protectionDesc' },
      { key: 'droit_famille', labelKey: 'menu.themes.famille', descKey: 'menu.themes.familleDesc' },
      { key: 'successions', labelKey: 'menu.themes.successions', descKey: 'menu.themes.successionsDesc' },
    ],
  },
  {
    titleKey: 'menu.themes.col3Title',
    descKey: 'menu.themes.col3Desc',
    items: [
      { key: 'droit_administratif', labelKey: 'menu.themes.administratif', descKey: 'menu.themes.administratifDesc' },
      { key: 'marches_publics', labelKey: 'menu.themes.marches', descKey: 'menu.themes.marchesDesc' },
      { key: 'environnement', labelKey: 'menu.themes.environnement', descKey: 'menu.themes.environnementDesc' },
      { key: 'foncier', labelKey: 'menu.themes.foncier', descKey: 'menu.themes.foncierDesc' },
    ],
  },
]

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return {
    title: t('themes.title', {
      fallback: language === 'fr' ? 'Thématiques' : 'Tèm yo',
    }),
  }
}

export default async function Page() {
  const t = await getT()
  const isFr = t.language === 'fr'

  // Flat sequence index so the numerals run 01 → 12 across sections,
  // not 01 → 04 three times. Computed once via reduce; cheap.
  let runningIndex = 0

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={isFr ? 'Thématiques' : 'Tèm yo'}
        subtitle={
          isFr
            ? 'Douze domaines transversaux du droit haïtien. Un texte peut en porter plusieurs — le Code civil parle de famille, de successions, et de sociétés à la fois.'
            : "Douz domèn transvèsal nan dwa ayisyen an. Yon tèks ka pote plizyè ladan yo — Kòd sivil la pale de fanmi, eritaj, ak sosyete an menm tan."
        }
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: isFr ? 'Thématiques' : 'Tèm yo' },
        ]}
      />

      <div className="container py-20 lg:py-28 max-w-5xl">
        {SECTIONS.map((section, sectionIdx) => (
          <section
            key={section.titleKey}
            className={sectionIdx > 0 ? 'mt-20 lg:mt-28' : ''}
          >
            {/* Section header — small label + thin rule + quiet
                description on the right. No icon, no card. Reads
                like a magazine section divider. */}
            <header className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-x-12 gap-y-3 items-baseline mb-10 lg:mb-12 pb-5 border-b border-slate-200">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                <span className="inline-block tabular-nums text-slate-400 mr-3">
                  {String(sectionIdx + 1).padStart(2, '0')}
                </span>
                {t(section.titleKey)}
              </h2>
              <p className="text-base lg:text-lg text-slate-600 leading-relaxed">
                {t(section.descKey)}
              </p>
            </header>

            {/* Item rows — two-column on wide screens, single column on
                mobile. Each row is a generous link target with a
                numeral, a bold theme title, a one-line description,
                and a hover arrow that slides in. */}
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 lg:gap-y-12">
              {section.items.map((item) => {
                const seq = ++runningIndex
                return (
                  <li key={item.key}>
                    <Link
                      href={`/lois?theme=${item.key}`}
                      className="group block"
                    >
                      <div className="flex items-baseline gap-4">
                        <span className="text-[11px] font-bold tabular-nums tracking-widest text-slate-400 group-hover:text-red-600 transition-colors">
                          {String(seq).padStart(2, '0')}
                        </span>
                        <span className="flex-1 min-w-0">
                          <h3 className="text-2xl lg:text-[1.65rem] font-bold leading-[1.2] text-slate-900 group-hover:text-red-600 transition-colors">
                            <span className="bg-[length:0%_1px] group-hover:bg-[length:100%_1px] bg-gradient-to-r from-red-600 to-red-600 bg-no-repeat bg-left-bottom transition-[background-size] duration-300">
                              {t(item.labelKey)}
                            </span>
                          </h3>
                        </span>
                        <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-red-600 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all flex-shrink-0 mt-1.5" />
                      </div>
                      <p className="mt-2 ml-9 text-sm text-slate-500 leading-relaxed max-w-prose">
                        {t(item.descKey)}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {/* Foot — one quiet line out, not a gradient call-to-action.
            The destination is the all-texts page with no theme filter,
            for visitors who want to leave the thematic axis. */}
        <div className="mt-28 lg:mt-32 pt-10 border-t border-slate-200 flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-sm text-slate-500 italic">
            {isFr
              ? 'Combinez plusieurs thématiques depuis la page de recherche.'
              : 'Konbine plizyè tèm depi paj rechèch la.'}
          </p>
          <Link
            href="/lois"
            className="text-sm font-semibold text-slate-900 hover:text-red-600 transition-colors inline-flex items-center gap-1.5"
          >
            {isFr ? 'Tous les textes' : 'Tout tèks yo'}
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
