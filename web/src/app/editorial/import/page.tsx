'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, FileText, LayoutDashboard, Newspaper } from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { useLanguage } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import LegalTextImportPanel from './_panels/LegalTextImportPanel'
import MoniteurImportPanel from './_panels/MoniteurImportPanel'

type Tab = 'legal' | 'moniteur'

const COPY = {
  fr: {
    crumbs: { home: 'Accueil', editor: 'Éditorial', import: 'Importer' },
    title: 'Importer dans le corpus',
    subtitle:
      "Choisissez le type de contenu à ingérer. Les champs s'affichent ci-dessous selon votre sélection.",
    chooseType: 'Type de contenu',
    legalTab: 'Texte légal',
    legalDesc:
      'Constitution, code, loi, décret, arrêté — un texte unique avec ses articles.',
    moniteurTab: 'Le Moniteur',
    moniteurDesc:
      "Numéro complet du journal officiel — analyse + extraction des lois contenues.",
    moniteurDashboard: 'Tableau de bord Le Moniteur',
  },
  ht: {
    crumbs: { home: 'Akèy', editor: 'Editoryal', import: 'Enpòte' },
    title: 'Enpòte nan kòpis la',
    subtitle:
      "Chwazi tip kontni an. Jan w chwazi a ap detèmine kisa ki parèt anba a.",
    chooseType: 'Tip kontni',
    legalTab: 'Tèks legal',
    legalDesc:
      'Konstitisyon, kòd, lwa, dekrè, arete — yon sèl tèks ak atik li yo.',
    moniteurTab: 'Le Moniteur',
    moniteurDesc:
      "Yon nimewo konplè jounal ofisyèl la — analiz + ekstraksyon lwa yo.",
    moniteurDashboard: 'Tablo Le Moniteur',
  },
}

export default function EditorialImportPage() {
  const { language } = useLanguage()
  const lang = ((language as 'fr' | 'ht') ?? 'fr') as 'fr' | 'ht'
  const copy = COPY[lang]
  const [tab, setTab] = useState<Tab>('legal')

  return (
    <div className="min-h-screen bg-white">
      {/* Page header */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
        </div>

        <div className="relative z-10 container py-12 lg:py-20 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: copy.crumbs.home, href: '/' },
              { label: copy.crumbs.editor, href: '/profile' },
              { label: copy.crumbs.import },
            ]}
          />

          <div>
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white"
            >
              {copy.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-slate-300 text-lg lg:text-xl leading-relaxed border-l-2 border-red-600 pl-6"
            >
              {copy.subtitle}
            </motion.p>
          </div>
        </div>
      </div>

      <div className="container py-10 lg:py-14">
        {/* Type chooser — two large segmented cards. Click flips the
            content below in-place (no navigation). */}
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-primary/65 mb-4">
            {copy.chooseType}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <ChooserButton
              active={tab === 'legal'}
              onClick={() => setTab('legal')}
              icon={FileText}
              label={copy.legalTab}
              desc={copy.legalDesc}
            />
            <ChooserButton
              active={tab === 'moniteur'}
              onClick={() => setTab('moniteur')}
              icon={Newspaper}
              label={copy.moniteurTab}
              desc={copy.moniteurDesc}
            />
          </div>
        </div>

        {/* Selected panel */}
        <div className="w-full">
          {tab === 'legal' ? <LegalTextImportPanel /> : <MoniteurImportPanel />}
        </div>

        {/* Quick link to the Moniteur dashboard — useful for the editor to
            check the status of in-flight parses or jump to a previously
            uploaded issue's review page. Only relevant when the Moniteur
            tab is active. */}
        {tab === 'moniteur' && (
          <div className="mt-10 flex justify-end">
            <Link
              href="/editorial/moniteur"
              className="group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-primary/40 hover:text-primary transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              {copy.moniteurDashboard}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function ChooserButton({
  active,
  onClick,
  icon: Icon,
  label,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group flex items-start gap-4 rounded-xl border p-5 lg:p-6 text-left',
        'transition-all duration-200',
        active
          ? 'border-primary bg-primary/[0.04] shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border transition-colors',
          active
            ? 'bg-primary text-white border-primary'
            : 'bg-primary/5 text-primary border-primary/10 group-hover:bg-primary/10',
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-base lg:text-lg font-bold leading-tight mb-1',
            active ? 'text-primary' : 'text-primary/90',
          )}
        >
          {label}
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
      </div>
    </button>
  )
}
