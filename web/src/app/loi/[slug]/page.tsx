// Route file is now an RSC so we can emit per-document metadata
// (`<title>` shows the actual law title, the description tag carries
// the editorial summary). The interactive viewer below stays client-
// rendered — Next handles the RSC↔client boundary at the import.

import type { Metadata } from 'next'
import LawDetailPage from '@/components/law-details/LawDetail'
import { getTextBySlug } from '@/lib/api/endpoints'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const text = await getTextBySlug(slug)
    return {
      title: text.title_fr,
      description: text.description_fr ?? undefined,
    }
  } catch {
    // The detail page itself will surface a not-found state; metadata
    // just falls back to the default site title.
    return {}
  }
}

export default function Page() {
  return <LawDetailPage />
}
