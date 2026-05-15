'use client'

/**
 * Admin-only user management dashboard.
 *
 * Lists every editor account, lets an admin invite a new editor by
 * email, change roles, and remove accounts. The backend enforces the
 * "last admin" guard (you can't demote/delete yourself or the last
 * remaining admin) — surfaced as 409s the UI translates into a toast.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react'

import { Breadcrumb } from '@/components/shared/Breadcrumb'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-simple'
import { useEditorMode } from '@/lib/hooks/useEditorMode'
import { useT } from '@/i18n/useT'
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminUserRead,
} from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

type Role = 'admin' | 'reviewer' | 'editor'

const ROLE_META: Record<
  Role,
  { fr: string; ht: string; cls: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  admin: {
    fr: 'Admin',
    ht: 'Admin',
    cls: 'bg-primary/10 text-primary border-primary/30',
    Icon: ShieldCheck,
  },
  reviewer: {
    fr: 'Réviseur',
    ht: 'Revize',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Shield,
  },
  editor: {
    fr: 'Éditeur',
    ht: 'Editè',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Icon: UserCog,
  },
}

function formatDate(iso: string | null | undefined, isFr: boolean): string {
  if (!iso) return isFr ? '—' : '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(isFr ? 'fr-FR' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function AdminUsersPage() {
  const { isEditor, status, role } = useEditorMode()
  const { language } = useT()
  const isFr = language !== 'ht'
  const { toast } = useToast()

  const isAdmin = role === 'admin'

  const [users, setUsers] = useState<AdminUserRead[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  // Invite-form state. Open as an inline card under the header.
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [inviteName, setInviteName] = useState('')

  // Pending delete — staged here so the ConfirmDialog can show the
  // email/role of the row before the user commits.
  const [pendingDelete, setPendingDelete] = useState<AdminUserRead | null>(null)

  function refetch() {
    setBusy(true)
    listAdminUsers()
      .then((rows) => setUsers(rows))
      .catch((e) =>
        setErr(e instanceof ApiError ? `${e.status} — ${(e.body as { detail?: string } | undefined)?.detail ?? e.message}` : String(e)),
      )
      .finally(() => setBusy(false))
  }

  useEffect(() => {
    if (!isEditor || !isAdmin) return
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditor, isAdmin])

  const filtered = useMemo(() => {
    if (!users) return null
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q),
    )
  }, [users, query])

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return
    setBusy(true)
    try {
      await createAdminUser({
        email,
        role: inviteRole,
        name: inviteName.trim() || null,
      })
      // Kick the standard magic-link send so the invited user gets a
      // branded "Sign in to LexHaïti" email immediately. ``redirect:
      // false`` keeps us on the dashboard — Auth.js otherwise
      // navigates us to /sign-in/check-email which would log us out.
      // Failures here are non-fatal: the user row exists, the admin
      // can resend by typing the email on /sign-in themselves.
      let emailSent = true
      try {
        await signIn('nodemailer', { email, redirect: false })
      } catch {
        emailSent = false
      }
      toast(
        emailSent
          ? isFr
            ? `${email} ajouté — e-mail d'invitation envoyé.`
            : `${email} ajoute — imèl envitasyon voye.`
          : isFr
            ? `${email} ajouté — l'envoi de l'e-mail a échoué, l'utilisateur peut se connecter manuellement.`
            : `${email} ajoute — voye imèl la echwe, itilizatè a ka konekte manyèlman.`,
      )
      setInviteEmail('')
      setInviteName('')
      setInviteRole('editor')
      setInviting(false)
      refetch()
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { detail?: string } | undefined)?.detail ?? e.message
          : String(e)
      toast((isFr ? 'Erreur : ' : 'Erè : ') + msg)
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(user: AdminUserRead, nextRole: Role) {
    if (nextRole === user.role) return
    try {
      await updateAdminUser(user.id, { role: nextRole })
      toast(
        isFr
          ? `Rôle mis à jour : ${user.email} → ${ROLE_META[nextRole].fr}`
          : `Wòl mete a jou : ${user.email} → ${ROLE_META[nextRole].ht}`,
      )
      refetch()
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { detail?: string } | undefined)?.detail ?? e.message
          : String(e)
      toast((isFr ? 'Erreur : ' : 'Erè : ') + msg)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteAdminUser(pendingDelete.id)
      toast(
        isFr
          ? `${pendingDelete.email} supprimé.`
          : `${pendingDelete.email} efase.`,
      )
      setPendingDelete(null)
      refetch()
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { detail?: string } | undefined)?.detail ?? e.message
          : String(e)
      toast((isFr ? 'Erreur : ' : 'Erè : ') + msg)
      setPendingDelete(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isEditor || !isAdmin) {
    return (
      <div className="container py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 max-w-2xl">
          <p className="text-sm text-slate-700 font-semibold mb-1">
            {isFr ? 'Accès restreint' : 'Aksè limite'}
          </p>
          <p className="text-sm text-slate-600">
            {isFr
              ? "La gestion des utilisateurs est réservée aux administrateurs."
              : 'Jesyon itilizatè yo se pou administratè sèlman.'}
          </p>
          <Link
            href={isEditor ? '/editorial' : '/sign-in'}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {isEditor
              ? isFr ? '← Retour au tableau de bord' : '← Tounen nan tablo'
              : isFr ? 'Se connecter' : 'Konekte'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navy hero — same band used across the editor surface. */}
      <div className="relative bg-primary text-white overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-12 lg:py-20 pt-28 lg:pt-36">
          <Breadcrumb
            className="mb-6"
            items={[
              { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
              { label: isFr ? 'Éditorial' : 'Editoryal', href: '/editorial' },
              { label: isFr ? 'Utilisateurs' : 'Itilizatè' },
            ]}
          />
          <h1 className="animate-in fade-in slide-in-from-top-2 duration-500 text-4xl lg:text-6xl font-black mb-4 leading-tight tracking-tight text-white">
            {isFr ? 'Gestion des utilisateurs' : 'Jesyon itilizatè'}
          </h1>
          <p className="animate-in fade-in duration-500 delay-100 fill-mode-both text-slate-300 text-base lg:text-lg leading-relaxed max-w-3xl">
            {isFr
              ? 'Invitez de nouveaux éditeurs, ajustez les rôles et retirez les accès. Les changements prennent effet immédiatement.'
              : 'Envite nouvo editè yo, ajiste wòl yo, retire aksè yo. Chanjman yo aplike imedyatman.'}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 py-10 lg:py-12 space-y-6">
        {err && <ErrorBanner density="compact">{err}</ErrorBanner>}

        {/* Search + invite action row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isFr ? 'Filtrer par email, nom ou rôle…' : 'Filtre pa imèl, non oswa wòl…'
              }
              className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                aria-label={isFr ? 'Effacer le filtre' : 'Efase filtè'}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInviting((v) => !v)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              inviting
                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                : 'bg-primary text-white hover:bg-primary/90',
            )}
          >
            {inviting ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {inviting
              ? isFr ? 'Annuler' : 'Anile'
              : isFr ? 'Inviter un éditeur' : 'Envite yon editè'}
          </button>
        </div>

        {/* Invite form */}
        {inviting && (
          <form
            onSubmit={submitInvite}
            className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-xl border border-amber-300 bg-amber-50/40 p-5 space-y-3"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-amber-800">
              {isFr ? 'Nouvel éditeur' : 'Nouvo editè'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                  {isFr ? 'Email' : 'Imèl'} *
                </span>
                <input
                  type="email"
                  required
                  autoFocus
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="someone@example.com"
                  className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                  {isFr ? 'Nom' : 'Non'}
                </span>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder={isFr ? '(facultatif)' : '(opsyonèl)'}
                  className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                  {isFr ? 'Rôle' : 'Wòl'}
                </span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="editor">{ROLE_META.editor[isFr ? 'fr' : 'ht']}</option>
                  <option value="reviewer">{ROLE_META.reviewer[isFr ? 'fr' : 'ht']}</option>
                  <option value="admin">{ROLE_META.admin[isFr ? 'fr' : 'ht']}</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-500 flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
              {isFr
                ? "Un e-mail d'invitation avec un lien de connexion (10 min) est envoyé immédiatement après l'ajout."
                : "Yon imèl envitasyon ak yon lyen koneksyon (10 minit) voye tout swit apre ajoute a."}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviting(false)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                {isFr ? 'Annuler' : 'Anile'}
              </button>
              <button
                type="submit"
                disabled={busy || !inviteEmail.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {isFr ? 'Ajouter' : 'Ajoute'}
              </button>
            </div>
          </form>
        )}

        {/* Users table */}
        {filtered === null ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500 text-center">
            <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
            {isFr ? 'Chargement…' : 'Chaje…'}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              query
                ? isFr ? 'Aucun utilisateur ne correspond' : 'Pa gen itilizatè ki koresponn'
                : isFr ? 'Aucun éditeur' : 'Pa gen editè'
            }
            description={
              query
                ? isFr ? 'Essayez une autre recherche.' : 'Eseye yon lòt rechèch.'
                : isFr
                  ? 'Invitez le premier éditeur ci-dessus pour commencer.'
                  : 'Envite premye editè a anwo pou kòmanse.'
            }
            density="compact"
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">{isFr ? 'Utilisateur' : 'Itilizatè'}</th>
                  <th className="px-4 py-3 font-bold">{isFr ? 'Rôle' : 'Wòl'}</th>
                  <th className="px-4 py-3 font-bold">{isFr ? 'Sessions' : 'Sesyon'}</th>
                  <th className="px-4 py-3 font-bold">{isFr ? 'Dernière connexion' : 'Dènye koneksyon'}</th>
                  <th className="px-4 py-3 font-bold">{isFr ? 'Ajouté' : 'Ajoute'}</th>
                  <th className="px-4 py-3 font-bold text-right">{isFr ? 'Actions' : 'Aksyon'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => {
                  const meta = ROLE_META[u.role as Role]
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 truncate">
                            {u.name || u.email || `#${u.id}`}
                          </span>
                          {u.name && u.email && (
                            <span className="text-xs text-slate-500 truncate">
                              {u.email}
                            </span>
                          )}
                          {!u.email_verified && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                              <AlertTriangle className="w-3 h-3" />
                              {isFr ? 'Email non vérifié' : 'Imèl pa verifye'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u, e.target.value as Role)}
                          className={cn(
                            'text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border outline-none cursor-pointer',
                            meta.cls,
                          )}
                        >
                          <option value="admin">{ROLE_META.admin[isFr ? 'fr' : 'ht']}</option>
                          <option value="reviewer">{ROLE_META.reviewer[isFr ? 'fr' : 'ht']}</option>
                          <option value="editor">{ROLE_META.editor[isFr ? 'fr' : 'ht']}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">
                        {u.active_session_count}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(u.last_login_at, isFr)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(u.created_at, isFr)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(u)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded-md transition-colors"
                          aria-label={isFr ? 'Supprimer' : 'Efase'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isFr ? 'Supprimer' : 'Efase'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={confirmDelete}
        title={isFr ? "Supprimer l'utilisateur ?" : 'Efase itilizatè a?'}
        description={
          pendingDelete ? (
            <span>
              {isFr ? 'L\'utilisateur ' : 'Itilizatè '}
              <span className="font-semibold text-slate-900">
                {pendingDelete.email}
              </span>{' '}
              {isFr
                ? "perdra immédiatement l'accès à l'éditeur. Les sessions actives seront fermées. Cette action est irréversible."
                : 'pral pèdi aksè a editè a tousuit. Sesyon aktif yo ap fèmen. Aksyon sa pa ka anile.'}
            </span>
          ) : null
        }
        confirmLabel={isFr ? 'Supprimer définitivement' : 'Efase definitivman'}
        cancelLabel={isFr ? 'Annuler' : 'Anile'}
        destructive
      />
    </div>
  )
}
