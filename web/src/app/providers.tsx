'use client'

import { SessionProvider } from 'next-auth/react'
import { LanguageProvider } from '@/i18n/LanguageContext'
import { ToastProvider } from '@/components/ui/toast-simple'
import type { Language, MessagesDict } from '@/i18n'

/** All client-side providers in one place — keeps RootLayout a Server Component. */
export default function Providers({
  children,
  initialLanguage,
  initialMessages,
}: {
  children: React.ReactNode
  /**
   * Server-detected language (from the lexhaiti.lang cookie). The
   * RootLayout reads it via getServerLanguage() and passes it down so
   * the LanguageProvider can hydrate with the correct value on first
   * render — no FR→HT flicker for Kreyòl visitors.
   */
  initialLanguage?: Language
  /**
   * Server-resolved catalogue for the active language. Passed in so
   * the first client render has its strings without waiting on the
   * per-language dynamic import the LanguageProvider does on toggle.
   */
  initialMessages?: MessagesDict | null
}) {
  return (
    <SessionProvider>
      <LanguageProvider
        initialLanguage={initialLanguage}
        initialMessages={initialMessages}
      >
        <ToastProvider>{children}</ToastProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
