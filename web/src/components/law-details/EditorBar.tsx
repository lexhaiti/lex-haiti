'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  CheckCircle2,
  LogOut,
  MessageSquareWarning,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react'
import { signOut } from 'next-auth/react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast-simple'
import { useT } from '@/i18n/useT'
import {
  deleteLegalText,
  publishLegalText,
  requestChanges,
  unpublishLegalText,
} from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import {
  MetadataEditor,
  type LegalTextMetadata,
} from './MetadataEditor'

type Status = 'draft' | 'pending_review' | 'published' | 'rejected'

// Copy lives at `editorBar.*` in i18n/{fr,ht}.ts.

const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-amber-100 text-amber-900 border-amber-200',
  pending_review: 'bg-blue-100 text-blue-900 border-blue-200',
  published: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  rejected: 'bg-red-100 text-red-900 border-red-200',
}

interface EditorBarProps {
  slug: string
  status: Status
  editorEmail: string | null
  metadata?: LegalTextMetadata
  onChanged?: () => void
}

export function EditorBar({
  slug,
  status,
  editorEmail,
  metadata,
  onChanged,
}: EditorBarProps) {
  const { t } = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showCommentBox, setShowCommentBox] = useState<
    null | 'request_changes' | 'unpublish'
  >(null)
  const [comment, setComment] = useState('')
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteLegalText(slug)
      toast(t('editorBar.deleteSuccess', { fallback: 'Brouillon supprimé ✓' }))
      setDeleteOpen(false)
      // Push the user back to the laws list so they don't sit on a
      // 404-bound URL after the row is gone.
      router.push('/lois')
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? String(
              (e.body as { detail?: unknown } | undefined)?.detail ??
                e.message,
            )
          : e instanceof Error
            ? e.message
            : String(e)
      toast(detail)
      setDeleting(false)
    }
  }

  const statusLabel =
    status === 'draft'
      ? t('editorBar.statusDraft')
      : status === 'pending_review'
        ? t('editorBar.statusPending')
        : status === 'published'
          ? t('editorBar.statusPublished')
          : t('editorBar.statusRejected')

  function run(toastLabel: string, fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn()
        toast(`${toastLabel} ✓`)
        setShowCommentBox(null)
        setComment('')
        onChanged?.()
      } catch (err) {
        const code = err instanceof ApiError ? ` (${err.status})` : ''
        toast(`${t('editorBar.failed')}${code}`)
      }
    })
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-24 duration-500 fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md">
      <div className="container max-w-7xl px-3 sm:px-4 py-2.5">
        {/* One-line layout, scrolls horizontally on overflow before wrapping */}
        <div className="flex items-center gap-3 overflow-x-auto">
          {/* Status pill — always first, never shrinks */}
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap flex-shrink-0',
              STATUS_TONE[status],
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{statusLabel}</span>
          </div>

          {/* Email — hidden on small screens */}
          {editorEmail && (
            <span className="hidden lg:inline text-xs text-slate-500 truncate min-w-0 flex-shrink">
              {editorEmail}
            </span>
          )}

          {/* Spacer pushes actions to the right */}
          <div className="flex-1 min-w-0" />

          {/* Actions */}
          {status !== 'published' ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(t('editorBar.publishedToast'), () => publishLegalText(slug))}
              className="bg-emerald-600 text-white hover:bg-emerald-700 h-8 px-3 sm:px-4 flex-shrink-0"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">{t('editorBar.publish')}</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setShowCommentBox('unpublish')}
              className="h-8 px-3 sm:px-4 flex-shrink-0"
            >
              <Undo2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{t('editorBar.unpublish')}</span>
            </Button>
          )}

          {metadata && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setMetadataOpen(true)}
              className="h-8 px-3 sm:px-4 flex-shrink-0"
              title={t('editorBar.editMetadata')}
            >
              <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden md:inline">{t('editorBar.editMetadata')}</span>
            </Button>
          )}

          {/* Delete brouillon — only surfaced on drafts. The backend
              refuses to delete published texts (409), so the button
              wouldn't help anyway; hiding it on published status is
              UX honesty. */}
          {status === 'draft' && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteOpen(true)}
              className="h-8 px-3 sm:px-4 flex-shrink-0 text-red-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50"
              title={t('editorBar.deleteDraft', { fallback: 'Supprimer le brouillon' })}
            >
              <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden md:inline">
                {t('editorBar.deleteDraft', {
                  fallback: 'Supprimer le brouillon',
                })}
              </span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setShowCommentBox('request_changes')}
            className="h-8 px-3 sm:px-4 flex-shrink-0"
          >
            <MessageSquareWarning className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden md:inline">{t('editorBar.requestChanges')}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-slate-500 hover:text-red-600 h-8 px-2 sm:px-3 flex-shrink-0"
            title={t('editorBar.signOut')}
          >
            <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden lg:inline">{t('editorBar.signOut')}</span>
          </Button>
        </div>

        {metadata && (
          <MetadataEditor
            open={metadataOpen}
            onOpenChange={setMetadataOpen}
            text={metadata}
            onSaved={onChanged}
            onSlugChanged={(newSlug) => {
              // Redirect to the new permalink so subsequent reads
              // don't 404 on the old slug. ``replace`` (not push)
              // so the back button doesn't return to the dead URL.
              router.replace(`/loi/${newSlug}`)
            }}
          />
        )}

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteOpen(false)
          }}
          onConfirm={confirmDelete}
          title={t('editorBar.deleteTitle', {
            fallback: 'Supprimer ce brouillon ?',
          })}
          description={
            <>
              {t('editorBar.deleteBody', {
                fallback:
                  'Toutes les données associées (en-têtes, articles, signataires, étiquettes thématiques) seront supprimées définitivement. Cette action est irréversible.',
              })}
              {metadata?.title_fr && (
                <>
                  <br />
                  <br />
                  <span className="font-semibold text-slate-900">
                    « {metadata.title_fr} »
                  </span>
                </>
              )}
            </>
          }
          confirmLabel={t('editorBar.deleteConfirm', { fallback: 'Supprimer' })}
          cancelLabel={t('editorBar.deleteCancel', { fallback: 'Annuler' })}
          destructive
          loading={deleting}
        />

        {showCommentBox && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                showCommentBox === 'request_changes'
                  ? t('editorBar.requestPlaceholder')
                  : t('editorBar.unpublishPlaceholder')
              }
              rows={3}
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowCommentBox(null)
                  setComment('')
                }}
                disabled={pending}
              >
                {t('editorBar.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={pending || comment.trim().length === 0}
                onClick={() => {
                  if (showCommentBox === 'request_changes') {
                    run(t('editorBar.requestedToast'), () =>
                      requestChanges(slug, comment.trim()),
                    )
                  } else {
                    run(t('editorBar.unpublishedToast'), () =>
                      unpublishLegalText(slug, comment.trim()),
                    )
                  }
                }}
              >
                {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('editorBar.confirm')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
