'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'

const COPY = {
  fr: {
    backHome: 'Retour au site',
    title: 'Connexion éditeur',
    subtitle:
      'Entrez votre adresse e-mail. Vous recevrez un lien à usage unique pour vous connecter — pas de mot de passe.',
    emailLabel: 'Adresse e-mail',
    emailPlaceholder: 'vous@lexhaiti.ht',
    submitButton: 'Recevoir le lien',
    submittingButton: 'Envoi…',
    note: 'Si votre adresse n’est pas autorisée, contactez l’administrateur.',
    alreadySignedInPrefix: 'Vous êtes déjà connecté en tant que',
    goHome: "Aller à l’accueil",
  },
  ht: {
    backHome: 'Retounen sou sit la',
    title: 'Koneksyon editè',
    subtitle:
      'Antre adrès imèl ou. W ap resevwa yon lyen pou yon sèl fwa pou konekte — pa gen modpas.',
    emailLabel: 'Adrès imèl',
    emailPlaceholder: 'ou@lexhaiti.ht',
    submitButton: 'Resevwa lyen an',
    submittingButton: 'K ap voye…',
    note: 'Si adrès ou pa otorize, kontakte administratè a.',
    alreadySignedInPrefix: 'Ou deja konekte kòm',
    goHome: 'Ale sou paj akèy',
  },
}

export default function SignInPage() {
  const { language } = useLanguage()
  const t = COPY[(language as 'fr' | 'ht') ?? 'fr']
  const { data: session, status } = useSession()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await signIn('nodemailer', {
        email,
        redirect: false,
        callbackUrl: '/',
      })
      // signIn returns { error?: string, ok: boolean, url?: string }.
      // If our auth.ts callback redirected to /sign-in/error?error=NotAuthorized,
      // that arrives here — forward the user.
      if (res?.error) {
        router.push(`/sign-in/error?error=${encodeURIComponent(res.error)}`)
        return
      }
      if (res?.url?.includes('/sign-in/error')) {
        router.push(res.url)
        return
      }
      router.push('/sign-in/check-email')
    })
  }

  // If already signed in, show a small notice instead of the form.
  if (status === 'authenticated' && session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-white">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-slate-600">
            {t.alreadySignedInPrefix}
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {session.user.email}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href="/">
              {t.goHome}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-white">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors mb-10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.backHome}
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {t.title}
        </h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          {t.subtitle}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.emailLabel}
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              disabled={pending}
              autoFocus
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white',
                'placeholder:text-slate-400 text-slate-900 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
                'transition-colors disabled:opacity-50',
              )}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            disabled={pending || !email}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {t.submittingButton}
              </>
            ) : (
              t.submitButton
            )}
          </Button>
        </form>

        <p className="mt-6 text-xs text-slate-400 leading-relaxed">{t.note}</p>
      </div>
    </div>
  )
}
