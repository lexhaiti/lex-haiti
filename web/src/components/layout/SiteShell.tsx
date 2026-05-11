'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main id="main-content" className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </div>
  )
}
