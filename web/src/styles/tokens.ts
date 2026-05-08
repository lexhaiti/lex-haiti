/**
 * LexHaïti Design System — TypeScript tokens.
 *
 * Source of truth for code. The matching rationale doc lives at
 * `docs/DESIGN_SYSTEM.md`. Keep them in sync — changing a value here
 * without updating the doc (or vice versa) is a bug.
 *
 * USAGE
 *   import { colors, radius, motion } from '@/styles/tokens'
 *   <h2 className={`text-[${colors.primary}]`}>...</h2>
 *
 * NOTE: Tailwind classes are still preferred for static values
 * (`text-primary`). Import these tokens when:
 *   - composing dynamic styles in JS
 *   - building consistent variants on a custom component
 *   - referencing values from server-rendered email templates etc.
 */

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export const colors = {
  /** Deep navy — institutional primary. Hero/footer bg, h1/h2, CTAs. */
  primary: '#0D1B4C',

  /** Amber — warmth + structural rhythm. Tailwind amber-400 / 500. */
  accent: {
    DEFAULT: '#FBBF24', // amber-400
    hover: '#F59E0B', // amber-500
  },

  /** Haitian flag red — national-identity moments only. Not decoration. */
  national: '#D21034',

  /**
   * Neutrals — Tailwind slate-*. Listed here so non-Tailwind contexts
   * (canvas exports, email templates) can still reach the canonical hex.
   */
  neutral: {
    white: '#FFFFFF',
    slate50: '#F8FAFC',
    slate100: '#F1F5F9',
    slate200: '#E2E8F0',
    slate300: '#CBD5E1',
    slate400: '#94A3B8',
    slate500: '#64748B',
    slate600: '#475569',
    slate700: '#334155',
    slate900: '#0F172A',
  },

  /**
   * Editorial-status semantic colors. Used in pills/badges across the
   * /lois listing and law detail. Tailwind classes are preferred when
   * available — these are the underlying hexes.
   */
  status: {
    inForce: { bg: '#DCFCE7', fg: '#166534' }, // emerald-100/700
    abrogated: { bg: '#FEE2E2', fg: '#991B1B' }, // red-100/700
    draft: { bg: '#FEF3C7', fg: '#92400E' }, // amber-100/700
  },
} as const

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  /** The only sizes that should appear on screen. */
  size: {
    display: '3.75rem', // text-6xl — hero h1
    titleL: '2.25rem', // text-4xl — h2 desktop
    titleM: '1.875rem', // text-3xl — h2 tablet
    titleS: '1.5rem', // text-2xl — h2 mobile, card titles
    titleXS: '1.25rem', // text-xl — compact card titles
    bodyL: '1.125rem', // text-lg — subtitles, intros
    bodyM: '1rem', // text-base — default body
    bodyS: '0.875rem', // text-sm — secondary
    caption: '0.75rem', // text-xs — eyebrows, metadata
  },

  weight: {
    extrabold: 800, // h1, h2
    bold: 700, // h3, eyebrows, buttons
    semibold: 600, // secondary CTAs
    medium: 500, // nav, list items
    normal: 400, // body
  },

  /** The "République section label" signature. */
  eyebrow: {
    fontSize: '0.75rem', // text-xs
    fontWeight: 700, // font-bold
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em', // tracking-widest
    color: '#0D1B4C',
    opacity: 0.65,
  },
} as const

// ---------------------------------------------------------------------------
// Spacing & layout
// ---------------------------------------------------------------------------

export const spacing = {
  /** Section vertical padding (matches `py-16 lg:py-20`). */
  sectionY: { sm: '4rem', lg: '5rem' },

  /** Gaps inside grids. */
  gap: {
    compact: '1rem', // gap-4
    standard: '1.5rem', // gap-6
    spacious: '2rem', // gap-8
    extraSpacious: '2.5rem', // gap-10
  },

  /** Heading-block internal rhythm (rendered by SectionHeading). */
  heading: {
    eyebrowToTitle: '0.75rem', // mt-3
    titleToAccent: '1.25rem', // mt-5
    accentToSubtitle: '1.25rem', // mt-5
    blockToContent: { sm: '2.5rem', lg: '3rem' }, // mb-10 lg:mb-12
  },
} as const

