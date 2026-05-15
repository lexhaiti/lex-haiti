/**
 * i18n entry point.
 *
 * # Conventions
 *
 * Every visitor-facing string lives in `i18n/fr.ts` and `i18n/ht.ts`,
 * keyed by feature → surface → field — e.g. `home.hero.title`,
 * `userMenu.profile`. Components consume them via:
 *
 *   - `useT()` hook in client components: `const { t, language } = useT()`
 *   - `getT()` helper in server components: `const t = await getT()`
 *
 * Both helpers return the same `(key, opts?) => string` shape and fall
 * back to French when a Kreyòl key is missing.
 *
 * ## Why centralised
 *
 * 21 files used to declare local `const COPY = { fr, ht }` blocks and
 * the codebase carried 76 inline `lang === 'fr' ? '…' : '…'` ternaries.
 * The result: same phrase rendered three different ways, untranslatable
 * strings hidden in components, and reviewers grepping French text
 * across the repo to find a translation. Now there's one place to look.
 *
 * ## Migration status — complete
 *
 * Every feature surface now resolves its strings via `useT()` / `getT()`
 * against `i18n/{fr,ht}.ts`. The previous local `const COPY = { fr, ht }`
 * blocks have all been retired. Migrated surfaces include:
 *
 *   - components/home/HeroSection.tsx → `home.hero.*`
 *   - components/home/ActualitesSection.tsx → `home.actualites.*`
 *   - components/home/AppelContribution.tsx → `home.appelContribution.*`
 *   - components/home/CorpusStatsStrip.tsx → `home.corpusStats.*`
 *   - components/home/ExplorerSection.tsx → `home.explorer.*`
 *   - components/home/FeaturesSection.tsx → `home.features.*`
 *   - components/home/MoniteurRecentSection.tsx → `home.moniteurRecent.*`
 *   - components/home/PartenairesSection.tsx → `home.partenaires.*`
 *   - components/layout/UserMenu.tsx → `userMenu.*`
 *   - components/shared/EditorialFilter.tsx → `editorialFilter.*`
 *   - components/law-details/EditorBar.tsx → `editorBar.*`
 *   - components/law-details/MetadataEditor.tsx → `metadataEditor.*`
 *   - app/sign-in/page.tsx → `signIn.*`
 *   - app/sign-in/error/page.tsx → `signIn.error.*`
 *   - app/profile/page.tsx → `profile.*`
 *   - app/loi/[slug]/amendements/page.tsx → `amendments.*`
 *   - app/editorial/import/page.tsx → `editorial.import.chooser.*`
 *   - app/editorial/import/_panels/LegalTextImportPanel.tsx
 *       → `editorial.import.legalText.*`
 *   - app/editorial/import/_panels/MoniteurImportPanel.tsx
 *       → `editorial.import.moniteur.*`
 *   - app/editorial/moniteur/page.tsx → `editorial.moniteur.list.*`
 *   - app/moniteur/[id]/_components/MoniteurIssueEditorPanel.tsx
 *       → `editorial.moniteur.review.*`
 *   - app/recherche/avancee/page.tsx → `searchAdvanced.*`
 *
 * The migration pattern (use HeroSection.tsx and UserMenu.tsx as
 * templates):
 *   1. Move local `COPY.fr.*` keys into `i18n/fr.ts` under a sensible
 *      namespace (`<feature>.<surface>.<field>`).
 *   2. Mirror the keys into `i18n/ht.ts`.
 *   3. Replace `useLanguage()` + `COPY[lang]` with `useT()` (client) or
 *      `getT()` (server) and call `t('namespace.key')`.
 *   4. Inline ternaries (`lang === 'fr' ? '…' : '…'`) get the same
 *      treatment — extract into i18n keys and call `t(...)`.
 *   5. Strings that interpolate runtime values (e.g.
 *      ``${n} candidats détectés``) stay as small local helpers in the
 *      component rather than going into the catalogue, which only
 *      carries plain strings and arrays.
 *
 * Data that *looks* like copy but actually carries routing / behaviour
 * (e.g. the suggestion chips in HeroSection, which are
 * `{label, q, href}` records) stays in the component file. The i18n
 * catalogue is for strings, not application state.
 */

// We no longer eagerly import both ``./fr`` and ``./ht`` here — that
// import graph used to pull *both* catalogues into every client bundle
// that called ``useT()`` (~25 KB gzip each). The active dict is now
// resolved per-language via dynamic import in ``loadMessages()`` below;
// server-side code that needs both (i18n/server.ts for SSR) imports
// them directly there, where the server bundle's size doesn't matter.
//
// We keep ``fr.ts`` and ``ht.ts`` as plain ES modules so the dynamic
// imports below produce per-language chunks under .next/server/chunks.

/** Available UI languages. Used as the typed key in cookies, the
 *  LanguageProvider's state, and the dynamic-import loader below. */
export type Language = 'fr' | 'ht'

/** Shape of a complete messages catalogue — the union of every key
 *  defined in fr.ts. The FR catalogue is treated as the source of
 *  truth; ht.ts must match its shape.
 *
 *  We deep-widen each leaf from its literal type (e.g. ``"FR"``) to
 *  ``string`` because each catalogue's literal narrowing diverges
 *  (``nav.langShort`` is the literal "FR" in fr.ts vs "HT" in ht.ts).
 *  Without widening, the two dicts wouldn't be assignable to the
 *  same ``MessagesDict`` type. */
type DeepStringify<T> = T extends string
  ? string
  : { [K in keyof T]: DeepStringify<T[K]> }
export type MessagesDict = DeepStringify<typeof import('./fr')['fr']>

/**
 * Load a single language's messages catalogue. Returns the active dict
 * on its own so the inactive language's ~25 KB gzipped chunk stays
 * out of the bundle until the user actually switches.
 *
 * The dynamic ``import()`` is split-aware: Webpack / Turbopack put each
 * branch in its own chunk (``i18n_fr.js`` / ``i18n_ht.js``). Calling
 * this from a server component is fine — Node loads the JSON-shaped
 * module synchronously and the chunk-split metadata is ignored.
 */
export async function loadMessages(lang: Language): Promise<MessagesDict> {
  if (lang === 'ht') {
    const mod = await import('./ht')
    return mod.ht
  }
  const mod = await import('./fr')
  return mod.fr
}

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
