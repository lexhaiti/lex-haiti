// RSC — no interactivity, just localized rendering. Reads the cookie
// language server-side via getServerLanguage() and emits per-route
// metadata for the browser tab. Copy lives at `signIn.checkEmail.*`
// in i18n/{fr,ht}.ts.

import Link from 'next/link'
import { Mail, ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import { getServerLanguage, getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return { title: t('signIn.checkEmail.pageTitle') }
}

export default async function CheckEmail() {
  const t = await getT()

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-white">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
          <Mail className="w-6 h-6 text-emerald-700" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {t('signIn.checkEmail.title')}
        </h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          {t('signIn.checkEmail.body')}
        </p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500 mb-3">
            {t('signIn.checkEmail.devNote')}
          </p>
          <a
            href="http://localhost:8025"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"
          >
            {t('signIn.checkEmail.openMailpit')}
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <Link
          href="/sign-in"
          className="mt-8 inline-block text-xs text-slate-400 hover:text-slate-600"
        >
          {t('signIn.checkEmail.backToSignIn')}
        </Link>
      </div>
    </div>
  )
}
