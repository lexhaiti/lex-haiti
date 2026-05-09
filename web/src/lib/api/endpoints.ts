/**
 * Typed wrappers around the LexHaïti API.
 *
 * Base URL is configured via `NEXT_PUBLIC_API_URL` (see .env.local), default
 * `http://localhost:8000/api/v1`. All paths here are relative to that base.
 */
import type { components } from '@/lib/api-types'
import { apiGet, apiPatch, apiPost, apiPostForm } from '@/lib/api/client'

// Re-exported types — what consumers reach for.
export type LegalTextRead = components['schemas']['LegalTextRead']
export type LegalTextListItem = components['schemas']['LegalTextListItem']
export type ArticleListItem = components['schemas']['ArticleListItem']
export type ArticleWithHistoryRead =
  components['schemas']['ArticleWithHistoryRead']
export type TocNode = components['schemas']['TocNode']
export type PaginatedListResponse =
  components['schemas']['PaginatedResponse_LegalTextListItem_']
export type PaginatedArticlesResponse =
  components['schemas']['PaginatedResponse_ArticleListItem_']
export type PaginatedSearchResponse =
  components['schemas']['PaginatedSearchResponse']
export type SearchHit = components['schemas']['SearchHit']
export type GlobalSearchResponse =
  components['schemas']['GlobalSearchResponse']
export type LegalCategory = components['schemas']['LegalCategory']
export type CodeSubcategory = components['schemas']['CodeSubcategory']
export type LegalStatus = components['schemas']['LegalStatus']
export type DecisionListItem = components['schemas']['DecisionListItem']
export type DecisionRead = components['schemas']['DecisionRead']
export type PaginatedDecisionsResponse =
  components['schemas']['PaginatedResponse_DecisionListItem_']
export type CitationRead = components['schemas']['CitationRead']
export type CitationNodeType = components['schemas']['CitationNodeType']
export type CitationRelation = components['schemas']['CitationRelation']
export type PaginatedCitationsResponse =
  components['schemas']['PaginatedResponse_CitationRead_']
export type CourtType = components['schemas']['CourtType']

// -----------------------------------------------------------------------
// Legal texts
// -----------------------------------------------------------------------

/** Quick-access cards on the homepage. */
export async function getQuickAccess() {
  return apiGet<LegalTextListItem[]>('/legal-texts/quick-access')
}

/**
 * Batch-resolve article IDs → parent-text label + permalink. Used by the
 * citation panel for cross-text references (where the local sibling list
 * doesn't have a hit). Returns a partial list — IDs that don't exist are
 * silently dropped, never throw.
 */
export type ArticleResolved = {
  id: number
  number: string
  slug: string
  text_id: number
  text_slug: string
  text_title_fr: string
}

export async function resolveArticles(ids: number[]) {
  if (ids.length === 0) return [] as ArticleResolved[]
  return apiGet<ArticleResolved[]>('/articles/resolve', {
    params: { ids: ids.join(',') },
  })
}

/** Paginated list of legal texts with optional filters and free-text query. */
export async function listTexts(params?: {
  q?: string
  category?: LegalCategory
  code_subcategory?: CodeSubcategory
  status?: LegalStatus
  /** One or more theme tags. ANY-match — repeat for multi-theme. */
  theme?: string[]
  limit?: number
  offset?: number
}) {
  return apiGet<PaginatedListResponse>('/legal-texts', { params })
}

/**
 * Hybrid lexical search across legal-text titles and article content.
 * Returns ranked texts with up to 3 highlighted article snippets each.
 */
export async function searchTexts(params: {
  q: string
  category?: LegalCategory
  code_subcategory?: CodeSubcategory
  status?: LegalStatus
  limit?: number
  offset?: number
}): Promise<PaginatedSearchResponse> {
  return apiGet<PaginatedSearchResponse>('/legal-texts/search', { params })
}

