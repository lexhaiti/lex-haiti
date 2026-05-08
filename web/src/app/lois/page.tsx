'use client'

import { Suspense } from 'react'
import AllLaws from '@/components/all-laws/AllLaws'

export default function Page() {
  return (
    <div className="pt-20 lg:pt-20">
      <Suspense>
        <AllLaws />
      </Suspense>
    </div>
  )
}
