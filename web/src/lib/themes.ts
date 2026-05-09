/**
 * Bilingual labels and short descriptions for the closed `LegalTheme` vocabulary.
 *
 * Single source of truth used by the law detail page (theme chips), the
 * /thematiques landing, and the /lois page header when filtered by theme.
 *
 * Keep in sync with:
 *   • backend/packages/schemas/enums.py  — the LegalTheme enum
 *   • web/src/components/layout/menu.ts  — the megamenu items
 *   • web/src/i18n/{fr,ht}.ts            — menu.themes.* (mirrors these)
 */

export type LegalThemeKey =
  | 'droit_societes'
  | 'droit_fiscal'
  | 'droit_bancaire'
  | 'propriete_intellectuelle'
  | 'droit_travail'
  | 'protection_sociale'
  | 'droit_famille'
  | 'successions'
  | 'droit_administratif'
  | 'marches_publics'
  | 'environnement'
  | 'foncier'

export const THEME_LABELS: Record<LegalThemeKey, { fr: string; ht: string }> = {
  droit_societes: { fr: 'Droit des Sociétés', ht: 'Dwa sosyete' },
  droit_fiscal: { fr: 'Droit Fiscal', ht: 'Dwa fiskal' },
  droit_bancaire: { fr: 'Droit Bancaire', ht: 'Dwa bank' },
  propriete_intellectuelle: { fr: 'Propriété Intellectuelle', ht: 'Pwopriyete entelektyèl' },
  droit_travail: { fr: 'Droit du Travail', ht: 'Dwa travay' },
  protection_sociale: { fr: 'Protection Sociale', ht: 'Pwoteksyon sosyal' },
  droit_famille: { fr: 'Droit de la Famille', ht: 'Dwa fanmi' },
  successions: { fr: 'Successions', ht: 'Eritaj' },
  droit_administratif: { fr: 'Droit Administratif', ht: 'Dwa administratif' },
  marches_publics: { fr: 'Marchés Publics', ht: 'Mache piblik' },
  environnement: { fr: 'Droit de l’Environnement', ht: 'Dwa anviwònman' },
  foncier: { fr: 'Droit Foncier', ht: 'Dwa fonse' },
}

/**
 * Used as the page subtitle on /lois?theme=… and on the /thematiques tile
 * tooltip. Phrased as one-sentence descriptions of what the domain covers.
 */
export const THEME_DESCRIPTIONS: Record<LegalThemeKey, { fr: string; ht: string }> = {
  droit_societes: {
    fr: 'Création et gestion des entreprises, statuts, fonds de commerce et registre du commerce.',
    ht: 'Kreyasyon ak jesyon biznis, estati, fon komès ak rejis komès.',
  },
  droit_fiscal: {
    fr: 'Impôts, taxes, patente, douanes et procédures fiscales.',
    ht: 'Enpo, taks, patant, dwàn ak pwosedi fiskal.',
  },
  droit_bancaire: {
    fr: 'Banque, crédit, monnaie et régulation prudentielle des établissements financiers.',
    ht: 'Bank, kredi, lajan ak regilasyon enstitisyon finansyè yo.',
  },
  propriete_intellectuelle: {
    fr: "Brevets, marques, droits d'auteur et propriété industrielle.",
    ht: 'Brevè, mak, dwa otè ak pwopriyete endistriyèl.',
  },
  droit_travail: {
    fr: 'Contrat de travail, conventions collectives, licenciement et relations syndicales.',
    ht: 'Kontra travay, konvansyon kolektif, ranvwa ak relasyon sendika.',
  },
  protection_sociale: {
    fr: 'Sécurité sociale, retraite, accidents du travail et assurance maladie.',
    ht: 'Sekirite sosyal, pansyon, aksidan travay ak asirans maladi.',
  },
  droit_famille: {
    fr: 'Mariage, divorce, filiation, adoption, autorité parentale et régimes matrimoniaux.',
    ht: 'Maryaj, divòs, filyasyon, adopsyon, otorite paran ak rejim matrimonyal.',
  },
  successions: {
    fr: 'Héritages, testaments, legs et donations.',
    ht: 'Eritaj, testaman, legs ak donasyon.',
  },
  droit_administratif: {
    fr: 'Fonction publique, ministères, services publics et actes administratifs.',
    ht: 'Fonksyon piblik, ministè, sèvis piblik ak zak administratif.',
  },
  marches_publics: {
    fr: "Appels d'offres, passation des marchés publics et concessions.",
    ht: 'Konkou ofis, pasasyon mache piblik ak konsesyon.',
  },
  environnement: {
    fr: 'Protection environnementale, biodiversité, ressources naturelles et gestion des déchets.',
    ht: 'Pwoteksyon anviwònman, byodivèsite, resous natirèl ak jesyon fatra.',
  },
  foncier: {
    fr: "Cadastre, propriété immobilière, baux et domaine de l'État.",
    ht: 'Kadas, pwopriyete imobilye, kontra lwaye ak domèn Leta.',
  },
}

export function themeLabel(key: string, lang: 'fr' | 'ht'): string | null {
  const entry = THEME_LABELS[key as LegalThemeKey]
  return entry ? entry[lang] : null
}

export function themeDescription(key: string, lang: 'fr' | 'ht'): string | null {
  const entry = THEME_DESCRIPTIONS[key as LegalThemeKey]
  return entry ? entry[lang] : null
}
