// Server Component — no client state. Entrance animation runs on
// mount via tailwindcss-animate utilities; the previous staggered
// framer-motion reveal is replaced by a single fade-in (the stagger
// nuance was barely visible on a 4-card row anyway).

import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { getT } from '@/i18n/server'

// Copy lives at `home.explorer.*` in i18n/{fr,ht}.ts.
// Card hrefs + image paths stay here because they are routing/asset
// data, not translatable strings.
const CARDS = [
  {
    key: 'constitutions' as const,
    href: '/lois?category=constitution',
    image: '/constitutions.png',
  },
  {
    key: 'codes' as const,
    href: '/lois?category=code',
    image: '/codes.png',
  },
  {
    key: 'lois' as const,
    href: '/lois?category=loi',
    image: '/decrets-lois.png',
  },
  {
    key: 'aide' as const,
    href: '/aide',
    image: '/faq.png',
  },
]

export default async function ExplorerSection() {
  const t = await getT()

  return (
    <section className="relative w-full bg-white py-16 lg:py-24 border-t border-slate-100">
      <div className="container">
        <SectionHeading title={t('home.explorer.eyebrow')} />

        {/* Card grid — 4 cards.
            Mobile: 1 col. md/lg (incl. iPad Pro 12.9" portrait at 1024): 2x2.
            xl+ (real desktop): single row of 4. */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {CARDS.map((card) => (
            <div key={card.key}>
              {/* Whole-card link — entire card is clickable. No underline
                  on hover; the lift + shadow + border shift signal
                  interactivity instead. */}
              <Link
                href={card.href}
                className={cn(
                  'group block h-full rounded-xl overflow-hidden',
                  'border border-slate-200 bg-white',
                  'shadow-sm hover:shadow-xl hover:border-slate-300',
                  'hover:-translate-y-1 transition-all duration-300',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
                )}
              >
                {/* Photographic image — taller image area + a baseline
                    zoom-in (scale-110) so the subject reads with presence
                    even when the card is narrow (e.g. 4-col xl layout). */}
                <div className="relative h-48 sm:h-56 lg:h-60 xl:h-56 w-full overflow-hidden bg-primary">
                  {/* ``next/image`` swap: serves WebP/AVIF + width-
                      targeted srcset, so we ship the right pixel size
                      per viewport instead of the same 1-6 MB PNG. The
                      ``sizes`` value mirrors the card grid breakpoints
                      (4-col xl, 2-col md, 1-col mobile). */}
                  <Image
                    src={card.image}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                    className={cn(
                      'object-cover object-center origin-center',
                      // Baseline zoom keeps the focal subject prominent when
                      // the image is squeezed into a narrow card.
                      'scale-110 group-hover:scale-[1.18]',
                      'transition-transform duration-500',
                    )}
                  />
                  {/* Soft bottom vignette for depth + a touch of edge
                      darkening so the amber line below pops. */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                </div>

                {/* Amber accent — Justice-Canada signature element. */}
                <div className="h-[3px] w-full bg-amber-400 transition-colors duration-300 group-hover:bg-amber-500" />

                {/* Text body */}
                <div className="flex flex-col p-6 lg:p-7">
                  <h3 className="text-lg lg:text-xl font-bold text-primary">
                    {t(`home.explorer.cards.${card.key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                    {t(`home.explorer.cards.${card.key}.description`)}
                  </p>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
