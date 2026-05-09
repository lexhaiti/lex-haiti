'use client'

import { SessionProvider } from 'next-auth/react'
import { LanguageProvider } from '@/i18n/LanguageContext'
import { ToastProvider } from '@/components/ui/toast-simple'
import type { Language } from '@/i18n'

/** All client-side providers in one place — keeps RootLayout a Server Component. */
export default function Providers({
  children,
  initialLanguage,
}: {
  children: React.ReactNode
  /**
   * Server-detected language (from the lexhaiti.lang cookie). The
   * RootLayout reads it via getServerLanguage() and passes it down so
   * the LanguageProvider can hydrate with the correct value on first
   * render — no FR→HT flicker for Kreyòl visitors.
   */
  initialLanguage?: Language
}) {
  return (
    <SessionProvider>
      <LanguageProvider initialLanguage={initialLanguage}>
        <ToastProvider>{children}</ToastProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
