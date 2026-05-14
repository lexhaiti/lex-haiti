// RSC — pure content + a static (uncontrolled) form. The shadcn
// Input/Textarea/Button components are client-marked themselves so
// importing them here is fine: Next handles the client boundary at the
// import site.

import type { Metadata } from 'next'
import { StandardPageHeader } from '@/components/shared/StandardPageHeader'
import { Mail, MapPin, MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getServerLanguage, getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const language = await getServerLanguage()
  const t = await getT(language)
  return {
    title: t('contact.title', {
      fallback: language === 'fr' ? 'Contact' : 'Kontakte Nou',
    }),
  }
}

export default async function Page() {
  const t = await getT()
  const isFr = t.language === 'fr'

  // Phone removed pending a real number — placeholder "+509 0000-0000"
  // shipped to production looks unprofessional and creates dead-tap targets.
  const contactInfo = [
    {
      icon: MapPin,
      title: isFr ? 'Notre Bureau' : 'Biwo Nou',
      detail: isFr ? 'Port-au-Prince, Haïti' : 'Pòtoprens, Ayiti',
    },
    {
      icon: Mail,
      title: 'Email',
      detail: 'contact@lexhaiti.org',
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <StandardPageHeader
        title={t('contact.title', {
          fallback: isFr ? 'Contact' : 'Kontakte Nou',
        })}
        subtitle={t('contact.subtitle', {
          fallback: isFr
            ? 'Une question ou une suggestion ? Notre équipe est à votre écoute.'
            : 'Ou gen yon keksyon oswa yon sijesyon ? Ekip nou an la pou koute ou.',
        })}
        breadcrumbs={[
          { label: isFr ? 'Accueil' : 'Akèy', href: '/' },
          { label: isFr ? 'Contact' : 'Kontak' },
        ]}
      />

      <div className="container py-20 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          {/* Contact Info */}
          <div className="space-y-12 animate-in fade-in slide-in-from-left-4 duration-500">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-slate-900">
                {isFr ? 'Parlons ensemble' : 'Ann pale ansanm'}
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed max-w-md">
                {isFr
                  ? 'Que vous soyez un professionnel du droit, un étudiant ou un citoyen, nous apprécions vos retours pour améliorer LexHaiti.'
                  : 'Kit ou se yon pwofesyonèl nan dwa, yon etidyan oswa yon sitwayen, nou apresye fidbak ou pou nou amelyore LexHaiti.'}
              </p>
            </div>

            <div className="space-y-8">
              {contactInfo.map((info, idx) => (
                <div key={idx} className="flex items-center gap-6 group">
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white group-hover:border-primary group-hover:shadow-md">
                    <info.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">
                      {info.title}
                    </h4>
                    <p className="text-xl font-bold text-slate-900">
                      {info.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Form */}
          <div className="relative animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-red-500/5 blur-3xl rounded-[3rem]" />
            <div className="relative bg-white border border-slate-100 shadow-2xl shadow-slate-200/50 rounded-[3rem] p-8 lg:p-12">
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label
                      htmlFor="contact-name"
                      className="text-sm font-bold text-slate-600 ml-1"
                    >
                      {isFr ? 'Nom' : 'Non'}
                    </label>
                    <Input
                      id="contact-name"
                      name="name"
                      autoComplete="name"
                      className="rounded-md border-slate-200 focus:ring-primary focus:border-primary h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="contact-email"
                      className="text-sm font-bold text-slate-600 ml-1"
                    >
                      Email
                    </label>
                    <Input
                      id="contact-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      className="rounded-md border-slate-200 focus:ring-primary focus:border-primary h-12"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="contact-subject"
                    className="text-sm font-bold text-slate-600 ml-1"
                  >
                    {isFr ? 'Sujet' : 'Sijè'}
                  </label>
                  <Input
                    id="contact-subject"
                    name="subject"
                    className="rounded-md border-slate-200 focus:ring-primary focus:border-primary h-12"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="contact-message"
                    className="text-sm font-bold text-slate-600 ml-1"
                  >
                    {isFr ? 'Message' : 'Mesaj'}
                  </label>
                  <Textarea
                    id="contact-message"
                    name="message"
                    className="rounded-md border-slate-200 focus:ring-primary focus:border-primary min-h-[150px]"
                  />
                </div>
                <Button className="w-full rounded-md bg-primary hover:bg-primary/90 text-white h-12 sm:h-14 font-semibold text-base transition-all active:scale-[0.99]">
                  <Send className="w-5 h-5 mr-2" />
                  {isFr ? 'Envoyer le message' : 'Voye mesaj la'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
