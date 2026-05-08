'use client'

import { useEffect, useMemo, useState } from 'react'
import type { components } from '@/lib/api-types'
import { getQuickAccess } from '@/lib/api/endpoints'

type LegalTextListItem = components['schemas']['LegalTextListItem']

type State =
  | { status: 'idle' | 'loading'; data: null; error: null }
  | { status: 'success'; data: LegalTextListItem[]; error: null }
  | { status: 'error'; data: null; error: Error }

export function useQuickAccess() {
  const [state, setState] = useState<State>({
    status: 'loading',
    data: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setState({ status: 'loading', data: null, error: null })
        const data = await getQuickAccess() // backend default list
        if (cancelled) return
        setState({ status: 'success', data, error: null })
      } catch (e) {
        if (cancelled) return
        setState({
          status: 'error',
          data: null,
          error:
            e instanceof Error ? e : new Error('Failed to load quick access'),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => state, [state])
}
