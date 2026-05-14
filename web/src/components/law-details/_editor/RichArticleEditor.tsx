'use client'

import { useEffect } from 'react'
import { EditorContent, Extension, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Custom Tiptap extension: paragraph-level indentation.
 *
 * Stores indent as ``margin-left: <N>em`` on the paragraph's
 * ``style`` attribute. The backend sanitizer's CSSSanitizer
 * allowlists ``margin-left``, so the value round-trips through
 * persistence. Tab adds 2em (max 8em); Shift-Tab removes 2em.
 *
 * Bound only to ``paragraph`` — lists already handle their own
 * indentation through ``Mod-]`` / ``Mod-[`` in StarterKit.
 */
const STEP_EM = 2
const MAX_EM = 8

const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const ml = (el as HTMLElement).style.marginLeft
              if (!ml) return 0
              const m = /^(\d+(?:\.\d+)?)em$/.exec(ml.trim())
              return m ? Math.min(parseFloat(m[1]), MAX_EM) : 0
            },
            renderHTML: (attrs) => {
              const v = attrs.indent
              if (!v) return {}
              return { style: `margin-left: ${v}em` }
            },
          },
        },
      },
    ]
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { state, view } = this.editor
        const node = state.selection.$from.parent
        if (node.type.name !== 'paragraph') return false
        const next = Math.min((node.attrs.indent ?? 0) + STEP_EM, MAX_EM)
        if (next === node.attrs.indent) return true
        view.dispatch(
          state.tr.setNodeMarkup(state.selection.$from.before(), null, {
            ...node.attrs,
            indent: next,
          }),
        )
        return true
      },
      'Shift-Tab': () => {
        const { state, view } = this.editor
        const node = state.selection.$from.parent
        if (node.type.name !== 'paragraph') return false
        const next = Math.max((node.attrs.indent ?? 0) - STEP_EM, 0)
        if (next === node.attrs.indent) return true
        view.dispatch(
          state.tr.setNodeMarkup(state.selection.$from.before(), null, {
            ...node.attrs,
            indent: next,
          }),
        )
        return true
      },
    }
  },
})

/**
 * Minimal Tiptap-backed rich-text editor for article bodies.
 *
 * Toolbar exposes the formatting visitors of Haitian law actually
 * need on a single article: bold, italic, bullet/ordered lists, and
 * paragraph alignment. Output is HTML — the backend sanitizes it
 * through ``_sanitize_article_html`` before persistence, so we don't
 * have to do extra cleanup here.
 *
 * Legacy plain-text bodies (everything imported before Tiptap shipped)
 * get converted to a series of ``<p>`` blocks on mount so the editor
 * doesn't collapse paragraph breaks. ``onChange`` always emits HTML.
 */

interface RichArticleEditorProps {
  /** Initial body — accepts HTML or legacy plain text. */
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** Sticks the toolbar accents to the calling color scheme. The
   *  FR editor borders amber; the HT editor borders blue. */
  tone?: 'amber' | 'blue'
  ariaLabel?: string
  disabled?: boolean
}

const HTML_TAG_RE = /^\s*<[a-z][^>]*>/i

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert legacy plain-text bodies (``\n\n``-separated paragraphs) to
 * Tiptap-compatible HTML. Input already detected as HTML is returned
 * as-is so an editor round-trip is idempotent.
 */
function toEditorHtml(value: string): string {
  if (!value) return ''
  if (HTML_TAG_RE.test(value)) return value
  return value
    .split(/\n{2,}/)
    .map((para) => {
      const escaped = escapeHtml(para.trim()).replace(/\n/g, '<br />')
      return escaped ? `<p>${escaped}</p>` : ''
    })
    .filter(Boolean)
    .join('')
}

const TONE: Record<
  NonNullable<RichArticleEditorProps['tone']>,
  { border: string; ring: string; bg: string; toolbar: string; active: string }
> = {
  amber: {
    border: 'border-amber-200 focus-within:border-amber-500',
    ring: 'focus-within:ring-2 focus-within:ring-amber-100',
    bg: 'bg-amber-50/30',
    toolbar: 'border-amber-200 bg-amber-50/40',
    active: 'bg-amber-200 text-amber-900',
  },
  blue: {
    border: 'border-blue-200 focus-within:border-blue-500',
    ring: 'focus-within:ring-2 focus-within:ring-blue-100',
    bg: 'bg-blue-50/30',
    toolbar: 'border-blue-200 bg-blue-50/40',
    active: 'bg-blue-200 text-blue-900',
  },
}

