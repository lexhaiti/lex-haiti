'use client'

import Link from 'next/link'
import { Scale } from 'lucide-react'
import { useT } from '@/i18n/useT'

type BrandLogoProps = {
  href?: string

  /** Wrapper text styles (header: text-foreground, footer: text-white, ...) */
  titleClassName?: string
  taglineClassName?: string

  /** Icon card styles */
  iconWrapperClassName?: string

  /** Icon styles */
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
  iconWrapperClassName = 'w-10 h-10 rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#2d5a87] flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow',
  iconClassName = 'w-5 h-5 text-accent',
  showTagline = true,
  taglineKey = 'nav.logoTagline',
}: BrandLogoProps) {
  const { t } = useT()

  return (
    <Link
      href={href}
      className="group flex items-center gap-2 cursor-pointer min-h-[44px] -my-0.5"
    >
      <div className={iconWrapperClassName}>
        <Scale className={iconClassName} />
      </div>

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
