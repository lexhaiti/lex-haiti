'use client'

import { Globe2, Languages, LinkIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useT } from '@/i18n/useT'
import { SectionHeading } from '@/components/shared/SectionHeading'

// Two voices for the same section. Desktop (md+) gets the longer
// institutional version; mobile gets the punchy minimal version. Both share
// the same icons, numbering and amber-accent rhythm.
const COPY = {
  fr: {
    eyebrow: 'Principes',
    desktop: {
      title: 'Une infrastructure juridique publique. Pas un produit.',
      subtitle:
        "LexHaïti est conçu comme un socle numérique du droit haïtien. Pas d’abonnement, pas de logique commerciale — uniquement une exigence : rendre le droit accessible, fiable et citable dans le temps.",
      pillars: [
        {
          icon: Globe2,
          label: 'Accès universel',
          lead: 'Ouvert. Gratuit. Permanent.',
          desc: "Aucun compte. Aucun paywall. Chaque texte possède une adresse stable, conçue pour être citée et conservée.",
        },
        {
          icon: LinkIcon,
          label: 'Source vérifiable',
          lead: 'Chaque contenu a une origine.',
          desc: "Textes reliés à leur source primaire : Le Moniteur, lois, décisions. Rien n’est publié sans ancrage documentaire clair.",
        },
        {
          icon: Languages,
          label: 'Bilingue natif',
          lead: 'Deux langues. Une même autorité.',
          desc: "Français et kreyòl ayisyen sont présentés côte à côte, à égalité. Pas une adaptation — une coexistence complète.",
        },
      ],
    },
    mobile: {
      title: 'Le droit haïtien, comme infrastructure publique.',
      subtitle:
        "Accès libre. Données fiables. Structure durable. LexHaïti n’est pas un service — c’est un standard.",
      pillars: [
        {
          icon: Globe2,
          label: 'Ouvert',
          desc: 'Gratuit. Sans compte. Accès immédiat à tous les textes.',
        },
        {
          icon: LinkIcon,
          label: 'Traçable',
          desc: "Chaque contenu est relié à sa source officielle. Aucune ambiguïté sur l’origine.",
        },
        {
          icon: Languages,
          label: 'Bilingue',
          desc: 'Français et kreyòl, côte à côte. Pas de traduction. Deux langues complètes.',
        },
      ],
    },
  },
  ht: {
    eyebrow: 'Prensip',
    desktop: {
      title: 'Yon enfrastrikti jiridik piblik. Pa yon pwodwi.',
      subtitle:
        "LexHaïti se yon sòk nimerik pou dwa ayisyen an. Pa gen abònman, pa gen lojik komèsyal — sèlman yon egzijans : rann dwa a aksesib, fyab, epi sitable nan tan.",
      pillars: [
        {
          icon: Globe2,
          label: 'Aksè inivèsèl',
          lead: 'Ouvè. Gratis. Pèmanan.',
          desc: 'Pa gen kont. Pa gen peman. Chak tèks gen yon adrès estab, fèt pou sit ak konsève.',
        },
        {
          icon: LinkIcon,
          label: 'Sous verifyab',
          lead: 'Chak kontni gen yon orijin.',
          desc: 'Tèks yo lye dirèk ak sous prensipal yo : Le Moniteur, lwa, desizyon. Anyen pa pibliye san yon ankraj dokimantè klè.',
        },
        {
          icon: Languages,
          label: 'Bileng natif',
          lead: 'De lang. Menm otorite.',
          desc: 'Fransè ak kreyòl ayisyen prezante kòt a kòt, a egalite. Se pa yon adaptasyon — se yon ko-egzistans konplè.',
        },
      ],
    },
    mobile: {
      title: 'Dwa ayisyen an, kòm enfrastrikti piblik.',
      subtitle:
        "Aksè lib. Done fyab. Estrikti dirab. LexHaïti se pa yon sèvis — se yon estanda.",
      pillars: [
        {
          icon: Globe2,
          label: 'Ouvè',
          desc: 'Gratis. San kont. Aksè imedya pou tout tèks yo.',
        },
        {
          icon: LinkIcon,
          label: 'Traseyab',
          desc: 'Chak kontni lye ak sous ofisyèl li. Pa gen anbigwite sou orijin.',
        },
        {
          icon: Languages,
          label: 'Bileng',
          desc: 'Fransè ak kreyòl, kòt a kòt. Pa gen tradiksyon. De lang konplè.',
        },
      ],
    },
  },
} as const

export default function FeaturesSection() {
  const { language } = useT()
  const copy = COPY[(language as 'fr' | 'ht') ?? 'fr']

  return (
    <section className="relative w-full bg-white py-16 lg:py-20 border-t border-slate-100">
      <div className="container">
        {/* Headings — render both, toggle by breakpoint. The institutional
            voice reads on desktop where there's room; the minimal voice
            reads on mobile where attention is scarce. */}
        <div className="md:hidden">
          <SectionHeading
            eyebrow={copy.eyebrow}
            title={copy.mobile.title}
            subtitle={copy.mobile.subtitle}
            titleMaxWidth="max-w-full"
          />
        </div>
        <div className="hidden md:block">
          <SectionHeading
            eyebrow={copy.eyebrow}
            title={copy.desktop.title}
            subtitle={copy.desktop.subtitle}
            titleMaxWidth="max-w-full"
          />
        </div>

        {/* Mobile pillars (Version B — minimal) */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
          }}
          className="md:hidden grid grid-cols-1 gap-4 mb-10"
        >
          {copy.mobile.pillars.map((pillar, i) => {
            const Icon = pillar.icon
            return (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="group rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
                    {String(i + 1).padStart(2, '0')} — {pillar.label}
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {pillar.desc}
                </p>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Desktop pillars (Version A — institutional, with lead line) */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
          }}
          className="hidden md:grid grid-cols-3 gap-6 lg:gap-7 mb-12"
        >
          {copy.desktop.pillars.map((pillar, i) => {
            const Icon = pillar.icon
            return (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="group relative rounded-xl border border-slate-200 bg-white p-6 lg:p-7 transition-all duration-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white group-hover:border-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">
                    {String(i + 1).padStart(2, '0')} — {pillar.label}
                  </span>
                </div>
                <h3 className="text-lg lg:text-xl font-bold text-primary mb-2 leading-tight">
                  {pillar.lead}
                </h3>
                <p className="text-sm lg:text-[15px] text-slate-600 leading-relaxed">
                  {pillar.desc}
                </p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
