// RSC — same pattern as legal/page.tsx: cookie-based i18n + per-route
// metadata + CSS-only entrance animations.

import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import { getServerLanguage, getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return {
    title: t('privacy.title', {
      fallback:
        language === 'fr'
          ? 'Politique de confidentialité'
          : 'Politik konfidansyalite',
    }),
  }
}

export default async function Page() {
  const t = await getT()
  const isFr = t.language === 'fr'

  const policies = [
    {
      title: isFr ? 'Collecte des données' : 'Kolèk done yo',
      content: isFr
        ? "Nous ne collectons que le strict minimum nécessaire au bon fonctionnement de la plateforme : préférences de langue, historique de recherche local. Aucune donnée personnelle n'est requise pour consulter le corpus."
        : "Nou kolekte sèlman sa ki nesesè pou platfòm lan ka mache byen : preferans lang, istwa rechèch lokal. Pa gen okenn done pèsonèl ki egzije pou konsilte kòpis la.",
    },
    {
      title: isFr ? 'Cookies' : 'Cookies',
      content: isFr
        ? "Nous utilisons uniquement des cookies techniques nécessaires au fonctionnement (mémorisation de la langue, état de session). Aucun cookie publicitaire ni de pistage n'est utilisé."
        : "Nou itilize sèlman cookies teknik ki nesesè pou fonksyonman an (sonje lang, eta sesyon). Pa gen okenn cookies pou piblisite oswa pou swiv ou.",
    },
    {
      title: isFr ? 'Vos droits' : 'Dwa ou yo',
      content: isFr
        ? "Conformément aux principes de protection des données, vous pouvez effacer vos données locales à tout moment en vidant le cache de votre navigateur. Aucune donnée n'est conservée côté serveur sans consentement explicite."
        : "Dapre prensip pwoteksyon done yo, ou ka efase done lokal ou yo nenpòt lè lè ou netwaye kach navigatè ou a. Okenn done pa konsève sou sèvè a san dakò eksplisit.",
    },
    {
      title: isFr ? 'Contact' : 'Kontak',
      content: isFr
        ? "Pour toute question concernant la confidentialité ou pour exercer vos droits sur vos données, contactez l'équipe LexHaïti via la page de contact."
        : "Pou nenpòt kesyon konsènan konfidansyalite oswa pou egzèse dwa ou yo sou done ou yo, kontakte ekip LexHaïti atravè paj kontak la.",
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={t('privacy.title', {
          fallback: isFr
            ? 'Politique de confidentialité'
            : 'Politik konfidansyalite',
        })}
        subtitle={t('privacy.subtitle', {
          fallback: isFr
            ? 'Comment nous protégeons vos informations et respectons votre vie privée.'
            : 'Kijan nou pwoteje enfòmasyon ou yo ak respekte vi prive ou.',
        })}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          {
            label: isFr ? 'Confidentialité' : 'Konfidansyalite',
          },
        ]}
      />

      <div className="container py-16 lg:py-20">
        <div className="space-y-10 lg:space-y-12">
          {policies.map((policy, idx) => (
            <section
              key={idx}
              className="rounded-xl border border-slate-200 bg-white p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <h2 className="flex items-start gap-4 text-xl lg:text-2xl font-bold text-primary leading-tight mb-4">
                <span className="flex-shrink-0 inline-flex h-9 w-9 lg:h-10 lg:w-10 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary text-xs font-bold tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="pt-1">{policy.title}</span>
              </h2>
              <div className="h-[3px] w-12 bg-amber-400 mb-5 ml-13 lg:ml-14" />
              <p className="text-base lg:text-lg text-slate-600 leading-relaxed">
                {policy.content}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
