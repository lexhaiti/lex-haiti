'use client'

import { SessionProvider } from 'next-auth/react'
import { LanguageProvider } from '@/i18n/LanguageContext'
import { ToastProvider } from '@/components/ui/toast-simple'

/** All client-side providers in one place — keeps RootLayout a Server Component. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LanguageProvider>
        <ToastProvider>{children}</ToastProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
