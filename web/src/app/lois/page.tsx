'use client'

import { Suspense } from 'react'
import AllLaws from '@/components/all-laws/AllLaws'

export default function Page() {
  // Menu clearance is handled inside the dark page header (h-20 spacer in
  // AllLawsUI), so the wrapper doesn't need its own pt-20 — that would
  // double-count the menu height.
  return (
    <Suspense>
      <AllLaws />
    </Suspense>
  )
}
