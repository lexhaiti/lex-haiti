'use client'

import Link from 'next/link'
import { useT } from '@/i18n/useT'

export default function NotFound() {
  const { t } = useT()
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground mb-6">
        {t('notFound.message', { fallback: 'Page introuvable.' })}
      </p>
      <Link href="/" className="text-primary underline">
        {t('notFound.backHome', { fallback: 'Retour à l’accueil' })}
      </Link>
    </div>
  )
}
// Participez à la création de la plus grande bibliothèque juridique numérique haïtienne accessible à tous, gratuitement.
