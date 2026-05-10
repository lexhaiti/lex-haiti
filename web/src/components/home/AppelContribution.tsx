// Server Component — no client state, no event handlers. The entrance
// animation is handled by tailwindcss-animate's `animate-in` utilities
// (CSS only, runs on mount), replacing the previous framer-motion
// `whileInView` reveal. Trade-off: the animation now fires on initial
// render rather than on scroll-into-view; that's fine since this
// section is always above-the-fold-ish on the homepage scroll.

import Link from 'next/link'
import { ArrowRight, MailIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getT } from '@/i18n/server'

// Copy lives at `home.appelContribution.*` in i18n/{fr,ht}.ts.

export default async function AppelContribution() {
  const t = await getT()

  return (
    <section className="relative w-full bg-white py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        <div className="relative rounded-2xl bg-primary p-8 sm:p-10 lg:p-14 overflow-hidden ring-1 ring-primary/10 shadow-[0_20px_60px_-20px_rgba(13,27,76,0.4)] animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Subtle decorative atmosphere — Haitian flag tones, low intensity. */}
          <div className="absolute top-0 right-0 w-[320px] h-[320px] bg-blue-600/10 rounded-full blur-[110px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[320px] h-[320px] bg-red-600/8 rounded-full blur-[110px] -translate-x-1/3 translate-y-1/3 pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                {t('home.appelContribution.eyebrow')}
              </p>
              <h3 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight tracking-tight">
                {t('home.appelContribution.heading')}
              </h3>
              <div className="mt-5 h-[3px] w-16 bg-amber-400" />
              <p className="mt-5 text-white/85 text-sm sm:text-base lg:text-lg leading-relaxed max-w-2xl">
                {t('home.appelContribution.body')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0 w-full lg:w-auto">
              <Link href="/contact" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 rounded-md bg-white text-primary hover:bg-slate-100 px-6 sm:px-7 font-semibold transition-colors active:scale-[0.98]"
                >
                  <MailIcon className="mr-2 w-4 h-4" />
                  {t('home.appelContribution.contact')}
                </Button>
              </Link>
              <Link href="/a-propos" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 rounded-md border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white/60 hover:text-white px-6 sm:px-7 font-medium transition-colors"
                >
                  {t('home.appelContribution.mission')}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
