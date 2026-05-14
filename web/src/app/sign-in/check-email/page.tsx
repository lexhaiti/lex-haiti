// RSC — no interactivity, just localized rendering. Reads the cookie
// language server-side via getServerLanguage() and emits per-route
// metadata for the browser tab. Copy lives at `signIn.checkEmail.*`
// in i18n/{fr,ht}.ts.
//
// Dev vs prod: the mailpit shortcut only renders when NODE_ENV !==
// 'production'. On prod we instead show a helpful "didn't get the
// email?" guidance block (spam folder, retry sign-in).

import Link from 'next/link'
import { Mail, ArrowRight, Clock, Shield } from 'lucide-react'
import type { Metadata } from 'next'
import { getServerLanguage, getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return { title: t('signIn.checkEmail.pageTitle') }
}

export default async function CheckEmail() {
  const t = await getT()
  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-gradient-to-b from-white to-slate-50">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-6 shadow-sm">
          <Mail className="w-7 h-7 text-emerald-700" />
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
          {t('signIn.checkEmail.title')}
        </h1>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          {t('signIn.checkEmail.body')}
        </p>

        {isDev ? (
          /* Dev-only convenience: Mailpit is the local SMTP catcher
             at :8025. Hidden on prod because there's no Mailpit there. */
          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
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
        ) : (
          /* Prod: helpful follow-up info instead of the dev shortcut. */
          <div className="mt-8 text-left space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 leading-relaxed">
                {t('signIn.checkEmail.tipExpiry')}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 leading-relaxed">
                {t('signIn.checkEmail.tipSpam')}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 leading-relaxed">
                {t('signIn.checkEmail.tipSecurity')}
              </p>
            </div>
          </div>
        )}

        <Link
          href="/sign-in"
          className="mt-8 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
        >
          ← {t('signIn.checkEmail.backToSignIn')}
        </Link>
      </div>
    </div>
  )
}
