import { fr } from './fr'
import { ht } from '@/i18n/ht'

export const messages = { fr, ht } as const
export type Language = keyof typeof messages

/**
 * Cookie name where the user's selected language is persisted. Read by
 * the server-side `getT()` helper (i18n/server.ts) and written by the
 * client-side LanguageProvider whenever the user picks a language.
 *
 * Kept here (not in server.ts) because both client + server modules
 * need the same constant, and i18n/server.ts uses next/headers which
 * can't be imported from a client component.
 */
export const LANG_COOKIE = 'lexhaiti.lang'
