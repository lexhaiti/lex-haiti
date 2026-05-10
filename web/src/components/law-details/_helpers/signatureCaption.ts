/**
 * Build a one-sentence intro that sits above the SIGNATAIRES list and
 * tells the visitor *what* the people below did to enact the act.
 *
 * Derived purely from the structured `signers` array — we know who
 * sat on which bureau and what date they signed, so the sentence
 * writes itself. No parsing of `official_formula` text needed.
 *
 * The exact phrasing depends on the *kind* of act:
 *   - Loi: "Adoptée par le Sénat … et par la Chambre des Députés …"
 *     (with optional " — Promulguée le …" if the Pres signature is
 *     also present)
 *   - Décret / Décret-loi: "Donnée le …"
 *   - Arrêté: "Faite le …"
 *   - Convention: "Signée le …"
 *   - Anything else: plain promulgation date if available
 *
 * Returns `null` when there's nothing useful to say (no signatories,
 * or the only ones present don't carry a `signed_at`). Callers hide
 * the caption when null so the page stays tidy.
 */

import type { components } from '@/lib/api-types'

type LegalSigner = components['schemas']['LegalSignerRead']

const MONTHS_FR = [
  '',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

const MONTHS_HT = [
  '',
  'janvye', 'fevriye', 'mas', 'avril', 'me', 'jen',
  'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm',
] as const

function fmt(iso: string | null | undefined, lang: 'fr' | 'ht'): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const day = Number.parseInt(m[3], 10)
  const month = Number.parseInt(m[2], 10)
  const months = lang === 'ht' ? MONTHS_HT : MONTHS_FR
  return `${day} ${months[month] ?? ''} ${m[1]}`
}

export function buildSignatureLeadCaption(
  signers: LegalSigner[] | undefined,
  category: string | null | undefined,
  lang: 'fr' | 'ht',
): string | null {
  if (!signers || signers.length === 0) return null

  const senateBureau = signers.filter((s) => s.chamber === 'senat')
  const chamberBureau = signers.filter((s) => s.chamber === 'chambre')
  const promulgator = signers.find(
    (s) => s.signing_capacity === 'promulgating',
  )
  const author = signers.find((s) => s.signing_capacity === 'authoring')

  const senateDate = fmt(senateBureau[0]?.signed_at, lang)
  const chamberDate = fmt(chamberBureau[0]?.signed_at, lang)
  const promulgationDate = fmt(promulgator?.signed_at, lang)
  const authorDate = fmt(author?.signed_at, lang)

  // ---- Loi-style: bicameral adoption + executive promulgation ----
  if (senateBureau.length > 0 && chamberBureau.length > 0) {
    const fr = (() => {
      let s = 'Adoptée par le Sénat de la République'
      if (senateDate) s += ` le ${senateDate}`
      s += ' et par la Chambre des Députés'
      if (chamberDate) s += ` le ${chamberDate}`
      s += '.'
      if (promulgationDate) s += ` Promulguée le ${promulgationDate}.`
      return s
    })()
    const ht = (() => {
      let s = 'Adopte pa Sena Repiblik la'
      if (senateDate) s += ` le ${senateDate}`
      s += ' ak pa Chanm Depite yo'
      if (chamberDate) s += ` le ${chamberDate}`
      s += '.'
      if (promulgationDate) s += ` Pwomilge le ${promulgationDate}.`
      return s
    })()
    return lang === 'ht' ? ht : fr
  }

  // ---- Décret / Décret-loi: head-of-state authoring ("Donnée …") ----
  if (author && (category === 'decret' || category === 'decret-loi')) {
    if (authorDate) {
      return lang === 'ht'
        ? `Bay le ${authorDate}.`
        : `Donnée le ${authorDate}.`
    }
  }

  // ---- Arrêté: minister authoring ("Faite …") ----
  if (author && category === 'arrete') {
    if (authorDate) {
      return lang === 'ht'
        ? `Fèt le ${authorDate}.`
        : `Faite le ${authorDate}.`
    }
  }

  // ---- Convention / traité ----
  if (author && category === 'convention') {
    if (authorDate) {
      return lang === 'ht'
        ? `Siyen le ${authorDate}.`
        : `Signée le ${authorDate}.`
    }
  }

  // ---- Generic authoring (unknown category) ----
  if (author && authorDate) {
    return lang === 'ht'
      ? `Siyen le ${authorDate}.`
      : `Signée le ${authorDate}.`
  }

  // ---- Promulgation-only (rare — vote bureaux missing but Pres signed) ----
  if (promulgator && promulgationDate) {
    return lang === 'ht'
      ? `Pwomilge le ${promulgationDate}.`
      : `Promulguée le ${promulgationDate}.`
  }

  return null
}
