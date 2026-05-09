import HeroSection from '@/components/home/HeroSection'
import CorpusStatsStrip from '@/components/home/CorpusStatsStrip'
import ExplorerSection from '@/components/home/ExplorerSection'
import MoniteurRecentSection from '@/components/home/MoniteurRecentSection'
import FeaturesSection from '@/components/home/FeaturesSection'
import ActualitesSection from '@/components/home/ActualitesSection'
import AppelContribution from '@/components/home/AppelContribution'
import PartenairesSection from '@/components/home/PartenairesSection'

export default function Page() {
  return (
    <div className="bg-white min-h-screen">
      <HeroSection />
      <CorpusStatsStrip />
      <ExplorerSection />
      <MoniteurRecentSection />
      <FeaturesSection />
      <ActualitesSection />
      <AppelContribution />
      <PartenairesSection />
    </div>
  )
}
