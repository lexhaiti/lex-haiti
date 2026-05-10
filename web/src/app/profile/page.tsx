'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ClipboardCheck,
  IdCard,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'

// Copy lives at `profile.*` in i18n/{fr,ht}.ts.

interface FieldCardProps {
  icon: typeof UserIcon
  label: string
  children: React.ReactNode
}

function FieldCard({ icon: Icon, label, children }: FieldCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-5 hover:border-slate-300 hover:bg-slate-50/80 transition-colors">
      <div className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-red-600" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
          {label}
        </span>
      </div>
      <div className="text-base text-slate-900 font-semibold break-all leading-snug">
        {children}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { t } = useT()
  const { data: session, status } = useSession()
  const router = useRouter()

  // Redirect to /sign-in if not authenticated.
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/sign-in')
    }
  }, [status, router])

  if (status === 'loading' || !session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const initial = (
    session.user.name?.[0] ??
    session.user.email?.[0] ??
    'E'
  ).toUpperCase()
  const role = session.user.role ?? t('profile.notSet')

  return (
    <div className="bg-slate-50/30 min-h-screen">
      {/* Hero */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        <div className="relative z-10 container py-12 lg:py-16 pt-28 lg:pt-32">
          <div className="flex items-end gap-5 flex-wrap">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white text-3xl font-bold shadow-xl shadow-red-900/40 ring-4 ring-white/10">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight mb-1">
                {session.user.name || session.user.email}
              </h1>
              <p className="text-sm text-slate-300 truncate">
                {session.user.email}
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                {role}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content — fills the container, no max-w override */}
      <div className="container py-10 lg:py-14">
        {/* Back button — matches the editor import page style, same position */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('profile.backHome')}
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-700 mb-6">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-red-700">
              <IdCard className="w-3.5 h-3.5" />
            </span>
            {t('profile.accountSection')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FieldCard icon={UserIcon} label={t('profile.nameLabel')}>
              {session.user.name || (
                <span className="text-slate-400 italic font-normal">—</span>
              )}
            </FieldCard>
            <FieldCard icon={Mail} label={t('profile.emailLabel')}>
              {session.user.email}
            </FieldCard>
            <FieldCard icon={ClipboardCheck} label={t('profile.roleLabel')}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-bold">
                <Pencil className="w-3 h-3" />
                {role}
              </span>
            </FieldCard>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
            <Button
              onClick={() => signOut({ callbackUrl: '/' })}
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              {t('profile.signOut')}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
