// RSC route file. Emits per-issue metadata so the browser tab + share
// previews carry the actual issue number ("Le Moniteur N° 47 — 4 juin
// 2014" instead of the default site title). The interactive viewer
// lives in the client component below.

import type { Metadata } from 'next'
import { getMoniteurIssue } from '@/lib/api/endpoints'
import { formatLongDate } from '@/lib/format/date'
import { smartIssueNumber } from '@/lib/format/moniteur'
import { getServerLanguage } from '@/i18n/server'
import MoniteurDetailClient from './_components/MoniteurDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const numericId = Number(id)
  if (Number.isNaN(numericId)) return {}

  try {
    const issue = await getMoniteurIssue(numericId)
    const language = await getServerLanguage()
    const number = smartIssueNumber(issue.number)
    const date = formatLongDate(issue.publication_date, language)
    const title = date ? `Le Moniteur ${number} — ${date}` : `Le Moniteur ${number}`
    return {
      title,
      description: issue.edition_label
        ? `${issue.edition_label} · ${title}`
        : title,
    }
  } catch {
    // Detail page surfaces a not-found state itself; fall back to default.
    return {}
  }
}

export default function Page() {
  return <MoniteurDetailClient />
}
