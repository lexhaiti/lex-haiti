/**
 * Renders `LegalSigner` rows grouped by their `signing_capacity` so
 * the visual structure tells the legal story:
 *
 *   - "Adopté par" — the bureaux that voted (presiding + attesting,
 *     grouped further by chamber: Sénat block, Chambre block)
 *   - "Promulgué par" — Pres signing a loi
 *   - "Authored by" — Pres / Ministre signing a décret/arrêté
 *   - "Contresigné par" — ministres countersigning a presidential décret
 *   - "Autres signataires" — any leftovers (capacity = other)
 *
 * Hidden when the array is empty. Each capacity group renders only
 * when it has signers, so a décret with one author shows a single
 * card and no chamber sections.
 */
import React from 'react'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api-types'

type LegalSigner = components['schemas']['LegalSignerRead']
type SigningCapacity = components['schemas']['SigningCapacity']
type SignatoryChamber = components['schemas']['SignatoryChamber']

interface SignatureGridProps {
  signatories: LegalSigner[]
  lang: 'fr' | 'ht'
  className?: string
}

const CAPACITY_LABELS: Record<SigningCapacity, { fr: string; ht: string }> = {
  authoring: { fr: 'Adopté et signé par', ht: 'Adopte epi siyen pa' },
  presiding: { fr: 'Adopté par', ht: 'Adopte pa' },
  attesting: { fr: 'Adopté par', ht: 'Adopte pa' },
  promulgating: { fr: 'Promulgué par', ht: 'Pwomilge pa' },
  countersigning: { fr: 'Contresigné par', ht: 'Kontresinyen pa' },
  other: { fr: 'Autres signataires', ht: 'Lòt siyatè' },
}

const CHAMBER_LABELS: Record<SignatoryChamber, { fr: string; ht: string }> = {
  senat: { fr: 'Sénat', ht: 'Sena' },
  chambre: { fr: 'Chambre des Députés', ht: 'Chanm Depite' },
  executive: { fr: 'Exécutif', ht: 'Egzekitif' },
  ministerial: { fr: 'Ministère', ht: 'Ministè' },
}

