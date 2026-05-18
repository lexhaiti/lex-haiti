'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

// Copy lives at `signIn.*` in i18n/{fr,ht}.ts.

export default function SignInPage() {
  const { t } = useT()
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
      <ShellWrapper>
        <div className="text-center">
          <p className="text-sm text-slate-600">
            {t('signIn.alreadySignedInPrefix')}
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900 break-all">
            {session.user.email}
          </p>
          <Button asChild className="mt-6 w-full h-11">
            <Link href="/">
              {t('signIn.goHome')}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </ShellWrapper>
    )
  }

  return (
    <ShellWrapper>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-6 sm:mb-8 min-h-[44px] py-2 -my-2"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('signIn.backHome')}
      </Link>

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
        {t('signIn.title')}
      </h1>
      <p className="mt-2 text-sm text-slate-500 leading-relaxed">
        {t('signIn.subtitle')}
      </p>

      <form onSubmit={onSubmit} className="mt-6 sm:mt-8 space-y-4">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('signIn.emailLabel')}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('signIn.emailPlaceholder')}
            disabled={pending}
            autoComplete="email"
            inputMode="email"
            // ``autoFocus`` on mobile pops the keyboard before the user
            // can read the prompt — drop it on small viewports. The
            // ``sm:focus:`` and tap targets handle the rest.
            className={cn(
              'w-full px-4 py-3 sm:py-2.5 rounded-lg border border-slate-300 bg-white',
              'placeholder:text-slate-400 text-slate-900 text-base sm:text-sm',
              // text-base on mobile keeps iOS Safari from zooming when
              // the input focuses (Safari only zooms inputs < 16px).
              'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
              'transition-colors disabled:opacity-50',
            )}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={pending || !email}
          className="w-full h-12 sm:h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {t('signIn.submittingButton')}
            </>
          ) : (
            t('signIn.submitButton')
          )}
        </Button>
      </form>

      <p className="mt-6 text-xs text-slate-400 leading-relaxed">{t('signIn.note')}</p>
    </ShellWrapper>
  )
}

// Shared shell for both the form and the already-signed-in notice.
// ``min-h-dvh`` (dynamic viewport height) keeps the layout correct
// when the mobile keyboard opens — ``min-h-screen`` jumps the form
// up under the keyboard on iOS Safari. Padding scales by viewport,
// and the brand header gives the page a context the bare form
// didn't have before.
function ShellWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white flex flex-col">
      <header className="flex items-center justify-center px-4 pt-8 sm:pt-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2"
          aria-label="LexHaiti"
        >
          {/* Plain <img> here instead of next/image to avoid Image's
              SSR layout reservation on a one-off auth shell — the
              browser can defer-load it without affecting LCP. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lexhaiti-logo.svg"
            alt="LexHaiti"
            className="h-9 w-9 object-contain"
          />
          <span className="text-lg font-black tracking-tight text-slate-900">
            Lex<span className="text-primary">Haïti</span>
          </span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-sm sm:max-w-md">{children}</div>
      </main>
    </div>
  )
}
