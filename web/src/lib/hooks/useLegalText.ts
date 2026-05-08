'use client'

import useSWR from 'swr'
import { getTextBySlug, type LegalTextRead } from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'

export function useLegalText(slug?: string) {
  const { data, error, isLoading } = useSWR<LegalTextRead>(
    slug ? ['legal-text', slug] : null,
    () => getTextBySlug(slug!),
    { revalidateOnFocus: false },
  )

  return {
    text: data,
    isLoading,
    error: error as ApiError | undefined,
  }
}
