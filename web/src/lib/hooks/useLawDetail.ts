'use client'

import { useCallback, useEffect, useState } from 'react'
import type { components } from '@/lib/api-types'
import {
  getEditorialTextBySlug,
  getTextBySlug,
} from '@/lib/api/endpoints'
import { useEditorMode } from '@/lib/hooks/useEditorMode'

type LegalTextRead = components['schemas']['LegalTextRead']

export function useLawDetail(slug: string) {
  const { isEditor } = useEditorMode()
  const [data, setData] = useState<LegalTextRead | null>(null)
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [error, setError] = useState<Error | null>(null)

  const fetchLaw = useCallback(async () => {
    if (!slug) return

    setStatus('loading')
    setError(null)

    try {
      // Editor mode hits the editorial endpoint so drafts are visible.
      const res = isEditor
        ? await getEditorialTextBySlug(slug, 'all')
        : await getTextBySlug(slug, 'all')
      setData(res)
      setStatus('success')
    } catch (e) {
      setStatus('error')
      setError(
        e instanceof Error ? e : new Error('Failed to fetch law details'),
      )
    }
  }, [slug, isEditor])

  useEffect(() => {
    fetchLaw()
  }, [fetchLaw])

  return {
    data,
    status,
    error,
    isLoading: status === 'loading',
    isError: status === 'error',
    refetch: fetchLaw,
  }
}