/**
 * Cross-entity search — returns matching laws (with article snippets) +
 * matching Moniteur issues in a single call. Backs the landing-page
 * hero search and the dedicated `/recherche` results page.
 */
export async function globalSearch(params: {
  q: string
  legal_text_limit?: number
  moniteur_issue_limit?: number
}): Promise<GlobalSearchResponse> {
  return apiGet<GlobalSearchResponse>('/search', { params })
}

/** Detail by slug. `include` controls how much of the related graph loads. */
export async function getTextBySlug(slug: string, include?: 'toc' | 'all') {
  return apiGet<LegalTextRead>(
    `/legal-texts/${encodeURIComponent(slug)}`,
    { params: { include } },
  )
}

/** Headings tree (sidebar TOC). */
export async function getTextToc(slug: string) {
  return apiGet<TocNode[]>(
    `/legal-texts/${encodeURIComponent(slug)}/toc`,
  )
}

/** Paginated articles within a text — light shape, no content. */
export async function listArticlesInText(
  slug: string,
  params?: {
    heading_id?: number
    heading_key?: string
    limit?: number
    offset?: number
  },
) {
  return apiGet<PaginatedArticlesResponse>(
    `/legal-texts/${encodeURIComponent(slug)}/articles`,
    { params },
  )
}

// -----------------------------------------------------------------------
// Articles
// -----------------------------------------------------------------------

export async function getArticle(articleId: number) {
  return apiGet<ArticleWithHistoryRead>(`/articles/${articleId}`)
}

/**
 * All articles in a legal text that have more than one version.
 * Returns each article's full version history embedded — used by the
 * `/loi/[slug]/amendements` page.
 */
export async function getAmendmentsForText(slug: string) {
  return apiGet<ArticleWithHistoryRead[]>(
    `/legal-texts/${encodeURIComponent(slug)}/amendments`,
  )
}

// -----------------------------------------------------------------------
// Moniteur ingestion pipeline
// -----------------------------------------------------------------------

export type MoniteurIssueRead = {
  id: number
  number: string
  year: number
  publication_date: string | null
  edition_label: string | null
  file_url: string | null
  page_count: number | null
  processing_status:
    | 'uploaded'
    | 'ocr_pending'
    | 'parsed'
    | 'reviewed'
    | 'published'
    | 'failed'
  processing_error: string | null
  uploaded_at: string
  parsed_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  entries_count: number
  accepted_count: number
  sommaire: Array<{
    category: string | null
    title: string | null
    promoted_slug: string | null
  }>
}

