'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Language, LANG_COOKIE } from '@/i18n/index'

type LanguageContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const STORAGE_KEY = 'lexhaiti:lang'

function readCookieLang(): Language | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]+)`),
  )
  const v = m?.[1]
  return v === 'fr' || v === 'ht' ? v : null
}

function writeCookieLang(lang: Language) {
  if (typeof document === 'undefined') return
  // Persist for one year. SameSite=Lax so the cookie survives normal
  // navigation but isn't sent on cross-site requests.
  const oneYear = 60 * 60 * 24 * 365
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${oneYear}; samesite=lax`
}

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  /**
   * Server-detected language from the lexhaiti.lang cookie. Lets the
   * provider hydrate with the right value immediately, so the first
   * render matches the SSR output and there's no FR→HT flicker for
   * Kreyòl visitors.
   */
  initialLanguage?: Language
  children: React.ReactNode
}) {
  const [language, setLanguageState] = useState<Language>(
    initialLanguage ?? 'fr',
  )

  // Sync from client storage on mount — handles the case where the
  // cookie was set but localStorage diverged, and keeps backward
  // compatibility with users whose preference only lived in
  // localStorage before this commit.
  useEffect(() => {
    if (initialLanguage) return // server already gave us the right value
    const cookieLang = readCookieLang()
    if (cookieLang) {
      setLanguageState(cookieLang)
      return
    }
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null
    if (saved === 'fr' || saved === 'ht') {
      setLanguageState(saved)
      writeCookieLang(saved) // promote localStorage → cookie
    }
  }, [initialLanguage])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang)
    }
    writeCookieLang(lang)
  }

  const toggleLanguage = () => setLanguage(language === 'fr' ? 'ht' : 'fr')

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage }),
    [language],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx)
    throw new Error('useLanguage must be used within <LanguageProvider>')
  return ctx
}
