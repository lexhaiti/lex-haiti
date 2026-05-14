/**
 * Word-level diff utilities shared by the article compare panel and
 * the formal-block compare panel.
 *
 * Algorithm: classic LCS over word + whitespace tokens, one backward
 * walk to build the edit script. HTML tags are stripped before
 * tokenising so the diff reflects content changes only — not differences
 * in Tiptap's serialisation.
 *
 * Performance: O(m·n) time and space. Fine for legal articles (a few
 * thousand words). For 10k+ tokens swap in Myers; in practice the
 * editor never compares anything that long.
 */

export type Token = { kind: 'word' | 'space'; text: string }
export type DiffOp = { op: 'equal' | 'delete' | 'insert'; text: string }

/**
 * Strip HTML tags + decode the small set of entities we actually emit,
 * and normalise whitespace so paragraph breaks don't pollute the
 * word-level diff. Returns plain text with single newlines between
 * what were originally block-level elements.
 */
export function htmlToPlain(html: string | null | undefined): string {
  if (!html) return ''
  const withBreaks = html
    .replace(/<\/(p|li|blockquote|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
  const noTags = withBreaks.replace(/<[^>]+>/g, '')
  const decoded = noTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  return decoded.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
}

/**
 * Split into word + whitespace runs. Newlines are kept as their own
 * tokens so paragraph boundaries survive the diff: a newline-matching-
 * newline stays 'equal'; otherwise it gets inserted/deleted like any
 * other token.
 */
export function tokenize(s: string): Token[] {
  const tokens: Token[] = []
  for (const part of s.split(/(\s+)/)) {
    if (!part) continue
    tokens.push({ kind: /^\s+$/.test(part) ? 'space' : 'word', text: part })
  }
  return tokens
}

/**
 * LCS-based word diff. Returns the edit script.
 */
export function diffTokens(aTokens: Token[], bTokens: Token[]): DiffOp[] {
  const m = aTokens.length
  const n = bTokens.length
  const dp: Int32Array[] = []
  for (let i = 0; i <= m; i++) dp.push(new Int32Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aTokens[i - 1].text === bTokens[j - 1].text) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1]
      }
    }
  }
  const out: DiffOp[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (aTokens[i - 1].text === bTokens[j - 1].text) {
      out.push({ op: 'equal', text: aTokens[i - 1].text })
      i -= 1
      j -= 1
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ op: 'delete', text: aTokens[i - 1].text })
      i -= 1
    } else {
      out.push({ op: 'insert', text: bTokens[j - 1].text })
      j -= 1
    }
  }
  while (i > 0) {
    out.push({ op: 'delete', text: aTokens[i - 1].text })
    i -= 1
  }
  while (j > 0) {
    out.push({ op: 'insert', text: bTokens[j - 1].text })
    j -= 1
  }
  return out.reverse()
}

/**
 * Merge adjacent same-op runs so the rendered output uses one styled
 * span per change instead of one per word.
 */
export function coalesce(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  for (const op of ops) {
    const prev = out[out.length - 1]
    if (prev && prev.op === op.op) {
      prev.text += op.text
    } else {
      out.push({ ...op })
    }
  }
  return out
}

/**
 * One-shot helper: stringA, stringB → coalesced diff ops over their
 * plain-text projections. Use this when you already have HTML strings
 * to compare; if you have token arrays already, call ``diffTokens``
 * directly to avoid re-tokenising.
 */
export function diffHtml(
  a: string | null | undefined,
  b: string | null | undefined,
): DiffOp[] {
  return coalesce(diffTokens(tokenize(htmlToPlain(a)), tokenize(htmlToPlain(b))))
}