const MONTHS_FR = [
  '',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function formatDate(iso?: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const day = Number.parseInt(m[3], 10)
  const month = Number.parseInt(m[2], 10)
  return `${day} ${MONTHS_FR[month] ?? ''} ${m[1]}`
}

/**
 * Groups the chamber-bureaux capacities (presiding + attesting) into a
 * single visual "Adopté par" block, since they're conceptually the same
 * legal step (adoption by the chamber); the presiding/attesting
 * distinction is preserved via a small role badge per signer.
 */
function groupSignatories(signatories: LegalSigner[]) {
  const adoption: LegalSigner[] = []
  const promulgation: LegalSigner[] = []
  const authoring: LegalSigner[] = []
  const countersigning: LegalSigner[] = []
  const other: LegalSigner[] = []

  for (const s of signatories) {
    switch (s.signing_capacity) {
      case 'presiding':
      case 'attesting':
        adoption.push(s)
        break
      case 'promulgating':
        promulgation.push(s)
        break
      case 'authoring':
        authoring.push(s)
        break
      case 'countersigning':
        countersigning.push(s)
        break
      default:
        other.push(s)
    }
  }

  return { adoption, promulgation, authoring, countersigning, other }
}

function groupByChamber(rows: LegalSigner[]) {
  const map = new Map<string, LegalSigner[]>()
  for (const s of rows) {
    const key = s.chamber ?? 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
}

export function SignatureGrid({
  signatories,
  lang,
  className,
}: SignatureGridProps) {
  if (!signatories || signatories.length === 0) return null

  const groups = groupSignatories(signatories)

  const sections: React.ReactNode[] = []

  // ---- Adoption (chamber bureaux) ----
  if (groups.adoption.length > 0) {
    const byChamber = groupByChamber(groups.adoption)
    sections.push(
      <SignatureSection
        key="adoption"
        caption={CAPACITY_LABELS.presiding[lang]}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from(byChamber.entries()).map(([chamber, rows]) => (
            <ChamberCard
              key={chamber}
              label={
                CHAMBER_LABELS[chamber as SignatoryChamber]?.[lang] ?? chamber
              }
              rows={rows}
              lang={lang}
            />
          ))}
        </div>
      </SignatureSection>,
    )
  }

  // ---- Authoring (décret / arrêté) ----
  if (groups.authoring.length > 0) {
    sections.push(
      <SignatureSection
        key="authoring"
        caption={CAPACITY_LABELS.authoring[lang]}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.authoring.map((s, i) => (
            <SignerCard key={`auth-${i}`} signer={s} lang={lang} />
          ))}
        </div>
      </SignatureSection>,
    )
  }

  // ---- Promulgation (Pres on a loi) ----
  if (groups.promulgation.length > 0) {
    sections.push(
      <SignatureSection
        key="promulgation"
        caption={CAPACITY_LABELS.promulgating[lang]}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.promulgation.map((s, i) => (
            <SignerCard key={`prom-${i}`} signer={s} lang={lang} />
          ))}
        </div>
      </SignatureSection>,
    )
  }

  // ---- Countersigning (ministres on a presidential décret) ----
  if (groups.countersigning.length > 0) {
    sections.push(
      <SignatureSection
        key="countersigning"
        caption={CAPACITY_LABELS.countersigning[lang]}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.countersigning.map((s, i) => (
            <SignerCard key={`cs-${i}`} signer={s} lang={lang} />
          ))}
        </div>
      </SignatureSection>,
    )
  }

  // ---- Other (capacity = other / unknown) ----
  if (groups.other.length > 0) {
    sections.push(
      <SignatureSection
        key="other"
        caption={CAPACITY_LABELS.other[lang]}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.other.map((s, i) => (
            <SignerCard key={`other-${i}`} signer={s} lang={lang} />
          ))}
        </div>
      </SignatureSection>,
    )
  }

  return <div className={cn('flex flex-col gap-8', className)}>{sections}</div>
}

function SignatureSection({
  caption,
  children,
}: {
  caption: string
  children: React.ReactNode
}) {
  return (
    <section>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
        {caption}
      </p>
      {children}
    </section>
  )
}

function ChamberCard({
  label,
  rows,
  lang,
}: {
  label: string
  rows: LegalSigner[]
  lang: 'fr' | 'ht'
}) {
  const presiding = rows.filter((r) => r.signing_capacity === 'presiding')
  const attesting = rows.filter((r) => r.signing_capacity === 'attesting')
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-primary/70 mb-4">
        {label}
      </p>
      <div className="space-y-3">
        {presiding.map((s, i) => (
          <SignerLine key={`p-${i}`} signer={s} primary lang={lang} />
        ))}
        {attesting.map((s, i) => (
          <SignerLine key={`s-${i}`} signer={s} primary={false} lang={lang} />
        ))}
      </div>
    </div>
  )
}

function SignerCard({
  signer,
  lang,
}: {
  signer: LegalSigner
  lang: 'fr' | 'ht'
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <SignerLine signer={signer} primary lang={lang} />
    </div>
  )
}

function SignerLine({
  signer,
  primary,
  lang,
}: {
  signer: LegalSigner
  primary: boolean
  lang: 'fr' | 'ht'
}) {
  const date = formatDate(signer.signed_at)
  const role =
    lang === 'ht' && signer.function_ht
      ? signer.function_ht
      : signer.function_fr
  return (
    <div>
      <p
        className={cn(
          'text-slate-900 leading-tight',
          primary ? 'text-base font-bold' : 'text-sm font-semibold',
        )}
      >
        {signer.name}
      </p>
      <p className="text-xs text-slate-600 mt-0.5">{role}</p>
      {date && (
        <p className="text-[11px] text-slate-400 mt-1 italic">{date}</p>
      )}
    </div>
  )
}
