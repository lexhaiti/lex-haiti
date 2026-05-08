'use client'

import Link from 'next/link'
import { Mail, ArrowRight } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'

const COPY = {
  fr: {
    title: 'Vérifiez votre boîte de réception',
    body:
      'Un lien de connexion a été envoyé. Cliquez dessus depuis votre boîte mail pour vous connecter.',
    devNote: 'En développement, l’e-mail est intercepté par Mailpit :',
    openMailpit: 'Ouvrir Mailpit',
    backToSignIn: '← Utiliser une autre adresse',
  },
  ht: {
    title: 'Tcheke bwat resepsyon ou',
    body:
      'Yon lyen koneksyon voye. Klike sou li depi nan bwat imèl ou pou konekte.',
    devNote: 'Nan devlòpman, imèl la kenbe pa Mailpit :',
    openMailpit: 'Ouvri Mailpit',
    backToSignIn: '← Sèvi ak yon lòt adrès',
  },
}

export default function CheckEmail() {
  const { language } = useLanguage()
  const t = COPY[(language as 'fr' | 'ht') ?? 'fr']

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-white">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
          <Mail className="w-6 h-6 text-emerald-700" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {t.title}
        </h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{t.body}</p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500 mb-3">{t.devNote}</p>
          <a
            href="http://localhost:8025"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"
          >
            {t.openMailpit}
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <Link
          href="/sign-in"
          className="mt-8 inline-block text-xs text-slate-400 hover:text-slate-600"
        >
          {t.backToSignIn}
        </Link>
      </div>
    </div>
  )
}
