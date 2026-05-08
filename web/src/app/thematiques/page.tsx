'use client'

import { useT } from '@/i18n/useT'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  Home,
  Landmark,
  LayoutGrid,
  Shield,
  Users,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function Page() {
  const { t, language } = useT()
  const isFr = language === 'fr'

  const themes = [
    {
      id: 'affaires',
      icon: Briefcase,
      title: isFr ? 'Vie des Affaires' : 'Lavi Biznis',
      description: isFr
        ? 'Droit des sociétés, fiscalité, banques et propriété intellectuelle.'
        : 'Dwa sosyete, fiskalite, bank ak pwopriyete entelektyèl.',
      color: 'blue',
      query: 'affaires',
      href: '/thematiques/affaires',
    },
    {
      id: 'famille',
      icon: Users,
      title: isFr ? 'Droit de la Famille' : 'Dwa Fanmi',
      description: isFr
        ? 'Mariage, divorce, filiation, successions et donations.'
        : 'Maryaj, divòs, filyasyon, siksesyon ak donasyon.',
      color: 'red',
      query: 'famille',
      href: '/thematiques/famille',
    },
    {
      id: 'immobilier',
      icon: Home,
      title: isFr ? 'Droit Immobilier' : 'Dwa Imobilye',
      description: isFr
        ? 'Propriété, cadastre, baux et droit foncier haïtien.'
        : 'Pwopriyete, kadast, kontra lwaye ak dwa fonzye ayisyen.',
      color: 'amber',
      query: 'immobilier',
      href: '/thematiques/immobilier',
    },
    {
      id: 'social',
      icon: Shield,
      title: isFr ? 'Droit Social' : 'Dwa Sosyal',
      description: isFr
        ? 'Droit du travail, protection sociale et sécurité sociale.'
        : 'Dwa travay, pwoteksyon sosyal ak sekirite sosyal.',
      color: 'emerald',
      query: 'social',
      href: '/thematiques/social',
    },
    {
      id: 'fiscalite',
      icon: Landmark,
      title: isFr ? 'Fiscalité & Douanes' : 'Fiskalite ak Douàn',
      description: isFr
        ? 'Impôts, taxes, tarifs douaniers et procédures fiscales.'
        : 'Impo, taks, tarif douanyè ak pwosedi fiskal.',
      color: 'purple',
      query: 'fiscalite',
      href: '/thematiques/fiscalite',
    },
  ]

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-600'
      case 'red':
        return 'bg-red-50 text-red-600 border-red-100 group-hover:bg-red-600'
      case 'amber':
        return 'bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-600'
      case 'emerald':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-600'
      case 'purple':
        return 'bg-purple-50 text-purple-600 border-purple-100 group-hover:bg-purple-600'
      default:
        return 'bg-slate-50 text-slate-600 border-slate-100 group-hover:bg-slate-600'
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={t('themes.title', { fallback: isFr ? 'Thématiques' : 'Tèm yo' })}
        subtitle={t('themes.subtitle', {
          fallback: isFr
            ? 'Explorez le droit haïtien classé par domaines d’application.'
            : 'Eksplore dwa ayisyen an klase pa domèn aplikasyon.',
        })}
        icon={LayoutGrid}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: isFr ? 'Thématiques' : 'Tèm yo' },
        ]}
      />

      <div className="container py-20 lg:py-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {themes.map((theme, idx) => (
            <motion.div
              key={theme.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="group relative"
            >
              <Link
                href={theme.href}
                className="block h-full bg-white border border-slate-100 rounded-[2.5rem] p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-2 overflow-hidden"
              >
                {/* Decorative Background */}
                <div
                  className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-slate-50 to-transparent rounded-full translate-x-10 -translate-y-10 group-hover:scale-150 transition-transform duration-700`}
                />

                <div className="relative z-10 h-full flex flex-col">
                  <div
                    className={`mb-8 inline-flex p-4 rounded-3xl border transition-all duration-500 group-hover:text-white group-hover:shadow-lg ${getColorClasses(theme.color)}`}
                  >
                    <theme.icon className="w-8 h-8" />
                  </div>

                  <h3 className="text-2xl font-bold mb-4 text-slate-900 group-hover:text-red-600 transition-colors">
                    {theme.title}
                  </h3>

                  <p className="text-slate-500 leading-relaxed mb-8 flex-1">
                    {theme.description}
                  </p>

                  <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400 group-hover:text-slate-900 transition-colors">
                    <span>{isFr ? 'Explorer' : 'Eksplore'}</span>
                    <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Info Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-32 p-12 rounded-[3rem] bg-primary text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-red-600/10 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl lg:text-5xl font-black mb-8 leading-tight">
                {isFr ? 'Recherche par thématique' : 'Rechèch pa tèm'}
              </h2>
              <p className="text-slate-400 text-lg lg:text-xl leading-relaxed mb-8">
                {isFr
                  ? 'Le droit est un domaine vaste. Nous avons organisé les textes juridiques par thématiques pour vous aider à trouver rapidement les informations qui concernent votre situation spécifique.'
                  : 'Lwa se yon domèn ki laj anpil. Nou òganize tèks jiridik yo pa tèm pou n ede w jwenn enfòmasyon ki konsène sitiyasyon w lan pi vit.'}
              </p>
              <Link href="/lois">
                <Button className="rounded-full bg-white text-slate-900 hover:bg-red-600 hover:text-white h-12 px-8 font-bold transition-all">
                  {isFr ? 'Accéder à tous les textes' : 'Wè tout tèks yo'}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
            <div className="hidden lg:block">
              <div className="relative aspect-square max-w-sm mx-auto">
                <div className="absolute inset-0 bg-white/5 rounded-[3rem] rotate-6" />
                <div className="absolute inset-0 bg-red-600/20 rounded-[3rem] -rotate-3" />
                <div className="relative bg-white/10 backdrop-blur-md border border-white/10 rounded-[3rem] p-10 flex items-center justify-center">
                  <LayoutGrid className="w-32 h-32 text-white/50" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
