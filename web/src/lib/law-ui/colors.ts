// src/lib/law-ui/colors.ts

/**
 * A curated palette that matches a clean, premium UI.
 * The goal is "random-looking" but still harmonious.
 */
const COLOR_PALETTE = [
  '#2563EB', // blue
  '#DC2626', // red
  '#7C3AED', // purple
  '#059669', // emerald
  '#C2410C', // orange
  '#0F766E', // teal
  '#4F46E5', // indigo
  '#B45309', // amber/brown
  '#475569', // slate
  '#BE185D', // pink
] as const

function hashString(input: string): number {
  // fast deterministic hash (djb2-ish)
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i)
  }
  return h >>> 0
}

/**
 * "Random" but stable per slug
 */
export function colorFromSlug(slug: string): string {
  const h = hashString(slug)
  return COLOR_PALETTE[h % COLOR_PALETTE.length]
}
