import { fr } from './fr'
import { ht } from '@/i18n/ht'

export const messages = { fr, ht } as const
export type Language = keyof typeof messages
