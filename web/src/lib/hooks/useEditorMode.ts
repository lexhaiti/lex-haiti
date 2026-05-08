'use client'

import { useSession } from 'next-auth/react'

export type EditorRole = 'admin' | 'reviewer' | 'editor'

const EDITOR_ROLES: ReadonlySet<EditorRole> = new Set([
  'admin',
  'reviewer',
  'editor',
])

/**
 * Returns whether the current user is signed in with an editorial role.
 *
 * Used by the law-detail page to conditionally render the EditorBar overlay
 * and to switch the data-fetch endpoint from `/legal-texts/{slug}` (public,
 * filters drafts) to `/editorial/legal-texts/{slug}` (sees all statuses).
 */
export function useEditorMode() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const isEditor =
    status === 'authenticated' &&
    typeof role === 'string' &&
    EDITOR_ROLES.has(role as EditorRole)

  return {
    isEditor,
    role: role as EditorRole | undefined,
    user: session?.user ?? null,
    status,
  }
}
