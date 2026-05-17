'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Language, LANG_COOKIE, loadMessages, MessagesDict } from '@/i18n/index'

type LanguageContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  /** Active messages catalogue — populated by the server (passed via
   *  ``initialMessages``) and refreshed on language switch via the
   *  per-language dynamic import. Reads via the ``useT()`` hook. */
  messages: MessagesDict | null
  /** French fallback dictionary, populated lazily the first time a
   *  non-FR session asks for a missing key. Cheaper than hydrating
   *  it eagerly on every visit. */
  fallback: MessagesDict | null
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
  initialMessages,
  children,
}: {
  /**
   * Server-detected language from the lexhaiti.lang cookie. Lets the
   * provider hydrate with the right value immediately, so the first
   * render matches the SSR output and there's no FR→HT flicker for
   * Kreyòl visitors.
   */
  initialLanguage?: Language
  /**
   * Server-resolved messages catalogue for the active language. Lets
   * the very first client render have strings without waiting on the
   * dynamic import. Loaded in app/layout.tsx via
   * ``loadMessages(serverLanguage)`` and passed in via ``Providers``.
   */
  initialMessages?: MessagesDict | null
  children: React.ReactNode
}) {
  const [language, setLanguageState] = useState<Language>(
    initialLanguage ?? 'fr',
  )
  const [messages, setMessages] = useState<MessagesDict | null>(
    initialMessages ?? null,
  )
  // FR fallback is loaded on demand the first time a non-FR session
  // looks up a key its own dict doesn't carry. Skipped entirely when
  // the active language IS already French (no second chunk).
  const [fallback, setFallback] = useState<MessagesDict | null>(
    (initialLanguage ?? 'fr') === 'fr' ? (initialMessages ?? null) : null,
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

  // Dynamic-load the active catalogue whenever the language changes.
  // The server pre-hydrated ``messages`` for the initial render via
  // ``initialMessages`` — we skip the first mount when we already have
  // a dict, so chunk-loading only happens during a user-initiated
  // toggle. ``isFirstMount`` is a ref (not the
  // ``initialLanguage === language`` comparison this used to do)
  // because toggling back to the initial language was wrongly skipping
  // the reload, leaving the dict stuck on the previous value.
  const isFirstMount = useRef(true)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      if (messages && initialLanguage === language) return
    }
    let cancelled = false
    loadMessages(language).then((dict) => {
      if (!cancelled) setMessages(dict)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang)
    }
    writeCookieLang(lang)
  }

  const toggleLanguage = () => setLanguage(language === 'fr' ? 'ht' : 'fr')

  // FR fallback hydrator. Fires only when a non-FR session is active
  // AND we haven't already loaded the FR dict (e.g. we did at startup
  // for an FR visitor and now they toggled to HT — fallback is still
  // their original FR dict, no reload). Cheap, idempotent.
  useEffect(() => {
    if (language === 'fr') return
    if (fallback) return
    loadMessages('fr').then(setFallback).catch(() => {})
  }, [language, fallback])

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, messages, fallback }),
    [language, messages, fallback],
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
