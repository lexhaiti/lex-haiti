'use client'

import React from 'react'
import { BookOpen, Clock, FileText } from 'lucide-react'

import { looksLikeHtml } from './_editor/utils'

interface PreambleViewerProps {
  /** Title to display above the body. */
  title: string
  /** The preamble / body text. May contain double-newlines as paragraph breaks. */
  text: string | null | undefined
  currentLang: 'fr' | 'ht'
}

/**
 * Renders the body of a LegalText that has no `articles[]` — typical for
 * historical constitutions and other texts that haven't been structured into
 * the article hierarchy yet. Treats blank-line-separated chunks as paragraphs.
 */
export default function PreambleViewer({
  title,
  text,
  currentLang,
}: PreambleViewerProps) {
  if (!text) {
    return (
      <div className="animate-in fade-in duration-500 bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <FileText className="w-16 h-16 mx-auto text-gray-200 mb-4" />
        <h3 className="text-lg font-semibold text-gray-400">
          {currentLang === 'fr'
            ? 'Aucun contenu disponible'
            : 'Pa gen kontni disponib'}
        </h3>
      </div>
    )
  }

  // Blank-line-separated chunks → paragraphs. Falls back to single-newline
  // splitting if there are no double-newlines (some sources are flat).
  const paragraphs = (
    text.includes('\n\n') ? text.split(/\n{2,}/) : text.split('\n')
  )
    .map((p) => p.trim())
    .filter(Boolean)

  const wordCount = text.split(/\s+/).filter(Boolean).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 220))

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
      <div className="border-b border-gray-100 p-6 lg:p-8 bg-gradient-to-r from-gray-50/50 to-white">
        <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3 leading-tight tracking-tight">
          {title}
        </h2>
        <div className="flex items-center gap-4 text-xs font-medium text-gray-400 uppercase tracking-widest">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            <span>
              {wordCount.toLocaleString()}{' '}
              {currentLang === 'fr' ? 'mots' : 'mo'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {readingTime} {currentLang === 'fr' ? 'min' : 'minit'}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-8">
        <article className="max-w-none">
          <div className="relative">
            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C9A227] to-primary rounded-full" />
            {looksLikeHtml(text) ? (
              // Editor-saved HTML — sanitized server-side, safe to
              // inject. Same allowlist as article bodies (bold,
              // italic, lists, alignment).
              <div
                className="ml-6 text-gray-700 leading-relaxed text-base lg:text-lg formal-block-html"
                dangerouslySetInnerHTML={{ __html: text }}
              />
            ) : (
              <div className="ml-6 space-y-5 text-gray-700 leading-relaxed text-base lg:text-lg">
                {paragraphs.map((p, i) => (
                  <p
                    key={i}
                    style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both whitespace-pre-line"
                  >
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  )
}
