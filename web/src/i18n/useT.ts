import { useLanguage } from '@/i18n/LanguageContext'

// ``useT`` is the client-side translation hook. It no longer imports
// the fr/ht catalogues at module load time — the dicts come from
// ``LanguageContext`` which dynamic-imports the active language and
// lazy-loads the FR fallback only when a non-FR session looks up a
// missing key. This is the chunk-split that keeps the inactive
// catalogue (~25 KB gzip) out of every client bundle.

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  )
}

export function useT() {
  const { language, messages, fallback } = useLanguage()

  function t(key: string, opts?: { fallback?: string }): string {
    // Active dict — null during the brief window before the dynamic
    // import resolves (only happens on language switch; the SSR'd
    // initial render already has its dict). Fall through to the
    // FR fallback then to the caller-supplied default then to the
    // raw key so the UI never renders ``undefined``.
    if (messages) {
      const value = getByPath(messages, key)
      if (typeof value === 'string') return value
    }
    if (fallback) {
      const value = getByPath(fallback, key)
      if (typeof value === 'string') return value
    }
    if (opts?.fallback) return opts.fallback
    return key
  }

  return { t, language }
}
