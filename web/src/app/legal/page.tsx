// RSC — pure content page with cookie-based i18n + per-route metadata.
// Entrance animations are pure CSS (tailwindcss-animate `animate-in`)
// so no client component is needed.

import type { Metadata } from 'next'
import { ShieldAlert } from 'lucide-react'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import { getServerLanguage, getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return {
    title: t('legal.title', {
      fallback: language === 'fr' ? 'Mentions légales' : 'Mansyon legal',
    }),
  }
}

export default async function Page() {
  const t = await getT()
  const isFr = t.language === 'fr'

  const sections = [
    {
      title: isFr ? 'Éditeur du site' : 'Editè sit la',
      content: isFr
        ? "Le site LexHaïti est une initiative open-source dédiée à la diffusion du droit haïtien. Le portail est exploité par l'équipe LexHaïti et publié comme un bien public numérique."
        : "Sit LexHaïti se yon inisyativ open-source ki la pou gaye dwa ayisyen an. Pòtal la jere pa ekip LexHaïti epi pibliye kòm yon byen piblik nimerik.",
    },
    {
      title: isFr ? 'Hébergement' : 'Hebèjman',
      content: isFr
        ? "Ce site est hébergé sur des serveurs sécurisés assurant une disponibilité continue et la conservation à long terme des contenus publiés."
        : "Sit sa a hebèje sou sèvè ki an sekirite ki asire disponibilite kontinyèl ak konsèvasyon kontni ki pibliye yo sou tan long.",
    },
    {
      title: isFr ? 'Propriété intellectuelle' : 'Pwopriyete entèlektyèl',
      content: isFr
        ? "Les textes de loi et règlements appartiennent au domaine public. La structure de la base de données, les annotations éditoriales et l'interface utilisateur sont distribuées sous licence libre — la mention de la source est requise."
        : "Tèks lwa ak règleman yo se pou domèn piblik la. Estrikti baz done a, anotasyon editoryal yo ak entèfas itilizatè a distribiye anba lisans lib — fò ou di sous la.",
    },
    {
      title: isFr ? 'Responsabilité' : 'Responsablite',
      content: isFr
        ? "LexHaïti met tout en œuvre pour garantir l'exactitude des contenus publiés. Cependant, aucune information disponible sur ce site ne saurait remplacer un avis juridique professionnel. Pour toute décision engageante, consulter un avocat ou une institution compétente."
        : "LexHaïti fè tout sa li kapab pou kontni ki pibliye yo egzak. Sepandan, okenn enfòmasyon sou sit sa a pa ka ranplase yon konsèy jiridik pwofesyonèl. Pou nenpòt desizyon enpòtan, konsilte yon avoka oswa yon enstitisyon konpetan.",
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={t('legal.title', {
          fallback: isFr ? 'Mentions légales' : 'Mansyon legal',
        })}
        subtitle={t('legal.subtitle', {
          fallback: isFr
            ? "Informations légales concernant l'utilisation de la plateforme LexHaïti."
            : 'Enfòmasyon legal konsènan itilizasyon platfòm LexHaïti a.',
        })}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: isFr ? 'Mentions légales' : 'Mansyon legal' },
        ]}
      />

      <div className="container py-16 lg:py-20">
        <div className="space-y-10 lg:space-y-12">
          {sections.map((section, idx) => (
            <section
              key={idx}
              className="rounded-xl border border-slate-200 bg-white p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <h2 className="flex items-start gap-4 text-xl lg:text-2xl font-bold text-primary leading-tight mb-4">
                <span className="flex-shrink-0 inline-flex h-9 w-9 lg:h-10 lg:w-10 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary text-xs font-bold tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="pt-1">{section.title}</span>
              </h2>
              <div className="h-[3px] w-12 bg-amber-400 mb-5 ml-13 lg:ml-14" />
              <p className="text-base lg:text-lg text-slate-600 leading-relaxed">
                {section.content}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
