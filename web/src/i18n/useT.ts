import { useLanguage } from '@/i18n/LanguageContext'
import { messages } from '@/i18n'

function getByPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj)
}

export function useT() {
  const { language } = useLanguage()

  function t(key: string, opts?: { fallback?: string }): string {
    const dict = messages[language]
    const value = getByPath(dict, key)
    if (typeof value === 'string') return value

    const fallbackFr = getByPath(messages.fr, key)
    if (typeof fallbackFr === 'string') return fallbackFr

    if (opts?.fallback) return opts.fallback
    return key
  }

  return { t, language }
}
