// Server Component — no client state. Entrance animation handled by
// tailwindcss-animate utilities instead of framer-motion.

import Link from 'next/link'
import { ArrowRight, Building2, GraduationCap, Scale } from 'lucide-react'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { getT } from '@/i18n/server'

// Copy lives at `home.partenaires.*` in i18n/{fr,ht}.ts.
// Partner-type icons stay here — they're component references, not
// translatable strings.
const TYPES = [
  { key: 'universities' as const, icon: GraduationCap },
  { key: 'bars' as const, icon: Scale },
  { key: 'ngos' as const, icon: Building2 },
]

export default async function PartenairesSection() {
  const t = await getT()

  return (
    <section className="relative w-full bg-slate-50/40 py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        <SectionHeading
          eyebrow={t('home.partenaires.eyebrow')}
          title={t('home.partenaires.title')}
          subtitle={t('home.partenaires.subtitle')}
        />

        {/* Partner-types grid — dashed border indicates "open to partners",
            not yet filled with logos. The previous staggered framer-motion
            reveal is replaced by a single CSS fade-in on mount; on a 3-up
            grid the stagger nuance was barely visible anyway. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {TYPES.map((type, i) => {
            const Icon = type.icon
            return (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-5 transition-colors hover:border-primary/30 hover:bg-white"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-slate-700 leading-tight">
                  {t(`home.partenaires.types.${type.key}`)}
                </span>
              </div>
            )
          })}
        </div>

        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-md bg-primary text-white px-6 py-3 text-sm font-semibold hover:bg-primary/90 transition-colors group"
        >
          {t('home.partenaires.cta')}
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  )
}
