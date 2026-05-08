'use client'

import { useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/i18n/LanguageContext'
import type { Language } from '@/i18n'
import { cn } from '@/lib/utils'

type LanguageEntry = {
  value: Language
  flag: string
  label: string
}

const LANGUAGES: LanguageEntry[] = [
  { value: 'fr', flag: '🇫🇷', label: 'Français' },
  { value: 'ht', flag: '🇭🇹', label: 'Kreyòl' },
]

// Hover timing: open feels instant, close is forgiving for jittery mice that
// briefly leave the menu while traveling between trigger and items.
const HOVER_OPEN_MS = 80
const HOVER_CLOSE_MS = 180

export type LanguageSwitcherProps = {
  /**
   * `responsive` (default) — flag only on `<sm`, flag + full name on `sm+`.
   * `compact`              — flag + 2-letter code (legacy).
   * `wide`                 — flag + full name, full-width (e.g., dialog footer).
   */
  variant?: 'responsive' | 'compact' | 'wide'
  /** Where to align the dropdown content. */
  align?: 'start' | 'center' | 'end'
  className?: string
  triggerClassName?: string
}

export function LanguageSwitcher({
  variant = 'responsive',
  align = 'end',
  className,
  triggerClassName,
}: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage()
  const current = LANGUAGES.find((l) => l.value === language) ?? LANGUAGES[0]

  // Controlled open state so hover and click can both drive it.
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimers() {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function scheduleOpen() {
    clearTimers()
    openTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS)
  }

  function scheduleClose() {
    clearTimers()
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS)
  }

  function handleSelect(value: Language) {
    setLanguage(value)
    setOpen(false)
    clearTimers()
    // Blur the trigger so hover-open doesn't immediately re-trigger if the
    // user's cursor is still on it. Next mouseEnter (after they move away
    // and back) will reopen — same for keyboard tab.
    if (typeof document !== 'undefined') {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    }
  }

  return (
    // The wrapper handles hover for both trigger and content. Radix portals
    // the content out of the DOM tree, so we use Radix's onMouseEnter/Leave
    // on DropdownMenuContent too (further down).
    <div
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      className={cn('inline-block', className)}
    >
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'flex items-center gap-2 rounded-full border-gray-200 bg-white hover:bg-slate-50 hover:border-red-200 transition-all shadow-sm',
              // Min 44x44 tap target on mobile (Apple/Google a11y guideline);
              // shrink to a tighter pill on sm+ where mouse users dominate.
              'h-11 sm:h-9 min-w-[44px] sm:min-w-0',
              variant === 'wide' && 'w-full justify-between h-12 sm:h-12 text-base',
              // Tighter padding on mobile when the label is hidden
              variant === 'responsive' && 'px-3 sm:px-3',
              triggerClassName,
            )}
            aria-label={`Language: ${current.label}`}
          >
            <span className="flex items-center gap-2">
              <span className="text-lg leading-none filter drop-shadow-sm">
                {current.flag}
              </span>
              {variant === 'wide' && (
                <span className="text-sm normal-case font-semibold text-slate-600">
                  {current.label}
                </span>
              )}
              {variant === 'compact' && (
                <span className="text-xs uppercase font-semibold text-slate-600">
                  {current.value.toUpperCase()}
                </span>
              )}
              {variant === 'responsive' && (
                <span className="hidden sm:inline text-sm normal-case font-semibold text-slate-600">
                  {current.label}
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 opacity-60',
                // Hide the chevron on mobile flag-only view to keep the button tight
                variant === 'responsive' && 'hidden sm:inline-block',
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className="min-w-[180px]"
          // Keep open while the cursor is over the menu items; close when it
          // leaves them. This pairs with the wrapper's mouse handlers above.
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          {LANGUAGES.map((lang) => {
            const active = lang.value === language
            return (
              <DropdownMenuItem
                key={lang.value}
                onSelect={(e) => {
                  // Stop Radix from auto-returning focus to the trigger;
                  // we handle blur ourselves so hover-open doesn't re-fire.
                  e.preventDefault()
                  handleSelect(lang.value)
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <span className="text-lg leading-none">{lang.flag}</span>
                <span className="flex-1 font-medium">{lang.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-red-600" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
