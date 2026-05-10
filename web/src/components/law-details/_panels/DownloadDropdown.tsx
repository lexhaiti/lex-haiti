/**
 * Download menu rendered inline in the law-detail hero metadata row.
 *
 * Two-format dropdown (PDF / Word) — anchors point at the backend
 * `/legal-texts/{slug}/export` endpoint, which streams the file with a
 * Content-Disposition filename. We use plain `<a download>` so the
 * browser handles the file save (no JS download orchestration). The
 * `download` attribute serves as a fallback for cross-origin proxy
 * edge cases.
 *
 * Extracted from LawDetail.tsx — self-contained, only needs `slug`
 * and `language` from the parent.
 */
'use client'

import React from 'react'
import { ChevronDown, Download, FileText } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/i18n/useT'
import { apiUrl } from '@/lib/api/client'
import { cn } from '@/lib/utils'

interface DownloadDropdownProps {
  slug: string
  language: string
}

export function DownloadDropdown({ slug, language }: DownloadDropdownProps) {
  const { t } = useT()
  const lang = (language as 'fr' | 'ht') ?? 'fr'

  const hrefFor = (format: 'pdf' | 'docx') =>
    apiUrl(`/legal-texts/${encodeURIComponent(slug)}/export`, {
      format,
      lang,
    })

  const buttonLabel = `${t('lawDetail.download.label')} — PDF / Word`

  return (
    // `modal={false}` prevents Radix from locking body scroll when the
    // menu opens. The default behaviour adds `padding-right` to the body
    // to compensate for the removed scrollbar — but the fixed page
    // header doesn't get the same compensation, so it visibly shifts to
    // the right as the dropdown opens. The menu is small and
    // non-blocking (just two file-format choices); we don't need to
    // trap focus or block the page.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {/* Styled as a metadata item so it sits seamlessly inline with
            année / contenu / référence: same icon circle, same small
            uppercase label, value below. The whole tile is the dropdown
            trigger; the chevron next to the value telegraphs that. */}
        <button
          type="button"
          aria-label={buttonLabel}
          className={cn(
            'group/dl flex items-center gap-4 text-left',
            'rounded-xl -m-2 p-2 hover:bg-white/5 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          )}
        >
          <div
            aria-hidden
            className="p-3 bg-white/5 rounded-full border border-white/10 group-hover/dl:bg-white/10 group-hover/dl:border-white/20 transition-colors"
          >
            <Download className="w-5 h-5 text-slate-400 group-hover/dl:text-white transition-colors" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
              {t('lawDetail.download.label')}
            </p>
            <p className="text-white font-bold flex items-center gap-1.5">
              PDF · Word
              <ChevronDown
                aria-hidden
                className="w-3.5 h-3.5 opacity-70 group-data-[state=open]:rotate-180 transition-transform"
              />
            </p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72">
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href={hrefFor('pdf')} download>
            <FileText className="mr-3 h-4 w-4 text-red-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                {t('lawDetail.download.pdf')}
              </div>
              <div className="text-xs text-slate-500 leading-snug mt-0.5">
                {t('lawDetail.download.pdfDesc')}
              </div>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href={hrefFor('docx')} download>
            <FileText className="mr-3 h-4 w-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                {t('lawDetail.download.docx')}
              </div>
              <div className="text-xs text-slate-500 leading-snug mt-0.5">
                {t('lawDetail.download.docxDesc')}
              </div>
            </div>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