export type MoniteurEntryRead = {
  id: number
  issue_id: number
  position: number
  detected_category:
    | 'constitution'
    | 'code'
    | 'loi'
    | 'decret'
    | 'arrete'
    | 'circulaire'
    | 'convention'
    | 'ordonnance'
    | 'communique'
    | 'promulgation'
    | 'errata'
    | 'autre'
    | null
  detected_title: string | null
  display_title: string | null
  detected_number: string | null
  parent_entry_id: number | null
  detected_date: string | null
  summary_fr: string | null
  summary_ht: string | null
  raw_text: string
  confidence: string | null
  page_from: number | null
  page_to: number | null
  review_status: 'pending' | 'accepted' | 'rejected' | 'deferred'
  promoted_legal_text_id: number | null
  promoted_legal_text_slug: string | null
  promoted_legal_text_title_fr: string | null
  review_notes: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

/** @deprecated Use MoniteurEntryRead instead */
export type MoniteurLawCandidateRead = MoniteurEntryRead

export type MoniteurIssueWithEntries = MoniteurIssueRead & {
  entries: MoniteurEntryRead[]
}

/** @deprecated Use MoniteurIssueWithEntries instead */
export type MoniteurIssueWithCandidates = MoniteurIssueRead & {
  candidates: MoniteurEntryRead[]
}

export async function listMoniteurIssues(params?: {
  limit?: number
  offset?: number
  only_published?: boolean
}) {
  return apiGet<{
    items: MoniteurIssueRead[]
    total: number
    page: number
    size: number
  }>(`/moniteur/issues`, { params })
}

export async function getMoniteurIssue(id: number) {
  return apiGet<MoniteurIssueWithEntries>(`/moniteur/issues/${id}`)
}

export async function createMoniteurIssue(payload: {
  number: string
  year: number
  publication_date?: string | null
  edition_label?: string | null
}) {
  return apiPost<MoniteurIssueRead>(`/moniteur/issues`, payload)
}

export async function uploadMoniteurPdf(id: number, file: File) {
  // Routed through a local Next.js API route, not /api/v1/*, for the same
  // reason as extractMoniteurMetadata — large multipart uploads choke the
  // dev rewrite. See web/src/app/api/moniteur/issues/[id]/upload/route.ts.
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`/api/moniteur/issues/${id}/upload`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  if (!r.ok) {
    let detail: string | undefined
    try {
      detail = (await r.json())?.detail
    } catch {
      detail = await r.text()
    }
    throw new Error(detail || `HTTP ${r.status}`)
  }
  return (await r.json()) as MoniteurIssueRead
}

export type ExtractedMoniteurMetadata = {
  number: string | null
  year: number | null
  publication_date: string | null
  edition_label: string | null
  confidence: Record<string, number>
}

/** Run OCR + cover-page regex on an uploaded PDF and return proposed
 *  metadata, without persisting anything. The editor reviews + corrects
 *  the result before triggering the actual create-issue flow.
 *
 *  Routes through a local Next.js API route (rather than the /api/v1/*
 *  rewrite) because Next's dev rewrite drops large multipart uploads —
 *  Moniteur PDFs are routinely 30-80 MB. The local route streams the body
 *  to FastAPI server-side. */
export async function extractMoniteurMetadata(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/moniteur/extract-metadata', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  if (!r.ok) {
    let detail: string | undefined
    try {
      detail = (await r.json())?.detail
    } catch {
      detail = await r.text()
    }
    throw new Error(detail || `HTTP ${r.status}`)
  }
  return (await r.json()) as ExtractedMoniteurMetadata
}

export async function parseMoniteurIssue(id: number) {
  return apiPost<MoniteurIssueWithEntries>(
    `/moniteur/issues/${id}/parse`,
    {},
  )
}

export type SommaireEntryInput = components['schemas']['SommaireEntryInput']

/** Pre-fill the editor's known sommaire so the parser can skip boundary
 *  detection and OCR per declared page range instead. */
export async function setMoniteurSommaire(
  id: number,
  entries: SommaireEntryInput[],
) {
  return apiPost<MoniteurIssueWithEntries>(
    `/moniteur/issues/${id}/sommaire`,
    { entries },
  )
}

