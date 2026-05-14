'use client'

/**
 * Invisible prefetcher mounted on the landing page. Warms the API
 * cache with high-traffic content so a click on "Constitution" or
 * "Moniteur" reads from memory instead of triggering a fresh network
 * fetch.
 *
 * Runs after a short delay so it doesn't compete with the landing
 * page's initial render. Skips on slow connections (effectiveType 2g
 * / save-data) — the win isn't worth burning the user's data plan.
 */

import { useEffect } from 'react'
import { getTextBySlug, listMoniteurIssues } from '@/lib/api/endpoints'

const PREFETCH_DELAY_MS = 600

const PREFETCH_SLUGS = [
  // The most-visited single text — pinning it pre-warms the largest
  // payload most likely to be requested next.
  'constitution-1987',
]

export function HomePrefetch() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Respect connection hints — bail on slow / metered networks.
    type ConnLike = { effectiveType?: string; saveData?: boolean }
    const conn = (navigator as Navigator & { connection?: ConnLike })
      .connection
    if (conn?.saveData) return
    if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return

    const handle = window.setTimeout(() => {
      // Best-effort — failures are silent. The TTL cache wrapping
      // apiGet handles dedupe with any concurrent fetch.
      for (const slug of PREFETCH_SLUGS) {
        void getTextBySlug(slug, 'all').catch(() => {})
      }
      void listMoniteurIssues({ limit: 6 }).catch(() => {})
    }, PREFETCH_DELAY_MS)

    return () => window.clearTimeout(handle)
  }, [])

  return null
}
