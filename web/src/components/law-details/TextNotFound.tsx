import { motion } from 'framer-motion'
import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import React from 'react'
import { useLanguage } from '@/i18n/LanguageContext'

export function TextNotFound() {
  const { language } = useLanguage()
  const currentLang = language as 'fr' | 'ht'

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-screen bg-white px-4">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-blue-500/5 blur-[100px] rounded-full" />
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-red-500/5 blur-[100px] rounded-full" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 max-w-md w-full text-center"
        >
          <div className="mb-8 relative inline-block">
            <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full animate-pulse-subtle" />
            <div className="relative bg-white rounded-full p-8 shadow-xl border border-slate-100">
              <FileText className="w-16 h-16 text-slate-300" />
              <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-2 shadow-lg ring-4 ring-white">
                <div className="w-3 h-3 text-white flex items-center justify-center font-bold text-[10px]">
                  !
                </div>
              </div>
            </div>
          </div>

          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">
            {currentLang === 'fr' ? 'Texte non trouvé' : 'Tèks pa jwenn'}
          </h2>
          <p className="text-slate-500 mb-10 leading-relaxed text-sm">
            {currentLang === 'fr'
              ? "Désolé, nous n'avons pas pu trouver le texte de loi que vous recherchez. Il est possible qu'il ait été déplacé ou qu'il ne soit pas encore numérisé."
              : 'Eskize nou, nou pa kapab jwenn tèks lwa w ap chèche a. Li posib li deplase oswa li poko nimerize.'}
          </p>

          <Link href="/lois">
            <Button className="rounded-full bg-slate-900 text-white px-10 py-6 h-auto font-bold transition-all duration-300 hover:scale-105 active:scale-95 group relative overflow-hidden">
              {/* Animated border */}
              <div className="absolute inset-0 rounded-full p-[2px] bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-full h-full rounded-full bg-slate-900" />
              </div>

              {/* Content */}
              <div className="relative flex items-center">
                <ArrowLeft className="w-5 h-5 mr-3 group-hover:-translate-x-2 transition-transform duration-300" />
                {currentLang === 'fr'
                  ? 'Retour à la liste'
                  : 'Retounen nan lis la'}
              </div>
            </Button>
          </Link>
        </motion.div>
      </div>
    </>
  )
}
