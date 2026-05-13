'use client'

import Link from 'next/link'
import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import {
  Braces,
  FileText,
  LayoutDashboard,
  LogOut,
  Newspaper,
  Plus,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'
// Copy lives at `userMenu.*` in i18n/{fr,ht}.ts.

/**
 * "+" header button — opens a dropdown with the editorial quick
 * actions: per-type import shortcuts ("Importer un texte", "Importer
 * un numéro Moniteur", "Importer JSON") plus the Console éditoriale
 * link at the bottom. Single focal point in the header instead of two
 * pills competing for attention.
 *
 * The Console éditoriale entry also lives in the avatar's UserMenu
 * dropdown — kept for muscle memory and the mobile-only path where
 * this button is hidden.
 */
export function AddTextButton({ className }: { className?: string }) {
  const { status } = useSession()
  const { t } = useT()
  const [open, setOpen] = useState(false)

  if (status !== 'authenticated') return null

  const addText = t('userMenu.addText')
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={addText}
          title={addText}
          className={cn(
            'inline-flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center rounded-full',
            'bg-primary text-white shadow-sm',
            'hover:bg-primary/90 hover:shadow-md',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'transition-all',
            className,
          )}
        >
          <Plus className="w-4.5 h-4.5" strokeWidth={2.25} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-72">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {t('userMenu.importGroup', { fallback: 'Importer' })}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link
            href="/editorial/import?type=legal_text"
            className="cursor-pointer"
          >
            <FileText className="mr-2 h-4 w-4" />
            {t('userMenu.importLegalText', {
              fallback: 'Texte légal (loi, décret, arrêté)',
            })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href="/editorial/import?type=moniteur"
            className="cursor-pointer"
          >
            <Newspaper className="mr-2 h-4 w-4" />
            {t('userMenu.importMoniteur', {
              fallback: 'Numéro du Moniteur',
            })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href="/editorial/import?type=json"
            className="cursor-pointer"
          >
            <Braces className="mr-2 h-4 w-4" />
            {t('userMenu.importJson', {
              fallback: 'JSON (dev)',
            })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/editorial" className="cursor-pointer">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            {t('userMenu.editorial')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Header widget — visible only when an editor is signed in.
 * Click-only avatar button (no hover, no chevron, no role icon).
 * Dropdown surfaces editorial entry points: profile, import, sign-out.
 */
export function UserMenu({ className }: { className?: string }) {
  const { data: session, status } = useSession()
  const { t } = useT()

  const [open, setOpen] = useState(false)

  if (status !== 'authenticated' || !session?.user) return null

  const email = session.user.email ?? ''
  const name = session.user.name ?? email.split('@')[0]
  const role = session.user.role ?? 'editor'
  const initial = (name[0] ?? 'E').toUpperCase()

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${name} (${role})`}
          className={cn(
            'inline-flex h-11 w-11 sm:h-10 sm:w-10 items-center justify-center rounded-full',
            'bg-gradient-to-br from-red-500 to-red-700 text-sm font-bold text-white',
            'shadow-sm hover:shadow-md hover:ring-2 hover:ring-red-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
            'transition-all',
            className,
          )}
        >
          {initial}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel className="px-3 py-3">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {name}
          </div>
          <div className="text-xs text-slate-500 truncate">{email}</div>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3 h-3" />
            {role}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" />
            {t('userMenu.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/editorial" className="cursor-pointer">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            {t('userMenu.editorial')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            setOpen(false)
            void signOut({ callbackUrl: '/' })
          }}
          className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t('userMenu.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
