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
      {/* Route-transition progress bar. Pinned EXACTLY on top of the
          red gradient line at the bottom of the fixed nav header
          (Header.tsx:125 — a h-0.5 = 2px gradient at the bottom of the
          h-20 header, so y = 78px-80px). When the user navigates, the
          gold bar slides left-to-right over the red line; when idle,
          the red gradient shows through. Same height (2px), same
          vertical position, just a different color and animated.

          Gold (amber-500) over red — red stays reserved for the
          attention-tone eyebrow on empty states and error banners. */}
      <body>
        <style>{`
          #nprogress .bar {
            top: 78px !important;
            height: 2px !important;
          }
          /* Hide the chevron-shaped "peg" that NextTopLoader puts on
             the leading edge — it leaks above the 2px height and
             reveals the bar's true 3px stroke. */
          #nprogress .peg { display: none !important; }
        `}</style>
        <NextTopLoader
          color="#F59E0B"
          height={2}
          showSpinner={false}
          shadow="0 0 8px #F59E0B"
          easing="ease"
          speed={250}
          crawlSpeed={150}
          zIndex={51}
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
