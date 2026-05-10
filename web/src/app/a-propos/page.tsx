// RSC — cookie-based i18n + per-route metadata + CSS-only entrance
// animations. The 5 framer-motion blocks (h1, p, stat tiles, value
// cards, CTA) became plain `animate-in` utilities — staggered effect
// is approximated rather than per-index.

import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, Shield, Target, Users } from 'lucide-react'
import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { getServerLanguage, getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return {
    title: t('about.title', {
      fallback: language === 'fr' ? 'À Propos' : 'Konsènan',
    }),
  }
}

export default async function Page() {
  const t = await getT()
  const isFr = t.language === 'fr'

  const values = [
    {
      icon: Target,
      title: isFr ? 'Notre Mission' : 'Misyon Nou',
      description: isFr
        ? 'Rendre le droit haïtien accessible, moderne et gratuit pour tous les citoyens et professionnels.'
        : 'Rann dwa ayisyen an aksesib, modèn ak gratis pou tout sitwayen ak pwofesyonèl.',
    },
    {
      icon: Users,
      title: isFr ? 'Communauté' : 'Kominote',
      description: isFr
        ? 'Un projet collaboratif porté par des experts juridiques et des passionnés de technologie.'
        : 'Yon pwojè kolaboratif ki fèt ak ekspè jiridik ak moun ki renmen teknoloji.',
    },
    {
      icon: Shield,
      title: isFr ? 'Fiabilité' : 'Fyabilite',
      description: isFr
        ? 'Des textes rigoureusement vérifiés et mis à jour selon les publications officielles.'
        : 'Tèks ki verifye seryèzman ak mizajou dapre piblikasyon ofisyèl yo.',
    },
  ]

  // Honest numbers only. Earlier values ("15,000+ Articles indexés",
  // "200+ Textes de loi") were aspirational placeholders that contradicted
  // the live corpus and read as false advertising. Until the figures can be
  // wired to the API, only the facts that are true today stay on the page.
  const stats = [
    { value: '2', label: isFr ? 'Langues officielles' : 'Lang ofisyèl' },
    { value: '100%', label: isFr ? 'Accès libre' : 'Aksè gratis' },
    {
      value: 'Open',
      label: isFr ? 'Code source ouvert' : 'Kòd sous ouvè',
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Dark header matching site design */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        <div className="relative z-10 container py-16 lg:py-24 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
              { label: isFr ? 'À propos' : 'Konsènan' },
            ]}
          />

          <h1 className="text-4xl lg:text-6xl font-black mb-6 leading-tight tracking-tight animate-in fade-in slide-in-from-top-2 duration-500">
            {t('about.title', { fallback: isFr ? 'À Propos' : 'Konsènan' })}
          </h1>

          <p className="text-slate-300 text-lg lg:text-xl leading-relaxed border-l-2 border-red-600 pl-6 animate-in fade-in duration-700 [animation-delay:120ms]">
            {t('about.subtitle', {
              fallback: isFr
                ? 'Découvrez LexHaiti, la plateforme de référence pour le droit numérique en Haïti.'
                : 'Dekouvri LexHaiti, platfòm referans pou dwa nimerik nan peyi Ayiti.',
            })}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="border-b bg-gray-50/50">
        <div className="container py-10">
          <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto">
            {stats.map((stat, idx) => (
              <div
                key={idx}
                className="text-center animate-in fade-in slide-in-from-bottom-2 duration-500"
              >
                <p className="text-3xl lg:text-4xl font-black text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-500 mt-1 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Values section */}
      <div className="container py-20 lg:py-28">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {values.map((value, idx) => (
            <div
              key={idx}
              className="group animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <div className="mb-6 inline-flex p-4 rounded-xl bg-primary/5 border border-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:border-primary group-hover:shadow-md">
                <value.icon className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-slate-900">
                {value.title}
              </h3>
              <p className="text-slate-500 leading-relaxed text-lg">
                {value.description}
              </p>
            </div>
          ))}
        </div>

        {/* Quote / CTA section */}
        <div className="mt-24 p-12 lg:p-16 rounded-[2rem] bg-primary text-white relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-red-600/10 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-10">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                {isFr ? 'Maxime juridique' : 'Maksim jiridik'}
              </p>
              <h2 className="text-3xl lg:text-5xl font-black italic mb-3 leading-tight">
                Publicitas iuris fundamentum libertatis.
              </h2>
              <p className="text-base lg:text-lg italic text-slate-300 mb-6">
                {isFr
                  ? "« La publicité du droit est le fondement de la liberté. »"
                  : '« Piblisite dwa a se fondasyon libète a. »'}
              </p>
              <p className="text-slate-400 text-lg leading-relaxed max-w-2xl">
                {isFr
                  ? "LexHaiti est un engagement pour la transparence juridique et l'éducation civique en Haïti. Notre plateforme évolue chaque jour grâce à votre soutien."
                  : 'LexHaiti se yon angajman pou transparans jiridik ak edikasyon sivik nan peyi Ayiti. Platfòm nou an ap evolye chak jou gras ak sipò ou.'}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Link
                href="/lois"
                className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-primary px-6 py-3 rounded-md font-semibold transition-colors active:scale-[0.99] shadow-sm"
              >
                <BookOpen className="w-4 h-4" />
                {isFr ? 'Explorer les textes' : 'Eksplore tèks yo'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
