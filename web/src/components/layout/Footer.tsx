'use client'

import Link from 'next/link'
import { Mail, MapPin } from 'lucide-react'
import { useT } from '@/i18n/useT'
import {
  footerAbout,
  footerLegal,
  footerResources,
} from '@/components/layout/nav'
import BrandLogo from '@/components/shared/BrandLogo'

export default function Footer() {
  const { t } = useT()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative bg-primary text-slate-300 overflow-hidden">
      {/* 1. Red Gradient Top Border */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-red-600 to-red-500" />

      {/* Decorative Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 bg-blue-900/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="container relative pt-20 pb-12">
        {/* 4-column footer grid. The brand column carries more content
            (logo + tagline + description + contact rows) than the link
            columns, so we give it 2x the width of each link column at
            lg+. With `2fr 1fr 1fr 1fr` the link columns stay equal among
            themselves and the brand column gets room to breathe — the
            standard Stripe / Linear / Vercel pattern. */}
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-10 items-start">
          {/* COL 1: Brand & Contact */}
          <div className="space-y-8">
            <div className="flex flex-col items-start">
              {/* The emblem's own navy disc would merge into the
                  footer's navy background — we wrap the image in a
                  white circular backdrop so the gold ring + Lady
                  Justice icon read as crisply as in the header
                  (where the white site surface already plays that
                  role). Tiny padding keeps the emblem from touching
                  the badge edge. */}
              <BrandLogo
                titleClassName="text-white font-extrabold text-2xl tracking-tight"
                taglineClassName=" text-[10px] font-bold uppercase tracking-widest mt-1"
                iconWrapperClassName="bg-white rounded-full p-0.5 ring-1 ring-white/20 shadow-md"
                showTagline={true}
                taglineKey={t('nav.logoTagline')}
              />

              <p className="mt-6 text-sm leading-relaxed text-slate-400 max-w-[60ch]">
                {t('footer.description')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 group">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 border border-slate-800 transition-colors group-hover:border-red-500/50">
                  <MapPin className="h-3.5 w-3.5 text-slate-500 transition-colors group-hover:text-red-500" />
                </div>
                <span className="text-xs font-medium group-hover:text-white transition-colors">
                  {t('footer.location')}
                </span>
              </div>
              <a
                href={`mailto:${t('footer.email')}`}
                className="flex items-center gap-3 group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 border border-slate-800 transition-colors group-hover:border-red-500/50">
                  <Mail className="h-3.5 w-3.5 text-slate-500 transition-colors group-hover:text-red-500" />
                </div>
                <span className="text-xs font-medium group-hover:text-white transition-colors">
                  {t('footer.email')}
                </span>
              </a>
            </div>
          </div>

          {/* COL 2: Textes Juridiques */}
          <div>
            <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              {t('footer.legalTexts')}
            </h4>
            <ul className="space-y-3">
              {footerLegal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-sm text-slate-400 transition-all hover:text-white"
                  >
                    <span className="h-px w-0 bg-red-500 transition-all group-hover:w-2" />
                    <span className="transition-transform group-hover:translate-x-1">
                      {t(link.labelKey)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* COL 3: Ressources */}
          <div>
            <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              {t('footer.resources')}
            </h4>
            <ul className="space-y-3">
              {footerResources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-sm text-slate-400 transition-all hover:text-white"
                  >
                    <span className="h-px w-0 bg-red-500 transition-all group-hover:w-2" />
                    <span className="transition-transform group-hover:translate-x-1">
                      {t(link.labelKey)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* COL 4: À propos */}
          <div>
            <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
              {t('footer.about')}
            </h4>
            <ul className="space-y-3">
              {footerAbout.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-sm text-slate-400 transition-all hover:text-white"
                  >
                    <span className="h-px w-0 bg-red-500 transition-all group-hover:w-2" />
                    <span className="transition-transform group-hover:translate-x-1">
                      {t(link.labelKey)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-slate-800/60 bg-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col-reverse md:flex-row items-center justify-between gap-4">
            {/* Left: Copyright + small editor sign-in */}
            <div className="flex flex-col sm:flex-row items-center gap-3 text-xs text-slate-300 font-medium">
              <span>© {currentYear} {t('footer.brand')}. {t('footer.rights')}</span>
              <span className="hidden sm:inline text-slate-600">·</span>
              <Link
                href="/sign-in"
                className="text-slate-300 hover:text-white transition-colors"
              >
                {t('nav.editorSignIn')}
              </Link>
            </div>

            {/* Right: Made-in-Haiti badge. Social links omitted until the
                project actually has accounts — empty href="#" links are
                broken navigation and a screen-reader anti-pattern. */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
              <span className="text-lg leading-none">🇭🇹</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                {t('footer.madeIn')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
