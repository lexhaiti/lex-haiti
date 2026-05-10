// RSC route file. The interactive list lives in the client component
// below; here we only emit per-route metadata so the browser tab
// reads "Le Moniteur | LexHaiti" instead of the default site title.

import type { Metadata } from 'next'
import { getServerLanguage, getT } from '@/i18n/server'
import MoniteurListClient from './_components/MoniteurListClient'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return {
    title: t('moniteur.title', { fallback: 'Le Moniteur' }),
    description: t('moniteur.subtitle', {
      fallback:
        language === 'fr'
          ? "Journal Officiel de la République d'Haïti."
          : 'Jounal Ofisyèl Repiblik Ayiti.',
    }),
  }
}

export default function Page() {
  return <MoniteurListClient />
}
