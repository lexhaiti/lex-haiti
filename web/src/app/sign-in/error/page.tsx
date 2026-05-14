'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'

type AuthErrorCode =
  | 'NotAuthorized' // our custom code from auth.ts signIn callback
  | 'Verification'  // magic-link expired or already used
  | 'Configuration'
  | 'AccessDenied'
  | 'Default'

// Copy lives at `signIn.error.*` in i18n/{fr,ht}.ts.

export default function SignInError() {
  const { t } = useT()
  const params = useSearchParams()
  const rawCode = (params?.get('error') ?? 'Default') as AuthErrorCode
  const validCodes: AuthErrorCode[] = [
    'NotAuthorized',
    'Verification',
    'Configuration',
    'AccessDenied',
    'Default',
  ]
  const code: AuthErrorCode = validCodes.includes(rawCode) ? rawCode : 'Default'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-white">
      <div className="w-full max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-5">
          <AlertCircle className="w-6 h-6 text-amber-700" />
        </div>
        <h1 className="text-center text-2xl font-bold text-slate-900 tracking-tight">
          {t(`signIn.error.${code}.title`)}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500 leading-relaxed">
          {t(`signIn.error.${code}.body`)}
        </p>

        <div className="mt-8 space-y-3">
          <Button asChild variant="outline" className="w-full h-11">
            <Link href="/sign-in">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t('signIn.error.tryAgain')}
            </Link>
          </Button>
          <a
            href="mailto:contact@lexhaiti.org"
            className="flex h-11 w-full items-center justify-center rounded-md text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <Mail className="mr-1.5 h-4 w-4" />
            {t('signIn.error.contact')}
          </a>
        </div>
      </div>
    </div>
  )
}