/**
 * Tailwind container behavior is configured in `web/tailwind.config.ts`
 * (centered, padding 2rem, 2xl cap at 1400px). Don't fork — every
 * section MUST use the shared `container` class.
 */
export const container = {
  padding: '2rem',
  cap2xl: '1400px',
} as const

/** Tailwind breakpoints. iPad Pro 12.9" portrait sits at lg (1024); the
 * full desktop nav only kicks in at xl (1280) — see header rule. */
export const breakpoints = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

// ---------------------------------------------------------------------------
// Radius & shadow
// ---------------------------------------------------------------------------

export const radius = {
  md: '0.375rem', // buttons, search input edges (rounded-md)
  lg: '0.5rem', // form pills, small cards (rounded-lg)
  xl: '0.75rem', // standard content cards (rounded-xl)
  '2xl': '1rem', // hero CTA card (AppelContribution) (rounded-2xl)
  full: '9999px', // pills, language chip (rounded-full)
} as const

/**
 * Shadows are navy-tinted, not pure black, so they pick up the brand
 * color in soft form. Listed here as the actual CSS — copy-paste into
 * arbitrary-class Tailwind syntax.
 */
export const shadow = {
  card: '0 1px 2px 0 rgb(0 0 0 / 0.05)', // shadow-sm
  cardHover: '0 4px 6px -1px rgb(0 0 0 / 0.1)', // shadow-md
  cardLift: '0 8px 30px -12px rgba(13, 27, 76, 0.18)',
  searchPill: '0 12px 40px -12px rgba(0, 0, 0, 0.5)',
  ctaCard: '0 20px 60px -20px rgba(13, 27, 76, 0.4)',
} as const

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Framer Motion patterns. Sections fade-in-from-bottom on scroll,
 * cards stagger by 60–80ms. No bounce, no spring, no rotate.
 */
export const motion = {
  /** Standard section reveal. */
  sectionFadeIn: {
    initial: { opacity: 0, y: 12 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.5 },
  },

  /** Card item inside a staggered grid. */
  cardItem: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
  },

  /** Stagger configurations — pick by feel. */
  stagger: {
    tight: 0.06,
    normal: 0.08,
    loose: 0.1,
  },

  /** Duration scale — only use these values. */
  duration: {
    fast: 0.2, // hover state changes
    base: 0.3, // standard transitions
    medium: 0.5, // section reveals
  },
} as const

// ---------------------------------------------------------------------------
// Z-index scale
// ---------------------------------------------------------------------------

/**
 * Document the few stacking contexts we care about so we don't end up
 * with z-9999 magic numbers in PRs.
 */
export const zIndex = {
  base: 0,
  card: 10,
  header: 50,
  megaMenu: 40, // below the header so the header bar sits on top
  mobileOverlay: 60,
  mobileDrawer: 61,
  toast: 70,
  modal: 80,
} as const

// ---------------------------------------------------------------------------
// Theme tag enum (mirrors backend/packages/schemas/enums.py LegalTheme)
// ---------------------------------------------------------------------------

/**
 * The 12 cross-cutting legal-domain tags. Keep this list in lockstep
 * with the backend `LegalTheme` enum and the keyword dictionary in
 * `backend/services/corpus/themes.py`.
 */
export const legalThemes = [
  'droit_societes',
  'droit_fiscal',
  'droit_bancaire',
  'propriete_intellectuelle',
  'droit_travail',
  'protection_sociale',
  'droit_famille',
  'successions',
  'droit_administratif',
  'marches_publics',
  'environnement',
  'foncier',
] as const
export type LegalTheme = (typeof legalThemes)[number]
