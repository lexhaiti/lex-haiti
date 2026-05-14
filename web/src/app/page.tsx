import HeroSection from '@/components/home/HeroSection'
import ExplorerSection from '@/components/home/ExplorerSection'
import MoniteurRecentSection from '@/components/home/MoniteurRecentSection'
import FeaturesSection from '@/components/home/FeaturesSection'
import ActualitesSection from '@/components/home/ActualitesSection'
import AppelContribution from '@/components/home/AppelContribution'
import PartenairesSection from '@/components/home/PartenairesSection'
import { HomePrefetch } from '@/components/home/HomePrefetch'

export default function Page() {
  return (
    <div className="bg-white min-h-screen">
      <HeroSection />
      <ExplorerSection />
      <MoniteurRecentSection />
      <FeaturesSection />
      <ActualitesSection />
      <AppelContribution />
      <PartenairesSection />
      {/* Invisible — warms the API cache with high-traffic content
          ~600ms after landing-page paint. */}
      <HomePrefetch />
    </div>
  )
}
