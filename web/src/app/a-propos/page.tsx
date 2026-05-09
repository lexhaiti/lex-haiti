'use client'

import { useT } from '@/i18n/useT'
import { Info, Shield, Target, Users, BookOpen, Scale, Globe } from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Breadcrumb } from '@/components/shared/Breadcrumb'

export default function Page() {
  const { t, language } = useT()
  const isFr = language === 'fr'

  const values = [
    {
      icon: Target,
      title: isFr ? 'Notre Mission' : 'Misyon Nou',
      description: isFr
        ? "Rendre le droit ha\u00eftien accessible, moderne et gratuit pour tous les citoyens et professionnels."
        : "Rann dwa ayisyen an aksesib, mod\u00e8n ak gratis pou tout sitwayen ak pwofesyon\u00e8l.",
    },
    {
      icon: Users,
      title: isFr ? 'Communaut\u00e9' : 'Kominote',
      description: isFr
        ? "Un projet collaboratif port\u00e9 par des experts juridiques et des passionn\u00e9s de technologie."
        : "Yon pwoj\u00e8 kolaboratif ki f\u00e8t ak eksp\u00e8 jiridik ak moun ki renmen teknoloji.",
    },
    {
      icon: Shield,
      title: isFr ? 'Fiabilit\u00e9' : 'Fyabilite',
      description: isFr
        ? "Des textes rigoureusement v\u00e9rifi\u00e9s et mis \u00e0 jour selon les publications officielles."
        : "T\u00e8ks ki verifye sery\u00e8zman ak mizajou dapre piblikasyon ofisy\u00e8l yo.",
    },
  ]

  // Honest numbers only. Earlier values ("15,000+ Articles index\u00e9s",
  // "200+ Textes de loi") were aspirational placeholders that contradicted
  // the live corpus and read as false advertising. Until the figures can be
  // wired to the API, only the facts that are true today stay on the page.
  const stats = [
    { value: '2', label: isFr ? 'Langues officielles' : 'Lang ofisy\u00e8l' },
    { value: '100%', label: isFr ? 'Acc\u00e8s libre' : 'Aks\u00e8 gratis' },
    {
      value: 'Open',
      label: isFr ? 'Code source ouvert' : 'K\u00f2d sous ouv\u00e8',
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
              { label: isFr ? 'Accueil' : 'Ak\u00e8y', href: '/' },
              { label: isFr ? '\u00c0 propos' : 'Kons\u00e8nan' },
            ]}
          />

          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl lg:text-6xl font-black mb-6 leading-tight tracking-tight"
          >
            {t('about.title', { fallback: isFr ? '\u00c0 Propos' : 'Kons\u00e8nan' })}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-300 text-lg lg:text-xl leading-relaxed max-w-3xl border-l-2 border-red-600 pl-6"
          >
            {t('about.subtitle', {
              fallback: isFr
                ? "D\u00e9couvrez LexHaiti, la plateforme de r\u00e9f\u00e9rence pour le droit num\u00e9rique en Ha\u00efti."
                : "Dekouvri LexHaiti, platf\u00f2m referans pou dwa nimerik nan peyi Ayiti.",
            })}
          </motion.p>
        </div>
      </div>

      {/* Stats row */}
      <div className="border-b bg-gray-50/50">
        <div className="container py-10">
          <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto">
            {stats.map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="text-center"
              >
                <p className="text-3xl lg:text-4xl font-black text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-500 mt-1 font-medium">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Values section */}
      <div className="container py-20 lg:py-28">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {values.map((value, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="group"
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
            </motion.div>
          ))}
        </div>

        {/* Quote / CTA section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-24 p-12 lg:p-16 rounded-[2rem] bg-primary text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-red-600/10 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-10">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                {isFr ? 'Proverbe haïtien' : 'Pwovèb ayisyen'}
              </p>
              <h2 className="text-3xl lg:text-5xl font-black mb-2 leading-tight">
                Men anpil chay pa lou.
              </h2>
              <p className="text-base lg:text-lg italic text-slate-300 mb-6">
                {isFr
                  ? "« Plusieurs mains rendent le fardeau léger. »"
                  : '« Lè nou ansanm, chay la pa lou. »'}
              </p>
              <p className="text-slate-400 text-lg leading-relaxed max-w-2xl">
                {isFr
                  ? "LexHaiti est un engagement pour la transparence juridique et l'\u00e9ducation civique en Ha\u00efti. Notre plateforme \u00e9volue chaque jour gr\u00e2ce \u00e0 votre soutien."
                  : "LexHaiti se yon angajman pou transparans jiridik ak edikasyon sivik nan peyi Ayiti. Platf\u00f2m nou an ap evolye chak jou gras ak sip\u00f2 ou."}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Link
                href="/lois"
                className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-primary px-6 py-3 rounded-md font-semibold transition-colors active:scale-[0.99] shadow-sm"
              >
                <BookOpen className="w-4 h-4" />
                {isFr ? 'Explorer les textes' : 'Eksplore t\u00e8ks yo'}
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
