'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/i18n/LanguageContext'

type AuthErrorCode =
  | 'NotAuthorized' // our custom code from auth.ts signIn callback
  | 'Verification'  // magic-link expired or already used
  | 'Configuration'
  | 'AccessDenied'
  | 'Default'

const COPY: Record<'fr' | 'ht', Record<AuthErrorCode, { title: string; body: string }>> = {
  fr: {
    NotAuthorized: {
      title: 'Adresse non autorisée',
      body:
        "Cette adresse e-mail n’est pas reconnue comme un compte éditeur. " +
        "L’accès est réservé aux personnes pré-autorisées par l’administrateur.",
    },
    Verification: {
      title: 'Lien expiré',
      body:
        'Ce lien magique a expiré ou a déjà été utilisé. Demandez-en un nouveau.',
    },
    Configuration: {
      title: 'Configuration incorrecte',
      body:
        'Une erreur de configuration empêche la connexion. Contactez l’administrateur.',
    },
    AccessDenied: {
      title: 'Accès refusé',
      body: 'L’accès a été refusé.',
    },
    Default: {
      title: 'Erreur de connexion',
      body: 'Une erreur s’est produite. Réessayez plus tard.',
    },
  },
  ht: {
    NotAuthorized: {
      title: 'Adrès pa otorize',
      body:
        "Adrès imèl sa a pa rekonèt kòm yon kont editè. " +
        "Aksè a se pou moun ki gen pèmisyon davans nan men administratè a.",
    },
    Verification: {
      title: 'Lyen ekspire',
      body: 'Lyen majik sa a ekspire oswa li deja itilize. Mande yon lòt.',
    },
    Configuration: {
      title: 'Konfigirasyon enkòrèk',
      body:
        'Yon erè konfigirasyon anpeche koneksyon an. Kontakte administratè a.',
    },
    AccessDenied: {
      title: 'Aksè refize',
      body: 'Aksè refize.',
    },
    Default: {
      title: 'Erè koneksyon',
      body: 'Yon erè rive. Eseye ankò pita.',
    },
  },
}

const CONTACT = {
  fr: 'Contacter un administrateur',
  ht: 'Kontakte yon administratè',
}
const TRY_AGAIN = { fr: 'Réessayer', ht: 'Eseye ankò' }

export default function SignInError() {
  const { language } = useLanguage()
  const lang = (language as 'fr' | 'ht') ?? 'fr'
  const params = useSearchParams()
  const code = (params?.get('error') ?? 'Default') as AuthErrorCode
  const m = COPY[lang][code] ?? COPY[lang].Default

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-white">
      <div className="w-full max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-5">
          <AlertCircle className="w-6 h-6 text-amber-700" />
        </div>
        <h1 className="text-center text-2xl font-bold text-slate-900 tracking-tight">
          {m.title}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500 leading-relaxed">
          {m.body}
        </p>

        <div className="mt-8 space-y-3">
          <Button asChild variant="outline" className="w-full h-11">
            <Link href="/sign-in">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {TRY_AGAIN[lang]}
            </Link>
          </Button>
          <a
            href="mailto:contact@lexhaiti.ht"
            className="flex h-11 w-full items-center justify-center rounded-md text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <Mail className="mr-1.5 h-4 w-4" />
            {CONTACT[lang]}
          </a>
        </div>
      </div>
    </div>
  )
}
