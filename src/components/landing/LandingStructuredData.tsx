import { t } from '@/i18n'
import { GITHUB_URL, SITE_URL } from './links'

type FaqItem = {
  q: string
  a: string
}

// Schema.org structured data — tells search engines this page is a free software
// application, which can earn a richer search result. Rendered as JSON-LD.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Tradenza',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  description: t('meta.ogDescription'),
  url: SITE_URL,
  image: `${SITE_URL}/opengraph-image.png`,
  license: 'https://www.gnu.org/licenses/agpl-3.0.html',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: 'Honza Příkryl', url: 'https://github.com/HonzaPrikryl' },
  sameAs: [GITHUB_URL],
}

export default function LandingStructuredData({ faqs }: { faqs: FaqItem[] }) {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <>
      {/* Structured data for search engines (SoftwareApplication + FAQ). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </>
  )
}
