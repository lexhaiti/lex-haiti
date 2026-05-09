'use client'

import { useT } from '@/i18n/useT'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import {
  ArrowRight,
  Briefcase,
  Building2,
  Coins,
  FileSignature,
  Gavel,
  HeartHandshake,
  Landmark,
  LayoutGrid,
  Leaf,
  Lightbulb,
  MapPin,
  Scale,
  Scroll,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Theme catalogue — mirrors the Thématiques megamenu (3 columns) and the
// LegalTheme enum on the backend. Adding a theme here also requires an
// entry in:
//   • backend/packages/schemas/enums.py (LegalTheme)
//   • backend/services/corpus/themes.py (THEME_KEYWORDS_FR / _HT)
//   • web/src/i18n/{fr,ht}.ts (menu.themes.*)
// ---------------------------------------------------------------------------

type ThemeItem = {
  /** Backend LegalTheme enum value — used for ?theme=… URL */
  key: string
  labelKey: string
  descKey: string
  icon: LucideIcon
}

type ThemeColumn = {
  /** Color palette for the column header + accent bars */
  palette: 'blue' | 'rose' | 'amber'
  titleKey: string
  descKey: string
  items: ThemeItem[]
}

const COLUMNS: ThemeColumn[] = [
  {
    palette: 'blue',
    titleKey: 'menu.themes.col1Title',
    descKey: 'menu.themes.col1Desc',
    items: [
      { key: 'droit_societes', labelKey: 'menu.themes.societes', descKey: 'menu.themes.societesDesc', icon: Building2 },
      { key: 'droit_fiscal', labelKey: 'menu.themes.fiscal', descKey: 'menu.themes.fiscalDesc', icon: Coins },
      { key: 'droit_bancaire', labelKey: 'menu.themes.bancaire', descKey: 'menu.themes.bancaireDesc', icon: Landmark },
      { key: 'propriete_intellectuelle', labelKey: 'menu.themes.pi', descKey: 'menu.themes.piDesc', icon: Lightbulb },
    ],
  },
  {
    palette: 'rose',
    titleKey: 'menu.themes.col2Title',
    descKey: 'menu.themes.col2Desc',
    items: [
      { key: 'droit_travail', labelKey: 'menu.themes.travail', descKey: 'menu.themes.travailDesc', icon: Briefcase },
      { key: 'protection_sociale', labelKey: 'menu.themes.protection', descKey: 'menu.themes.protectionDesc', icon: ShieldCheck },
      { key: 'droit_famille', labelKey: 'menu.themes.famille', descKey: 'menu.themes.familleDesc', icon: HeartHandshake },
      { key: 'successions', labelKey: 'menu.themes.successions', descKey: 'menu.themes.successionsDesc', icon: Users },
    ],
  },
  {
    palette: 'amber',
    titleKey: 'menu.themes.col3Title',
    descKey: 'menu.themes.col3Desc',
    items: [
      { key: 'droit_administratif', labelKey: 'menu.themes.administratif', descKey: 'menu.themes.administratifDesc', icon: Scale },
      { key: 'marches_publics', labelKey: 'menu.themes.marches', descKey: 'menu.themes.marchesDesc', icon: FileSignature },
      { key: 'environnement', labelKey: 'menu.themes.environnement', descKey: 'menu.themes.environnementDesc', icon: Leaf },
      { key: 'foncier', labelKey: 'menu.themes.foncier', descKey: 'menu.themes.foncierDesc', icon: MapPin },
    ],
  },
]

const PALETTE = {
  blue: {
    bar: 'bg-blue-500',
    iconBg: 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
    chipBg: 'bg-blue-100/60 text-blue-800',
    headerIcon: Briefcase,
  },
  rose: {
    bar: 'bg-rose-500',
    iconBg: 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white',
    chipBg: 'bg-rose-100/60 text-rose-800',
    headerIcon: HeartHandshake,
  },
  amber: {
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white',
    chipBg: 'bg-amber-100/60 text-amber-800',
    headerIcon: Gavel,
  },
}

export default function Page() {
  const { t, language } = useT()
  const isFr = language === 'fr'

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={isFr ? 'Thématiques' : 'Tèm yo'}
        subtitle={
          isFr
            ? 'Explorez le droit haïtien classé par domaines d’application. 12 thématiques transversales — un même texte peut en porter plusieurs.'
            : 'Eksplore dwa ayisyen an klase pa domèn aplikasyon. 12 tèm transvèsal — yon menm tèks ka pote plizyè ladan yo.'
        }
        icon={LayoutGrid}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: isFr ? 'Thématiques' : 'Tèm yo' },
        ]}
      />

      <div className="container py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {COLUMNS.map((col) => {
            const palette = PALETTE[col.palette]
            const HeaderIcon = palette.headerIcon
            return (
              <section
                key={col.titleKey}
                className="rounded-3xl border border-slate-200/80 bg-white overflow-hidden flex flex-col"
              >
                {/* Column header */}
                <header className="relative px-6 lg:px-8 pt-7 pb-5 border-b border-slate-100">
                  <div className={`absolute top-0 left-0 right-0 h-1 ${palette.bar}`} />
                  <div className="flex items-start gap-3 mb-2">
                    <div
                      className={`p-2.5 rounded-xl ${palette.chipBg}`}
                    >
                      <HeaderIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-black text-slate-900 leading-tight">
                        {t(col.titleKey)}
                      </h2>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {t(col.descKey)}
                      </p>
                    </div>
                  </div>
                </header>

                {/* Items */}
                <ul className="flex-1 divide-y divide-slate-100">
                  {col.items.map((item, idx) => {
                    const Icon = item.icon
                    return (
                      <motion.li
                        key={item.key}
                        initial={{ opacity: 0, x: -6 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.04 }}
                      >
                        <Link
                          href={`/lois?theme=${item.key}`}
                          className="group flex items-center gap-4 px-6 lg:px-8 py-4 hover:bg-slate-50 transition-colors"
                        >
                          <div
                            className={`flex-shrink-0 inline-flex p-2.5 rounded-xl border border-slate-100 transition-all duration-200 ${palette.iconBg}`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">
                              {t(item.labelKey)}
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                              {t(item.descKey)}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                        </Link>
                      </motion.li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>

        {/* Info section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20 p-10 lg:p-14 rounded-3xl bg-primary text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-red-600/10 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black mb-4 leading-tight">
                {isFr ? 'Recherche par thématique' : 'Rechèch pa tèm'}
              </h2>
              <p className="text-slate-300 text-base lg:text-lg leading-relaxed mb-6 max-w-2xl">
                {isFr
                  ? 'Un texte peut porter plusieurs thématiques — le Code civil couvre famille, successions et sociétés à la fois. Combinez les filtres pour affiner votre recherche.'
                  : 'Yon tèks ka pote plizyè tèm — Kòd sivil la kouvri fanmi, eritaj ak sosyete an menm tan. Konbine filtè yo pou afine rechèch ou.'}
              </p>
              <Link
                href="/lois"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-slate-900 hover:bg-red-600 hover:text-white font-bold transition-all"
              >
                {isFr ? 'Accéder à tous les textes' : 'Wè tout tèks yo'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="hidden lg:block">
              <div className="relative w-48 h-48">
                <div className="absolute inset-0 bg-white/5 rounded-3xl rotate-6" />
                <div className="absolute inset-0 bg-red-600/20 rounded-3xl -rotate-3" />
                <div className="relative bg-white/10 backdrop-blur-md border border-white/10 rounded-3xl p-8 flex items-center justify-center w-full h-full">
                  <Scroll className="w-20 h-20 text-white/60" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