/** Hard-delete a Moniteur issue (and its entries + uploaded PDF). */
export async function deleteMoniteurIssue(id: number) {
  const r = await fetch(`/api/v1/moniteur/issues/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (!r.ok) {
    let detail: string | undefined
    try {
      detail = (await r.json())?.detail
    } catch {
      detail = await r.text()
    }
    throw new Error(detail || `HTTP ${r.status}`)
  }
}

export async function reviewMoniteurEntry(
  id: number,
  payload: {
    review_status?: 'pending' | 'accepted' | 'rejected' | 'deferred'
    detected_category?: string | null
    detected_title?: string | null
    detected_number?: string | null
    detected_date?: string | null
    review_notes?: string | null
    raw_text?: string | null
  },
) {
  return apiPatch<MoniteurEntryRead>(
    `/moniteur/candidates/${id}`,
    payload,
  )
}

/** @deprecated Use reviewMoniteurEntry instead */
export const reviewMoniteurCandidate = reviewMoniteurEntry

export async function promoteMoniteurEntry(id: number) {
  return apiPost<MoniteurEntryRead>(
    `/moniteur/candidates/${id}/promote`,
    {},
  )
}

/** @deprecated Use promoteMoniteurEntry instead */
export const promoteMoniteurCandidate = promoteMoniteurEntry

// -----------------------------------------------------------------------
// Decisions (jurisprudence)
// -----------------------------------------------------------------------

export async function listDecisions(params?: {
  q?: string
  court?: CourtType
  /** Inclusive, ISO date YYYY-MM-DD. Maps to backend `from`. */
  from?: string
  /** Inclusive, ISO date YYYY-MM-DD. Maps to backend `to`. */
  to?: string
  limit?: number
  offset?: number
}) {
  return apiGet<PaginatedDecisionsResponse>('/decisions', { params })
}

export async function getDecisionBySlug(slug: string) {
  return apiGet<DecisionRead>(`/decisions/${encodeURIComponent(slug)}`)
}

// -----------------------------------------------------------------------
// Citations (the legal graph)
// -----------------------------------------------------------------------

export async function listCitations(params?: {
  source_type?: CitationNodeType
  source_id?: number
  target_type?: CitationNodeType
  target_id?: number
  relation?: CitationRelation
  limit?: number
  offset?: number
}) {
  return apiGet<PaginatedCitationsResponse>('/citations', { params })
}

/** Outgoing edges from an article: what does it cite? */
export async function citationsFromArticle(articleId: number) {
  return listCitations({ source_type: 'article', source_id: articleId })
}

/** Incoming edges to an article: what cites it? */
export async function citationsToArticle(articleId: number) {
  return listCitations({ target_type: 'article', target_id: articleId })
}

/** Outgoing edges from a decision: what does it cite? */
export async function citationsFromDecision(decisionId: number) {
  return listCitations({ source_type: 'decision', source_id: decisionId })
}

// -----------------------------------------------------------------------
// Editorial — import pipeline
// -----------------------------------------------------------------------

/** Parse result from the document analysis endpoint. */
export type ParsedHeadingResponse = {
  key: string
  level: string
  number: string
  title_fr: string
  parent_key: string | null
  position: number
}

export type ParsedArticleResponse = {
  number: string
  content_fr: string
  heading_path: string[]
  heading_key: string | null
  title: string | null
}

export type DocumentParseResponse = {
  headings: ParsedHeadingResponse[]
  articles: ParsedArticleResponse[]
  preamble: string
  parser_confidence: number
  warnings: string[]
}

/**
 * Parse a legal document (PDF/DOCX/TXT) into structured headings + articles.
 *
 * Routes through a local Next.js API route for the same reason as
 * Moniteur uploads — large multipart uploads choke the dev rewrite.
 */
export async function parseDocument(file: File): Promise<DocumentParseResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/editorial/parse-document', {
    method: 'POST',
    body: fd,
  })
  if (!r.ok) {
    let detail: string | undefined
    try {
      const body = await r.json()
      detail = body?.detail ?? body?.error?.message
    } catch {
      detail = await r.text()
    }
    throw new Error(detail || `Parse failed (HTTP ${r.status})`)
  }
  return (await r.json()) as DocumentParseResponse
}

/** Payload shape for creating a new legal text with structure. */
export type LegalTextCreatePayload = {
  slug: string
  category: string
  title_fr: string
  title_ht?: string | null
  description_fr?: string | null
  description_ht?: string | null
  preamble_fr?: string | null
  preamble_ht?: string | null
  visas_fr?: string | null
  visas_ht?: string | null
  considerants_fr?: string | null
  considerants_ht?: string | null
  enacting_formula_fr?: string | null
  enacting_formula_ht?: string | null
  promulgation_date?: string | null
  publication_date?: string | null
  moniteur_ref?: string | null
  status?: string
  headings?: Array<{
    key: string
    parent_key?: string | null
    level: string
    number?: string | null
    title_fr?: string | null
    title_ht?: string | null
    position?: number
  }>
  articles?: Array<{
    number: string
    slug: string
    heading_key?: string | null
    position?: number
    version: {
      text_fr: string
      text_ht?: string | null
      title_fr?: string | null
      title_ht?: string | null
    }
  }>
}

/**
 * Create a new draft LegalText with headings + articles.
 * This is the "commit" step after the editor reviews the parsed structure.
 */
export async function createLegalText(payload: LegalTextCreatePayload) {
  return apiPost<LegalTextRead>('/editorial/legal-texts', payload)
}

// -----------------------------------------------------------------------
// Editorial — auth-required endpoints (carry the Auth.js cookie)
// -----------------------------------------------------------------------

export type EditorIdentity = {
  id: number
  email: string | null
  name: string | null
  role: 'admin' | 'reviewer' | 'editor'
}

/** Caller identity (for showing "logged in as ..." in the UI). */
export async function whoami() {
  return apiGet<EditorIdentity>('/editorial/me')
}

/**
 * Editor list — sees ALL editorial statuses (drafts + published + ...).
 * Default `editorial_status` is undefined → no filter, returns everything.
 * Pass 'draft' / 'published' to narrow.
 */
export async function listEditorialTexts(params?: {
  q?: string
  category?: LegalCategory
  code_subcategory?: CodeSubcategory
  status?: LegalStatus
  editorial_status?: 'draft' | 'pending_review' | 'published' | 'rejected'
  limit?: number
  offset?: number
}) {
  return apiGet<PaginatedListResponse>('/editorial/legal-texts', { params })
}

/**
 * Editorial detail — sees drafts. Used in editor mode instead of the public
 * `/legal-texts/{slug}` endpoint.
 */
export async function getEditorialTextBySlug(
  slug: string,
  include: 'toc' | 'all' = 'all',
) {
  return apiGet<LegalTextRead>(
    `/editorial/legal-texts/${encodeURIComponent(slug)}`,
    { params: { include } },
  )
}

export async function publishLegalText(slug: string) {
  return apiPost<LegalTextRead>(
    `/editorial/legal-texts/${encodeURIComponent(slug)}/publish`,
  )
}

export async function unpublishLegalText(slug: string, comment: string) {
  return apiPost<{ ok: boolean }>(
    `/editorial/legal-texts/${encodeURIComponent(slug)}/unpublish`,
    { comment },
  )
}

export async function requestChanges(slug: string, comment: string) {
  return apiPost<{ ok: boolean }>(
    `/editorial/legal-texts/${encodeURIComponent(slug)}/request-changes`,
    { comment },
  )
}

/**
 * Editor metadata update. Send only the fields you want to change; unset
 * keys are left untouched. Pass `null` to clear nullable fields.
 */
export type LegalTextMetadataPatch = {
  title_fr?: string
  title_ht?: string | null
  description_fr?: string | null
  description_ht?: string | null
  promulgation_date?: string | null // ISO date "YYYY-MM-DD"
  publication_date?: string | null
  moniteur_ref?: string | null
  category?: LegalCategory
  code_subcategory?: CodeSubcategory | null
  status?: LegalStatus
  comment?: string | null
}

export async function updateLegalTextMetadata(
  slug: string,
  patch: LegalTextMetadataPatch,
) {
  return apiPatch<LegalTextRead>(
    `/editorial/legal-texts/${encodeURIComponent(slug)}/metadata`,
    patch,
  )
}

/**
 * Editor article-content update — bilingual title + body. Send only the
 * fields you want to change; unset keys leave the version untouched.
 *
 * Versioning policy is server-side: a draft version is mutated in place;
 * a published version is superseded by a new draft (next version_number).
 */
export type ArticleContentPatch = {
  title_fr?: string | null
  title_ht?: string | null
  text_fr?: string
  text_ht?: string | null
  comment?: string | null
}

export type ArticleEmbed = components['schemas']['ArticleEmbed']

export async function updateArticleContent(
  articleId: number,
  patch: ArticleContentPatch,
) {
  return apiPatch<ArticleEmbed>(
    `/editorial/articles/${articleId}/content`,
    patch,
  )
}
