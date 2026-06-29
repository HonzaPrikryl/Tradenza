import { tArray } from '@/i18n'
import SmoothScroll from './SmoothScroll'
import LandingStructuredData from './LandingStructuredData'
import LandingNav from './LandingNav'
import HeroSection from './HeroSection'
import TrustStrip from './TrustStrip'
import ShowcaseSection from './ShowcaseSection'
import FeaturesSection from './FeaturesSection'
import HowItWorksSection from './HowItWorksSection'
import OpenSourceSection from './OpenSourceSection'
import FaqSection from './FaqSection'
import FinalCtaSection from './FinalCtaSection'
import LandingFooter from './LandingFooter'

export default function LandingPage() {
  const faqs = tArray<{ q: string; a: string }>('landing.faq.items')

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      <LandingStructuredData faqs={faqs} />
      <SmoothScroll />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.35] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent_75%)]"
      />
      <LandingNav />
      <HeroSection />
      <TrustStrip />
      <ShowcaseSection />
      <FeaturesSection />
      <HowItWorksSection />
      <OpenSourceSection />
      <FaqSection faqs={faqs} />
      <FinalCtaSection />
      <LandingFooter />
    </main>
  )
}
