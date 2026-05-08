'use client'

import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  LogOut,
  MessageSquareWarning,
  Loader2,
  Pencil,
  ShieldCheck,
  Undo2,
} from 'lucide-react'
import { signOut } from 'next-auth/react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast-simple'
import { useLanguage } from '@/i18n/LanguageContext'
import {
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

const COPY = {
  fr: {
    statusDraft: 'Brouillon',
    statusPending: 'En revue',
    statusPublished: 'Publié',
    statusRejected: 'Rejeté',
    publish: 'Publier',
    unpublish: 'Dépublier',
    requestChanges: 'Demander modification',
    editMetadata: 'Métadonnées',
    signOut: 'Déconnexion',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    requestPlaceholder: 'Quel changement demandez-vous ?',
    unpublishPlaceholder: 'Pourquoi dépubliez-vous ce texte ?',
    publishedToast: 'Publié',
    requestedToast: 'Demande envoyée',
    unpublishedToast: 'Dépublié',
    failed: 'Échec',
  },
  ht: {
    statusDraft: 'Bouyon',
    statusPending: 'Nan revizyon',
    statusPublished: 'Pibliye',
    statusRejected: 'Rejte',
    publish: 'Pibliye',
    unpublish: 'Depibliye',
    requestChanges: 'Mande modifikasyon',
    editMetadata: 'Metadata',
    signOut: 'Dekonekte',
    cancel: 'Anile',
    confirm: 'Konfime',
    requestPlaceholder: 'Ki chanjman ou mande?',
    unpublishPlaceholder: 'Poukisa ou ap depibliye tèks la?',
    publishedToast: 'Pibliye',
    requestedToast: 'Demand voye',
    unpublishedToast: 'Depibliye',
    failed: 'Echwe',
  },
}

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
  const { language } = useLanguage()
  const t = COPY[(language as 'fr' | 'ht') ?? 'fr']
  const [pending, startTransition] = useTransition()
  const [showCommentBox, setShowCommentBox] = useState<
    null | 'request_changes' | 'unpublish'
  >(null)
  const [comment, setComment] = useState('')
  const [metadataOpen, setMetadataOpen] = useState(false)
  const { toast } = useToast()

  const statusLabel =
    status === 'draft'
      ? t.statusDraft
      : status === 'pending_review'
        ? t.statusPending
        : status === 'published'
          ? t.statusPublished
          : t.statusRejected

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
        toast(`${t.failed}${code}`)
      }
    })
  }

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md"
    >
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
              onClick={() => run(t.publishedToast, () => publishLegalText(slug))}
              className="bg-emerald-600 text-white hover:bg-emerald-700 h-8 px-3 sm:px-4 flex-shrink-0"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">{t.publish}</span>
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
              <span className="hidden sm:inline">{t.unpublish}</span>
            </Button>
          )}

          {metadata && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setMetadataOpen(true)}
              className="h-8 px-3 sm:px-4 flex-shrink-0"
              title={t.editMetadata}
            >
              <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden md:inline">{t.editMetadata}</span>
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
            <span className="hidden md:inline">{t.requestChanges}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-slate-500 hover:text-red-600 h-8 px-2 sm:px-3 flex-shrink-0"
            title={t.signOut}
          >
            <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden lg:inline">{t.signOut}</span>
          </Button>
        </div>

        {metadata && (
          <MetadataEditor
            open={metadataOpen}
            onOpenChange={setMetadataOpen}
            text={metadata}
            onSaved={onChanged}
          />
        )}

        {showCommentBox && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                showCommentBox === 'request_changes'
                  ? t.requestPlaceholder
                  : t.unpublishPlaceholder
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
                {t.cancel}
              </Button>
              <Button
                size="sm"
                disabled={pending || comment.trim().length === 0}
                onClick={() => {
                  if (showCommentBox === 'request_changes') {
                    run(t.requestedToast, () =>
                      requestChanges(slug, comment.trim()),
                    )
                  } else {
                    run(t.unpublishedToast, () =>
                      unpublishLegalText(slug, comment.trim()),
                    )
                  }
                }}
              >
                {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t.confirm}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
