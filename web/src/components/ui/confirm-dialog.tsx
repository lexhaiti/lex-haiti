'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, Loader2, X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Centred confirm-dialog modal — replacement for ``window.confirm``.
 *
 * Controlled component. Parent owns the open state; the dialog calls
 * ``onConfirm`` (which can be async) on the primary button, and
 * ``onOpenChange(false)`` on cancel, escape, backdrop-click. Pass
 * ``loading`` while ``onConfirm`` is in flight to disable buttons
 * and show a spinner on the primary one.
 *
 * ``destructive`` flips the primary button to red — use for delete /
 * unpublish / revert actions where the user should hesitate before
 * confirming.
 */

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  title: string
  /** Body text. Pass a string for the common case, or a ReactNode for
   *  richer content (e.g. a quoted name in bold). */
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100vw-2rem)] max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'duration-150',
          )}
        >
          <div className="p-6">
            <div className="flex items-start gap-3">
              {destructive && (
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <DialogPrimitive.Title className="text-base font-bold text-slate-900 leading-snug">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 -mt-1 -mr-1"
                aria-label="Fermer"
                disabled={loading}
              >
                <X className="w-4 h-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <DialogPrimitive.Close
                disabled={loading}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white',
                  'px-4 py-2 text-sm font-semibold text-slate-700',
                  'hover:border-slate-400 hover:bg-slate-50 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {cancelLabel}
              </DialogPrimitive.Close>
              <button
                type="button"
                onClick={() => {
                  void onConfirm()
                }}
                disabled={loading}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors',
                  destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-primary hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
