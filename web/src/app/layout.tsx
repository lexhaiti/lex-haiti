// app/layout.tsx
import type { Metadata } from 'next'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'
import SiteShell from '@/components/layout/SiteShell'
import Providers from './providers'
import { getServerLanguage } from '@/i18n/server'

export const metadata: Metadata = {
  title: {
    default: 'LexHaiti — Législation Haïtienne',
    template: '%s | LexHaiti',
  },
  description:
    "Plateforme de numérisation et d'accès public à la législation haïtienne. Recherchez les lois, décrets, codes et textes juridiques d'Haïti.",
  keywords: [
    'Haïti',
    'législation',
    'loi',
    'décret',
    'code',
    'droit haïtien',
    'juridique',
    'Le Moniteur',
  ],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const language = await getServerLanguage()
  return (
    <html lang={language} suppressHydrationWarning>
      <body>
        {/* Slim top progress bar on route transitions — LexHaïti red,
            no spinner, no shadow. Subtle "yes, I'm loading" signal
            that's invisible when navigations complete instantly. */}
        <NextTopLoader
          color="#DC2626"
          height={2}
          showSpinner={false}
          shadow="0 0 8px #DC2626, 0 0 4px #DC2626"
          easing="ease"
          speed={250}
          crawlSpeed={150}
        />
        {/* Skip-to-content link for keyboard/screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-blue-700 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
        >
          Aller au contenu principal
        </a>
        <Providers initialLanguage={language}>
          <SiteShell>{children}</SiteShell>
        </Providers>
      </body>
    </html>
  )
}
