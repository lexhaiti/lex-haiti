import 'server-only'

import { cookies } from 'next/headers'
import { LANG_COOKIE, Language } from '@/i18n'
// Server-only eager imports — the server bundle has no client-side
// size impact, so loading both catalogues here is cheap and lets us
// look up fallbacks without an await chain.
import { fr } from '@/i18n/fr'
import { ht } from '@/i18n/ht'

const messages = { fr, ht } as const

/**
 * Read the visitor's language from the LANG_COOKIE in an RSC. Falls
 * back to French (the editorial default) when the cookie is absent.
 *
 * Use this in any server component that needs to render localized
 * strings — pair with `getT()` below for the actual lookup, or pass
 * the value as a `lang` prop down to children that already accept one.
 */
export async function getServerLanguage(): Promise<Language> {
  const store = await cookies()
  const v = store.get(LANG_COOKIE)?.value
  return v === 'ht' ? 'ht' : 'fr'
}

/**
 * Server-side counterpart to the client `useT()` hook. Returns a
 * function with the same shape — `t('some.key', { fallback })` —
 * resolving against the same dictionaries.
 *
 * Pass an explicit `lang` when you already know it (e.g. in a Suspense
 * boundary that accepts the language as a prop); otherwise the helper
 * reads the cookie itself.
 *
 * Usage:
 *   const t = await getT()
 *   return <h1>{t('home.title')}</h1>
 */
export async function getT(lang?: Language) {
  const language = lang ?? (await getServerLanguage())
  const dict = messages[language]
  const fallbackDict = messages.fr

  function getByPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    )
  }

  function t(key: string, opts?: { fallback?: string }): string {
    const value = getByPath(dict, key)
    if (typeof value === 'string') return value
    const fr = getByPath(fallbackDict, key)
    if (typeof fr === 'string') return fr
    if (opts?.fallback) return opts.fallback
    return key
  }

  return Object.assign(t, { language })
}
