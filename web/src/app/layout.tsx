// app/layout.tsx
import type { Metadata } from 'next'
import { DM_Sans, Source_Serif_4 } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import SiteShell from '@/components/layout/SiteShell'
import Providers from './providers'
import { getServerLanguage } from '@/i18n/server'
import { loadMessages } from '@/i18n'

// next/font self-hosts these so the browser never blocks on a
// Google Fonts CSS request. ``swap`` shows a fallback immediately,
// preventing the FOIT. ``--font-*`` variables are read by the Tailwind
// fontFamily config (tailwind.config.ts:fontFamily.sans/serif).
const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-dm-sans',
})
const sourceSerif4 = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-source-serif-4',
})

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
  // Load just the active language's catalogue server-side and hand it
  // to the client Provider. The dynamic import in ``loadMessages``
  // produces a per-language chunk; the server happens to render with
  // it directly while the client picks up only that one chunk for
  // first paint. The inactive language stays a separate chunk that
  // only fetches when the user toggles.
  const initialMessages = await loadMessages(language)
  return (
    <html
      lang={language}
      suppressHydrationWarning
      className={`${dmSans.variable} ${sourceSerif4.variable}`}
    >
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
        <Providers initialLanguage={language} initialMessages={initialMessages}>
          <SiteShell>{children}</SiteShell>
        </Providers>
        {/* Vercel Speed Insights — Core Web Vitals (LCP, CLS, INP,
            FCP, TTFB) sampled in production only, no PII. The script
            is lazy-loaded by Vercel after the page is interactive
            so it doesn't compete with first paint. Free tier covers
            10k events/month, plenty for our current traffic. */}
        <SpeedInsights />
      </body>
    </html>
  )
}
