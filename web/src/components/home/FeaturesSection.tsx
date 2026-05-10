// Server Component — no client state, no event handlers. Replaces the
// previous staggered framer-motion reveals with tailwindcss-animate's
// fade-in/slide-in utilities, which run on mount via CSS only.

import { Globe2, Languages, LinkIcon } from 'lucide-react'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { getT } from '@/i18n/server'

// Copy lives at `home.features.*` in i18n/{fr,ht}.ts.
// Two voices for the same section. Desktop (md+) gets the longer
// institutional version; mobile gets the punchy minimal version. Both share
// the same icons, numbering and amber-accent rhythm.
//
// Pillar icons stay here because they are component references, not
// translatable strings.
const PILLARS = [
  { key: 'access' as const, icon: Globe2 },
  { key: 'source' as const, icon: LinkIcon },
  { key: 'bilingual' as const, icon: Languages },
]

export default async function FeaturesSection() {
  const t = await getT()

  return (
    <section className="relative w-full bg-white py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        {/* Headings — render both, toggle by breakpoint. The institutional
            voice reads on desktop where there's room; the minimal voice
            reads on mobile where attention is scarce. */}
        <div className="md:hidden">
          <SectionHeading
            eyebrow={t('home.features.eyebrow')}
            title={t('home.features.mobile.title')}
            subtitle={t('home.features.mobile.subtitle')}
            titleMaxWidth="max-w-full"
          />
        </div>
        <div className="hidden md:block">
          <SectionHeading
            eyebrow={t('home.features.eyebrow')}
            title={t('home.features.desktop.title')}
            subtitle={t('home.features.desktop.subtitle')}
            titleMaxWidth="max-w-full"
          />
        </div>

        {/* Mobile pillars (Version B — minimal) */}
        <div className="md:hidden grid grid-cols-1 gap-4 mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {PILLARS.map((pillar, i) => {
            const Icon = pillar.icon
            return (
              <div
                key={i}
                className="group rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
                    {String(i + 1).padStart(2, '0')} — {t(`home.features.mobile.pillars.${pillar.key}.label`)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t(`home.features.mobile.pillars.${pillar.key}.desc`)}
                </p>
              </div>
            )
          })}
        </div>

        {/* Desktop pillars (Version A — institutional, with lead line) */}
        <div className="hidden md:grid grid-cols-3 gap-6 lg:gap-7 mb-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {PILLARS.map((pillar, i) => {
            const Icon = pillar.icon
            return (
              <div
                key={i}
                className="group relative rounded-xl border border-slate-200 bg-white p-6 lg:p-7 transition-all duration-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white group-hover:border-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
                    {String(i + 1).padStart(2, '0')} — {t(`home.features.desktop.pillars.${pillar.key}.label`)}
                  </span>
                </div>
                <h3 className="text-lg lg:text-xl font-bold text-primary mb-2 leading-tight">
                  {t(`home.features.desktop.pillars.${pillar.key}.lead`)}
                </h3>
                <p className="text-sm lg:text-[15px] text-slate-600 leading-relaxed">
                  {t(`home.features.desktop.pillars.${pillar.key}.desc`)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
