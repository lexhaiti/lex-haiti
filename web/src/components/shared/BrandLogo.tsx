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
      {/* Plain ``<img>`` (not next/image) so the browser renders the
          SVG natively as a vector and stays crisp on Retina/iPhone —
          next/image was rasterising the file on high-DPI screens,
          leaving the engraved detail (Lady Justice, palmis, circular
          legend) blurry. Default size 40px; the header bumps it to
          48px from ``sm`` upwards via ``iconWrapperClassName``. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/lexhaiti-logo.svg"
        alt="LexHaiti"
        loading="eager"
        decoding="async"
        className={cn(
          'h-10 w-10 shrink-0 object-contain transition-transform duration-300 group-hover:scale-[1.05]',
          iconWrapperClassName,
        )}
      />

      <div className="flex flex-col">
        <span className={`text-xl font-bold tracking-tight ${titleClassName}`}>
          Lex<span className="text-red-600">Haiti</span>
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
