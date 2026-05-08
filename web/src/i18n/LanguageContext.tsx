'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Language } from '@/i18n/index'

type LanguageContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const STORAGE_KEY = 'lexhaiti:lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr')
  const [mounted, setMounted] = useState(false)

  // load from localStorage once
  useEffect(() => {
    setMounted(true)
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null
    if (saved === 'fr' || saved === 'ht') setLanguageState(saved)
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STORAGE_KEY, lang)
  }

  const toggleLanguage = () => setLanguage(language === 'fr' ? 'ht' : 'fr')

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage }),
    [language],
  )

  if (!mounted) {
    return (
      <LanguageContext.Provider value={value}>
        <div style={{ opacity: 0 }}>{children}</div>
      </LanguageContext.Provider>
    )
  }

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
