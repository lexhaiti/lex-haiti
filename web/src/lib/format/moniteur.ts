/**
 * Display helpers specific to Le Moniteur issues.
 */

/**
 * Prepend `N°` only when an issue number starts with a digit. Avoids
 * "N° Spécial N° 5" double-prefix when the stored number already
 * carries an edition word (e.g. "Spécial N° 5", "Extraordinaire 12").
 */
export function smartIssueNumber(raw: string): string {
  return /^[0-9]/.test(raw) ? `N° ${raw}` : raw
}
