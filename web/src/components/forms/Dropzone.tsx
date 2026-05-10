/**
 * File-upload dropzone — single canonical implementation.
 *
 * Supersedes the two formerly-duplicated `Dropzone` components in the
 * editorial import panels. Combines:
 *   - The LegalText panel's "selected file summary" view (post-pick
 *     card with filename, size, and a remove button) — opt in via
 *     `showFileSummary={true}` (default).
 *   - The Moniteur panel's always-visible drop-surface mode (file is
 *     displayed elsewhere on the page) — opt in via
 *     `showFileSummary={false}`.
 *
 * Always controlled: parent owns the `file` state and gets `onSelect`
 * notifications. Optionally accepts an external `inputRef` for
 * programmatic file picker triggers (used by the Moniteur retry flow).
 */
'use client'

import React, { useId, useState } from 'react'
import { CheckCircle2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropzoneProps {
  /** Currently-selected file. Pass `null` for empty. */
  file: File | null
  /** Notified whenever the selection changes (pick or remove). */
  onSelect: (file: File | null) => void

  /** Accept attribute (extension list or MIME types). */
  accept: string

  /** Drop-surface copy. */
  prompt: string
  /** Optional inline "browse" affordance — renders next to the prompt
   *  with an underline. Omit to render the prompt as a single semibold
   *  string (the MoniteurImportPanel style). */
  browseLabel?: string
  formatsLabel: string

  /** "Selected file" summary copy — required only when
   *  `showFileSummary` is true (the default). */
  fileSelectedLabel?: string
  removeLabel?: string

  /** When true (default), shows a card with the picked filename + a
   *  remove button after a file is selected. When false, the dropzone
   *  surface stays visible regardless — useful when the parent renders
   *  the file's status elsewhere. */
  showFileSummary?: boolean

  /** Validation error rendered as a red border + message below. */
  error?: string

  /** External ref for programmatically triggering the file picker. */
  inputRef?: React.RefObject<HTMLInputElement | null>

  className?: string
}

export function Dropzone({
  file,
  onSelect,
  accept,
  prompt,
  browseLabel,
  formatsLabel,
  fileSelectedLabel,
  removeLabel,
  showFileSummary = true,
  error,
  inputRef,
  className,
}: DropzoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const reactId = useId()
  // Stable per-instance id so multiple dropzones on the same page get
  // independent file-input bindings.
  const inputId = `dropzone-${reactId.replace(/[^a-z0-9]/gi, '')}`

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onSelect(files[0])
  }

  const showSummary = showFileSummary && !!file

  return (
    <div className={className}>
      {showSummary ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {fileSelectedLabel && (
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-1">
                {fileSelectedLabel}
              </p>
            )}
            <p className="text-sm text-slate-800 font-medium truncate">
              {file!.name}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {(file!.size / 1024 / 1024).toFixed(2)} Mo
            </p>
          </div>
          {removeLabel && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {removeLabel}
            </button>
          )}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            onFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : error
                ? 'border-red-300 bg-red-50/40'
                : 'border-slate-300 bg-slate-50/40 hover:border-slate-400 hover:bg-slate-50',
          )}
        >
          <Upload className="w-8 h-8 text-slate-400" />
          {browseLabel ? (
            <p className="text-sm text-slate-600 text-center">
              {prompt}
              <span className="font-semibold text-primary underline underline-offset-4">
                {browseLabel}
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-slate-700 text-center">
              {prompt}
            </p>
          )}
          <p className="text-[11px] text-slate-400">{formatsLabel}</p>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(e) => onFiles(e.target.files)}
            className="sr-only"
          />
        </label>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-red-600">{error}</p>
      )}
    </div>
  )
}
