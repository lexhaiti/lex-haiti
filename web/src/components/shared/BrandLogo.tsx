'use client'

import Link from 'next/link'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

type BrandLogoProps = {
  href?: string

  /** Wrapper text styles (header: text-foreground, footer: text-white, ...) */
  titleClassName?: string
  taglineClassName?: string

  /**
   * Classes applied to the logo image itself — size, rounding, shadow,
   * etc. Default is a 40×40 contained box, matching the previous
   * gradient-card icon size. Pass a different size (``w-12 h-12``) or
   * drop the rounded background if the parent surface already provides
   * contrast.
   */
  iconWrapperClassName?: string

  /**
   * @deprecated kept for backward compat with old call-sites that pass
   * a Lucide-icon classname. The new logo is a self-contained emblem;
   * style the surrounding box via ``iconWrapperClassName`` instead.
   */
  iconClassName?: string

  /** show tagline (you might want hidden on mobile in header etc.) */
  showTagline?: boolean

  /** optional override if you want different tagline key */
  taglineKey?: string
}

export default function BrandLogo({
  href = '/',
  titleClassName = 'text-foreground',
  taglineClassName = 'text-muted-foreground',
  iconWrapperClassName,
  showTagline = true,
  taglineKey = 'nav.logoTagline',
}: BrandLogoProps) {
  const { t } = useT()

  return (
    <Link
      href={href}
      className="group flex items-center gap-2 cursor-pointer min-h-[44px] -my-0.5"
      aria-label="LexHaiti"
    >
      {/* Logo strategy: a 192px PNG rasterized once from the 2000×2000
          master (``public/lexhaiti-logo.png``) covers every header /
          footer display size at 3× DPR. We serve WebP first (~22KB,
          all evergreen browsers + Safari 14+) with a PNG fallback
          (~53KB, ancient Safari & Edge). Plain ``<img>`` / ``<source>``
          so next/image's optimiser can't rasterise the asset again —
          on iPhone Retina that round-trip blurred the engraved
          detail. Master SVG + 2000px PNG stay around for share-card
          / print contexts.

          Sizing: 48px mobile (bumped from 40 so the gold ring +
          ``IURIS FUNDAMENTUM`` legend read at iPhone glance distance),
          56px on ``sm+``. Header / Footer can grow further via
          ``iconWrapperClassName``. */}
      <picture className="contents">
        <source srcSet="/lexhaiti-logo-192.webp" type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/lexhaiti-logo-192.png"
          alt="LexHaiti"
          loading="eager"
          decoding="async"
          className={cn(
            'h-12 w-12 sm:h-14 sm:w-14 shrink-0 object-contain transition-transform duration-300 group-hover:scale-[1.05]',
            iconWrapperClassName,
          )}
        />
      </picture>

      <div className="flex flex-col">
        <span className={`text-xl font-bold tracking-tight ${titleClassName}`}>
          Lex<span className="text-red-600">Haïti</span>
        </span>

        {showTagline && (
          <span className={`text-[10px]  hidden sm:block ${taglineClassName}`}>
            {t(taglineKey)}
          </span>
        )}
      </div>
    </Link>
  )
}