export function RichArticleEditor({
  value,
  onChange,
  placeholder,
  tone = 'amber',
  ariaLabel,
  disabled = false,
}: RichArticleEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: 'left',
      }),
      ParagraphIndent,
    ],
    content: toEditorHtml(value),
    editable: !disabled,
    immediatelyRender: false,
    // ``preserveWhitespace: 'full'`` keeps leading spaces / tabs /
    // line breaks from pasted text (Word, PDF, plain text). Legal
    // bodies in Haitian Codes often carry hand-typed indents on
    // enumerated items — without this option Tiptap collapses every
    // run of spaces to one, losing visual alignment on paste.
    parseOptions: { preserveWhitespace: 'full' },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel ?? 'Article body editor',
        class: cn(
          // ``whitespace-pre-wrap`` echoes the preserved-whitespace
          // parse so leading spaces show up while the editor is open.
          'prose prose-slate max-w-none px-4 py-3 outline-none min-h-[8rem]',
          'text-base leading-relaxed text-gray-900 whitespace-pre-wrap',
          'placeholder:text-slate-400 placeholder:italic',
        ),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
    onUpdate({ editor }) {
      // Always emit the HTML serialisation; empty docs come out as
      // ``<p></p>`` which the parent normalises to '' before posting.
      onChange(editor.getHTML())
    },
  })

  // Sync external value changes (e.g. cancel + reopen on a different
  // article) without rebuilding the editor. We compare against the
  // current HTML to avoid the keep-typing → cursor-jump bug.
  useEffect(() => {
    if (!editor) return
    const next = toEditorHtml(value)
    if (editor.getHTML() === next) return
    editor.commands.setContent(next, { emitUpdate: false })
  }, [value, editor])

  useEffect(() => {
    if (!editor) return
    if (editor.isEditable !== !disabled) {
      editor.setEditable(!disabled)
    }
  }, [disabled, editor])

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-md border min-h-[10rem]',
          TONE[tone].border,
          TONE[tone].bg,
        )}
      />
    )
  }

  const palette = TONE[tone]

  return (
    <div
      className={cn(
        'rounded-md border transition-colors',
        palette.border,
        palette.bg,
        palette.ring,
        disabled && 'opacity-60 pointer-events-none',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 px-2 py-1 border-b',
          palette.toolbar,
        )}
        role="toolbar"
        aria-label="Mise en forme"
      >
        <ToolbarButton
          icon={Bold}
          label="Gras"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          tone={tone}
        />
        <ToolbarButton
          icon={Italic}
          label="Italique"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          tone={tone}
        />
        <ToolbarSeparator />
        <ToolbarButton
          icon={List}
          label="Liste à puces"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          tone={tone}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="Liste numérotée"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          tone={tone}
        />
        <ToolbarSeparator />
        <ToolbarButton
          icon={AlignLeft}
          label="Aligner à gauche"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          tone={tone}
        />
        <ToolbarButton
          icon={AlignCenter}
          label="Centrer"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          tone={tone}
        />
        <ToolbarButton
          icon={AlignRight}
          label="Aligner à droite"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          tone={tone}
        />
        <ToolbarSeparator />
        <ToolbarButton
          icon={IndentDecrease}
          label="Diminuer le retrait (Shift+Tab)"
          onClick={() => {
            editor.chain().focus().run()
            // Trigger the same keymap path used by Shift-Tab so the
            // toolbar button and the keyboard shortcut produce
            // identical document state.
            const ev = new KeyboardEvent('keydown', {
              key: 'Tab',
              shiftKey: true,
              bubbles: true,
            })
            editor.view.dom.dispatchEvent(ev)
          }}
          tone={tone}
        />
        <ToolbarButton
          icon={IndentIncrease}
          label="Augmenter le retrait (Tab)"
          onClick={() => {
            editor.chain().focus().run()
            const ev = new KeyboardEvent('keydown', {
              key: 'Tab',
              bubbles: true,
            })
            editor.view.dom.dispatchEvent(ev)
          }}
          tone={tone}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

interface ToolbarButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  onClick: () => void
  tone: NonNullable<RichArticleEditorProps['tone']>
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  onClick,
  tone,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => {
        // Prevent the editor losing focus before the command runs —
        // otherwise the chain().focus() inside onClick doesn't catch
        // the same selection.
        e.preventDefault()
      }}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 rounded text-slate-600',
        'hover:bg-white/70 transition-colors',
        active && TONE[tone].active,
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

function ToolbarSeparator() {
  return <span className="w-px h-5 bg-slate-200/80 mx-0.5" aria-hidden="true" />
}
